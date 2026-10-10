// Sync module entry: wires the engine to the real SQLite database and asset
// directories, and registers the `sync:*` IPC surface (mirroring the `ai:*`
// pattern). The renderer/plugin sandbox never touches the filesystem or the DB.
import fs from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as db from '../db';
import { extractAudioRefs, audioFilePath, isValidAudioData } from '../audio';
import { extractImageRefs, imageFilePath, isValidImageData } from '../images';
import { pdfFilePath } from '../pdf';
import type { AIProviderConfig, DocumentType, SyncSettings } from '../../shared/types';
import { createSyncEngine, type EngineLocalAdapter, type SyncEngine } from './engine';
import { createSyncProvider, SYNC_PROVIDER_INFOS } from './providers';
import { startOneDriveAuth } from './providers/onedrive';
import {
  addConflict,
  addTombstones,
  clearAssetState,
  clearRealmSyncData,
  clearRetry,
  clearSyncState as clearState,
  clearTombstone,
  conflictCount,
  getAssetStates,
  getConflict,
  getResolvedSyncConfig,
  getRetry,
  getSyncState as getState,
  getSyncPrefs,
  getSyncProviderConfig,
  listConflicts,
  listTombstones,
  migrateSyncTables,
  recordRetryFailure,
  removeConflict,
  resolveMaskedSyncSecrets,
  setAssetState,
  setSyncState as setState,
  setSyncPrefs,
  setSyncProviderConfig,
  updateStoredSecrets,
} from './state';
import type { SyncStatus } from './types';

let engine: SyncEngine | null = null;
let statusListener: (() => void) | null = null;

function withConflictCount(status: SyncStatus): SyncStatus {
  let count = status.conflictCount;
  try {
    count = conflictCount();
  } catch {
    /* db may not be migrated yet */
  }
  return { ...status, conflictCount: count };
}

function broadcastStatus(status: SyncStatus): void {
  const payload = withConflictCount(status);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('sync:status', payload);
  }
}

/** Notifies every window that the realm list changed (cloud sync restore). */
function broadcastRealmsChanged(realmId: string | null): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('realms:changed', realmId);
  }
}

/** Notifies every window that documents in a realm changed (sync pull). */
function broadcastDocsChanged(realmId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('docs:changed', realmId);
  }
}

