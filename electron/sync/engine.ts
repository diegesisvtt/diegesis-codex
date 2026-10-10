// Sync engine: the provider-agnostic, storage-agnostic core. All app storage
// access goes through EngineLocalAdapter and all remote access through
// SyncProvider, so the whole engine is unit-testable with in-memory fakes.
//
// Sync model (per document, Obsidian-style):
//   base = hash recorded in sync_state at the last successful sync of the doc
//   localChanged  = hash(local doc)      !== base
//   remoteChanged = hash(manifest entry) !== base
//   one side changed → apply it; both changed → last-writer-wins by updatedAt,
//   the losing version is preserved in the conflict queue and remote history.
import type { DocNode } from '../../shared/types';
import type {
  RemoteRealmView,
  SyncLogEntry,
  SyncProvider,
  SyncStatus,
  SyncStatus as Status,
  SyncVersionView,
} from './types';
import { classifyError, SyncError } from './types';
import {
  decodeDoc,
  decodeManifest,
  docToPayload,
  encodeDoc,
  encodeManifest,
  hashPayload,
  remotePaths,
  sha256Hex,
  SYNC_ROOT,
  type SyncedDocPayload,
  type SyncManifest,
} from './snapshot';
import type { RetryState, SyncPrefs } from './state';

export interface EngineLocalAdapter {
  // realms & docs
  listSyncRealmIds(): string[];
  realmExists(realmId: string): boolean;
  realmName(realmId: string): string;
  createRealmWithId(realmId: string, name: string): void;
  listDocs(realmId: string): DocNode[];
  getDoc(docId: string): DocNode | null;
  docPdfPages(docId: string): { page: number; text: string }[];
  /** upserts a remote payload preserving id/updatedAt (and pdf page text) */
  applyRemoteDoc(payload: SyncedDocPayload): void;
  deleteLocalDoc(docId: string): void;
  /** copies the doc with a new id (conflict "keep both") */
  duplicateDoc(docId: string, titleSuffix: string): void;
  // cursors
  getState(realmId: string): Map<string, string>;
  setState(realmId: string, docId: string, baseHash: string): void;
  clearState(realmId: string, docId: string): void;
  listTombstones(realmId: string): Map<string, number>;
  addTombstone(realmId: string, docId: string): void;
  clearTombstone(realmId: string, docId: string): void;
  addConflict(realmId: string, docId: string, title: string, localJson: string | null, remoteJson: string | null): void;
  getAssetStates(realmId: string): Map<string, string>;
  setAssetState(realmId: string, fileKey: string, hash: string): void;
  clearAssetState(realmId: string, fileKey: string): void;
  // assets (key = 'images/<name>' | 'audios/<name>' | 'pdfs/<docId>.pdf')
  listAssetRefs(realmId: string): string[];
  readAsset(fileKey: string): Uint8Array | null;
  writeAsset(fileKey: string, data: Uint8Array): void;
  // retry ledger
  getRetry(realmId: string, itemKey: string): RetryState | null;
  recordRetryFailure(realmId: string, kind: 'doc' | 'asset', itemKey: string, error: string): RetryState;
  clearRetry(realmId: string, itemKey: string): void;
  // prefs
  prefs(): SyncPrefs;
}

export interface EngineDeps {
  local: EngineLocalAdapter;
  /** null while no provider is configured — engine stays idle */
  getProvider(): SyncProvider | null;
  onStatus?(status: SyncStatus): void;
  /** fired when a cycle pulled/changed docs in a realm (renderer refresh) */
  onRealmChanged?(realmId: string): void;
  now?(): number;
  /** delay injector for tests */
  sleep?(ms: number): Promise<void>;
}

export type ConflictResolution = 'local' | 'remote' | 'both';

const LOG_LIMIT = 50;
const TOMBSTONE_PRUNE_MS = 90 * 24 * 3600 * 1000;

