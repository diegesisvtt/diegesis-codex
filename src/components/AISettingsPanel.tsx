import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Database, Loader2, Plug, RefreshCw, XCircle } from 'lucide-react';
import type { AIIndexStatus, AIProviderConfig, ProviderInfo, ProviderTestResult } from '@shared/types';
import { Button } from './ui';

function ProviderSection({
  providers,
  saved,
  onSave,
}: {
  providers: ProviderInfo[];
  saved: AIProviderConfig | null;
  onSave(cfg: AIProviderConfig | null): Promise<void>;
}) {
  const [providerId, setProviderId] = useState(saved?.providerId ?? '');
  const [values, setValues] = useState<Record<string, string>>(saved?.config ?? {});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const provider = useMemo(() => providers.find((p) => p.id === providerId) ?? null, [providers, providerId]);

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
      setTestResult(await window.mythril.ai.testProvider(provider.id, values));
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

  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2">
          <Plug size={15} className="text-accent-ink" />
          Provider de chat
        </h3>
        <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">
          Usado nas conversas do Assistente IA e nos comandos do editor. Chaves de API são criptografadas
          localmente quando o sistema operacional oferece keyring.
        </p>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-1.5">Provider</label>
      <select
        value={providerId}
        onChange={(e) => setProviderId(e.target.value)}
        className="w-full bg-sidebar border border-line rounded-md px-3 py-2 text-[13px] text-ink-1 outline-none focus:border-accent transition-colors mb-4"
      >
        <option value="">— Desativado —</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {provider && (
        <>
          <p className="text-[12px] text-ink-3 mb-4 leading-relaxed">{provider.description}</p>
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
            <Button variant="secondary" onClick={test} disabled={testing}>
              {testing ? <Loader2 size={14} className="animate-spin" /> : null}
              Testar conexão
            </Button>
            <Button onClick={save} disabled={saving}>
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

export function AISettingsPanel() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [chatCfg, setChatCfg] = useState<AIProviderConfig | null>(null);
  const [status, setStatus] = useState<AIIndexStatus | null>(null);

  const reload = useCallback(async () => {
    const [p, s, st] = await Promise.all([
      window.mythril.ai.providers(),
      window.mythril.ai.getSettings(),
      window.mythril.ai.indexStatus(),
    ]);
    setProviders(p);
    setChatCfg(s.chat);
    setStatus(st);
  }, []);

  useEffect(() => {
    reload();
    return window.mythril.ai.onIndexStatus(setStatus);
  }, [reload]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-app">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-1 tracking-tight">Configurações de IA</h2>
          <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">
            Providers de chat são plug-and-play. A busca semântica usa um modelo de embeddings local, sem
            configuração.
          </p>
        </div>

        <ProviderSection
          key={chatCfg?.providerId ?? 'none'}
          providers={providers}
          saved={chatCfg}
          onSave={async (cfg) => {
            await window.mythril.ai.setChatProvider(cfg);
            await reload();
          }}
        />

        {status && <IndexCard status={status} onRebuild={() => window.mythril.ai.rebuildIndex()} />}
      </div>
    </div>
  );
}
