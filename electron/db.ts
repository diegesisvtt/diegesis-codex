import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { ChatRole, Conversation, DocChanges, DocInput, DocNode, Realm, RetrievedChunk, SearchResult, SemanticSearchResult, StoredChatMessage, UiState } from '../shared/types';
import { blocksToPlainText, isTiptapDoc, tiptapToBlocks } from '../shared/blockContent';

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
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      realm_id TEXT NOT NULL REFERENCES realms(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_realm ON conversations(realm_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at ASC);
    CREATE TABLE IF NOT EXISTS pdf_pages (
      doc_id TEXT NOT NULL,
      page INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (doc_id, page)
    );
  `);

  // migration: Notion-style page icons (pins inherit the note's icon)
  try {
    db.exec('ALTER TABLE documents ADD COLUMN icon TEXT');
  } catch {
    /* column already exists */
  }

  // migration: legacy tiptap JSON → BlockNote JSON in note documents
  {
    const notes = db.prepare("SELECT id, content FROM documents WHERE type = 'core/note'").all() as {
      id: string;
      content: string | null;
    }[];
    const upd = db.prepare('UPDATE documents SET content = ? WHERE id = ?');
    let migrated = 0;
    const tx = db.transaction(() => {
      for (const n of notes) {
        if (!n.content) continue;
        try {
          const parsed = JSON.parse(n.content);
          if (isTiptapDoc(parsed)) {
            upd.run(JSON.stringify(tiptapToBlocks(parsed)), n.id);
            migrated++;
          }
        } catch {
          /* malformed content — leave as is */
        }
      }
    });
    tx();
    if (migrated > 0) rebuildFts();
  }

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
    const welcome = [
      {
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: 'Bem-vindo ao Mythril', styles: {} }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Crie mundos, notas e quadros de campanha. Tudo salvo localmente em SQLite.', styles: {} },
        ],
      },
    ];
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
export function extractPlainText(content: string | null): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    const parts: string[] = [];
    // PDF documents: index file name, pin tags/fields, highlight excerpts, bookmark labels.
    if (parsed && typeof parsed === 'object' && parsed.file && Array.isArray(parsed.pins)) {
      if (parsed.file.name) parts.push(String(parsed.file.name));
      for (const pin of parsed.pins) {
        if (pin?.tag) parts.push(String(pin.tag));
        if (Array.isArray(pin?.fields)) {
          for (const f of pin.fields) {
            if (f?.key) parts.push(String(f.key));
            if (f?.value != null) parts.push(String(f.value));
          }
        }
      }
      for (const hl of parsed.highlights ?? []) if (hl?.text) parts.push(String(hl.text));
      for (const bm of parsed.bookmarks ?? []) if (bm?.label) parts.push(String(bm.label));
      return parts.join(' ');
    }
    // notes (BlockNote JSON), whiteboards and legacy content
    return blocksToPlainText(content);
  } catch {
    return '';
  }
}

// ---------- PDF page text ----------

export function getPdfPagesText(docId: string): string {
  return getPdfPageRows(docId)
    .map((r) => r.text)
    .join('\n');
}

/** Extracted per-page text of a PDF doc with real page numbers; used by realm export. */
export function getPdfPageRows(docId: string): { page: number; text: string }[] {
  return db.prepare('SELECT page, text FROM pdf_pages WHERE doc_id = ? ORDER BY page ASC').all(docId) as {
    page: number;
    text: string;
  }[];
}

/** Restores extracted PDF page text (realm import), preserving page numbers, then re-indexes. */
export function restorePdfPages(docId: string, rows: { page: number; text: string }[]): void {
  const row = db.prepare('SELECT id, realm_id, type, title, content FROM documents WHERE id = ?').get(docId) as any;
  if (!row || row.type !== 'core/pdf') return;
  const clean = rows
    .filter((r) => r && Number.isInteger(r.page) && r.page >= 1 && r.page <= 10000 && typeof r.text === 'string')
    .map((r) => ({ page: r.page, text: r.text.length > 200000 ? r.text.slice(0, 200000) : r.text }))
    .filter((r) => r.text.trim());
  if (!clean.length) return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pdf_pages WHERE doc_id = ?').run(docId);
    const ins = db.prepare('INSERT INTO pdf_pages (doc_id, page, text) VALUES (?, ?, ?)');
    for (const r of clean) ins.run(docId, r.page, r.text);
  });
  tx();
  ftsUpsert({ id: row.id, realmId: row.realm_id, type: row.type, title: row.title, content: row.content });
  enqueueEmbedJob(docId);
}

/** Replaces the extracted per-page text of a PDF doc and re-indexes it (FTS + embeddings). */
export function savePdfPages(docId: string, pages: string[]): void {
  const row = db.prepare('SELECT id, realm_id, type, title, content FROM documents WHERE id = ?').get(docId) as any;
  if (!row || row.type !== 'core/pdf') return;
  // sanity caps: a 300 MB PDF shouldn't be able to freeze the app or bloat the DB
  const clean = pages
    .filter((p): p is string => typeof p === 'string')
    .slice(0, 10000)
    .map((p) => (p.length > 200000 ? p.slice(0, 200000) : p));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pdf_pages WHERE doc_id = ?').run(docId);
    const ins = db.prepare('INSERT INTO pdf_pages (doc_id, page, text) VALUES (?, ?, ?)');
    clean.forEach((text, i) => {
      if (text && text.trim()) ins.run(docId, i + 1, text);
    });
  });
  tx();
  ftsUpsert({ id: row.id, realmId: row.realm_id, type: row.type, title: row.title, content: row.content });
  enqueueEmbedJob(docId);
}

/** Full text used for FTS/embeddings: JSON content plus extracted PDF pages. */
function docIndexText(doc: { id: string; type: string; content: string | null }): string {
  const text = extractPlainText(doc.content);
  if (doc.type !== 'core/pdf') return text;
  const pages = getPdfPagesText(doc.id);
  return pages ? `${text} ${pages}` : text;
}

function ftsUpsert(doc: { id: string; realmId: string; type: string; title: string; content: string | null }): void {
  db.prepare('DELETE FROM documents_fts WHERE doc_id = ?').run(doc.id);
  db.prepare('INSERT INTO documents_fts (doc_id, realm_id, title, body) VALUES (?, ?, ?, ?)').run(
    doc.id,
    doc.realmId,
    doc.title,
    docIndexText(doc)
  );
}

export function rebuildFts(): void {
  db.prepare('DELETE FROM documents_fts').run();
  const rows = db.prepare('SELECT id, realm_id, type, title, content FROM documents').all() as any[];
  const insert = db.prepare('INSERT INTO documents_fts (doc_id, realm_id, title, body) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const r of rows) insert.run(r.id, r.realm_id, r.title, docIndexText({ id: r.id, type: r.type, content: r.content }));
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
  return { id: row.id, realmId: row.realm_id, title: row.title, text: docIndexText({ id: row.id, type: row.type, content: row.content }) };
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
  db.prepare('DELETE FROM pdf_pages WHERE doc_id IN (SELECT id FROM documents WHERE realm_id = ?)').run(id);
  db.prepare('DELETE FROM realms WHERE id = ?').run(id);
}

/** Ids and types of every document in a realm (used for asset cleanup). */
export function listRealmDocTypes(realmId: string): { id: string; type: string }[] {
  return db.prepare('SELECT id, type FROM documents WHERE realm_id = ?').all(realmId) as { id: string; type: string }[];
}

// ---------- Documents ----------

function rowToDoc(r: any): DocNode {
  return {
    id: r.id,
    realmId: r.realm_id,
    parentId: r.parent_id,
    type: r.type,
    title: r.title,
    icon: r.icon ?? null,
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
    'INSERT INTO documents (id, realm_id, parent_id, type, title, icon, content, position, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(input.id, input.realmId, input.parentId, input.type, input.title, input.icon ?? null, input.content ?? null, position, now);
  const doc: DocNode = { ...input, content: input.content ?? null, position, updatedAt: now };
  ftsUpsert({ id: doc.id, realmId: doc.realmId, type: doc.type, title: doc.title, content: doc.content });
  if (input.type !== 'core/folder') enqueueEmbedJob(doc.id);
  return doc;
}

export function updateDoc(id: string, changes: DocChanges): void {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (changes.title !== undefined) { fields.push('title = ?'); values.push(changes.title); }
  if (changes.icon !== undefined) { fields.push('icon = ?'); values.push(changes.icon); }
  if (changes.content !== undefined) { fields.push('content = ?'); values.push(changes.content); }
  if (changes.parentId !== undefined) { fields.push('parent_id = ?'); values.push(changes.parentId); }
  if (changes.position !== undefined) { fields.push('position = ?'); values.push(changes.position); }
  fields.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  if (changes.title !== undefined || changes.content !== undefined) {
    const row = db.prepare('SELECT id, realm_id, type, title, content FROM documents WHERE id = ?').get(id) as any;
    if (row) {
      ftsUpsert({ id: row.id, realmId: row.realm_id, type: row.type, title: row.title, content: row.content });
      if (row.type !== 'core/folder') enqueueEmbedJob(id);
    }
  }
}

/** Ids and types of a document and all its descendants (used for asset cleanup). */
export function listSubtreeDocs(id: string): { id: string; type: string }[] {
  return db
    .prepare(
      `WITH RECURSIVE sub(id, type) AS (
         SELECT id, type FROM documents WHERE id = ?
         UNION ALL
         SELECT d.id, d.type FROM documents d JOIN sub s ON d.parent_id = s.id
       ) SELECT id, type FROM sub`
    )
    .all(id) as { id: string; type: string }[];
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
  const delPages = db.prepare('DELETE FROM pdf_pages WHERE doc_id = ?');
  for (const d of descendants) {
    del.run(d.id);
    delPages.run(d.id);
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

// ---------- AI conversations ----------

export function listConversations(realmId: string): Conversation[] {
  const rows = db
    .prepare('SELECT * FROM conversations WHERE realm_id = ? ORDER BY updated_at DESC')
    .all(realmId) as any[];
  return rows.map((r) => ({
    id: r.id,
    realmId: r.realm_id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function createConversation(realmId: string): Conversation {
  const now = Date.now();
  const conv: Conversation = { id: generateId(), realmId, title: 'Nova conversa', createdAt: now, updatedAt: now };
  db.prepare('INSERT INTO conversations (id, realm_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    conv.id,
    conv.realmId,
    conv.title,
    conv.createdAt,
    conv.updatedAt
  );
  return conv;
}

export function getConversation(id: string): Conversation | null {
  const r = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
  return r
    ? { id: r.id, realmId: r.realm_id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }
    : null;
}

export function renameConversation(id: string, title: string): void {
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
}

export function touchConversation(id: string, firstUserMessage?: string): void {
  // auto-title from the first user message if the conversation is still untitled
  const conv = getConversation(id);
  if (!conv) return;
  if (conv.title === 'Nova conversa' && firstUserMessage) {
    const title = firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 48) || conv.title;
    db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
  } else {
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id);
  }
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id); // messages cascade
}

/** Inserts an already-remapped conversation with its messages (realm import). */
export function restoreConversation(
  realmId: string,
  conv: { id: string; title: string; createdAt: number; updatedAt: number },
  messages: { id: string; role: ChatRole; content: string; sources: string | null; createdAt: number }[]
): void {
  db.prepare('INSERT INTO conversations (id, realm_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    conv.id,
    realmId,
    conv.title.slice(0, 500),
    conv.createdAt,
    conv.updatedAt
  );
  const ins = db.prepare(
    'INSERT INTO chat_messages (id, conversation_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const m of messages) ins.run(m.id, conv.id, m.role, m.content, m.sources, m.createdAt);
}

export function addChatMessage(
  conversationId: string,
  role: ChatRole,
  content: string,
  sources?: RetrievedChunk[]
): void {
  db.prepare(
    'INSERT INTO chat_messages (id, conversation_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(generateId(), conversationId, role, content, sources ? JSON.stringify(sources) : null, Date.now());
}

export function listChatMessages(conversationId: string): StoredChatMessage[] {
  const rows = db
    .prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(conversationId) as any[];
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as ChatRole,
    content: r.content,
    sources: r.sources ? JSON.parse(r.sources) : undefined,
    createdAt: r.created_at,
  }));
}