export interface SyncEngine {
  start(): void;
  stop(): void;
  /** debounced trigger called after local doc changes */
  notifyChanged(realmId: string): void;
  /** re-arms the engine after config changes (clears backoff/auth pause) */
  notifyConfigChanged(): void;
  syncNow(realmId?: string): Promise<void>;
  getStatus(): SyncStatus;
  listRemoteRealms(): Promise<RemoteRealmView[]>;
  restoreRealm(realmId: string): Promise<void>;
  listVersions(realmId: string, docId: string): Promise<SyncVersionView[]>;
  restoreVersion(realmId: string, docId: string, timestamp: number): Promise<string | null>;
  resolveConflict(
    conflictId: string,
    realmId: string,
    resolution: ConflictResolution,
    localJson: string | null,
    remoteJson: string | null
  ): Promise<string | null>;
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const local = deps.local;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let status: SyncStatus = {
    state: 'disabled',
    providerId: null,
    enabled: false,
    lastSyncAt: null,
    pending: 0,
    conflictCount: 0,
    lastError: null,
    skipped: 0,
    log: [],
  };
  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let queue: Promise<void> = Promise.resolve();
  const realmAttempts = new Map<string, number>();
  let authPaused = false;

  function log(level: SyncLogEntry['level'], message: string): void {
    status.log = [{ at: now(), level, message }, ...status.log].slice(0, LOG_LIMIT);
  }

  function emit(patch: Partial<Status>): void {
    status = { ...status, ...patch };
    deps.onStatus?.(status);
  }

  function providerOrNull(): SyncProvider | null {
    try {
      return deps.getProvider();
    } catch (err) {
      const e = classifyError(err);
      if (e.code === 'auth') {
        authPaused = true;
        emit({ state: 'auth-required', lastError: e.message });
      } else {
        emit({ state: 'error', lastError: e.message });
      }
      log('error', e.message);
      return null;
    }
  }

  /** True when an item must be skipped this cycle: permanently failed, or its
   *  backoff window hasn't elapsed yet. */
  function retryBlocked(realmId: string, itemKey: string): boolean {
    const r = local.getRetry(realmId, itemKey);
    if (!r) return false;
    return r.gaveUp || r.nextRetryAt > now();
  }

  async function readManifest(provider: SyncProvider, realmId: string): Promise<SyncManifest> {
    const empty: SyncManifest = {
      format: 'diegesis-sync-manifest',
      version: 1,
      realmId,
      realmName: local.realmName(realmId),
      updatedAt: 0,
      deviceId: '',
      docs: {},
      assets: {},
    };
    try {
      const bytes = await provider.get(remotePaths.manifest(realmId));
      const parsed = decodeManifest(bytes);
      if (!parsed) log('warn', 'Manifesto remoto corrompido — tratando como vazio (nada será apagado).');
      return parsed ?? empty;
    } catch {
      return empty; // first sync of this realm
    }
  }

  async function writeManifest(provider: SyncProvider, manifest: SyncManifest, realmId: string): Promise<void> {
    manifest.updatedAt = now();
    manifest.deviceId = local.prefs().deviceId;
    // the manifest is the consistency point: it goes up last, after all blobs
    await provider.put(remotePaths.manifest(realmId), encodeManifest(manifest));
  }

  /** Copies the current remote doc into version history before overwriting. */
  async function backupRemoteVersion(provider: SyncProvider, realmId: string, docId: string): Promise<void> {
    try {
      const current = await provider.get(remotePaths.doc(realmId, docId));
      if (decodeDoc(current)) {
        await provider.put(remotePaths.version(realmId, docId, now()), current);
      }
    } catch {
      /* no previous version to preserve */
    }
  }

  async function pruneVersions(provider: SyncProvider, realmId: string, docId: string): Promise<void> {
    const cutoff = now() - local.prefs().retentionDays * 24 * 3600 * 1000;
    try {
      const entries = await provider.list(remotePaths.versionsDir(realmId, docId));
      for (const e of entries) {
        const ts = parseInt(/\/(\d+)\.json$/.exec(e.path)?.[1] ?? '0', 10);
        if (ts > 0 && ts < cutoff) await provider.delete(e.path);
      }
    } catch {
      /* pruning is best-effort */
    }
  }

