import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Database, Info, Loader2, Plug, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import type { AIIndexStatus, AIProviderConfig, AISettings, ProviderInfo, ProviderTestResult } from '@shared/types';
import { Button } from './ui';

type SettingsSectionId = 'general' | 'ai';

const SECTIONS: { id: SettingsSectionId; name: string; icon: typeof Info }[] = [
  { id: 'general', name: 'Geral', icon: Info },
  { id: 'ai', name: 'IA', icon: Sparkles },
];

// ---------- shared provider form (chat & web search) ----------

function ProviderSection({
  title,
  description,
  emptyLabel,
  providers,
  saved,
  onSave,
  onTest,
}: {
  title: string;
  description: string;
  /** label for the "no provider selected" option */
  emptyLabel: string;
  providers: ProviderInfo[];
  saved: AIProviderConfig | null;
  onSave(cfg: AIProviderConfig | null): Promise<void>;
  onTest(providerId: string, config: Record<string, string>): Promise<ProviderTestResult>;
}) {
  const [providerId, setProviderId] = useState(saved?.providerId ?? '');
  const [values, setValues] = useState<Record<string, string>>(saved?.config ?? {});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const provider = useMemo(() => providers.find((p) => p.id === providerId) ?? null, [providers, providerId]);

  // providers with required API keys are only selectable once a key exists
  // (stored — SECRET_MASK counts — or entered in the form for the selected provider)
  const hasRequiredKey = useCallback(
    (p: ProviderInfo) => {
      const requiredSecrets = p.fields.filter((f) => f.secret && f.required);
      if (requiredSecrets.length === 0) return true;
      if (p.id === providerId) {
        return requiredSecrets.every((f) => !!(values[f.key] ?? '').trim());
      }
      if (saved?.providerId !== p.id) return false;
      return requiredSecrets.every((f) => !!saved.config[f.key]);
    },
    [providerId, values, saved]
  );

  // reset fields when switching providers (never carry values — especially the
  // SECRET_MASK placeholder — across different providers)
  useEffect(() => {
    if (!provider) return;
    if (provider.id === saved?.providerId) {
      setValues(saved.config);
    } else {
      const next: Record<string, string> = {};
      for (const f of provider.fields) next[f.key] = f.default ?? '';
      setValues(next);
    }
    setTestResult(null);
  }, [providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const test = async () => {
    if (!provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTest(provider.id, values));
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(provider ? { providerId: provider.id, config: values } : null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const missingRequired = provider?.fields.some((f) => f.required && !(values[f.key] ?? '').trim()) ?? false;

  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2">
          <Plug size={15} className="text-accent-ink" />
          {title}
        </h3>
        <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">{description}</p>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-1.5">Provider</label>
      <select
        value={providerId}
        onChange={(e) => setProviderId(e.target.value)}
        className="w-full bg-sidebar border border-line rounded-md px-3 py-2 text-[13px] text-ink-1 outline-none focus:border-accent transition-colors mb-4"
      >
        <option value="">{emptyLabel}</option>
        {providers.map((p) => {
          const keyed = hasRequiredKey(p);
          return (
            <option key={p.id} value={p.id} disabled={!keyed && p.id !== providerId}>
              {p.name}
              {!keyed ? ' (requer chave de API)' : ''}
            </option>
          );
        })}
      </select>

      {provider && (
        <>
          <p className="text-[12px] text-ink-3 mb-4 leading-relaxed">{provider.description}</p>
          {provider.fields.length > 0 && (
            <div className="flex flex-col gap-3 mb-4">
              {provider.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[12px] text-ink-2 mb-1">
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </label>
                  <input
                    type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="w-full bg-sidebar border border-line rounded-md px-3 py-2 text-[13px] text-ink-1 placeholder-ink-3 outline-none focus:border-accent transition-colors"
                  />
                </div>
              ))}
            </div>
          )}

          {testResult && (
            <div
              className={`flex items-start gap-2 text-[12px] rounded-md px-3 py-2 mb-4 ${
                testResult.ok ? 'bg-accent-soft text-accent-ink' : 'bg-danger-soft text-danger'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 size={14} className="shrink-0 mt-px" />
              ) : (
                <XCircle size={14} className="shrink-0 mt-px" />
              )}
              <span className="break-all">{testResult.ok ? 'Conexão OK' : (testResult.error ?? 'Falhou')}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {provider.fields.length > 0 && (
              <Button variant="secondary" onClick={test} disabled={testing}>
                {testing ? <Loader2 size={14} className="animate-spin" /> : null}
                Testar conexão
              </Button>
            )}
            <Button onClick={save} disabled={saving || missingRequired}>
              {savedFlash ? 'Salvo ✓' : 'Salvar'}
            </Button>
          </div>
        </>
      )}

      {!provider && saved && (
        <div className="mt-1">
          <Button variant="ghost" onClick={save}>
            Confirmar remoção
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------- IA: semantic index ----------

function IndexCard({ status, onRebuild }: { status: AIIndexStatus; onRebuild(): void }) {
  const pct = status.chunkCount > 0 ? Math.round((status.embeddedCount / status.chunkCount) * 100) : 100;
  const downloading = status.modelState === 'downloading';
  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2">
          <Database size={15} className="text-accent-ink" />
          Busca semântica (sqlite-vec)
        </h3>
        <Button variant="secondary" onClick={onRebuild} disabled={downloading}>
          <RefreshCw size={13} className={status.processing ? 'animate-spin' : ''} />
          Reindexar tudo
        </Button>
      </div>

      <p className="text-[12px] text-ink-3 leading-relaxed mb-3">
        Os embeddings são gerados <strong className="text-ink-2">localmente</strong> (multilingual-e5-small),
        otimizados para textos em português. Nenhum dado sai da sua máquina.
      </p>

      {downloading && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-[12px] text-ink-2 mb-1.5">
            <Loader2 size={12} className="animate-spin" />
            Baixando modelo de embeddings (primeira execução)… {status.modelProgress}%
          </div>
          <div className="h-1.5 rounded-full bg-sidebar overflow-hidden">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${status.modelProgress}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-[12px] text-ink-2 mb-2">
        <span>
          <strong className="text-ink-1">{status.embeddedCount}</strong> / {status.chunkCount} trechos indexados
        </span>
        {status.pendingJobs > 0 && (
          <span className="text-ink-3 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> {status.pendingJobs} pendentes
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-sidebar overflow-hidden">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {status.lastError && (
        <div className="flex items-start gap-2 text-[12px] rounded-md px-3 py-2 mt-3 bg-danger-soft text-danger">
          <XCircle size={14} className="shrink-0 mt-px" />
          <span className="break-all">Erro ao indexar: {status.lastError}</span>
        </div>
      )}
    </section>
  );
}

// ---------- sections ----------

function GeneralSection() {
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState('');
  useEffect(() => {
    window.mythril.app.version().then(setVersion);
    window.mythril.app.platform().then(setPlatform);
  }, []);
  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2 mb-4">
        <Info size={15} className="text-accent-ink" />
        Sobre o Mythril
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

function AISection() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [searchProviders, setSearchProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [status, setStatus] = useState<AIIndexStatus | null>(null);

  const reload = useCallback(async () => {
    const [p, sp, s, st] = await Promise.all([
      window.mythril.ai.providers(),
      window.mythril.ai.searchProviders(),
      window.mythril.ai.getSettings(),
      window.mythril.ai.indexStatus(),
    ]);
    setProviders(p);
    setSearchProviders(sp);
    setSettings(s);
    setStatus(st);
  }, []);

  useEffect(() => {
    reload();
    return window.mythril.ai.onIndexStatus(setStatus);
  }, [reload]);

  if (!settings) return null;

  return (
    <>
      <ProviderSection
        key={`chat-${settings.chat?.providerId ?? 'none'}`}
        title="Provider de chat"
        description="Usado nas conversas do Assistente IA e nos comandos do editor. Chaves de API são criptografadas localmente quando o sistema operacional oferece keyring."
        emptyLabel="— Desativado —"
        providers={providers}
        saved={settings.chat}
        onSave={async (cfg) => {
          await window.mythril.ai.setChatProvider(cfg);
          await reload();
        }}
        onTest={(id, cfg) => window.mythril.ai.testProvider(id, cfg)}
      />

      <ProviderSection
        key={`search-${settings.search?.providerId ?? 'default'}`}
        title="Provider de busca na web"
        description="Usado quando a opção “Busca na web” está ativa no chat. DuckDuckGo é o padrão e não requer chave; Brave e Tavily precisam de API key."
        emptyLabel="— DuckDuckGo (padrão) —"
        providers={searchProviders.filter((p) => p.id !== 'duckduckgo')}
        saved={settings.search}
        onSave={async (cfg) => {
          await window.mythril.ai.setSearchProvider(cfg);
          await reload();
        }}
        onTest={(id, cfg) => window.mythril.ai.testSearchProvider(id, cfg)}
      />

      {status && <IndexCard status={status} onRebuild={() => window.mythril.ai.rebuildIndex()} />}
    </>
  );
}

// ---------- panel ----------

export function SettingsPanel() {
  const [section, setSection] = useState<SettingsSectionId>('general');

  return (
    <div className="h-full flex bg-app">
      {/* sections nav */}
      <div className="w-44 shrink-0 border-r border-line bg-sidebar py-3">
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
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-5">
          {section === 'general' ? (
            <>
              <div>
                <h2 className="text-lg font-semibold text-ink-1 tracking-tight">Geral</h2>
                <p className="text-[13px] text-ink-3 mt-1">Informações do aplicativo.</p>
              </div>
              <GeneralSection />
            </>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-ink-1 tracking-tight">IA</h2>
                <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">
                  Providers de chat e busca na web são plug-and-play. A busca semântica usa um modelo de embeddings
                  local, sem configuração.
                </p>
              </div>
              <AISection />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
