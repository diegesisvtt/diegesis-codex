// Testa o fluxo real de move: db.ts compilado + buildTree replicado.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const proj = process.cwd();
const work = path.join(proj, '.tmp-move-test');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// Stub do módulo 'electron' (db.ts usa apenas app.getPath)
const stubDir = path.join(work, 'node_modules', 'electron');
fs.mkdirSync(stubDir, { recursive: true });
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diegesis-db-'));
fs.writeFileSync(
  path.join(stubDir, 'index.js'),
  `module.exports = { app: { getPath: () => ${JSON.stringify(dbDir)} } };`
);
fs.writeFileSync(path.join(stubDir, 'package.json'), '{"main":"index.js"}');

await build({
  entryPoints: ['electron/db.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'better-sqlite3'],
  outfile: path.join(work, 'db.cjs'),
});

const require = createRequire(path.join(work, 'index.js'));
const db = require(path.join(work, 'db.cjs'));

db.initDb();
const realm = db.listRealms()[0];
console.log('realm:', realm.name);

db.createDoc({ id: 'folder1', realmId: realm.id, parentId: null, type: 'core/folder', title: 'Pasta' });
db.createDoc({ id: 'note1', realmId: realm.id, parentId: null, type: 'core/note', title: 'Nota A', content: null });

console.log('\n-- antes do move --');
db.listDocs(realm.id).forEach((d) => console.log(`${d.id} parent=${d.parentId} pos=${d.position}`));

// Simula o que o Explorer envia ao soltar a nota NA pasta
db.moveDoc('note1', 'folder1', 0);

console.log('\n-- depois do move --');
const docs = db.listDocs(realm.id);
docs.forEach((d) => console.log(`${d.id} parent=${d.parentId} pos=${d.position}`));

function buildTree(docs) {
  const byId = new Map();
  const roots = [];
  for (const d of docs) byId.set(d.id, { id: d.id, name: d.title, docType: d.type });
  for (const d of docs) {
    const node = byId.get(d.id);
    if (d.type === 'core/folder') node.children = [];
    if (d.parentId && byId.has(d.parentId)) {
      const parent = byId.get(d.parentId);
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const tree = buildTree(docs);
const inFolder = tree.find((n) => n.id === 'folder1')?.children?.map((c) => c.id) ?? [];
console.log('\nroot:', tree.map((n) => n.id), '| filhos da pasta:', inFolder);

// Cenário 2: move de volta para a raiz
db.moveDoc('note1', null, 0);
const tree2 = buildTree(db.listDocs(realm.id));
console.log('apos voltar p/ raiz:', tree2.map((n) => n.id));

const ok = inFolder.includes('note1') && tree2.some((n) => n.id === 'note1');
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