  /** Uploads one local doc (with version backup) and updates manifest+state. */
  async function pushDoc(provider: SyncProvider, manifest: SyncManifest, realmId: string, doc: DocNode): Promise<string> {
    if (manifest.docs[doc.id] && !manifest.docs[doc.id].deleted) {
      await backupRemoteVersion(provider, realmId, doc.id);
    }
    const envelope = encodeDoc(doc, doc.type === 'core/pdf' ? local.docPdfPages(doc.id) : undefined);
    await provider.put(remotePaths.doc(realmId, doc.id), envelope);
    const payload = docToPayload(doc, doc.type === 'core/pdf' ? local.docPdfPages(doc.id) : undefined);
    const hash = hashPayload(payload);
    manifest.docs[doc.id] = { hash, updatedAt: doc.updatedAt };
    local.setState(realmId, doc.id, hash);
    local.clearRetry(realmId, `doc:${doc.id}`);
    return hash;
  }

  /** Pulls a remote doc. Returns 'ok', 'corrupt' (integrity failure recorded for
   *  retry) or 'skipped' (permanent failure / backoff not elapsed). */
  async function pullDoc(provider: SyncProvider, manifest: SyncManifest, realmId: string, docId: string): Promise<'ok' | 'corrupt' | 'skipped'> {
    if (retryBlocked(realmId, `doc:${docId}`)) return 'skipped';
    const bytes = await provider.get(remotePaths.doc(realmId, docId));
    const payload = decodeDoc(bytes);
    if (!payload) {
      log('warn', `Documento remoto corrompido ignorado: ${docId}`);
      local.recordRetryFailure(realmId, 'doc', `doc:${docId}`, 'Documento remoto corrompido');
      return 'corrupt';
    }
    local.applyRemoteDoc(payload);
    local.setState(realmId, docId, manifest.docs[docId]?.hash ?? hashPayload(payload));
    local.clearRetry(realmId, `doc:${docId}`);
    return 'ok';
  }

  /** Serializes cycles: at most one realm syncs at a time, callers coalesce. */
  function enqueue(realmId: string): Promise<void> {
    const run = queue.then(() => syncRealm(realmId));
    queue = run.catch(() => {});
    return run;
  }

