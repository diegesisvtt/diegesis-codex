import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useStore } from '../state/store';
import { CommandRegistry, type Command } from './api/commands';
import { ViewRegistry, type RibbonItem, type ViewContribution, type ViewLocation } from './api/views';
import { EditorRegistry, type EditorContribution } from './api/editors';
import { DocTypeRegistry, type DocTypeContribution } from './api/docTypes';
import { MenuRegistry, type MenuItemContribution, type MenuLocation } from './api/menus';
import { File, Folder, LayoutGrid } from 'lucide-react';
import { TypedEventBus, type AppEvents } from './api/events';
import {
  PLUGIN_API_VERSION,
  type AppFacade,
  type Disposable,
  type Plugin,
  type PluginContext,
  type PluginManifest,
  type PluginSettings,
} from './api/types';
import type { PluginUiState } from '@shared/types';
import { loadExternalPlugins } from './external/loader';

export interface PluginInfo {
  manifest: PluginManifest;
  active: boolean;
  /** set when activation failed (e.g. apiVersion mismatch, thrown error) */
  error: string | null;
}

interface PluginRecord {
  plugin: Plugin;
  active: boolean;
  disposables: Disposable[];
  error: string | null;
  /** serializes activate/deactivate so racing toggles can't interleave */
  inFlight: Promise<void> | null;
}

interface SettingsAdapter {
  read(pluginId: string): Record<string, unknown>;
  write(pluginId: string, settings: Record<string, unknown>): void;
  readDisabled(): string[];
  writeDisabled(disabled: string[]): void;
}

/**
 * Owns the plugin lifecycle and the contribution registries (commands, views,
 * ribbon items) plus the app event bus. UI reads registries through hooks;
 * plugins write to them through their activation context.
 */
export class PluginManager {
  readonly commands = new CommandRegistry();
  readonly views = new ViewRegistry();
  readonly editors = new EditorRegistry();
  readonly docTypes = new DocTypeRegistry();
  readonly menus = new MenuRegistry();
  readonly events = new TypedEventBus<AppEvents>();

  constructor() {
    // core creatable types live in the same registry as plugin types so
    // creation UIs (e.g. the Explorer's "new document" popover) render
    // everything from one source
    this.docTypes.addCore({
      docType: 'core/note',
      label: 'Nota',
      icon: File,
      iconColor: 'text-note',
      defaultTitle: 'Nova Nota',
      defaultContent: () => JSON.stringify([{ type: 'paragraph' }]),
    });
    this.docTypes.addCore({
      docType: 'core/whiteboard',
      label: 'Quadro',
      icon: LayoutGrid,
      iconColor: 'text-board',
      defaultTitle: 'Novo Quadro',
      defaultContent: () => JSON.stringify({ nodes: [] }),
    });
    this.docTypes.addCore({
      docType: 'core/folder',
      label: 'Pasta',
      icon: Folder,
      iconColor: 'text-ink-3',
      defaultTitle: 'Nova Pasta',
    });
  }

  private records = new Map<string, PluginRecord>();
  private listeners = new Set<() => void>();
  private version = 0;
  private facade: AppFacade | null = null;
  private settings: SettingsAdapter | null = null;

  configure(facade: AppFacade, settings: SettingsAdapter): void {
    this.facade = facade;
    this.settings = settings;
  }

  register(plugin: Plugin): void {
    const { id } = plugin.manifest;
    // first wins: an external plugin must never replace a built-in (or another
    // external) record — id squatting would grant access to the victim's
    // settings blob and allow UI/command spoofing
    if (this.records.has(id)) {
      console.error(`[plugins] plugin id '${id}' já registrado — rejeitando '${plugin.manifest.name}'`);
      return;
    }
    this.records.set(id, { plugin, active: false, disposables: [], error: null, inFlight: null });
    this.notify();
  }

  /** Deactivates and unregisters a plugin (used when reloading external plugins). */
  async remove(id: string): Promise<void> {
    await this.deactivate(id);
    if (this.records.delete(id)) this.notify();
  }

  /** ids persisted as disabled by the user */
  listDisabled(): string[] {
    return this.settings?.readDisabled() ?? [];
  }

