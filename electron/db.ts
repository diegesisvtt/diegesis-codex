import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { DocChanges, DocInput, DocNode, Realm, SearchResult, SemanticSearchResult, UiState } from '../shared/types';

export const generateId = () => crypto.randomBytes(6).toString('hex');

let db: Database.Database;

export function initDb(dbPath?: string): void {
  const dir = dbPath ? path.dirname(dbPath) : app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(dbPath ?? path.join(dir, 'mythril.db'));
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate();
}

export function getDb(): Database.Database {
  return db;
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS realms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_realm ON documents(realm_id, parent_id, position);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      doc_id UNINDEXED,
      realm_id UNINDEXED,
      title,
      body,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS doc_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      realm_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedded INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON doc_chunks(doc_id, seq);
    CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedded ON doc_chunks(embedded);
    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status, created_at);
    CREATE TABLE IF NOT EXISTS ai_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Recreate the vec table if one was previously configured (dimension comes from ai_meta).
  const dim = getEmbedDim();
  if (dim !== null) createVecTable(dim);

  // Seed a default realm with a welcome note on first run.
  const realmCount = db.prepare('SELECT COUNT(*) AS c FROM realms').get() as { c: number };
  if (realmCount.c === 0) {
    const realmId = generateId();
    db.prepare('INSERT INTO realms (id, name, created_at) VALUES (?, ?, ?)').run(
      realmId,
      'Meu Primeiro Universo',
      Date.now()
    );
    const welcome = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Bem-vindo ao Mythril' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Crie mundos, notas e quadros de campanha. Tudo salvo localmente em SQLite.' }],
        },
      ],
    };
    db.prepare(
      'INSERT INTO documents (id, realm_id, parent_id, type, title, content, position, updated_at) VALUES (?, ?, NULL, ?, ?, ?, 0, ?)'
    ).run(generateId(), realmId, 'core/note', 'Bem-vindo ao Mythril', JSON.stringify(welcome), Date.now());

    rebuildFts();
  }

  // Keep the FTS index warm for pre-existing databases (e.g. created before FTS existed).
  const ftsCount = db.prepare('SELECT COUNT(*) AS c FROM documents_fts').get() as { c: number };
  const docCount = db.prepare('SELECT COUNT(*) AS c FROM documents').get() as { c: number };
  if (docCount.c > 0 && ftsCount.c === 0) rebuildFts();
}

// ---------- Full-text search ----------

/** Extracts plain text from a document's JSON content for indexing. */
function extractPlainText(content: string | null): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    const parts: string[] = [];
    const walk = (node: any): void => {
      if (!node) return;
      if (typeof node.text === 'string') parts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(walk);
      // whiteboard nodes
      if (Array.isArray(node.nodes)) {
        for (const n of node.nodes) if (n?.data?.name) parts.push(String(n.data.name));
      }
    };
    walk(parsed);
    return parts.join(' ');
  } catch {
    return '';
  }
}

function ftsUpsert(doc: { id: string; realmId: string; title: string; content: string | null }): void {
  db.prepare('DELETE FROM documents_fts WHERE doc_id = ?').run(doc.id);
  db.prepare('INSERT INTO documents_fts (doc_id, realm_id, title, body) VALUES (?, ?, ?, ?)').run(
    doc.id,
    doc.realmId,
    doc.title,
    extractPlainText(doc.content)
  );
}

export function rebuildFts(): void {
  db.prepare('DELETE FROM documents_fts').run();
  const rows = db.prepare('SELECT id, realm_id, title, content FROM documents').all() as any[];
  const insert = db.prepare('INSERT INTO documents_fts (doc_id, realm_id, title, body) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const r of rows) insert.run(r.id, r.realm_id, r.title, extractPlainText(r.content));
  });
  tx();
}

