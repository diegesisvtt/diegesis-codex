import type { ComponentType } from 'react';
import type { TabNode } from 'flexlayout-react';
import type { AppEvents, EventBus } from './events';
import type { Command } from './commands';
import type { RibbonItem, ViewContribution } from './views';
import type { EditorContribution } from './editors';
import type { DocTypeContribution } from './docTypes';
import type { MenuItemContribution } from './menus';
import type { SettingDeclaration, SettingsPageContribution } from './settings';
import type { HookHandler, HookMap } from './hooks';

import { PLUGIN_API_VERSION } from '@shared/types';

/**
 * Bump when the plugin API breaks compatibility. Plugins declare the version
 * they were built against; the host refuses to activate mismatched plugins.
 * (Defined in shared/types so the main process can validate manifests too.)
 */
export { PLUGIN_API_VERSION };

/** Capabilities a plugin declares in its manifest. Not enforced for built-in
 *  plugins — the future sandboxed loader will enforce them. */
export type PluginPermission =
  | 'ui'
  | 'commands'
  | 'events'
  | 'settings'
  | 'docs:read'
  | 'docs:write'
  | 'ai'
  | 'network';

export interface PluginManifest {
  /** unique, namespaced id, e.g. 'core/search' */
  id: string;
  name: string;
  version: string;
  /** PLUGIN_API_VERSION the plugin was built against */
  apiVersion: number;
  description?: string;
  author?: string;
  permissions?: PluginPermission[];
  /** host-controlled: required plugins cannot be disabled (the loader strips
   *  this flag from external plugin manifests) */
  required?: boolean;
  /** set by the host loader for community plugins (not by plugin authors) */
  external?: boolean;
}

/** A resource that can be torn down. Everything a plugin registers through
 *  its context is collected and disposed automatically on deactivation. */
export interface Disposable {
  dispose(): void;
}

/** Curated, typed access to host application capabilities. */
export interface AppFacade {
  /** id of the active realm (universe), or null when none is open */
  readonly activeRealmId: string | null;
  openDocument(docId: string): void;
  openPanel(panel: 'ai-chat' | 'settings'): void;
  /** opens the Settings panel; `sectionId` pre-selects a section —
   *  plugin pages are addressable as `plugin:<pluginId>` */
  openSettings(sectionId?: string): void;
  /** opens a registered 'workspace-tab' view as a tab in the workspace */
  openView(viewId: string): void;
  setAiChatOpen(open: boolean): void;
  readonly aiChatOpen: boolean;
  /** id of the view shown in the right-side panel, or null when closed */
  readonly rightPanelView: string | null;
  /** opens a registered 'right-panel' view; null closes the panel */
  setRightPanelView(viewId: string | null): void;
  /** introspection into other plugins' lifecycle state */
  readonly plugins: {
    /** true when the plugin is registered AND currently active */
    isActive(pluginId: string): boolean;
  };
}

/** Per-plugin key/value settings, persisted in the SQLite-backed UI state. */
export interface PluginSettings {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  all(): Record<string, unknown>;
  /** declares typed fields so the host can auto-generate a settings form
   *  (Foundry-style). Disposed automatically on deactivation. */
  registerAll(declarations: SettingDeclaration[]): Disposable;
  /** notified whenever this plugin's settings blob changes (including own
   *  writes) — the reactive alternative to polling `get` */
  subscribe(listener: () => void): Disposable;
}

export interface PluginContext {
  readonly manifest: PluginManifest;
  readonly app: AppFacade;
  /** typed pub/sub; subscriptions made via `on` are auto-disposed */
  readonly events: EventBus<AppEvents>;
  /** named plugin-provided services with return values (vs. fire-and-forget
   *  events). First registration wins; auto-disposed on deactivation. */
  readonly hooks: {
    register<K extends keyof HookMap>(name: K, handler: HookHandler<HookMap[K]['payload'], HookMap[K]['result']>): Disposable;
  };
  readonly commands: {
    add(command: Command): Disposable;
  };
  readonly views: {
    add(view: ViewContribution): Disposable;
    addRibbonItem(item: RibbonItem): Disposable;
  };
  readonly editors: {
    /** register an editor component for a plugin-owned document type */
    add(editor: EditorContribution): Disposable;
  };
  readonly docTypes: {
    /** register a creatable document type (label, icon, defaults) shown in creation UIs */
    add(contribution: DocTypeContribution): Disposable;
  };
  readonly menus: {
    /** contribute an item to a host context menu (e.g. 'explorer:item') */
    add(item: MenuItemContribution): Disposable;
  };
  readonly settings: PluginSettings;
  readonly settingsPages: {
    /** contribute a settings page (Obsidian-style). Without `component`, the
     *  host auto-generates the form from the declared settings schema.
     *  A custom page replaces the auto-generated one. */
    add(page: SettingsPageContribution): Disposable;
  };
  /** collect an arbitrary disposable for deactivation cleanup */
  register(disposable: Disposable): void;
}

export interface Plugin {
  readonly manifest: PluginManifest;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

/** Props passed to contributed view components rendered inside flexlayout tabs. */
export interface ViewProps {
  node?: TabNode;
}

export type ViewComponent = ComponentType<ViewProps>;
