import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FolderOpen,
  Info,
  Loader2,
  Plug,
  Puzzle,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import {
  useExternalPlugins,
  usePluginManager,
  usePlugins,
  usePluginSettings,
  useSettingsPages,
  type PluginInfo,
  type PluginSettings,
  type SettingDeclaration,
  type SettingsNavEntry,
} from '../plugins';
import { useStore } from '../state/store';
import { Button, Toggle } from './ui';

type BuiltinSectionId = 'general' | 'plugins';

/** section ids: builtin ids, settings page ids, `schema:<pluginId>` (páginas
 *  implícitas) ou `plugin:<pluginId>` (deep-link, resolvido na renderização) */
type SettingsSectionId = string;

const SECTIONS: { id: BuiltinSectionId; name: string; icon: typeof Info }[] = [
  { id: 'general', name: 'Geral', icon: Info },
  { id: 'plugins', name: 'Plugins', icon: Plug },
];

// ---------- plugin settings pages ----------

const inputCls =
  'bg-sidebar border border-line rounded-md px-3 py-1.5 text-[13px] text-ink-1 placeholder-ink-3 outline-none focus:border-accent transition-colors';

/** Um campo do formulário auto-gerado a partir do schema declarativo. */
function SettingField({ decl, settings }: { decl: SettingDeclaration; settings: PluginSettings }) {
  const value = settings.get(decl.key, decl.default);
  let control: ReactNode;

  switch (decl.type) {
    case 'boolean':
      control = <Toggle checked={!!value} onChange={(v) => settings.set(decl.key, v)} />;
      break;
    case 'select':
      control = (
        <select
          value={String(value ?? '')}
          onChange={(e) => settings.set(decl.key, e.target.value)}
          className={`${inputCls} max-w-[220px]`}
        >
          {(decl.choices ?? []).map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'number': {
      const num = typeof value === 'number' ? value : Number(decl.default) || 0;
      control =
        decl.min !== undefined && decl.max !== undefined ? (
          <span className="flex items-center gap-2">
            <input
              type="range"
              min={decl.min}
              max={decl.max}
              step={decl.step ?? 1}
              value={num}
              onChange={(e) => settings.set(decl.key, Number(e.target.value))}
              className="w-32 accent-accent"
            />
            <span className="font-mono text-[11px] text-ink-3 w-8 text-right">{num}</span>
          </span>
        ) : (
          <input
            type="number"
            value={num}
            min={decl.min}
            max={decl.max}
            step={decl.step}
            onChange={(e) => settings.set(decl.key, Number(e.target.value))}
            className={`${inputCls} w-28`}
          />
        );
      break;
    }
    case 'color':
      control = (
        <input
          type="color"
          value={typeof value === 'string' ? value : '#ffffff'}
          onChange={(e) => settings.set(decl.key, e.target.value)}
          className="w-9 h-7 rounded border border-line bg-sidebar cursor-pointer"
        />
      );
      break;
    case 'text':
      control = (
        <textarea
          value={String(value ?? '')}
          placeholder={decl.placeholder}
          rows={3}
          onChange={(e) => settings.set(decl.key, e.target.value)}
          className={`${inputCls} w-full max-w-sm resize-y`}
        />
      );
      break;
    default: // 'string'
      control = (
        <input
          type="text"
          value={String(value ?? '')}
          placeholder={decl.placeholder}
          onChange={(e) => settings.set(decl.key, e.target.value)}
          className={`${inputCls} w-full max-w-sm`}
        />
      );
  }

  // campos largos (text/string) empilham; os demais ficam em linha
  const wide = decl.type === 'text' || decl.type === 'string';
  return (
    <div className={`py-4 first:pt-0 last:pb-0 ${wide ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-4'}`}>
      <div className="min-w-0">
        <div className="text-[13px] text-ink-1">{decl.label}</div>
        {decl.description && <div className="text-[12px] text-ink-3 mt-0.5 leading-snug">{decl.description}</div>}
      </div>
      <div className={wide ? '' : 'shrink-0'}>{control}</div>
    </div>
  );
}

/** Formulário auto-gerado a partir do schema declarado pelo plugin. */
function PluginSettingsForm({ schema, settings }: { schema: SettingDeclaration[]; settings: PluginSettings }) {
  if (schema.length === 0) {
    return (
      <p className="text-[12px] text-ink-3/80 border border-dashed border-line rounded-md px-3 py-4 leading-relaxed">
        Este plugin não declara configurações.
      </p>
    );
  }
  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <div className="flex flex-col divide-y divide-line">
        {schema.map((decl) => (
          <SettingField key={decl.key} decl={decl} settings={settings} />
        ))}
      </div>
    </section>
  );
}

/** Página de configurações de um plugin: componente custom (se houver) ou
 *  formulário auto-gerado do schema. */
function PluginPageSection({ entry, plugins }: { entry: SettingsNavEntry; plugins: PluginInfo[] }) {
  const manager = usePluginManager();
  const settings = usePluginSettings(entry.pluginId);
  const info = plugins.find((p) => p.manifest.id === entry.pluginId);
  const Custom = entry.component;

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-ink-1 tracking-tight">{entry.title}</h2>
        <p className="text-[13px] text-ink-3 mt-1">
          {info ? `${info.manifest.name} v${info.manifest.version}` : entry.pluginId}
          {info?.manifest.external ? ' · plugin de comunidade' : ''}
        </p>
      </div>
      {Custom ? (
        <Custom settings={settings} />
      ) : (
        <PluginSettingsForm schema={manager.settingsPages.getSchema(entry.pluginId)} settings={settings} />
      )}
    </>
  );
}