  async activateAll(): Promise<void> {
    const disabled = new Set(this.settings?.readDisabled() ?? []);
    for (const [id, record] of this.records) {
      // required plugins always activate, even if persisted as disabled
      if (record.plugin.manifest.required || !disabled.has(id)) await this.activate(id);
    }
    // self-heal: scrub required plugins from the persisted disabled list
    // (e.g. disabled before they became required)
    const scrubbed = [...disabled].filter((id) => !this.records.get(id)?.plugin.manifest.required);
    if (scrubbed.length !== disabled.size) this.settings?.writeDisabled(scrubbed);
  }

  async deactivateAll(): Promise<void> {
    for (const id of this.records.keys()) {
      await this.deactivate(id);
    }
  }

  /** Returns true when the plugin ended up active. */
  activate(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) return Promise.resolve(false);
    return this.enqueue(record, () => this.doActivate(record));
  }

  deactivate(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) return Promise.resolve();
    return this.enqueue(record, () => this.doDeactivate(record));
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const record = this.records.get(id);
    // required plugins are never deactivated nor persisted as disabled
    if (!record || (!enabled && record.plugin.manifest.required)) return;
    if (enabled) await this.activate(id);
    else await this.deactivate(id);
    // persist the user's INTENT, not the outcome: a failed enable must not be
    // written as a permanent opt-out (it will be retried on next launch)
    const disabled = new Set(this.settings?.readDisabled() ?? []);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    this.settings?.writeDisabled([...disabled]);
  }

  isActive(id: string): boolean {
    return this.records.get(id)?.active ?? false;
  }

  list(): PluginInfo[] {
    return [...this.records.values()].map((r) => ({
      manifest: r.plugin.manifest,
      active: r.active,
      error: r.error,
    }));
  }

  /** monotonic counter bumped on any lifecycle change (React snapshot) */
  getVersion(): number {
    return this.version;
  }

  subscribe(fn: () => void): Disposable {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  private enqueue<T>(record: PluginRecord, op: () => Promise<T>): Promise<T> {
    const run = (record.inFlight ?? Promise.resolve()).then(op, op);
    record.inFlight = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async doActivate(record: PluginRecord): Promise<boolean> {
    if (record.active) return true;
    const { plugin } = record;

    if (plugin.manifest.apiVersion !== PLUGIN_API_VERSION) {
      record.error = `API incompatível (plugin: v${plugin.manifest.apiVersion}, host: v${PLUGIN_API_VERSION})`;
      console.error(`[plugins] refused to activate '${plugin.manifest.id}': ${record.error}`);
      this.events.emit('plugins:changed', { pluginId: plugin.manifest.id, enabled: false });
      this.notify();
      return false;
    }

    try {
      await plugin.activate(this.createContext(record));
      record.active = true;
      record.error = null;
    } catch (err) {
      record.error = err instanceof Error ? err.message : String(err);
      console.error(`[plugins] activation of '${plugin.manifest.id}' failed`, err);
      // partial contributions must not leak
      this.disposeRecord(record);
    }
    this.events.emit('plugins:changed', { pluginId: plugin.manifest.id, enabled: record.active });
    this.notify();
    return record.active;
  }

  private async doDeactivate(record: PluginRecord): Promise<void> {
    if (!record.active) return;
    if (record.plugin.manifest.required) {
      console.warn(`[plugins] '${record.plugin.manifest.id}' é obrigatório e não pode ser desativado`);
      return;
    }
    try {
      await record.plugin.deactivate?.();
    } catch (err) {
      console.error(`[plugins] deactivate of '${record.plugin.manifest.id}' failed`, err);
    }
    this.disposeRecord(record);
    record.active = false;
    this.events.emit('plugins:changed', { pluginId: record.plugin.manifest.id, enabled: false });
    this.notify();
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private disposeRecord(record: PluginRecord): void {
    for (const d of [...record.disposables].reverse()) {
      try {
        d.dispose();
      } catch (err) {
        console.error(`[plugins] disposal failed for '${record.plugin.manifest.id}'`, err);
      }
    }
    record.disposables = [];
  }

  private createContext(record: PluginRecord): PluginContext {
    if (!this.facade || !this.settings) throw new Error('PluginManager not configured');
    const { plugin } = record;
    const collect = (d: Disposable): Disposable => {
      record.disposables.push(d);
      return d;
    };
    const events = this.events;
    const settingsAdapter = this.settings;
    const pluginId = plugin.manifest.id;

    const settings: PluginSettings = {
      get: <T,>(key: string, fallback: T): T => {
        const value = settingsAdapter.read(pluginId)[key];
        return value === undefined ? fallback : (value as T);
      },
      set: (key, value) => {
        settingsAdapter.write(pluginId, { ...settingsAdapter.read(pluginId), [key]: value });
      },
      all: () => settingsAdapter.read(pluginId),
    };

    return {
      manifest: plugin.manifest,
      app: this.facade,
      events: {
        on<K extends keyof AppEvents>(type: K, handler: (payload: AppEvents[K]) => void) {
          return collect(events.on(type, handler));
        },
        emit<K extends keyof AppEvents>(type: K, payload: AppEvents[K]) {
          events.emit(type, payload);
        },
      },
      commands: {
        add: (command: Command) => collect(this.commands.add(command)),
      },
      views: {
        add: (view: ViewContribution) => collect(this.views.addView(view)),
        addRibbonItem: (item: RibbonItem) => collect(this.views.addRibbonItem(item)),
      },
      editors: {
        add: (editor: EditorContribution) => collect(this.editors.addEditor(editor)),
      },
      docTypes: {
        add: (contribution: DocTypeContribution) => collect(this.docTypes.add(contribution)),
      },
      menus: {
        add: (item: MenuItemContribution) => collect(this.menus.add(item)),
      },
      settings,
      register: (d) => collect(d),
    };
  }
}

// ---------- React integration ----------

const ManagerContext = createContext<PluginManager | null>(null);

export function usePluginManager(): PluginManager {
  const ctx = useContext(ManagerContext);
  if (!ctx) throw new Error('usePluginManager outside PluginProvider');
  return ctx;
}

interface Subscribable {
  subscribe(fn: () => void): Disposable;
  getVersion(): number;
}

/**
 * Subscribes to a registry using its version counter as the snapshot, then
 * reads derived data during render. Avoids both the tearing of hand-rolled
 * useState+effect subscriptions and the unstable-snapshot pitfalls of
 * returning fresh arrays from getSnapshot.
 */
function useRegistryVersion(source: Subscribable): void {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const d = source.subscribe(onChange);
      return () => d.dispose();
    },
    [source]
  );
  const getSnapshot = useCallback(() => source.getVersion(), [source]);
  useSyncExternalStore(subscribe, getSnapshot);
}

