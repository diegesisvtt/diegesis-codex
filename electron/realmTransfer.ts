// Realm export/import: self-contained .realm transfer files (zip, DEFLATE).
// The archive carries a realm.json manifest (documents, conversations,
// extracted PDF page text) plus each PDF binary as a pdfs/<docId>.pdf entry,
// so a realm can move between machines without data loss.
import { app, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import * as db from './db';
import { pdfFilePath } from './pdf';
import { audioFilePath, extractAudioRefs, isValidAudioData } from './audio';
import { imageFilePath, extractImageRefs, isValidImageData } from './images';
import type { ChatRole, DocumentType, RealmTransferResult, RetrievedChunk } from '../shared/types';

const FORMAT = 'diegesis-realm';
const VERSION = 2;
const MANIFEST = 'realm.json';
const PDF_DIR = 'pdfs';
const AUDIO_DIR = 'audios';
const IMAGE_DIR = 'images';
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB transfer file cap
const VALID_TYPES: DocumentType[] = [
  'core/note',
  'core/whiteboard',
  'core/folder',
  'core/pdf',
  'hexcrawl/map',
  'diegesis/timeline',
];
const VALID_ROLES: ChatRole[] = ['system', 'user', 'assistant'];

interface RealmFileDoc {
  id: string;
  parentId: string | null;
  type: DocumentType;
  title: string;
  icon?: string | null;
  content: string | null;
  position: number;
}

interface RealmFileMessage {
  role: ChatRole;
  content: string;
  sources?: RetrievedChunk[];
  createdAt: number;
}

interface RealmFileConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: RealmFileMessage[];
}

interface RealmFile {
  format: string;
  version: number;
  exportedAt: number;
  name: string;
  documents: RealmFileDoc[];
  conversations: RealmFileConversation[];
  /** extracted page text with real page numbers, keyed by document id */
  pdfPages: Record<string, { page: number; text: string }[]>;
}

function safeFileName(name: string): string {
  const clean = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  return clean || 'realm';
}

export async function exportRealm(realmId: string): Promise<RealmTransferResult> {
  const realm = db.listRealms().find((r) => r.id === realmId);
  if (!realm) return { ok: false, error: 'Universo não encontrado.' };

  // Ask where to save before doing any heavy lifting (PDFs can be large).
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: 'Janela principal não disponível.' };
  let defaultDir = '';
  try {
    defaultDir = app.getPath('desktop');
  } catch {
    /* fall back to the OS default */
  }
  const picked = await dialog.showSaveDialog(win, {
    title: 'Exportar universo',
    defaultPath: path.join(defaultDir, `${safeFileName(realm.name)}.realm`),
    filters: [{ name: 'Diegesis Codex Realm', extensions: ['realm'] }],
  });
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };

  const docs = db.listDocs(realmId);
  const payload: RealmFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    name: realm.name,
    documents: docs.map((d) => ({
      id: d.id,
      parentId: d.parentId,
      type: d.type,
      title: d.title,
      icon: d.icon ?? null,
      content: d.content,
      position: d.position,
    })),
    conversations: db.listConversations(realmId).map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: db.listChatMessages(c.id).map((m) => ({
        role: m.role,
        content: m.content,
        sources: m.sources,
        createdAt: m.createdAt,
      })),
    })),
    pdfPages: {},
  };

  const zip = new AdmZip();
  for (const doc of docs) {
    if (doc.type !== 'core/pdf') continue;
    const pages = db.getPdfPageRows(doc.id);
    if (pages.length) payload.pdfPages[doc.id] = pages;
    try {
      const file = pdfFilePath(doc.id);
      if (fs.existsSync(file)) {
        zip.addFile(`${PDF_DIR}/${doc.id}.pdf`, await fs.promises.readFile(file));
      }
    } catch {
      return { ok: false, error: `Falha ao ler o PDF "${doc.title}".` };
    }
  }
  // audio files referenced by any document (notes, whiteboards, PDF highlights);
  // asset ids are globally unique, so they travel unchanged in the content JSON
  for (const doc of docs) {
    for (const fileName of extractAudioRefs(doc.content)) {
      try {
        const file = audioFilePath(fileName);
        if (fs.existsSync(file) && !zip.getEntry(`${AUDIO_DIR}/${fileName}`)) {
          zip.addFile(`${AUDIO_DIR}/${fileName}`, await fs.promises.readFile(file));
        }
      } catch {
        return { ok: false, error: `Falha ao ler o áudio "${fileName}".` };
      }
    }
  }
  // image files referenced by any document (timeline event covers, etc.)
  for (const doc of docs) {
    for (const fileName of extractImageRefs(doc.content)) {
      try {
        const file = imageFilePath(fileName);
        if (fs.existsSync(file) && !zip.getEntry(`${IMAGE_DIR}/${fileName}`)) {
          zip.addFile(`${IMAGE_DIR}/${fileName}`, await fs.promises.readFile(file));
        }
      } catch {
        return { ok: false, error: `Falha ao ler a imagem "${fileName}".` };
      }
    }
  }
  zip.addFile(MANIFEST, Buffer.from(JSON.stringify(payload), 'utf8'));

  try {
    await fs.promises.writeFile(picked.filePath, zip.toBuffer());
  } catch {
    return { ok: false, error: 'Não foi possível gravar o arquivo de exportação.' };
  }
  return { ok: true, filePath: picked.filePath };
}