/** Destino de deep-link sem página ativa: plugin desativado (oferece ativar)
 *  ou plugin sem página de configurações. */
function PluginPagePlaceholder({ pluginId, plugins }: { pluginId: string; plugins: PluginInfo[] }) {
  const manager = usePluginManager();
  const [busy, setBusy] = useState(false);
  const info = plugins.find((p) => p.manifest.id === pluginId);

  const activate = async () => {
    setBusy(true);
    try {
      await manager.setEnabled(pluginId, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-ink-1 tracking-tight">{info?.manifest.name ?? pluginId}</h2>
      </div>
      <section className="bg-elevated border border-line rounded-lg p-5">
        {info && !info.active ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-ink-3 leading-relaxed">
              Este plugin está desativado. Ative-o para ver e alterar suas configurações.
            </p>
            <Button onClick={activate} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Ativar plugin
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3 leading-relaxed">Este plugin não possui uma página de configurações.</p>
        )}
      </section>
    </>
  );
}

// ---------- sections ----------

function GeneralSection() {
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    window.diegesis.app.version().then(setVersion);
    window.diegesis.app.platform().then(setPlatform);
  }, []);
  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2 mb-4">
        <Info size={15} className="text-accent-ink" />
        Sobre o Diegesis Codex
      </h3>
      <dl className="flex flex-col gap-2.5 text-[13px]">
        <div className="flex items-center justify-between">
          <dt className="text-ink-3">Versão</dt>
          <dd className="text-ink-1 font-medium">{version || '—'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-3">Plataforma</dt>
          <dd className="text-ink-1 font-medium">{platform || '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

function PluginRow({
  plugin: p,
  busy,
  onToggle,
  onOpenSettings,
}: {
  plugin: PluginInfo;
  busy: boolean;
  onToggle(id: string, enabled: boolean): void;
  onOpenSettings(id: string): void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-ink-1">{p.manifest.name}</span>
          <span className="text-[10px] text-ink-3 bg-overlay rounded px-1.5 py-px">v{p.manifest.version}</span>
          {p.error && (
            <span className="text-[10px] text-danger bg-danger/10 rounded px-1.5 py-px" title={p.error}>
              erro
            </span>
          )}
        </div>
        {p.manifest.description && <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">{p.manifest.description}</p>}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] text-ink-3/70 font-mono">{p.manifest.id}</span>
          {p.manifest.external && p.manifest.permissions && p.manifest.permissions.length > 0 && (
            <span className="flex items-center gap-1 flex-wrap">
              {p.manifest.permissions.map((perm) => (
                <span key={perm} className="text-[9px] text-ink-3 bg-overlay rounded px-1 py-px font-mono">
                  {perm}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onOpenSettings(p.manifest.id)}
        title="Abrir configurações do plugin"
        className="p-1.5 rounded text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors shrink-0"
      >
        <Settings2 size={14} />
      </button>
      {p.manifest.required ? (
        <span className="text-[10px] text-ink-3 bg-overlay rounded px-1.5 py-1 shrink-0" title="Plugin essencial do aplicativo">
          sempre ativo
        </span>
      ) : (
        <Toggle
          checked={p.active}
          disabled={busy}
          onChange={(enabled) => onToggle(p.manifest.id, enabled)}
          title={p.active ? 'Desativar plugin' : 'Ativar plugin'}
        />
      )}
    </li>
  );
}

function PluginsSection() {
  const plugins = usePlugins();
  const manager = usePluginManager();
  const external = useExternalPlugins();
  const { openSettings } = useStore();
  const [busy, setBusy] = useState<string | null>(null);

  const core = plugins.filter((p) => !p.manifest.external);
  const community = plugins.filter((p) => p.manifest.external);

  const toggle = async (id: string, enabled: boolean) => {
    setBusy(id);
    try {
      await manager.setEnabled(id, enabled);
    } finally {
      setBusy(null);
    }
  };

  // deep-link (estilo Obsidian): abre a página de configurações do plugin
  const openPluginSettings = (id: string) => openSettings(`plugin:${id}`);

  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2 mb-1">
        <Plug size={15} className="text-accent-ink" />
        Plugins instalados
      </h3>
      <p className="text-[12px] text-ink-3 mb-4 leading-relaxed">
        Os recursos do Diegesis Codex são plugins sobre a mesma API pública. Desativar um plugin remove seus comandos,
        painéis e botões da interface; reativar os restaura.
      </p>

      {/* core plugins */}
      <h4 className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-1">Core</h4>
      <ul className="flex flex-col divide-y divide-line">
        {core.map((p) => (
          <PluginRow
            key={p.manifest.id}
            plugin={p}
            busy={busy === p.manifest.id}
            onToggle={toggle}
            onOpenSettings={openPluginSettings}
          />
        ))}
      </ul>

      {/* community plugins */}
      <div className="flex items-center justify-between mt-6 mb-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">Comunidade</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => window.diegesis.plugins.openFolder()}
            title="Abrir pasta de plugins da comunidade"
            className="flex items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink-2 px-2 py-1 rounded-md hover:bg-hover transition-colors border border-line bg-sidebar"
          >
            <FolderOpen size={12} />
            Pasta
          </button>
          <button
            onClick={() => external?.reload()}
            disabled={!external || external.reloading}
            title="Recarregar plugins da comunidade da pasta"
            className="flex items-center gap-1.5 text-[11px] text-ink-3 hover:text-ink-2 px-2 py-1 rounded-md hover:bg-hover transition-colors border border-line bg-sidebar disabled:opacity-40"
          >
            <RefreshCw size={12} className={external?.reloading ? 'animate-spin' : ''} />
            Recarregar
          </button>
        </div>
      </div>
      {community.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {community.map((p) => (
            <PluginRow
              key={p.manifest.id}
              plugin={p}
              busy={busy === p.manifest.id}
              onToggle={toggle}
              onOpenSettings={openPluginSettings}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-3/80 border border-dashed border-line rounded-md px-3 py-4 leading-relaxed">
          Nenhum plugin de comunidade instalado. Para instalar, copie a pasta do plugin (com{' '}
          <code className="text-ink-2">manifest.json</code>) para a pasta de plugins e clique em Recarregar.
        </p>
      )}
    </section>
  );
}

// ---------- panel ----------

export function SettingsPanel() {
  const [section, setSection] = useState<SettingsSectionId>('general');
  const plugins = usePlugins();
  const pageEntries = useSettingsPages();
  const { settingsSection, clearSettingsSection } = useStore();

  // deep-link consumível (Configurações → Plugins → ⚙️, app.openSettings, …)
  useEffect(() => {
    if (settingsSection) {
      setSection(settingsSection);
      clearSettingsSection();
    }
  }, [settingsSection, clearSettingsSection]);

  // páginas implícitas (schema-only) usam o nome do manifest como título
  const entries = useMemo(
    () =>
      pageEntries.map((e) =>
        e.id.startsWith('schema:')
          ? { ...e, title: plugins.find((p) => p.manifest.id === e.pluginId)?.manifest.name ?? e.title }
          : e
      ),
    [pageEntries, plugins]
  );

  const isBuiltin = SECTIONS.some((s) => s.id === section);
  // resolve a seção para uma página de plugin: id exato da página, ou
  // deep-link `plugin:<pluginId>` → primeira página daquele plugin
  const pluginTarget = section.startsWith('plugin:') ? section.slice('plugin:'.length) : null;
  const activeEntry = !isBuiltin
    ? entries.find((e) => e.id === section) ?? (pluginTarget ? entries.find((e) => e.pluginId === pluginTarget) : undefined)
    : undefined;

  const entryActive = (e: SettingsNavEntry) => section === e.id || pluginTarget === e.pluginId;

  return (
    <div className="h-full flex bg-app">
      {/* sections nav */}
      <div className="w-44 shrink-0 border-r border-line bg-sidebar py-3 overflow-y-auto custom-scrollbar">
        <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Configurações</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${
              section === s.id ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover'
            }`}
          >
            <s.icon size={14} className={section === s.id ? 'text-accent-ink' : 'text-ink-3'} />
            {s.name}
          </button>
        ))}

        {/* plugin settings pages (grupo estilo Obsidian) */}
        {entries.length > 0 && (
          <>
            <div className="mx-4 my-2 border-t border-line" />
            <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Plugins</div>
            {entries.map((e) => {
              const Icon = e.icon ?? Puzzle;
              const active = entryActive(e);
              return (
                <button
                  key={e.id}
                  onClick={() => setSection(e.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${
                    active ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover'
                  }`}
                >
                  <Icon size={14} className={active ? 'text-accent-ink' : 'text-ink-3'} />
                  <span className="truncate">{e.title}</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-5">
          {section === 'general' && (
            <>
              <div>
                <h2 className="text-lg font-semibold text-ink-1 tracking-tight">Geral</h2>
                <p className="text-[13px] text-ink-3 mt-1">Informações do aplicativo.</p>
              </div>
              <GeneralSection />
            </>
          )}
          {section === 'plugins' && (
            <>
              <div>
                <h2 className="text-lg font-semibold text-ink-1 tracking-tight">Plugins</h2>
                <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">
                  Gerencie os recursos ativos do aplicativo.
                </p>
              </div>
              <PluginsSection />
            </>
          )}
          {!isBuiltin && activeEntry && <PluginPageSection entry={activeEntry} plugins={plugins} />}
          {!isBuiltin && !activeEntry && pluginTarget && <PluginPagePlaceholder pluginId={pluginTarget} plugins={plugins} />}
        </div>
      </div>
    </div>
  );
}