export function useCommands(): Command[] {
  const manager = usePluginManager();
  useRegistryVersion(manager.commands);
  return manager.commands.list();
}

export function useViews(location?: ViewLocation): ViewContribution[] {
  const manager = usePluginManager();
  useRegistryVersion(manager.views);
  return manager.views.listViews(location);
}

export function useRibbonItems(): RibbonItem[] {
  const manager = usePluginManager();
  useRegistryVersion(manager.views);
  return manager.views.listRibbonItems();
}

export function useEditor(docType: string): EditorContribution | undefined {
  const manager = usePluginManager();
  useRegistryVersion(manager.editors);
  return manager.editors.getEditor(docType);
}

export function useDocTypes(): DocTypeContribution[] {
  const manager = usePluginManager();
  useRegistryVersion(manager.docTypes);
  return manager.docTypes.list();
}

export function useMenuItems(location: MenuLocation): MenuItemContribution[] {
  const manager = usePluginManager();
  useRegistryVersion(manager.menus);
  return manager.menus.list(location);
}

export function usePlugins(): PluginInfo[] {
  const manager = usePluginManager();
  useRegistryVersion(manager);
  return manager.list();
}

export function usePluginEvent<K extends keyof AppEvents>(type: K, handler: (payload: AppEvents[K]) => void): void {
  const manager = usePluginManager();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const d = manager.events.on(type, (payload) => handlerRef.current(payload));
    return () => d.dispose();
  }, [manager, type]);
}

// ---------- external (community) plugins ----------

export interface ExternalPluginsHandle {
  reloading: boolean;
  /** re-scans the plugins folder: removes loaded external plugins and reloads them */
  reload(): Promise<void>;
}