  async function syncRealm(realmId: string): Promise<void> {
    const prefs = local.prefs();
    if (!prefs.enabled || !prefs.realmIds.includes(realmId)) return;
    if (authPaused) return;
    const provider = providerOrNull();
    if (!provider) {
      emit({ state: 'disabled', enabled: prefs.enabled });
      return;
    }
    if (!local.realmExists(realmId)) return;

    emit({ state: 'syncing', providerId: provider.kind, enabled: true, skipped: 0 });
    try {
      const manifest = await readManifest(provider, realmId);
      const state = local.getState(realmId);
      const tombstones = local.listTombstones(realmId);
      const docs = local.listDocs(realmId);
      let pushed = 0;
      let pulled = 0;
      let conflicts = 0;
      let skipped = 0;

      // local hashes
      const localHashes = new Map<string, string>();
      for (const doc of docs) {
        const payload = docToPayload(doc, doc.type === 'core/pdf' ? local.docPdfPages(doc.id) : undefined);
        localHashes.set(doc.id, hashPayload(payload));
      }

      // implicit tombstones: docs that were synced but vanished locally without
      // a recorded tombstone (e.g. a cascade path that didn't notify)
      for (const docId of state.keys()) {
        if (!localHashes.has(docId) && !tombstones.has(docId)) {
          local.addTombstone(realmId, docId);
          tombstones.set(docId, now());
        }
      }

      emit({ pending: countPending(localHashes, state, tombstones, manifest) });

      // ---- deletions (local tombstones) ----
      for (const [docId] of tombstones) {
        const remoteEntry = manifest.docs[docId];
        if (remoteEntry && !remoteEntry.deleted && remoteEntry.hash !== state.get(docId)) {
          // remote edited after our base: deletion vs edit → keep the edit, queue conflict
          const pr = await pullDoc(provider, manifest, realmId, docId);
          if (pr !== 'ok') skipped++;
          local.addConflict(
            realmId,
            docId,
            'Documento excluído localmente, mas editado em outro dispositivo',
            null,
            new TextDecoder().decode(await provider.get(remotePaths.doc(realmId, docId)).catch(() => new Uint8Array()))
          );
          local.clearTombstone(realmId, docId);
          conflicts++;
          continue;
        }
        try {
          await provider.delete(remotePaths.doc(realmId, docId));
        } catch {
          /* already gone remotely */
        }
        manifest.docs[docId] = { hash: state.get(docId) ?? '', updatedAt: now(), deleted: true };
        local.clearState(realmId, docId);
        local.clearTombstone(realmId, docId);
        pushed++;
      }

      // ---- per-document 3-way ----
      const docById = new Map(docs.map((d) => [d.id, d]));
      const allIds = new Set([...localHashes.keys(), ...Object.keys(manifest.docs)]);
      for (const docId of allIds) {
        if (tombstones.has(docId)) continue; // handled above
        const localHash = localHashes.get(docId);
        const base = state.get(docId);
        const remoteEntry = manifest.docs[docId];

        if (localHash !== undefined) {
          const localChanged = base === undefined || localHash !== base;
          const remoteChanged = remoteEntry !== undefined && remoteEntry.hash !== base;
          const remoteDeleted = remoteEntry?.deleted === true;

          if (remoteDeleted) {
            if (localChanged && base !== undefined) {
              // remote delete vs local edit: local wins, conflict preserved
              const doc = docById.get(docId)!;
              await pushDoc(provider, manifest, realmId, doc);
              manifest.docs[docId].deleted = undefined;
              local.addConflict(realmId, docId, doc.title, null, null);
              conflicts++;
            } else if (base !== undefined) {
              local.deleteLocalDoc(docId);
              local.clearState(realmId, docId);
              local.clearTombstone(realmId, docId); // the deletion is already remote
              pulled++;
            } else {
              await pushDoc(provider, manifest, realmId, docById.get(docId)!);
              manifest.docs[docId].deleted = undefined;
              pushed++;
            }
            continue;
          }

          if (!remoteEntry) {
            if (base === undefined || localChanged) {
              await pushDoc(provider, manifest, realmId, docById.get(docId)!);
              pushed++;
            }
            continue;
          }

          if (localChanged && remoteChanged) {
            const doc = docById.get(docId)!;
            // capture BOTH full envelopes so either side can be restored later
            const remoteText = new TextDecoder().decode(
              await provider.get(remotePaths.doc(realmId, docId)).catch(() => new Uint8Array())
            );
            const localText = new TextDecoder().decode(
              encodeDoc(doc, doc.type === 'core/pdf' ? local.docPdfPages(doc.id) : undefined)
            );
            // last-writer-wins; loser preserved in the conflict queue
            if (doc.updatedAt >= remoteEntry.updatedAt) {
              await pushDoc(provider, manifest, realmId, doc);
            } else {
              const pr = await pullDoc(provider, manifest, realmId, docId);
              if (pr === 'ok') pulled++;
              else skipped++;
            }
            local.addConflict(realmId, docId, doc.title, localText || null, remoteText || null);
            conflicts++;
          } else if (localChanged) {
            await pushDoc(provider, manifest, realmId, docById.get(docId)!);
            pushed++;
          } else if (remoteChanged) {
            const pr = await pullDoc(provider, manifest, realmId, docId);
            if (pr === 'ok') pulled++;
            else skipped++;
          }
        } else if (remoteEntry && !remoteEntry.deleted && !state.has(docId)) {
          // doc created on another device, unknown locally
          const pr = await pullDoc(provider, manifest, realmId, docId);
          if (pr === 'ok') pulled++;
          else skipped++;
        }
      }

      // ---- assets ----
      const assetResult = await syncAssets(provider, manifest, realmId);
      pushed += assetResult.uploaded;
      pulled += assetResult.downloaded;
      skipped += assetResult.skipped;

      // prune old remote tombstones
      for (const [docId, entry] of Object.entries(manifest.docs)) {
        if (entry.deleted && now() - entry.updatedAt > TOMBSTONE_PRUNE_MS) delete manifest.docs[docId];
      }

      manifest.realmName = local.realmName(realmId);
      await writeManifest(provider, manifest, realmId);

      realmAttempts.delete(realmId);
      const skippedMsg = skipped > 0 ? `${skipped} item(ns) não sincronizado(s) — ver detalhes no log de atividade.` : null;
      emit({ state: 'idle', lastSyncAt: now(), pending: 0, skipped, lastError: skippedMsg });
      if (pushed || pulled || conflicts) {
        log('info', `Sincronização concluída: ${pushed} enviados, ${pulled} recebidos${conflicts ? `, ${conflicts} conflitos` : ''}.`);
      }
      if (skipped > 0) log('warn', skippedMsg!);
      if (pulled > 0 || conflicts > 0) deps.onRealmChanged?.(realmId);
    } catch (err) {
      const e = classifyError(err);
      const attempts = (realmAttempts.get(realmId) ?? 0) + 1;
      realmAttempts.set(realmId, attempts);
      if (e.code === 'auth') {
        authPaused = true;
        emit({ state: 'auth-required', lastError: e.message });
      } else if (e.code === 'network') {
        emit({ state: 'offline', lastError: e.message });
        scheduleRetry(realmId);
      } else {
        emit({ state: 'error', lastError: e.message });
        scheduleRetry(realmId);
      }
      log('error', e.message);
    }
  }

