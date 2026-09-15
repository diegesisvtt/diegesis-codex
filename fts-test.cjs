const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`CREATE TABLE documents (id TEXT PRIMARY KEY, realm_id TEXT, type TEXT, title TEXT, content TEXT);
CREATE VIRTUAL TABLE documents_fts USING fts5(doc_id UNINDEXED, realm_id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2');`);
db.prepare('INSERT INTO documents VALUES (?,?,?,?,?)').run('d1', 'r1', 'core/note', 'Mundo de Aventura', '{}');
db.prepare('INSERT INTO documents_fts VALUES (?,?,?,?)').run('d1', 'r1', 'Mundo de Aventura', 'o coração da floresta esconde um dragão ancião');
const q = ['dragao', 'floresta'].map((t) => `"${t}"*`).join(' AND ');
const rows = db
  .prepare(
    `SELECT f.doc_id AS docId, d.title, d.type, snippet(documents_fts,3,'<mark>','</mark>','…',40) AS snippet
     FROM documents_fts f JOIN documents d ON d.id=f.doc_id
     WHERE documents_fts MATCH ? AND f.realm_id=? ORDER BY bm25(documents_fts,10.0,5.0,3.0,1.0) LIMIT 40`
  )
  .all(q, 'r1');
console.log('AND + diacritics-insensitive:', JSON.stringify(rows, null, 1));