export function searchDocs(realmId: string, query: string): SearchResult[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"*`);
  if (tokens.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT f.doc_id AS docId,
              d.title AS title,
              d.type AS type,
              snippet(documents_fts, 3, '<mark>', '</mark>', '…', 40) AS snippet
       FROM documents_fts f
       JOIN documents d ON d.id = f.doc_id
       WHERE documents_fts MATCH ? AND f.realm_id = ?
       ORDER BY bm25(documents_fts, 10.0, 5.0, 3.0, 1.0)
       LIMIT 40`
    )
    .all(tokens.join(' AND '), realmId) as SearchResult[];
  return rows;
}

// ---------- Vector store (sqlite-vec) ----------

function createVecTable(dim: number): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      embedding float[${dim}] distance_metric=cosine,
      +chunk_id TEXT,
      +doc_id TEXT,
      +realm_id TEXT
    );
  `);
}

export function getEmbedDim(): number | null {
  const row = db.prepare("SELECT value FROM ai_meta WHERE key = 'embed_dim'").get() as
    | { value: string }
    | undefined;
  return row ? parseInt(row.value, 10) : null;
}

/**
 * Sets the embedding dimension, (re)creating the vec table. If the dimension
 * changes, all embeddings are wiped and every document is re-enqueued.
 */