  function scheduleRetry(realmId: string): void {
    const attempts = realmAttempts.get(realmId) ?? 0;
    const delay = Math.min(5 * 60_000, 1000 * 2 ** Math.min(attempts, 9)) + Math.random() * 1000;
    const prev = debounceTimers.get(realmId);
    if (prev) clearTimeout(prev);
    debounceTimers.set(
      realmId,
      setTimeout(() => {
        debounceTimers.delete(realmId);
        enqueue(realmId);
      }, delay)
    );
  }

  function countPending(
    localHashes: Map<string, string>,
    state: Map<string, string>,
    tombstones: Map<string, number>,
    manifest: SyncManifest
  ): number {
    let n = tombstones.size;
    for (const [id, hash] of localHashes) {
      if (tombstones.has(id)) continue;
      const base = state.get(id);
      if (base === undefined || hash !== base) n++;
    }
    return n;
  }

  async function syncAssets(
    provider: SyncProvider,
    manifest: SyncManifest,
    realmId: string
  ): Promise<{ uploaded: number; downloaded: number; skipped: number }> {
    let uploaded = 0;
    let downloaded = 0;
    let skipped = 0;
    const assetState = local.getAssetStates(realmId);
    const localRefs = new Set(local.listAssetRefs(realmId));
    const localHashes = new Map<string, string>();

    for (const key of localRefs) {
      const data = local.readAsset(key);
      if (!data) continue;
      const hash = sha256Hex(data);
      localHashes.set(key, hash);
      const base = assetState.get(key);
      const remoteEntry = manifest.assets[key];
      const localChanged = base === undefined || base !== hash;
      const remoteChanged = remoteEntry !== undefined && remoteEntry.hash !== base;
      if (localChanged) {
        await provider.put(remotePaths.asset(realmId, key), data);
        manifest.assets[key] = { hash, size: data.byteLength };
        local.setAssetState(realmId, key, hash);
        local.clearRetry(realmId, `asset:${key}`);
        uploaded++;
      } else if (!remoteEntry && base !== undefined) {
        // asset vanished remotely without us deleting it: re-upload
        await provider.put(remotePaths.asset(realmId, key), data);
        manifest.assets[key] = { hash, size: data.byteLength };
        uploaded++;
      }
    }

    // remote assets unknown locally (referenced by pulled docs)
    for (const [key, entry] of Object.entries(manifest.assets)) {
      if (localHashes.has(key)) continue;
      if (assetState.get(key) === entry.hash) {
        local.clearRetry(realmId, `asset:${key}`);
        continue;
      }
      if (retryBlocked(realmId, `asset:${key}`)) {
        skipped++;
        continue;
      }
      try {
        const data = await provider.get(remotePaths.asset(realmId, key));
        if (sha256Hex(data) !== entry.hash) {
          log('warn', `Asset remoto corrompido ignorado: ${key}`);
          local.recordRetryFailure(realmId, 'asset', `asset:${key}`, 'Asset remoto corrompido');
          skipped++;
          continue;
        }
        local.writeAsset(key, data);
        local.setAssetState(realmId, key, entry.hash);
        local.clearRetry(realmId, `asset:${key}`);
        downloaded++;
      } catch {
        log('warn', `Asset remoto indisponível: ${key}`);
        local.recordRetryFailure(realmId, 'asset', `asset:${key}`, 'Asset remoto indisponível');
        skipped++;
      }
    }

    // assets no longer referenced locally AND already synced: keep remotely
    // (other realms/devices may reference the same file — asset GC is local)
    return { uploaded, downloaded, skipped };
  }