function sanitizeDoc(raw: unknown): RealmFileDoc | null {
  const d = raw as Partial<RealmFileDoc>;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.id !== 'string' || !d.id) return null;
  if (!VALID_TYPES.includes(d.type as DocumentType)) return null;
  return {
    id: d.id,
    parentId: typeof d.parentId === 'string' ? d.parentId : null,
    type: d.type as DocumentType,
    title: typeof d.title === 'string' ? d.title.slice(0, 500) : '',
    icon: typeof d.icon === 'string' ? d.icon : null,
    content: typeof d.content === 'string' ? d.content : null,
    position: typeof d.position === 'number' && Number.isFinite(d.position) ? d.position : 0,
  };
}

function sanitizeConversation(raw: unknown): RealmFileConversation | null {
  const c = raw as Partial<RealmFileConversation>;
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) return null;
  const now = Date.now();
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const messages = (Array.isArray(c.messages) ? c.messages : [])
    .map((m): RealmFileMessage | null => {
      if (!m || typeof m !== 'object' || typeof m.content !== 'string') return null;
      const role = VALID_ROLES.includes(m.role as ChatRole) ? (m.role as ChatRole) : 'user';
      return {
        role,
        content: m.content,
        sources: Array.isArray(m.sources) ? m.sources : undefined,
        createdAt: num(m.createdAt, now),
      };
    })
    .filter((m): m is RealmFileMessage => m !== null);
  return {
    id: c.id,
    title: typeof c.title === 'string' ? c.title : 'Conversa',
    createdAt: num(c.createdAt, now),
    updatedAt: num(c.updatedAt, now),
    messages,
  };
}

/** Rewrites source chunk docIds through the import id map (best-effort). */
function remapSources(sources: RetrievedChunk[] | undefined, idMap: Map<string, string>): string | null {
  if (!sources) return null;
  const mapped = sources.map((s) => ({ ...s, docId: idMap.get(s.docId) ?? s.docId }));
  return JSON.stringify(mapped);
}

