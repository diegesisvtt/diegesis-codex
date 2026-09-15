import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { DocChanges, DocInput, DocNode, Realm, SearchResult, UiState } from '../shared/types';

export const generateId = () => crypto.randomBytes(6).toString('hex');

let db: Database.Database;

export function initDb(): void {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'mythril.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate();
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
  `);

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
    const row = db.prepare('SELECT id, realm_id, title, content FROM documents WHERE id = ?').get(id) as any;
    if (row) ftsUpsert({ id: row.id, realmId: row.realm_id, title: row.title, content: row.content });
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
  for (const d of descendants) del.run(d.id);
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
