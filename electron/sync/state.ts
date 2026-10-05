// Sync local state: per-doc cursors, deletion tombstones, conflict queue and
// asset cursors — all in the same SQLite database, following the app's
// idempotent CREATE TABLE IF NOT EXISTS migration style. Also persists the
// provider configuration (secrets encrypted) and sync preferences.
import { getDb } from '../db';
import { SECRET_MASK, type AIProviderConfig } from '../../shared/types';
import { decryptSecret, encryptSecret } from './secrets';
import { syncSecretKeys, SYNC_PROVIDER_INFOS } from './providers';
import type { SyncConflictView, SyncProviderKind } from './types';

export function migrateSyncTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      realm_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      base_hash TEXT NOT NULL,
      synced_at INTEGER NOT NULL,
      PRIMARY KEY (realm_id, doc_id)
    );
    CREATE TABLE IF NOT EXISTS sync_tombstones (
      realm_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL,
      PRIMARY KEY (realm_id, doc_id)
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      realm_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      local_json TEXT,
      remote_json TEXT,
      detected_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_assets (
      realm_id TEXT NOT NULL,
      file_key TEXT NOT NULL,
      hash TEXT NOT NULL,
      synced_at INTEGER NOT NULL,
      PRIMARY KEY (realm_id, file_key)
    );
  `);
}

// ---------- per-doc cursors ----------

export function getSyncState(realmId: string): Map<string, string> {
  const rows = getDb().prepare('SELECT doc_id, base_hash FROM sync_state WHERE realm_id = ?').all(realmId) as {
    doc_id: string;
    base_hash: string;
  }[];
  return new Map(rows.map((r) => [r.doc_id, r.base_hash]));
}

export function setSyncState(realmId: string, docId: string, baseHash: string): void {
  getDb()
    .prepare('INSERT INTO sync_state (realm_id, doc_id, base_hash, synced_at) VALUES (?, ?, ?, ?) ON CONFLICT(realm_id, doc_id) DO UPDATE SET base_hash = excluded.base_hash, synced_at = excluded.synced_at')
    .run(realmId, docId, baseHash, Date.now());
}

export function clearSyncState(realmId: string, docId: string): void {
  getDb().prepare('DELETE FROM sync_state WHERE realm_id = ? AND doc_id = ?').run(realmId, docId);
}

// ---------- tombstones (local deletions not yet pushed) ----------

export function addTombstones(realmId: string, docIds: string[]): void {
  if (docIds.length === 0) return;
  const stmt = getDb().prepare(
    'INSERT INTO sync_tombstones (realm_id, doc_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(realm_id, doc_id) DO UPDATE SET deleted_at = excluded.deleted_at'
  );
  const now = Date.now();
  for (const id of docIds) stmt.run(realmId, id, now);
}

export function listTombstones(realmId: string): Map<string, number> {
  const rows = getDb().prepare('SELECT doc_id, deleted_at FROM sync_tombstones WHERE realm_id = ?').all(realmId) as {
    doc_id: string;
    deleted_at: number;
  }[];
  return new Map(rows.map((r) => [r.doc_id, r.deleted_at]));
}

export function clearTombstone(realmId: string, docId: string): void {
  getDb().prepare('DELETE FROM sync_tombstones WHERE realm_id = ? AND doc_id = ?').run(realmId, docId);
}

/** Drops every sync trace of a realm (realm deleted locally or unsynced). */
export function clearRealmSyncData(realmId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sync_state WHERE realm_id = ?').run(realmId);
  db.prepare('DELETE FROM sync_tombstones WHERE realm_id = ?').run(realmId);
  db.prepare('DELETE FROM sync_conflicts WHERE realm_id = ?').run(realmId);
  db.prepare('DELETE FROM sync_assets WHERE realm_id = ?').run(realmId);
}

// ---------- conflict queue ----------

export interface StoredConflict extends SyncConflictView {
  localJson: string | null;
  remoteJson: string | null;
}

export function addConflict(realmId: string, docId: string, title: string, localJson: string | null, remoteJson: string | null): void {
  const db = getDb();
  // one open conflict per doc: a repeat detection replaces the previous entry
  db.prepare('DELETE FROM sync_conflicts WHERE realm_id = ? AND doc_id = ?').run(realmId, docId);
  db.prepare(
    'INSERT INTO sync_conflicts (id, realm_id, doc_id, title, local_json, remote_json, detected_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(`${docId}-${Date.now()}`, realmId, docId, title.slice(0, 500), localJson, remoteJson, Date.now());
}

export function listConflicts(): StoredConflict[] {
  const rows = getDb().prepare('SELECT * FROM sync_conflicts ORDER BY detected_at DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    realmId: r.realm_id,
    docId: r.doc_id,
    title: r.title,
    localJson: r.local_json,
    remoteJson: r.remote_json,
    detectedAt: r.detected_at,
  }));
}

export function conflictCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM sync_conflicts').get() as { c: number }).c;
}

export function getConflict(id: string): StoredConflict | null {
  const r = getDb().prepare('SELECT * FROM sync_conflicts WHERE id = ?').get(id) as any;
  return r
    ? { id: r.id, realmId: r.realm_id, docId: r.doc_id, title: r.title, localJson: r.local_json, remoteJson: r.remote_json, detectedAt: r.detected_at }
    : null;
}

export function removeConflict(id: string): void {
  getDb().prepare('DELETE FROM sync_conflicts WHERE id = ?').run(id);
}

// ---------- asset cursors ----------

export function getAssetStates(realmId: string): Map<string, string> {
  const rows = getDb().prepare('SELECT file_key, hash FROM sync_assets WHERE realm_id = ?').all(realmId) as {
    file_key: string;
    hash: string;
  }[];
  return new Map(rows.map((r) => [r.file_key, r.hash]));
}

export function setAssetState(realmId: string, fileKey: string, hash: string): void {
  getDb()
    .prepare('INSERT INTO sync_assets (realm_id, file_key, hash, synced_at) VALUES (?, ?, ?, ?) ON CONFLICT(realm_id, file_key) DO UPDATE SET hash = excluded.hash, synced_at = excluded.synced_at')
    .run(realmId, fileKey, hash, Date.now());
}

export function clearAssetState(realmId: string, fileKey: string): void {
  getDb().prepare('DELETE FROM sync_assets WHERE realm_id = ? AND file_key = ?').run(realmId, fileKey);
}

// ---------- provider config (encrypted secrets) ----------

const PROVIDER_KEY = 'sync_provider';
const PREFS_KEY = 'sync_prefs';

export interface SyncPrefs {
  enabled: boolean;
  /** realms included in background sync */
  realmIds: string[];
  /** sweep interval in minutes (edits trigger a debounced cycle regardless) */
  intervalMin: number;
  /** version history retention in days */
  retentionDays: number;
  /** stable id of this device, written into remote manifests */
  deviceId: string;
}

export const DEFAULT_PREFS: Omit<SyncPrefs, 'deviceId'> = {
  enabled: false,
  realmIds: [],
  intervalMin: 5,
  retentionDays: 30,
};

function readRaw(key: string): Record<string, unknown> | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: Record<string, unknown> | null): void {
  if (value === null) {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
    return;
  }
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

/** Masked provider config for the renderer (secrets become SECRET_MASK). */
export function getSyncProviderConfig(): AIProviderConfig | null {
  const raw = readRaw(PROVIDER_KEY) as AIProviderConfig | null;
  if (!raw || !SYNC_PROVIDER_INFOS.some((p) => p.id === raw.providerId)) return null;
  const secrets = syncSecretKeys(raw.providerId);
  const config = { ...raw.config };
  for (const k of Object.keys(config)) {
    if (secrets.has(k)) config[k] = config[k] ? SECRET_MASK : '';
  }
  return { providerId: raw.providerId, config };
}

export function setSyncProviderConfig(cfg: AIProviderConfig | null): void {
  if (cfg === null) {
    writeRaw(PROVIDER_KEY, null);
    return;
  }
  const prev = readRaw(PROVIDER_KEY) as AIProviderConfig | null;
  const secrets = syncSecretKeys(cfg.providerId);
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.config)) {
    if (!secrets.has(k)) {
      config[k] = v;
    } else if (v === SECRET_MASK) {
      // unchanged mask keeps the stored secret (same provider only)
      config[k] = prev && prev.providerId === cfg.providerId ? prev.config[k] : '';
    } else {
      config[k] = v ? encryptSecret(v) : '';
    }
  }
  writeRaw(PROVIDER_KEY, { providerId: cfg.providerId, config });
}

/** Decrypted provider config — main-process use only, never sent to renderer. */
export function getResolvedSyncConfig(): { providerId: SyncProviderKind; config: Record<string, string> } | null {
  const raw = readRaw(PROVIDER_KEY) as AIProviderConfig | null;
  if (!raw || !SYNC_PROVIDER_INFOS.some((p) => p.id === raw.providerId)) return null;
  const secrets = syncSecretKeys(raw.providerId);
  const config = { ...raw.config };
  for (const k of Object.keys(config)) {
    if (secrets.has(k) && config[k]) config[k] = decryptSecret(config[k]);
  }
  return { providerId: raw.providerId as SyncProviderKind, config };
}

/** OneDrive rotated its tokens — re-encrypt and persist them in place. */
export function updateStoredSecrets(keys: Record<string, string>): void {
  const raw = readRaw(PROVIDER_KEY) as AIProviderConfig | null;
  if (!raw) return;
  const config = { ...raw.config };
  for (const [k, v] of Object.entries(keys)) config[k] = encryptSecret(v);
  writeRaw(PROVIDER_KEY, { providerId: raw.providerId, config });
}

/** Resolves SECRET_MASK placeholders so "test connection" works without retyping. */
export function resolveMaskedSyncSecrets(providerId: string, incoming: Record<string, string>): Record<string, string> {
  const secrets = syncSecretKeys(providerId);
  const stored = readRaw(PROVIDER_KEY) as AIProviderConfig | null;
  const out = { ...incoming };
  for (const key of secrets) {
    if (out[key] !== SECRET_MASK) continue;
    out[key] = stored && stored.providerId === providerId && stored.config[key] ? decryptSecret(stored.config[key]) : '';
  }
  return out;
}

export function getSyncPrefs(): SyncPrefs {
  const raw = readRaw(PREFS_KEY) ?? {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
  return {
    enabled: raw.enabled === true,
    realmIds: Array.isArray(raw.realmIds) ? (raw.realmIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    intervalMin: Math.min(120, Math.max(1, num(raw.intervalMin, DEFAULT_PREFS.intervalMin))),
    retentionDays: Math.min(365, Math.max(1, num(raw.retentionDays, DEFAULT_PREFS.retentionDays))),
    deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : newDeviceId(),
  };
}

function newDeviceId(): string {
  const id = `dev-${Math.random().toString(36).slice(2, 10)}`;
  writeRaw(PREFS_KEY, { ...readRaw(PREFS_KEY), deviceId: id });
  return id;
}

export function setSyncPrefs(patch: Partial<Omit<SyncPrefs, 'deviceId'>>): SyncPrefs {
  const current = getSyncPrefs();
  const next: SyncPrefs = {
    ...current,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.realmIds !== undefined ? { realmIds: patch.realmIds.filter((x) => typeof x === 'string') } : {}),
    ...(patch.intervalMin !== undefined ? { intervalMin: Math.min(120, Math.max(1, Math.round(patch.intervalMin) || DEFAULT_PREFS.intervalMin)) } : {}),
    ...(patch.retentionDays !== undefined ? { retentionDays: Math.min(365, Math.max(1, Math.round(patch.retentionDays) || DEFAULT_PREFS.retentionDays)) } : {}),
  };
  writeRaw(PREFS_KEY, next as unknown as Record<string, unknown>);
  return next;
}