/** Builds the storage adapter backed by the app database and asset folders. */
function createLocalAdapter(): EngineLocalAdapter {
  const assetKind = (fileKey: string): { kind: string; name: string } => {
    const [kind, ...rest] = fileKey.split('/');
    return { kind, name: rest.join('/') };
  };

  return {
    listSyncRealmIds: () => getSyncPrefs().realmIds,
    realmExists: (realmId) => db.listRealms().some((r) => r.id === realmId),
    realmName: (realmId) => db.listRealms().find((r) => r.id === realmId)?.name ?? 'Universo',
    createRealmWithId: (realmId, name) => db.createRealmWithId(realmId, name),
    listDocs: (realmId) => db.listDocs(realmId),
    getDoc: (docId) => {
      const row = db.getDocRealmId(docId);
      if (!row) return null;
      const realmId = row;
      return db.listDocs(realmId).find((d) => d.id === docId) ?? null;
    },
    docPdfPages: (docId) => db.getPdfPageRows(docId),
    applyRemoteDoc: (payload) => {
      db.upsertSyncedDoc({
        id: payload.id,
        realmId: payload.realmId,
        parentId: payload.parentId,
        type: payload.type as DocumentType,
        title: payload.title,
        icon: payload.icon,
        cover: payload.cover,
        content: payload.content,
        position: payload.position,
        updatedAt: payload.updatedAt,
      });
      if (payload.pdfPages?.length) db.restorePdfPages(payload.id, payload.pdfPages);
    },
    deleteLocalDoc: (docId) => {
      const realmId = db.getDocRealmId(docId);
      const subtree = db.listSubtreeDocs(docId);
      db.deleteDoc(docId);
      if (!realmId) return;
      // only the root is tombstoned: children disappear with the cascade on
      // every device, so per-child tombstones would just be noise
      addTombstones(realmId, [docId]);
      for (const d of subtree) {
        if (d.id !== docId) {
          clearState(realmId, d.id);
          clearTombstone(realmId, d.id);
        }
      }
    },
    duplicateDoc: (docId, titleSuffix) => {
      db.duplicateDoc(docId, titleSuffix);
    },
    getState,
    setState,
    clearState,
    listTombstones,
    addTombstone: (realmId, docId) => addTombstones(realmId, [docId]),
    clearTombstone,
    addConflict: (realmId, docId, title, localJson, remoteJson) =>
      addConflict(realmId, docId, title, localJson, remoteJson),
    getAssetStates,
    setAssetState,
    clearAssetState,
    getRetry,
    recordRetryFailure,
    clearRetry,
    listAssetRefs: (realmId) => {
      const refs: string[] = [];
      for (const doc of db.listRealmDocTypes(realmId)) {
        for (const f of extractImageRefs(doc.content)) refs.push(`images/${f}`);
        for (const f of extractAudioRefs(doc.content)) refs.push(`audios/${f}`);
        if (doc.type === 'core/pdf') refs.push(`pdfs/${doc.id}.pdf`);
      }
      return [...new Set(refs)];
    },
    readAsset: (fileKey) => {
      const { kind, name } = assetKind(fileKey);
      const file = kind === 'images' ? imageFilePath(name) : kind === 'audios' ? audioFilePath(name) : kind === 'pdfs' ? pdfFilePath(name.replace(/\.pdf$/, '')) : '';
      if (!file) return null;
      try {
        const data = fs.readFileSync(file);
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } catch {
        return null;
      }
    },
    writeAsset: (fileKey, data) => {
      const { kind, name } = assetKind(fileKey);
      const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      try {
        if (kind === 'images') {
          if (!isValidImageData(buf)) return;
          fs.mkdirSync(imageFilePath(''), { recursive: true });
          fs.writeFileSync(imageFilePath(name), buf);
        } else if (kind === 'audios') {
          if (!isValidAudioData(buf)) return;
          fs.mkdirSync(audioFilePath(''), { recursive: true });
          fs.writeFileSync(audioFilePath(name), buf);
        } else if (kind === 'pdfs') {
          if (buf.subarray(0, 4).toString('latin1') !== '%PDF') return;
          fs.mkdirSync(pdfFilePath(''), { recursive: true });
          fs.writeFileSync(pdfFilePath(name.replace(/\.pdf$/, '')), buf);
        }
      } catch {
        /* best-effort asset write */
      }
    },
    prefs: getSyncPrefs,
  };
}

/** Lazily builds the provider from the stored (decrypted) config. */
function currentProvider() {
  const resolved = getResolvedSyncConfig();
  if (!resolved) return null;
  return createSyncProvider(resolved.providerId, resolved.config, {
    onTokensChanged: (tokens) =>
      updateStoredSecrets({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: String(tokens.expiresAt),
      }),
  });
}

export function initSync(): void {
  migrateSyncTables();
  engine = createSyncEngine({
    local: createLocalAdapter(),
    getProvider: currentProvider,
    onStatus: broadcastStatus,
    onRealmChanged: broadcastDocsChanged,
  });
  engine.start();
  // keep status fresh in every window on startup
  statusListener = () => broadcastStatus(engine!.getStatus());
  app.on('browser-window-created', statusListener);
}

export function getSyncEngine(): SyncEngine {
  if (!engine) throw new Error('sync module not initialized');
  return engine;
}

/** Called by main.ts after local document mutations to debounce a push. */
export function notifyDocsChanged(realmId: string | null): void {
  if (realmId) engine?.notifyChanged(realmId);
}

/** Records deletion tombstones so other devices learn about removals. */
export function recordDeletions(realmId: string, docIds: string[]): void {
  addTombstones(realmId, docIds);
  engine?.notifyChanged(realmId);
}

/** Debounces a sync for every enabled realm (asset writes touch no realm directly). */
export function notifyAllRealms(): void {
  for (const id of getSyncPrefs().realmIds) engine?.notifyChanged(id);
}