export async function importRealm(): Promise<RealmTransferResult> {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { ok: false, error: 'Janela principal não disponível.' };
  const picked = await dialog.showOpenDialog(win, {
    title: 'Importar universo',
    filters: [{ name: 'Diegesis Codex Realm', extensions: ['realm'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true };

  const src = picked.filePaths[0];
  let parsed: RealmFile;
  let zip: AdmZip;
  try {
    const stat = await fs.promises.stat(src);
    if (stat.size > MAX_FILE_SIZE) return { ok: false, error: 'Arquivo de importação muito grande.' };
    const head = Buffer.alloc(4);
    const fd = await fs.promises.open(src, 'r');
    try {
      await fd.read(head, 0, 4, 0);
    } finally {
      await fd.close();
    }
    if (head.readUInt32LE(0) !== 0x04034b50) {
      // "PK\x03\x04" — anything else (e.g. a renamed legacy .realm.json) isn't a zip.
      return { ok: false, error: 'O arquivo não é um universo Diegesis Codex válido.' };
    }
    zip = new AdmZip(src);
    const entry = zip.getEntry(MANIFEST);
    if (!entry) return { ok: false, error: 'Arquivo de universo corrompido (sem manifesto).' };
    parsed = JSON.parse(entry.getData().toString('utf8'));
  } catch {
    return { ok: false, error: 'Não foi possível ler o arquivo selecionado.' };
  }
  if (parsed?.format !== FORMAT || typeof parsed.version !== 'number' || parsed.version !== VERSION) {
    return { ok: false, error: 'O arquivo não é um universo Diegesis Codex válido.' };
  }
  if (!Array.isArray(parsed.documents)) {
    return { ok: false, error: 'Arquivo de universo corrompido (sem documentos).' };
  }

  const docs = parsed.documents.map(sanitizeDoc).filter((d): d is RealmFileDoc => d !== null);
  const conversations = (Array.isArray(parsed.conversations) ? parsed.conversations : [])
    .map(sanitizeConversation)
    .filter((c): c is RealmFileConversation => c !== null);
  const name =
    typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 200) : 'Universo importado';

  // Ids are remapped so re-importing into the same app never collides.
  const idMap = new Map<string, string>();
  for (const d of docs) {
    if (idMap.has(d.id)) return { ok: false, error: 'Arquivo inválido: documentos com identificadores duplicados.' };
    idMap.set(d.id, db.generateId());
  }
  for (const d of docs) {
    if (d.parentId && !idMap.has(d.parentId)) d.parentId = null; // orphan guard
  }

  const existing = new Set(db.listRealms().map((r) => r.name));
  const realmName = existing.has(name) ? `${name} (importado)` : name;
  let realmId = '';

  try {
    // All DB writes in a single transaction: a crash can't leave a half-imported realm.
    db.getDb().transaction(() => {
      realmId = db.createRealm(realmName).id;

      // Insert parents before children (parent_id has a foreign key).
      const pending = [...docs];
      const inserted = new Set<string>();
      while (pending.length) {
        const idx = pending.findIndex((d) => !d.parentId || inserted.has(d.parentId));
        if (idx === -1) {
          for (const d of pending) d.parentId = null; // cycle guard: shouldn't happen
        } else {
          const d = pending.splice(idx, 1)[0];
          db.createDoc({
            id: idMap.get(d.id)!,
            realmId,
            parentId: d.parentId ? idMap.get(d.parentId)! : null,
            type: d.type,
            title: d.title,
            icon: d.icon ?? null,
            content: d.content,
            position: d.position,
          });
          inserted.add(d.id);
        }
      }

      for (const c of conversations) {
        db.restoreConversation(
          realmId,
          { id: db.generateId(), title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt },
          c.messages.map((m) => ({
            id: db.generateId(),
            role: m.role,
            content: m.content,
            sources: remapSources(m.sources, idMap),
            createdAt: m.createdAt,
          }))
        );
      }
    })();

    // Restore PDF binaries and extracted page text (page text re-indexes FTS).
    for (const d of docs) {
      if (d.type !== 'core/pdf') continue;
      const newId = idMap.get(d.id)!;
      const pdfEntry = zip.getEntry(`${PDF_DIR}/${d.id}.pdf`);
      if (pdfEntry) {
        await fs.promises.writeFile(pdfFilePath(newId), pdfEntry.getData());
      }
      const pages = parsed.pdfPages?.[d.id];
      if (Array.isArray(pages) && pages.length) db.restorePdfPages(newId, pages);
    }

    // Restore audio binaries (ids are stable — content references stay valid).
    for (const entry of zip.getEntries()) {
      const m = /^audios\/([a-z0-9]+\.[a-z0-9]+)$/i.exec(entry.entryName);
      if (!m || entry.isDirectory) continue;
      const data = entry.getData();
      if (!isValidAudioData(data)) continue; // skip oversized/invalid payloads
      await fs.promises.writeFile(audioFilePath(m[1]), data);
    }

    // Restore image binaries (timeline covers etc.; ids are stable).
    for (const entry of zip.getEntries()) {
      const m = /^images\/([a-z0-9]+\.[a-z0-9]+)$/i.exec(entry.entryName);
      if (!m || entry.isDirectory) continue;
      const data = entry.getData();
      if (!isValidImageData(data)) continue; // skip oversized/invalid payloads
      await fs.promises.writeFile(imageFilePath(m[1]), data);
    }
  } catch (err) {
    // rollback: don't leave a half-imported realm behind
    if (realmId) db.deleteRealm(realmId);
    for (const d of docs) {
      if (d.type === 'core/pdf') {
        try {
          fs.rmSync(pdfFilePath(idMap.get(d.id)!), { force: true });
        } catch {
          /* best-effort */
        }
      }
      // audio binaries intentionally left in place: asset ids are stable, so a
      // previously imported copy of this same realm may still reference them
    }
    return { ok: false, error: 'Falha ao importar o universo. O arquivo pode estar corrompido.' };
  }

  return { ok: true, realm: db.listRealms().find((r) => r.id === realmId) };
}
