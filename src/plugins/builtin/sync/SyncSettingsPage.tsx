// Settings page (contributed via ctx.settingsPages): provider setup, which
// realms sync, scheduling, and restoring a realm on a new device.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudOff,
  FolderOpen,
  History,
  Loader2,
  Plug,
  RefreshCw,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { Button, Toggle, ToggleList } from '../../../components/ui';
import type {
  AIProviderConfig,
  ProviderInfo,
  ProviderTestResult,
  Realm,
  RemoteRealmInfo,
  SyncConflictInfo,
  SyncSettings,
  SyncState,
  SyncVersionInfo,
} from '@shared/types';
import type { SettingsPageProps } from '../../api/settings';
import { clearHistory, useHistoryTarget, useSyncStatus } from './store';

const inputCls =
  'w-full bg-sidebar border border-line rounded-md px-3 py-2 text-[13px] text-ink-1 placeholder-ink-3 outline-none focus:border-accent transition-colors';

function Section({ title, icon: Icon, description, children }: {
  title: string;
  icon: typeof Plug;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2">
          <Icon size={15} className="text-accent-ink" />
          {title}
        </h3>
        {description && <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const STATE_META: Record<SyncState, { label: string; className: string; Icon: typeof Cloud }> = {
  disabled: { label: 'Desativado', className: 'text-ink-3', Icon: CloudOff },
  idle: { label: 'Sincronizado', className: 'text-success', Icon: CheckCircle2 },
  syncing: { label: 'Sincronizando…', className: 'text-accent-ink', Icon: RefreshCw },
  offline: { label: 'Offline', className: 'text-accent-ink', Icon: CloudOff },
  error: { label: 'Erro', className: 'text-danger', Icon: AlertTriangle },
  'auth-required': { label: 'Reautenticação necessária', className: 'text-danger', Icon: AlertTriangle },
};

function timeFmt(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(ts);
}

function ConflictsSection({ count }: { count: number }) {
  const [conflicts, setConflicts] = useState<SyncConflictInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    window.diegesis.sync.listConflicts().then(setConflicts);
  }, []);

  useEffect(reload, [reload, count]);

  if (conflicts.length === 0) return null;

  const resolve = async (id: string, resolution: 'local' | 'remote' | 'both') => {
    setBusy(id);
    await window.diegesis.sync.resolveConflict(id, resolution);
    setBusy(null);
    reload();
  };

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold text-danger">
        <AlertTriangle size={13} /> {conflicts.length} conflito(s)
      </div>
      <div className="flex flex-col gap-2">
        {conflicts.map((c) => (
          <div key={c.id} className="rounded-md border border-danger/40 bg-danger-soft/40 px-3 py-2">
            <div className="text-[12.5px] text-ink-1 truncate mb-0.5" title={c.title}>
              {c.title || c.docId}
            </div>
            <div className="text-[10.5px] text-ink-3 mb-2">{timeFmt(c.detectedAt)}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button variant="secondary" disabled={busy === c.id} onClick={() => resolve(c.id, 'local')}>
                Manter local
              </Button>
              <Button variant="secondary" disabled={busy === c.id} onClick={() => resolve(c.id, 'remote')}>
                Manter remoto
              </Button>
              <Button variant="ghost" disabled={busy === c.id} onClick={() => resolve(c.id, 'both')}>
                <ArrowLeftRight size={12} /> Ambos
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VersionsSection() {
  const target = useHistoryTarget();
  const [versions, setVersions] = useState<SyncVersionInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    window.diegesis.sync.listVersions(target.realmId, target.docId).then(setVersions);
  }, [target]);

  if (!target) return null;

  const restore = async (timestamp: number) => {
    setBusy(true);
    const err = await window.diegesis.sync.restoreVersion(target.realmId, target.docId, timestamp);
    setBusy(false);
    if (!err) window.diegesis.sync.now();
  };

  return (
    <div className="mt-4 pt-4 border-t border-line">
      <div className="flex items-center gap-1.5 mb-2">
        <History size={13} className="text-accent-ink" />
        <span className="text-[12px] font-semibold text-ink-2 truncate">Histórico · {target.title}</span>
        <button
          type="button"
          title="Fechar histórico"
          onClick={clearHistory}
          className="ml-auto p-0.5 rounded text-ink-3 hover:text-ink-1 hover:bg-elevated transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      {versions.length === 0 ? (
        <p className="text-[11.5px] text-ink-3">Nenhuma versão anterior ainda.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {versions.map((v) => (
            <div key={v.path} className="flex items-center gap-2 text-[12px] text-ink-2">
              <span className="truncate">{timeFmt(v.timestamp)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => restore(v.timestamp)}
                className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-ink-3 hover:text-accent-ink hover:bg-accent-soft transition-colors disabled:opacity-40"
              >
                <RotateCcw size={11} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard() {
  const status = useSyncStatus();
  const [syncing, setSyncing] = useState(false);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await window.diegesis.sync.now();
    } finally {
      setSyncing(false);
    }
  };

  const meta = status ? STATE_META[status.state] : null;
  const Icon = meta?.Icon ?? CloudOff;

  return (
    <Section title="Status" icon={Cloud} description="A sincronização roda sozinha em segundo plano; use o botão para forçar um ciclo agora.">
      <div className="flex items-center gap-2 mb-3">
        <Icon
          size={15}
          className={`${meta?.className ?? 'text-ink-3'} ${status?.state === 'syncing' ? 'animate-spin' : ''}`}
        />
        <span className="text-[13px] text-ink-1">{meta?.label ?? 'Sem status'}</span>
        <Button variant="secondary" className="ml-auto" disabled={syncing} onClick={syncNow}>
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sincronizar agora
        </Button>
      </div>

      {status && (
        <div className="text-[12.5px] text-ink-3 flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Última sincronização</span>
            <span className="text-ink-2">{status.lastSyncAt ? timeFmt(status.lastSyncAt) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Pendentes</span>
            <span className="text-ink-2">{status.pending}</span>
          </div>
          {status.lastError && <p className="text-danger break-words mt-0.5">{status.lastError}</p>}
        </div>
      )}

      <ConflictsSection count={status?.conflictCount ?? 0} />
      <VersionsSection />

      {status && status.log.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-2">Atividade recente</div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar">
            {status.log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                    entry.level === 'error' ? 'bg-danger' : entry.level === 'warn' ? 'bg-accent' : 'bg-success'
                  }`}
                />
                <span className="text-ink-3 shrink-0">
                  {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(entry.at)}
                </span>
                <span className="text-ink-2 break-words">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

export function SyncSettingsPage(_props: SettingsPageProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [saved, setSaved] = useState<AIProviderConfig | null>(null);
  const [prefs, setPrefs] = useState<SyncSettings | null>(null);
  const [realms, setRealms] = useState<Realm[]>([]);
  const [remote, setRemote] = useState<RemoteRealmInfo[]>([]);
  const [providerId, setProviderId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [msBusy, setMsBusy] = useState(false);

  const reload = useCallback(async () => {
    const [p, s, r] = await Promise.all([
      window.diegesis.sync.providers(),
      window.diegesis.sync.getSettings(),
      window.diegesis.realms.list(),
    ]);
    setProviders(p);
    setPrefs(s);
    setSaved(s.provider);
    setRealms(r);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // hydrate the form from saved config (masked secrets included)
  useEffect(() => {
    setProviderId(saved?.providerId ?? '');
    setValues(saved?.config ?? {});
    setTestResult(null);
  }, [saved]);

  const provider = useMemo(() => providers.find((p) => p.id === providerId) ?? null, [providers, providerId]);

  const selectProvider = (id: string) => {
    setProviderId(id);
    const info = providers.find((p) => p.id === id);
    if (saved?.providerId === id) {
      setValues(saved.config);
    } else {
      const next: Record<string, string> = {};
      for (const f of info?.fields ?? []) next[f.key] = f.default ?? '';
      setValues(next);
    }
    setTestResult(null);
  };

  const test = async () => {
    if (!provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await window.diegesis.sync.testProvider(provider.id, values));
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.diegesis.sync.setProvider(provider ? { providerId: provider.id, config: values } : null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const pickFolder = async () => {
    const path = await window.diegesis.sync.pickFolder();
    if (path) setValues((v) => ({ ...v, path }));
  };

  const connectMicrosoft = async () => {
    setMsBusy(true);
    setTestResult(null);
    try {
      const result = await window.diegesis.sync.onedriveAuth(values.clientId || undefined);
      if (result.ok && result.tokens) {
        const cfg = {
          providerId: 'onedrive',
          config: {
            ...values,
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresAt: String(result.tokens.expiresAt),
          },
        };
        await window.diegesis.sync.setProvider(cfg);
        await reload();
        setTestResult({ ok: true });
      } else {
        setTestResult({ ok: false, error: result.error });
      }
    } finally {
      setMsBusy(false);
    }
  };

  const updatePrefs = async (patch: Partial<Pick<SyncSettings, 'enabled' | 'realmIds' | 'intervalMin' | 'retentionDays'>>) => {
    await window.diegesis.sync.setPrefs(patch);
    setPrefs((p) => (p ? { ...p, ...patch } : p));
  };

  const loadRemote = async () => {
    setRemote(await window.diegesis.sync.listRemoteRealms());
  };

  const restore = async (realmId: string) => {
    const res = await window.diegesis.sync.restoreRealm(realmId);
    if (!res.ok) {
      setTestResult({ ok: false, error: res.error });
      return;
    }
    await reload();
    await loadRemote();
  };

  const missingRequired = provider?.fields.some((f) => !f.secret && f.required && !(values[f.key] ?? '').trim()) ?? false;

  return (
    <>
      <StatusCard />

      <Section
        title="Provedor de sincronização"
        icon={Plug}
        description="Os dados são copiados para o provedor escolhido. Senhas e tokens são criptografados localmente com o keyring do sistema."
      >
        <label className="block text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-1.5">Provedor</label>
        <select value={providerId} onChange={(e) => selectProvider(e.target.value)} className={`${inputCls} mb-4`}>
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

            {provider.id === 'onedrive' ? (
              <div className="flex flex-col gap-3 mb-4">
                <div>
                  <label className="block text-[12px] text-ink-2 mb-1">
                    Client ID (App registration) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={values.clientId ?? ''}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    onChange={(e) => setValues((v) => ({ ...v, clientId: e.target.value }))}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-ink-3 mt-1 leading-relaxed">
                    Registre um app público no Azure e adicione a redirect URI <code>http://localhost</code>. O login abre no navegador do sistema.
                  </p>
                </div>
                <Button variant="secondary" onClick={connectMicrosoft} disabled={msBusy || !(values.clientId ?? '').trim()}>
                  {msBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                  {values.refreshToken ? 'Reconectar conta Microsoft' : 'Conectar conta Microsoft'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-4">
                {provider.fields.map((f) => (
                  <div key={f.key}>
                    <label className="block text-[12px] text-ink-2 mb-1">
                      {f.label}
                      {f.required && <span className="text-danger"> *</span>}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type={f.type === 'password' ? 'password' : 'text'}
                        value={values[f.key] ?? ''}
                        placeholder={f.placeholder}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className={inputCls}
                      />
                      {f.key === 'path' && (
                        <Button variant="secondary" onClick={pickFolder} title="Escolher pasta">
                          <FolderOpen size={14} />
                        </Button>
                      )}
                    </div>
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
                {testResult.ok ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <XCircle size={14} className="shrink-0 mt-px" />}
                <span className="break-all">{testResult.ok ? 'Conexão OK' : (testResult.error ?? 'Falhou')}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={test} disabled={testing}>
                {testing ? <Loader2 size={14} className="animate-spin" /> : null}
                Testar conexão
              </Button>
              <Button onClick={save} disabled={saving || missingRequired}>
                {savedFlash ? 'Salvo ✓' : 'Salvar'}
              </Button>
            </div>
          </>
        )}

        {!provider && saved && (
          <Button variant="ghost" onClick={save}>
            Confirmar remoção
          </Button>
        )}
      </Section>

      {prefs && (
        <Section
          title="O que sincronizar"
          icon={RefreshCw}
          description="A sincronização roda em segundo plano: 3 segundos após uma edição e periodicamente. Nada é enviado sem um provedor configurado."
        >
          <div className="flex items-center justify-between gap-4 mb-4">
            <span className="text-[13px] text-ink-1">Ativar sincronização automática</span>
            <Toggle checked={prefs.enabled} onChange={(enabled) => updatePrefs({ enabled })} />
          </div>

          <label className="block text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-1.5">Universos</label>
          <div className="mb-4">
            <ToggleList
              items={realms.map((r) => ({ id: r.id, label: r.name }))}
              selectedIds={prefs.realmIds}
              onChange={(realmIds) => updatePrefs({ realmIds })}
              icon={BookOpen}
              emptyLabel="Nenhum universo."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-ink-2 mb-1">Intervalo (min)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={prefs.intervalMin}
                onChange={(e) => updatePrefs({ intervalMin: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[12px] text-ink-2 mb-1">Reter histórico (dias)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={prefs.retentionDays}
                onChange={(e) => updatePrefs({ retentionDays: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
          </div>
        </Section>
      )}

      <Section
        title="Restaurar da nuvem"
        icon={CloudDownload}
        description="Em um dispositivo novo, baixe um universo já sincronizado. Os documentos mantêm os mesmos identificadores, então passam a sincronizar junto."
      >
        <Button variant="secondary" onClick={loadRemote} className="mb-3">
          Buscar universos remotos
        </Button>
        {remote.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {remote.map((r) => (
              <div key={r.realmId} className="flex items-center gap-2 text-[13px] text-ink-1 border border-line rounded-md px-3 py-2">
                <span className="truncate">{r.name}</span>
                <span className="text-[11px] text-ink-3 shrink-0">{r.docCount} doc(s)</span>
                <Button variant="ghost" className="ml-auto" onClick={() => restore(r.realmId)}>
                  Restaurar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