export function forgetRealm(realmId: string): void {
  clearRealmSyncData(realmId);
  const prefs = getSyncPrefs();
  if (prefs.realmIds.includes(realmId)) {
    setSyncPrefs({ realmIds: prefs.realmIds.filter((id) => id !== realmId) });
  }
}

export function registerSyncIpc(): void {
  ipcMain.handle('sync:providers:list', () => SYNC_PROVIDER_INFOS);

  ipcMain.handle('sync:settings:get', (): SyncSettings => {
    const prefs = getSyncPrefs();
    return {
      provider: getSyncProviderConfig() as AIProviderConfig | null,
      enabled: prefs.enabled,
      realmIds: prefs.realmIds,
      intervalMin: prefs.intervalMin,
      retentionDays: prefs.retentionDays,
      deviceId: prefs.deviceId,
    };
  });

  ipcMain.handle('sync:settings:setProvider', (_e, cfg: AIProviderConfig | null) => {
    setSyncProviderConfig(cfg);
    engine?.notifyConfigChanged();
  });

  ipcMain.handle('sync:settings:setPrefs', (_e, patch: Partial<SyncSettings>) => {
    if (patch.enabled !== undefined || patch.realmIds !== undefined || patch.intervalMin !== undefined || patch.retentionDays !== undefined) {
      setSyncPrefs({
        enabled: patch.enabled,
        realmIds: patch.realmIds,
        intervalMin: patch.intervalMin,
        retentionDays: patch.retentionDays,
      });
      engine?.notifyConfigChanged();
    }
  });

  ipcMain.handle('sync:provider:test', async (_e, providerId: string, config: Record<string, string>) => {
    try {
      const provider = createSyncProvider(
        providerId as never,
        resolveMaskedSyncSecrets(providerId, config)
      );
      const url = await provider.test();
      return { ok: true, url: url || undefined };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('sync:onedrive:auth', async (_e, clientId?: string) => {
    try {
      const tokens = await startOneDriveAuth(clientId ?? '');
      return { ok: true, tokens };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('sync:pickFolder', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const picked = await dialog.showOpenDialog(win, {
      title: 'Escolher pasta de sincronização',
      properties: ['openDirectory', 'createDirectory'],
    });
    return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
  });

  ipcMain.handle('sync:now', (_e, realmId?: string) => engine?.syncNow(realmId));
  ipcMain.handle('sync:status', () => (engine ? withConflictCount(engine.getStatus()) : null));

  ipcMain.handle('sync:conflicts:list', () => listConflicts().map(({ localJson, remoteJson, ...meta }) => meta));
  ipcMain.handle('sync:conflicts:resolve', async (_e, id: string, resolution: 'local' | 'remote' | 'both') => {
    const conflict = getConflict(id);
    if (!conflict) return 'Conflito não encontrado.';
    const err = await engine!.resolveConflict(id, conflict.realmId, resolution, conflict.localJson, conflict.remoteJson);
    if (!err) {
      removeConflict(id);
      broadcastStatus(engine!.getStatus());
      broadcastDocsChanged(conflict.realmId);
    }
    return err;
  });

  ipcMain.handle('sync:versions:list', (_e, realmId: string, docId: string) => engine!.listVersions(realmId, docId));
  ipcMain.handle('sync:versions:restore', async (_e, realmId: string, docId: string, timestamp: number) => {
    const err = await engine!.restoreVersion(realmId, docId, timestamp);
    if (!err) broadcastDocsChanged(realmId);
    return err;
  });

  ipcMain.handle('sync:remote:realms', async () => {
    try {
      return { ok: true as const, realms: await engine!.listRemoteRealms() };
    } catch (err) {
      return { ok: false as const, realms: [], error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('sync:remote:restore', async (_e, realmId: string) => {
    try {
      await engine!.restoreRealm(realmId);
      const prefs = getSyncPrefs();
      if (!prefs.realmIds.includes(realmId)) setSyncPrefs({ realmIds: [...prefs.realmIds, realmId] });
      engine?.notifyConfigChanged();
      // let every window pick up the new realm (and its docs) immediately
      broadcastRealmsChanged(realmId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('sync:conflicts:count', () => conflictCount());
}
