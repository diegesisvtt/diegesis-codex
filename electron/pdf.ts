// PDF file management: import dialog, on-disk storage, custom streaming protocol.
import { app, dialog, protocol, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import * as db from './db';
import { generateId } from './db';
import type { DocNode } from '../shared/types';

export const PDF_SCHEME = 'diegesis-pdf';
const MAX_PDF_SIZE = 300 * 1024 * 1024; // 300 MB

function pdfDir(): string {
  const dir = path.join(app.getPath('userData'), 'pdfs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function pdfFilePath(docId: string): string {
  return path.join(pdfDir(), `${docId}.pdf`);
}

/** Initial content JSON for a freshly imported PDF document. */
function initialContent(fileName: string, fileSize: number): string {
  return JSON.stringify({
    file: { name: fileName, size: fileSize, numPages: 0 },
    view: {
      zoom: 1,
      layout: 'single',
      separateCover: false,
      filter: 'normal',
      rotations: {},
      historySpine: true,
      inspectorWidth: 400,
    },
    lastPage: 1,
    navHistory: [],
    pins: [],
    highlights: [],
    hlLabels: {},
    bookmarks: [],
    flyleaf: [],
    folderStyle: {},
  });
}

export interface PdfImportResult {
  doc: DocNode | null; // null when the user cancelled the dialog
  error?: string;
}

/** Opens a file picker, copies the chosen PDF into userData and creates the doc. */
export async function importPdf(realmId: string, parentId: string | null): Promise<PdfImportResult> {
  const win = BrowserWindow.getAllWindows()[0];
  const picked = await dialog.showOpenDialog(win!, {
    title: 'Importar PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return { doc: null };

  const src = picked.filePaths[0];
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(src);
  } catch {
    return { doc: null, error: 'Não foi possível ler o arquivo selecionado.' };
  }
  if (stat.size > MAX_PDF_SIZE) {
    return { doc: null, error: `Arquivo muito grande (${Math.ceil(stat.size / 1048576)} MB). Limite: 300 MB.` };
  }
  // Quick sanity check on the magic header (the real parser is pdf.js, with
  // scripting disabled — never enable isEvalSupported).
  try {
    const fd = await fs.promises.open(src, 'r');
    const head = Buffer.alloc(5);
    await fd.read(head, 0, 5, 0);
    await fd.close();
    if (head.toString('latin1') !== '%PDF-') {
      return { doc: null, error: 'O arquivo selecionado não parece ser um PDF válido.' };
    }
  } catch {
    return { doc: null, error: 'Não foi possível ler o arquivo selecionado.' };
  }

  const id = generateId();
  try {
    await fs.promises.copyFile(src, pdfFilePath(id));
    const title = path.basename(src).replace(/\.pdf$/i, '');
    const doc = db.createDoc({
      id,
      realmId,
      parentId,
      type: 'core/pdf',
      title,
      content: initialContent(path.basename(src), stat.size),
    });
    return { doc };
  } catch (err) {
    deletePdfFile(id); // don't orphan the copied file if doc creation fails
    return { doc: null, error: err instanceof Error ? err.message : 'Falha ao importar o PDF.' };
  }
}

export function deletePdfFile(docId: string): void {
  try {
    fs.rmSync(pdfFilePath(docId), { force: true });
    fs.rmSync(path.join(app.getPath('userData'), 'pdf-thumbs', docId), { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ---------- page thumbnail disk cache ----------
// Keyed by docId + page; written once after the first render so hover
// previews (bookmarks, links, history) are instant across sessions.

function thumbPath(docId: string, page: number): string | null {
  if (!/^[a-z0-9]+$/i.test(docId) || !Number.isInteger(page) || page < 1 || page > 100000) return null;
  return path.join(app.getPath('userData'), 'pdf-thumbs', docId, `p${page}.jpg`);
}

export async function readThumb(docId: string, page: number): Promise<string | null> {
  const file = thumbPath(docId, page);
  if (!file) return null;
  try {
    return (await fs.promises.readFile(file)).toString('base64');
  } catch {
    return null;
  }
}

export async function writeThumb(docId: string, page: number, base64: string): Promise<void> {
  const file = thumbPath(docId, page);
  if (!file || typeof base64 !== 'string' || base64.length > 2_000_000) return;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(base64, 'base64'));
}

/** Registers the privileged scheme; must run before app 'ready'. */
export function registerPdfScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PDF_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
    },
  ]);
}

/** Serves `diegesis-pdf://doc/<docId>` from disk, with Range support for pdf.js. */
export function registerPdfProtocol(): void {
  protocol.handle(PDF_SCHEME, (request) => {
    const url = new URL(request.url);
    const docId = url.pathname.replace(/^\/+/, '');
    if (!/^[a-z0-9]+$/i.test(docId)) return new Response('Not found', { status: 404 });
    const file = pdfFilePath(docId);
    if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });

    // CORS: in dev the renderer origin is the Vite server (http://127.0.0.1:5173),
    // so pdf.js fetches of diegesis-pdf:// are cross-origin.
    const cors = { 'Access-Control-Allow-Origin': '*' };

    const size = fs.statSync(file).size;
    const range = request.headers.get('range');
    if (range) {
      // single ranges only; multi-range requests are rejected
      const m = /^bytes=(\d+)-(\d*)$|^bytes=-(\d+)$/.exec(range.trim());
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[3], 10));
        const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, ...cors } });
        }
        // protocol.handle needs a web stream — fs streams are Node streams
        const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
        return new Response(stream, {
          status: 206,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            ...cors,
          },
        });
      }
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, ...cors } });
    }
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        ...cors,
      },
    });
  });
}