const ExternalPluginsContext = createContext<ExternalPluginsHandle | null>(null);

/** null when rendered outside the PluginProvider */
export function useExternalPlugins(): ExternalPluginsHandle | null {
  return useContext(ExternalPluginsContext);
}

export function PluginProvider({
  plugins,
  fallback = null,
  children,
}: {
  plugins: Plugin[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const store = useStore();
  const storeRef = useRef(store);
  storeRef.current = store;
  const [ready, setReady] = useState(false);
  const [reloading, setReloading] = useState(false);
  const externalIdsRef = useRef<string[]>([]);

  const manager = useMemo(() => new PluginManager(), []);
  // the plugin host is app-scoped (not realm-scoped): `plugins` is read once
  const pluginsRef = useRef(plugins);

  const reloadExternal = useCallback(async () => {
    setReloading(true);
    try {
      for (const id of externalIdsRef.current) await manager.remove(id);
      const external = await loadExternalPlugins();
      externalIdsRef.current = external.map((p) => p.manifest.id);
      const disabled = new Set(manager.listDisabled());
      for (const plugin of external) {
        manager.register(plugin);
        if (!disabled.has(plugin.manifest.id)) await manager.activate(plugin.manifest.id);
      }
    } finally {
      setReloading(false);
    }
  }, [manager]);

  const externalHandle = useMemo(() => ({ reloading, reload: reloadExternal }), [reloading, reloadExternal]);

  useEffect(() => {
    const facade: AppFacade = {
      get activeRealmId() {
        return storeRef.current.activeRealmId;
      },
      get aiChatOpen() {
        return storeRef.current.aiChatOpen;
      },
      openDocument: (docId) => storeRef.current.openDocument(docId),
      openPanel: (panel) => storeRef.current.openPanel(panel),
      openView: (viewId) => storeRef.current.openView(viewId),
      setAiChatOpen: (open) => storeRef.current.setAiChatOpen(open),
      plugins: {
        isActive: (pluginId) => manager.isActive(pluginId),
      },
    };

    // The adapter owns the authoritative copy of UiState.plugins: it is the
    // only writer of that key, and caching avoids lost updates from stale
    // store snapshots when writes happen within the same render cycle.
    let pluginsCache: PluginUiState = { ...(storeRef.current.uiState.plugins ?? {}) };
    const persist = () => storeRef.current.saveUiState({ plugins: pluginsCache });

    const settings: SettingsAdapter = {
      read: (pluginId) => pluginsCache.settings?.[pluginId] ?? {},
      write: (pluginId, pluginSettings) => {
        pluginsCache = {
          ...pluginsCache,
          settings: { ...(pluginsCache.settings ?? {}), [pluginId]: pluginSettings },
        };
        persist();
      },
      readDisabled: () => pluginsCache.disabled ?? [],
      writeDisabled: (disabled) => {
        pluginsCache = { ...pluginsCache, disabled };
        persist();
      },
    };

    manager.configure(facade, settings);

    let cancelled = false;
    (async () => {
      for (const plugin of pluginsRef.current) manager.register(plugin);
      const external = await loadExternalPlugins();
      if (cancelled) return;
      externalIdsRef.current = external.map((p) => p.manifest.id);
      for (const plugin of external) manager.register(plugin);
      await manager.activateAll();
      if (!cancelled) setReady(true);
    })();

    const onKeydown = (e: KeyboardEvent) => manager.commands.handleKeydown(e);
    window.addEventListener('keydown', onKeydown);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeydown);
      void manager.deactivateAll();
    };
  }, [manager]);

  // broadcast realm switches on the event bus (initial emission included,
  // fired only after activation so late-subscribing plugins don't miss it)
  useEffect(() => {
    if (ready) manager.events.emit('realm:changed', { realmId: store.activeRealmId });
  }, [manager, ready, store.activeRealmId]);

  if (!ready) return <>{fallback}</>;

  return (
    <ManagerContext.Provider value={manager}>
      <ExternalPluginsContext.Provider value={externalHandle}>{children}</ExternalPluginsContext.Provider>
    </ManagerContext.Provider>
  );
}
