// Sync wire format: per-document envelopes with integrity hash, plus the
// per-realm manifest that acts as the consistency point of a sync cycle.
import crypto from 'node:crypto';
import type { DocNode } from '../../shared/types';

export const SYNC_ROOT = 'diegesis-sync';
export const DOC_FORMAT = 'diegesis-sync-doc';
export const MANIFEST_FORMAT = 'diegesis-sync-manifest';
export const SYNC_FORMAT_VERSION = 1;

export function sha256Hex(data: string | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Fields that define a document's synced state (fixed key order = stable hash). */
export interface SyncedDocPayload {
  id: string;
  realmId: string;
  parentId: string | null;
  type: string;
  title: string;
  icon: string | null;
  cover: string | null;
  content: string | null;
  position: number;
  updatedAt: number;
  /** extracted page text for core/pdf docs (re-extraction needs the renderer) */
  pdfPages?: { page: number; text: string }[];
}

export interface DocEnvelope {
  format: typeof DOC_FORMAT;
  version: number;
  /** sha256 of the canonical payload JSON — guards against torn writes */
  sha256: string;
  doc: SyncedDocPayload;
}

export interface ManifestDocEntry {
  hash: string;
  updatedAt: number;
  /** tombstone: the doc was deleted on some device */
  deleted?: boolean;
}

export interface ManifestAssetEntry {
  hash: string;
  size: number;
}

export interface SyncManifest {
  format: typeof MANIFEST_FORMAT;
  version: number;
  realmId: string;
  realmName: string;
  updatedAt: number;
  /** id of the last device that committed the manifest */
  deviceId: string;
  docs: Record<string, ManifestDocEntry>;
  /** keyed by '<kind>/<fileName>' (images/…, audios/…, pdfs/…) */
  assets: Record<string, ManifestAssetEntry>;
}

export function docToPayload(doc: DocNode, pdfPages?: { page: number; text: string }[]): SyncedDocPayload {
  return {
    id: doc.id,
    realmId: doc.realmId,
    parentId: doc.parentId,
    type: doc.type,
    title: doc.title,
    icon: doc.icon ?? null,
    cover: doc.cover ?? null,
    content: doc.content,
    position: doc.position,
    updatedAt: doc.updatedAt,
    ...(pdfPages && pdfPages.length ? { pdfPages } : {}),
  };
}

function canonical(payload: SyncedDocPayload): string {
  // fixed key order keeps the hash stable across engines/versions
  return JSON.stringify({
    id: payload.id,
    realmId: payload.realmId,
    parentId: payload.parentId,
    type: payload.type,
    title: payload.title,
    icon: payload.icon,
    cover: payload.cover,
    content: payload.content,
    position: payload.position,
    updatedAt: payload.updatedAt,
    pdfPages: payload.pdfPages ?? null,
  });
}

/** Hash of the doc's synced state — compared against sync_state/manifest. */
export function hashPayload(payload: SyncedDocPayload): string {
  return sha256Hex(canonical(payload));
}

export function encodeDoc(doc: DocNode, pdfPages?: { page: number; text: string }[]): Uint8Array {
  const payload = docToPayload(doc, pdfPages);
  const envelope: DocEnvelope = { format: DOC_FORMAT, version: SYNC_FORMAT_VERSION, sha256: hashPayload(payload), doc: payload };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

/** Parses and integrity-checks a remote doc envelope; null = corrupted (skip). */
export function decodeDoc(bytes: Uint8Array): SyncedDocPayload | null {
  try {
    const env = JSON.parse(new TextDecoder().decode(bytes)) as DocEnvelope;
    if (env?.format !== DOC_FORMAT || typeof env.version !== 'number' || env.version > SYNC_FORMAT_VERSION) return null;
    if (!env.doc || typeof env.doc.id !== 'string' || typeof env.sha256 !== 'string') return null;
    if (hashPayload(env.doc) !== env.sha256) return null;
    return env.doc;
  } catch {
    return null;
  }
}

export function encodeManifest(m: SyncManifest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ ...m, format: MANIFEST_FORMAT, version: SYNC_FORMAT_VERSION }));
}

export function decodeManifest(bytes: Uint8Array): SyncManifest | null {
  try {
    const m = JSON.parse(new TextDecoder().decode(bytes)) as SyncManifest;
    if (m?.format !== MANIFEST_FORMAT || typeof m.version !== 'number' || m.version > SYNC_FORMAT_VERSION) return null;
    if (typeof m.realmId !== 'string' || typeof m.docs !== 'object' || m.docs === null) return null;
    return { ...m, docs: m.docs ?? {}, assets: m.assets ?? {} };
  } catch {
    return null;
  }
}

// ---------- remote path helpers ----------

export const remotePaths = {
  realmDir: (realmId: string) => `${SYNC_ROOT}/${realmId}`,
  manifest: (realmId: string) => `${SYNC_ROOT}/${realmId}/manifest.json`,
  doc: (realmId: string, docId: string) => `${SYNC_ROOT}/${realmId}/docs/${docId}.json`,
  version: (realmId: string, docId: string, ts: number) => `${SYNC_ROOT}/${realmId}/versions/${docId}/${ts}.json`,
  versionsDir: (realmId: string, docId: string) => `${SYNC_ROOT}/${realmId}/versions/${docId}`,
  asset: (realmId: string, key: string) => `${SYNC_ROOT}/${realmId}/assets/${key}`,
  assetsDir: (realmId: string) => `${SYNC_ROOT}/${realmId}/assets`,
};