  return {
    start() {
      const prefs = local.prefs();
      emit({ enabled: prefs.enabled, state: prefs.enabled ? 'idle' : 'disabled' });
      if (sweepTimer) clearInterval(sweepTimer);
      sweepTimer = setInterval(() => {
        for (const realmId of local.listSyncRealmIds()) enqueue(realmId);
      }, Math.max(1, local.prefs().intervalMin) * 60_000);
      // initial catch-up sweep
      for (const realmId of local.listSyncRealmIds()) enqueue(realmId);
    },

    stop() {
      if (sweepTimer) clearInterval(sweepTimer);
      sweepTimer = null;
      for (const t of debounceTimers.values()) clearTimeout(t);
      debounceTimers.clear();
    },

    notifyChanged(realmId) {
      if (!local.prefs().realmIds.includes(realmId)) return;
      realmAttempts.delete(realmId);
      const prev = debounceTimers.get(realmId);
      if (prev) clearTimeout(prev);
      debounceTimers.set(
        realmId,
        setTimeout(() => {
          debounceTimers.delete(realmId);
          enqueue(realmId);
        }, 3000)
      );
    },

    notifyConfigChanged() {
      authPaused = false;
      realmAttempts.clear();
      const prefs = local.prefs();
      emit({ enabled: prefs.enabled, state: prefs.enabled ? 'idle' : 'disabled', lastError: null });
      this.start();
    },

    async syncNow(realmId) {
      const targets = realmId ? [realmId] : local.listSyncRealmIds();
      for (const id of targets) realmAttempts.delete(id);
      for (const id of targets) await enqueue(id);
    },

    getStatus: () => status,

    async listRemoteRealms() {
      const provider = providerOrNull();
      if (!provider) {
        throw new SyncError('Configure e salve um provedor de sincronização antes de buscar universos remotos.', 'unknown');
      }
      const entries = await provider.list(SYNC_ROOT);
      const manifests = entries.filter((e) => /\/manifest\.json$/.test(e.path));
      const out: RemoteRealmView[] = [];
      for (const m of manifests) {
        try {
          const parsed = decodeManifest(await provider.get(m.path));
          if (parsed) {
            out.push({
              realmId: parsed.realmId,
              name: parsed.realmName,
              updatedAt: parsed.updatedAt,
              docCount: Object.values(parsed.docs).filter((d) => !d.deleted).length,
            });
          }
        } catch {
          /* skip unreadable manifests */
        }
      }
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async restoreRealm(realmId) {
      const provider = providerOrNull();
      if (!provider) throw new SyncError('Nenhum provider configurado.', 'unknown');
      if (local.realmExists(realmId)) throw new SyncError('Este universo já existe neste dispositivo.', 'conflict');
      const manifest = await readManifest(provider, realmId);
      local.createRealmWithId(realmId, manifest.realmName || 'Universo restaurado');

      // parents first (documents.parent_id has a foreign key)
      const pending = Object.entries(manifest.docs).filter(([, e]) => !e.deleted).map(([id]) => id);
      const payloads: SyncedDocPayload[] = [];
      for (const docId of pending) {
        const bytes = await provider.get(remotePaths.doc(realmId, docId)).catch(() => null);
        const payload = bytes ? decodeDoc(bytes) : null;
        if (payload) payloads.push(payload);
        else log('warn', `Documento remoto ilegível ignorado na restauração: ${docId}`);
      }
      const applied = new Set<string>();
      let remaining = [...payloads];
      while (remaining.length) {
        const idx = remaining.findIndex((p) => !p.parentId || applied.has(p.parentId) || !payloads.some((q) => q.id === p.parentId));
        const batch = idx === -1 ? remaining.splice(0) : remaining.splice(idx, 1);
        for (const p of batch) {
          if (!p.parentId || (!applied.has(p.parentId) && payloads.some((q) => q.id === p.parentId))) p.parentId = null;
          local.applyRemoteDoc(p);
          local.setState(realmId, p.id, manifest.docs[p.id]?.hash ?? hashPayload(p));
          applied.add(p.id);
        }
      }

      for (const [key, entry] of Object.entries(manifest.assets)) {
        try {
          const data = await provider.get(remotePaths.asset(realmId, key));
          if (sha256Hex(data) !== entry.hash) continue;
          local.writeAsset(key, data);
          local.setAssetState(realmId, key, entry.hash);
        } catch {
          /* missing assets don't block the restore */
        }
      }
      log('info', `Universo "${manifest.realmName}" restaurado da nuvem (${applied.size} documentos).`);
    },

    async listVersions(realmId, docId) {
      const provider = providerOrNull();
      if (!provider) return [];
      const entries = await provider.list(remotePaths.versionsDir(realmId, docId));
      return entries
        .map((e) => ({ docId, path: e.path, timestamp: parseInt(/\/(\d+)\.json$/.exec(e.path)?.[1] ?? '0', 10) }))
        .filter((v) => v.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp);
    },

    async restoreVersion(realmId, docId, timestamp) {
      const provider = providerOrNull();
      if (!provider) return 'Nenhum provider configurado.';
      try {
        const bytes = await provider.get(remotePaths.version(realmId, docId, timestamp));
        const payload = decodeDoc(bytes);
        if (!payload) return 'Versão corrompida — não foi possível restaurar.';
        local.applyRemoteDoc(payload);
        // state is NOT updated: the restored content differs from the remote
        // current, so the next cycle pushes it as a new version
        log('info', `Versão de ${new Date(timestamp).toLocaleString()} restaurada.`);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },

    async resolveConflict(conflictId, realmId, resolution, localJson, remoteJson) {
      const provider = providerOrNull();
      if (!provider) return 'Nenhum provider configurado.';
      const docId = conflictId.replace(/-\d+$/, '');
      const decodeEnvelope = (json: string | null): SyncedDocPayload | null =>
        json ? decodeDoc(new TextEncoder().encode(json)) : null;

      const deleteRemote = async (): Promise<void> => {
        const manifest = await readManifest(provider, realmId);
        await provider.delete(remotePaths.doc(realmId, docId)).catch(() => {});
        manifest.docs[docId] = { hash: manifest.docs[docId]?.hash ?? '', updatedAt: now(), deleted: true };
        await writeManifest(provider, manifest, realmId);
        local.clearState(realmId, docId);
      };

      const applyRemote = async (): Promise<void> => {
        const payload = decodeEnvelope(remoteJson);
        if (!payload) {
          // remote side is a deletion
          local.deleteLocalDoc(docId);
          local.clearState(realmId, docId);
          return;
        }
        local.applyRemoteDoc(payload);
        const manifest = await readManifest(provider, realmId);
        local.setState(realmId, docId, manifest.docs[docId]?.hash ?? hashPayload(payload));
      };

      const pushLocal = async (): Promise<void> => {
        const doc = local.getDoc(docId);
        if (!doc) {
          // local side is a deletion — mirror it remotely
          await deleteRemote();
          return;
        }
        const manifest = await readManifest(provider, realmId);
        await pushDoc(provider, manifest, realmId, doc);
        await writeManifest(provider, manifest, realmId);
      };

      try {
        if (resolution === 'local') {
          await pushLocal();
        } else if (resolution === 'remote') {
          await applyRemote();
        } else {
          // keep both: preserve the local version as a copy, take the remote
          const localP = decodeEnvelope(localJson);
          const remoteP = decodeEnvelope(remoteJson);
          if (localP && remoteP) {
            local.applyRemoteDoc(localP); // original temporarily holds the local version
            local.duplicateDoc(docId, ' (conflito)'); // copy keeps it
            local.applyRemoteDoc(remoteP); // original takes the remote version
            const manifest = await readManifest(provider, realmId);
            local.setState(realmId, docId, manifest.docs[docId]?.hash ?? hashPayload(remoteP));
          } else if (remoteP) {
            await applyRemote(); // local side was a deletion
          } else if (localP) {
            await pushLocal(); // remote side was a deletion — resurrect local
          }
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  };
}
