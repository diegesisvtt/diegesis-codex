// Cloud sync core types: provider abstraction, remote layout, status.

export type SyncProviderKind = 'local' | 'webdav' | 'onedrive' | 's3';

/** A remote object entry, paths always relative POSIX-style (a/b/c.json). */
export interface RemoteEntry {
  path: string;
  size: number;
  etag?: string;
  mtime?: number;
}

/**
 * Uniform storage verbs implemented by every backend. All paths are relative
 * to the provider root and use forward slashes. `put` must be atomic from the
 * reader's perspective (tmp+rename locally, server-side atomicity on HTTP
 * object stores).
 */
export interface SyncProvider {
  readonly kind: SyncProviderKind;
  /** validates credentials/paths; throws with a user-readable message */
  test(): Promise<void>;
  /** recursive listing under a prefix ('' = everything) */
  list(prefix: string): Promise<RemoteEntry[]>;
  get(path: string): Promise<Uint8Array>;
  put(path: string, data: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  /** creates intermediate directories; no-op on object stores */
  ensureDir?(path: string): Promise<void>;
}

export type SyncProviderState = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error' | 'auth-required';

export interface SyncConflictView {
  id: string;
  realmId: string;
  docId: string;
  title: string;
  detectedAt: number;
}

export interface SyncVersionView {
  docId: string;
  /** epoch ms taken from the version file name */
  timestamp: number;
  path: string;
}

export interface RemoteRealmView {
  realmId: string;
  name: string;
  updatedAt: number;
  docCount: number;
}

export interface SyncLogEntry {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface SyncStatus {
  state: SyncProviderState;
  providerId: SyncProviderKind | null;
  enabled: boolean;
  lastSyncAt: number | null;
  /** docs waiting to be pushed right now */
  pending: number;
  conflictCount: number;
  lastError: string | null;
  log: SyncLogEntry[];
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly code: 'network' | 'auth' | 'quota' | 'integrity' | 'conflict' | 'unknown'
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** Classifies arbitrary provider/fetch failures for the engine's retry policy. */
export function classifyError(err: unknown): SyncError {
  if (err instanceof SyncError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|403|unauthorized|forbidden|invalid[_ ]?grant/i.test(msg)) return new SyncError(msg, 'auth');
  if (/507|quota|insufficient storage/i.test(msg)) return new SyncError(msg, 'quota');
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|socket|timeout/i.test(msg)) {
    return new SyncError(msg, 'network');
  }
  return new SyncError(msg, 'unknown');
}