export function setEmbedDim(dim: number): { changed: boolean } {
  const prev = getEmbedDim();
  db.prepare(
    "INSERT INTO ai_meta (key, value) VALUES ('embed_dim', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(dim));
  if (prev === dim) return { changed: false };

  db.exec('DROP TABLE IF EXISTS vec_chunks');
  createVecTable(dim);
  db.prepare('UPDATE doc_chunks SET embedded = 0').run();
  enqueueAllDocs();
  return { changed: true };
}

/** Creates the vec table lazily when the dimension is first discovered from a
 *  provider response, without wiping anything. */
export function ensureEmbedDim(dim: number): void {
  if (getEmbedDim() !== null) return;
  db.prepare("INSERT INTO ai_meta (key, value) VALUES ('embed_dim', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    String(dim)
  );
  createVecTable(dim);
}

/** Drops the vec table and forgets the dimension (re-discovered on next embed batch). */
export function resetEmbedDim(): void {
  db.exec('DROP TABLE IF EXISTS vec_chunks');
  db.prepare("DELETE FROM ai_meta WHERE key = 'embed_dim'").run();
  db.prepare('UPDATE doc_chunks SET embedded = 0').run();
  enqueueAllDocs();
}

export interface DocChunkRow {
  id: string;
  doc_id: string;
  realm_id: string;
  seq: number;
  text: string;
  content_hash: string;
  embedded: number;
}

/** Replaces a document's chunks, removing their vector rows. New chunks start unembedded. */
export function deleteChunksForDoc(docId: string): void {
  if (getEmbedDim() !== null) {
    db.prepare('DELETE FROM vec_chunks WHERE rowid IN (SELECT rowid FROM vec_chunks WHERE doc_id = ?)').run(docId);
  }
  db.prepare('DELETE FROM doc_chunks WHERE doc_id = ?').run(docId);
}

export function deleteChunksForRealm(realmId: string): void {
  if (getEmbedDim() !== null) {
    db.prepare('DELETE FROM vec_chunks WHERE rowid IN (SELECT rowid FROM vec_chunks WHERE realm_id = ?)').run(realmId);
  }
  db.prepare('DELETE FROM doc_chunks WHERE realm_id = ?').run(realmId);
}

/** Existing chunk hashes for a document, used to skip re-embedding unchanged content. */
export function getChunkHashes(docId: string): Map<number, { id: string; hash: string; embedded: boolean }> {
  const rows = db
    .prepare('SELECT id, seq, content_hash, embedded FROM doc_chunks WHERE doc_id = ?')
    .all(docId) as any[];
  const map = new Map<number, { id: string; hash: string; embedded: boolean }>();
  for (const r of rows) map.set(r.seq, { id: r.id, hash: r.content_hash, embedded: r.embedded === 1 });
  return map;
}

function deleteChunk(chunkId: string): void {
  if (getEmbedDim() !== null) {
    db.prepare('DELETE FROM vec_chunks WHERE rowid IN (SELECT rowid FROM vec_chunks WHERE chunk_id = ?)').run(chunkId);
  }
  db.prepare('DELETE FROM doc_chunks WHERE id = ?').run(chunkId);
}

/**
 * Diffs a document's freshly computed chunks against the stored ones. Unchanged
 * chunks (same seq + hash) keep their ids and embeddings; changed/removed chunks
 * are deleted (vectors included); new/changed chunks are inserted unembedded.
 */
export function syncDocChunks(
  docId: string,
  realmId: string,
  chunks: { seq: number; text: string; hash: string }[]
): void {
  const existing = getChunkHashes(docId);
  const tx = db.transaction(() => {
    for (const [seq, row] of existing) {
      const next = chunks.find((c) => c.seq === seq);
      if (!next || next.hash !== row.hash) deleteChunk(row.id);
    }
    const insert = db.prepare(
      'INSERT INTO doc_chunks (id, doc_id, realm_id, seq, text, content_hash, embedded, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    );
    const now = Date.now();
    for (const c of chunks) {
      const prev = existing.get(c.seq);
      if (prev && prev.hash === c.hash) continue; // unchanged
      insert.run(generateId(), docId, realmId, c.seq, c.text, c.hash, now);
    }
  });
  tx();
}

export function getUnembeddedChunks(limit: number): DocChunkRow[] {
  return db
    .prepare('SELECT * FROM doc_chunks WHERE embedded = 0 ORDER BY updated_at ASC LIMIT ?')
    .all(limit) as DocChunkRow[];
}

export function insertVecEmbedding(chunkId: string, docId: string, realmId: string, embedding: Float32Array): void {
  const tx = db.transaction(() => {
    // the chunk may have been deleted while the embedding request was in flight
    const exists = db.prepare('SELECT 1 AS x FROM doc_chunks WHERE id = ?').get(chunkId);
    if (!exists) return;
    db.prepare('DELETE FROM vec_chunks WHERE rowid IN (SELECT rowid FROM vec_chunks WHERE chunk_id = ?)').run(chunkId);
    db.prepare('INSERT INTO vec_chunks (chunk_id, doc_id, realm_id, embedding) VALUES (?, ?, ?, ?)').run(
      chunkId,
      docId,
      realmId,
      embedding
    );
    db.prepare('UPDATE doc_chunks SET embedded = 1, updated_at = ? WHERE id = ?').run(Date.now(), chunkId);
  });
  tx();
}

/**
 * Two-step KNN: the vec0 MATCH query runs isolated (joins/constraints on aux
 * columns are illegal inside KNN queries), then chunks are joined by id.
 * Over-fetches progressively so realms with few chunks still get k results.
 */
function knnRaw(realmId: string, embedding: Float32Array, k: number) {
  if (getEmbedDim() === null) return [];
  const knnStmt = db.prepare('SELECT chunk_id, distance FROM vec_chunks WHERE embedding MATCH ? AND k = ?');
  const joinStmt = db.prepare(
    `SELECT c.id AS chunkId, c.text AS text, c.doc_id AS docId, d.title AS title, d.type AS type
     FROM doc_chunks c
     JOIN documents d ON d.id = c.doc_id
     WHERE c.realm_id = ? AND c.id IN (SELECT value FROM json_each(?))`
  );

  let fetchK = k * 5;
  for (let attempt = 0; attempt < 4; attempt++) {
    const knn = knnStmt.all(embedding, fetchK) as { chunk_id: string; distance: number }[];
    if (knn.length === 0) return [];
    const dist = new Map(knn.map((r) => [r.chunk_id, r.distance]));
    const joined = (joinStmt.all(realmId, JSON.stringify(knn.map((r) => r.chunk_id))) as any[])
      .map((r) => ({ ...r, distance: dist.get(r.chunkId) as number }))
      .sort((a, b) => a.distance - b.distance);
    // enough realm matches, or KNN already exhausted the store → done
    if (joined.length >= k || knn.length < fetchK) return joined.slice(0, k);
    fetchK *= 4;
  }
  // last attempt returns what it could
  const knn = knnStmt.all(embedding, fetchK) as { chunk_id: string; distance: number }[];
  const dist = new Map(knn.map((r) => [r.chunk_id, r.distance]));
  return (joinStmt.all(realmId, JSON.stringify(knn.map((r) => r.chunk_id))) as any[])
    .map((r) => ({ ...r, distance: dist.get(r.chunkId) as number }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

export function knnSearch(realmId: string, embedding: Float32Array, k: number): SemanticSearchResult[] {
  return knnRaw(realmId, embedding, k).map((r) => ({
    docId: r.docId,
    title: r.title,
    type: r.type,
    snippet: r.text.length > 280 ? r.text.slice(0, 280) + '…' : r.text,
    score: Math.max(0, 1 - r.distance),
  }));
}

/** KNN search returning full chunk text — used by the RAG pipeline. */
export function knnChunks(
  realmId: string,
  embedding: Float32Array,
  k: number
): { docId: string; title: string; type: string; text: string; score: number }[] {
  return knnRaw(realmId, embedding, k).map((r) => ({
    docId: r.docId,
    title: r.title,
    type: r.type,
    text: r.text,
    score: Math.max(0, 1 - r.distance),
  }));
}

export function chunkStats(): { chunkCount: number; embeddedCount: number } {
  const row = db
    .prepare('SELECT COUNT(*) AS chunks, COALESCE(SUM(embedded), 0) AS embedded FROM doc_chunks')
    .get() as { chunks: number; embedded: number };
  return { chunkCount: row.chunks, embeddedCount: row.embedded };
}

// ---------- AI embedding job queue ----------

export function enqueueEmbedJob(docId: string): void {
  db.prepare("DELETE FROM ai_jobs WHERE doc_id = ? AND status = 'pending'").run(docId);
  db.prepare("INSERT INTO ai_jobs (id, doc_id, status, attempts, created_at) VALUES (?, ?, 'pending', 0, ?)").run(
    generateId(),
    docId,
    Date.now()
  );
}

export function enqueueAllDocs(): void {
  const rows = db.prepare('SELECT id FROM documents').all() as { id: string }[];
  db.prepare("DELETE FROM ai_jobs WHERE status = 'pending'").run();
  const insert = db.prepare(
    "INSERT INTO ai_jobs (id, doc_id, status, attempts, created_at) VALUES (?, ?, 'pending', 0, ?)"
  );
  const tx = db.transaction(() => {
    const now = Date.now();
    for (const r of rows) insert.run(generateId(), r.id, now);
  });
  tx();
}

export function pendingJobCount(): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM ai_jobs WHERE status = 'pending'").get() as { c: number }).c;
}

export function claimPendingJob(): { id: string; doc_id: string; attempts: number } | null {
  const row = db
    .prepare("SELECT id, doc_id, attempts FROM ai_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1")
    .get() as { id: string; doc_id: string; attempts: number } | undefined;
  if (!row) return null;
  // mark as processing so enqueueEmbedJob's pending-dedupe cannot delete/re-add it mid-flight
  db.prepare("UPDATE ai_jobs SET status = 'processing' WHERE id = ?").run(row.id);
  return row;
}

export function completeJob(id: string): void {
  db.prepare('DELETE FROM ai_jobs WHERE id = ?').run(id);
}

export function failJob(id: string, error: string, maxAttempts = 5): void {
  const row = db.prepare('SELECT attempts FROM ai_jobs WHERE id = ?').get(id) as { attempts: number } | undefined;
  if (!row) return;
  if (row.attempts + 1 >= maxAttempts) {
    // Give up on this job so one bad document cannot stall the queue.
    db.prepare('DELETE FROM ai_jobs WHERE id = ?').run(id);
    return;
  }
  db.prepare("UPDATE ai_jobs SET status = 'pending', attempts = attempts + 1, error = ? WHERE id = ?").run(error, id);
}

export function getDocForChunking(docId: string): { id: string; realmId: string; title: string; text: string } | null {
  const row = db.prepare('SELECT id, realm_id, title, content, type FROM documents WHERE id = ?').get(docId) as any;
  if (!row) return null;
  return { id: row.id, realmId: row.realm_id, title: row.title, text: extractPlainText(row.content) };
}

// ---------- Realms ----------

export function listRealms(): Realm[] {
  const rows = db.prepare('SELECT id, name, created_at FROM realms ORDER BY created_at ASC').all() as any[];
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

export function createRealm(name: string): Realm {
  const realm: Realm = { id: generateId(), name, createdAt: Date.now() };
  db.prepare('INSERT INTO realms (id, name, created_at) VALUES (?, ?, ?)').run(realm.id, realm.name, realm.createdAt);
  return realm;
}

export function renameRealm(id: string, name: string): void {
  db.prepare('UPDATE realms SET name = ? WHERE id = ?').run(name, id);
}

export function deleteRealm(id: string): void {
  deleteChunksForRealm(id);
  db.prepare("DELETE FROM ai_jobs WHERE doc_id IN (SELECT id FROM documents WHERE realm_id = ?)").run(id);
  db.prepare('DELETE FROM documents_fts WHERE realm_id = ?').run(id);
  db.prepare('DELETE FROM realms WHERE id = ?').run(id);
}

// ---------- Documents ----------

function rowToDoc(r: any): DocNode {
  return {
    id: r.id,
    realmId: r.realm_id,
    parentId: r.parent_id,
    type: r.type,
    title: r.title,
    content: r.content,
    position: r.position,
    updatedAt: r.updated_at,
  };
}

export function listDocs(realmId: string): DocNode[] {
  const rows = db
    .prepare('SELECT * FROM documents WHERE realm_id = ? ORDER BY position ASC, updated_at ASC')
    .all(realmId) as any[];
  return rows.map(rowToDoc);
}

export function createDoc(input: DocInput): DocNode {
  const now = Date.now();
  const position =
    input.position ??
    ((db
      .prepare('SELECT COALESCE(MAX(position) + 1, 0) AS p FROM documents WHERE realm_id = ? AND parent_id IS ?')
      .get(input.realmId, input.parentId) as { p: number }).p);
  db.prepare(
    'INSERT INTO documents (id, realm_id, parent_id, type, title, content, position, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(input.id, input.realmId, input.parentId, input.type, input.title, input.content ?? null, position, now);
  const doc: DocNode = { ...input, content: input.content ?? null, position, updatedAt: now };
  ftsUpsert(doc);
  if (input.type !== 'core/folder') enqueueEmbedJob(doc.id);
  return doc;
}

export function updateDoc(id: string, changes: DocChanges): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (changes.title !== undefined) { fields.push('title = ?'); values.push(changes.title); }
  if (changes.content !== undefined) { fields.push('content = ?'); values.push(changes.content); }
  if (changes.parentId !== undefined) { fields.push('parent_id = ?'); values.push(changes.parentId); }
  if (changes.position !== undefined) { fields.push('position = ?'); values.push(changes.position); }
  fields.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  if (changes.title !== undefined || changes.content !== undefined) {
    const row = db.prepare('SELECT id, realm_id, type, title, content FROM documents WHERE id = ?').get(id) as any;
    if (row) {
      ftsUpsert({ id: row.id, realmId: row.realm_id, title: row.title, content: row.content });
      if (row.type !== 'core/folder') enqueueEmbedJob(id);
    }
  }
}

export function deleteDoc(id: string): void {
  // ON DELETE CASCADE handles descendants (parent_id references documents(id)).
  const descendants = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM documents WHERE id = ?
         UNION ALL
         SELECT d.id FROM documents d JOIN sub s ON d.parent_id = s.id
       ) SELECT id FROM sub`
    )
    .all(id) as { id: string }[];
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  const del = db.prepare('DELETE FROM documents_fts WHERE doc_id = ?');
  for (const d of descendants) {
    del.run(d.id);
    deleteChunksForDoc(d.id);
    db.prepare('DELETE FROM ai_jobs WHERE doc_id = ?').run(d.id);
  }
}

export function moveDoc(id: string, parentId: string | null, position: number): void {
  const doc = db.prepare('SELECT realm_id FROM documents WHERE id = ?').get(id) as { realm_id: string } | undefined;
  if (!doc) return;
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE documents SET position = position + 1 WHERE realm_id = ? AND parent_id IS ? AND position >= ? AND id != ?'
    ).run(doc.realm_id, parentId, position, id);
    db.prepare('UPDATE documents SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?').run(
      parentId,
      position,
      Date.now(),
      id
    );
  });
  tx();
}

// ---------- UI settings ----------

export function loadUiState(): UiState | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ui_state'").get() as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}

export function saveUiState(state: UiState): void {
  db.prepare("INSERT INTO settings (key, value) VALUES ('ui_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    JSON.stringify(state)
  );
}
