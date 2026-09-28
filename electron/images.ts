// Image file management: import dialog, on-disk storage, custom protocol.
// Mirrors the audio pipeline (audio.ts): files live in <userData>/images and
// are served to the renderer through a privileged scheme.
import { app, dialog, protocol, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { generateId } from './db';
import type { ImageAsset, ImageImportResult } from '../shared/types';

export const IMAGE_SCHEME = 'diegesis-image';
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25 MB

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

function imageDir(): string {
  const dir = path.join(app.getPath('userData'), 'images');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function imageFilePath(fileName: string): string {
  return path.join(imageDir(), fileName);
}

export function imageUrl(fileName: string): string {
  return `${IMAGE_SCHEME}://asset/${fileName}`;
}

/** Sniffs the magic header against known image signatures. */
function looksLikeImage(head: Buffer): boolean {
  const ascii = (from: number, to: number) => head.toString('latin1', from, to);
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return true; // png
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true; // jpeg
  if (ascii(0, 4) === 'GIF8') return true; // gif
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return true; // webp
  if (ascii(4, 8) === 'ftyp' && (ascii(8, 12) === 'avif' || ascii(8, 12) === 'avis')) return true; // avif
  return false;
}

/** Validates an image payload for restore (realm import): size cap + magic bytes. */
export function isValidImageData(data: Buffer): boolean {
  return data.byteLength >= 12 && data.byteLength <= MAX_IMAGE_SIZE && looksLikeImage(data.subarray(0, 12));
}

/** Validates and writes an image buffer into app storage. Returns the asset descriptor. */
async function storeImageBuffer(data: Buffer, originalName: string): Promise<ImageImportResult> {
  const ext = path.extname(originalName).replace(/^\./, '').toLowerCase();
  if (!ext || !(ext in MIME_BY_EXT)) {
    return { asset: null, error: 'Formato não suportado. Use png, jpg, webp, gif ou avif.' };
  }
  if (data.byteLength > MAX_IMAGE_SIZE) {
    return { asset: null, error: `Imagem muito grande (${Math.ceil(data.byteLength / 1048576)} MB). Limite: 25 MB.` };
  }
  if (!isValidImageData(data)) {
    return { asset: null, error: 'O arquivo selecionado não parece ser uma imagem válida.' };
  }

  const fileName = `${generateId()}.${ext}`;
  try {
    await fs.promises.writeFile(imageFilePath(fileName), data);
  } catch (err) {
    return { asset: null, error: err instanceof Error ? err.message : 'Falha ao importar a imagem.' };
  }
  return { asset: { id: fileName, name: path.basename(originalName), url: imageUrl(fileName), size: data.byteLength } };
}

/** Opens a file picker, copies the chosen image into userData. */
export async function importImage(): Promise<ImageImportResult> {
  const win = BrowserWindow.getAllWindows()[0];
  const picked = await dialog.showOpenDialog(win!, {
    title: 'Importar imagem',
    filters: [{ name: 'Imagem', extensions: Object.keys(MIME_BY_EXT) }],
    properties: ['openFile'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return { asset: null };
  let data: Buffer;
  try {
    data = await fs.promises.readFile(picked.filePaths[0]);
  } catch {
    return { asset: null, error: 'Não foi possível ler o arquivo selecionado.' };
  }
  return storeImageBuffer(data, path.basename(picked.filePaths[0]));
}

/** Stores an image the renderer already holds (paste/drop inside editors). */
export async function saveImage(name: string, data: Uint8Array): Promise<ImageImportResult> {
  return storeImageBuffer(Buffer.from(data), name);
}

export function deleteImageFile(fileName: string): void {
  if (!/^[a-z0-9]+\.[a-z0-9]+$/i.test(fileName)) return;
  try {
    fs.rmSync(imageFilePath(fileName), { force: true });
  } catch {
    // best-effort cleanup
  }
}

const IMAGE_URL_RE = /diegesis-image:\/\/asset\/([a-z0-9]+\.[a-z0-9]+)/gi;

/** Image file names referenced inside a document's content JSON. */
export function extractImageRefs(content: string | null | undefined): string[] {
  if (!content) return [];
  const out = new Set<string>();
  for (const m of content.matchAll(IMAGE_URL_RE)) out.add(m[1]);
  return [...out];
}

/** Registers the privileged scheme; must run before app 'ready'. */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: IMAGE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
    },
  ]);
}

/** Serves `diegesis-image://asset/<file>` from disk. */
export function registerImageProtocol(): void {
  protocol.handle(IMAGE_SCHEME, (request) => {
    let fileName: string;
    try {
      fileName = new URL(request.url).pathname.replace(/^\/+/, '');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (!/^[a-z0-9]+\.[a-z0-9]+$/i.test(fileName)) return new Response('Not found', { status: 404 });
    const file = imageFilePath(fileName);
    if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });

    const mime = MIME_BY_EXT[path.extname(fileName).slice(1).toLowerCase()] ?? 'application/octet-stream';
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(fs.statSync(file).size),
        'Access-Control-Allow-Origin': '*',
      },
    });
  });
}
