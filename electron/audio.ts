// Audio file management: import dialog, on-disk storage, custom streaming protocol.
// Mirrors the PDF pipeline (pdf.ts): files live in <userData>/audios and are
// served to the renderer through a privileged scheme with Range support.
import { app, dialog, protocol, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { generateId } from './db';
import type { AudioAsset, AudioImportResult } from '../shared/types';

export const AUDIO_SCHEME = 'mythril-audio';
const MAX_AUDIO_SIZE = 200 * 1024 * 1024; // 200 MB

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

function audioDir(): string {
  const dir = path.join(app.getPath('userData'), 'audios');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function audioFilePath(fileName: string): string {
  return path.join(audioDir(), fileName);
}

export function audioUrl(fileName: string): string {
  return `${AUDIO_SCHEME}://asset/${fileName}`;
}

/** Validates an audio payload for restore (realm import): size cap + magic bytes. */
export function isValidAudioData(data: Buffer): boolean {
  return data.byteLength >= 12 && data.byteLength <= MAX_AUDIO_SIZE && looksLikeAudio(data.subarray(0, 12));
}

/** Sniffs the magic header against known audio container signatures. */
function looksLikeAudio(head: Buffer): boolean {
  const ascii = (from: number, to: number) => head.toString('latin1', from, to);
  if (ascii(0, 3) === 'ID3') return true; // mp3 with tags
  if (ascii(0, 4) === 'ADIF') return true; // raw aac (ADIF)
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return true; // mp3/aac frame sync
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return true;
  if (ascii(0, 4) === 'OggS') return true; // ogg / opus
  if (ascii(0, 4) === 'fLaC') return true;
  if (ascii(4, 8) === 'ftyp') return true; // m4a / mp4 audio
  if (head.readUInt32BE(0) === 0x1a45dfa3) return true; // webm/matroska
  return false;
}

/** Validates and writes an audio buffer into app storage. Returns the asset descriptor. */
async function storeAudioBuffer(data: Buffer, originalName: string): Promise<AudioImportResult> {
  const ext = path.extname(originalName).replace(/^\./, '').toLowerCase();
  if (!ext || !(ext in MIME_BY_EXT)) {
    return { asset: null, error: 'Formato não suportado. Use mp3, wav, ogg, m4a, flac, aac ou webm.' };
  }
  if (data.byteLength > MAX_AUDIO_SIZE) {
    return { asset: null, error: `Arquivo muito grande (${Math.ceil(data.byteLength / 1048576)} MB). Limite: 200 MB.` };
  }
  if (data.byteLength < 12 || !looksLikeAudio(data.subarray(0, 12))) {
    return { asset: null, error: 'O arquivo selecionado não parece ser um áudio válido.' };
  }

  const fileName = `${generateId()}.${ext}`;
  try {
    await fs.promises.writeFile(audioFilePath(fileName), data);
  } catch (err) {
    return { asset: null, error: err instanceof Error ? err.message : 'Falha ao importar o áudio.' };
  }
  return { asset: { id: fileName, name: path.basename(originalName), url: audioUrl(fileName), size: data.byteLength } };
}

/** Opens a file picker, copies the chosen audio into userData. */
export async function importAudio(): Promise<AudioImportResult> {
  const win = BrowserWindow.getAllWindows()[0];
  const picked = await dialog.showOpenDialog(win!, {
    title: 'Importar áudio',
    filters: [{ name: 'Áudio', extensions: Object.keys(MIME_BY_EXT) }],
    properties: ['openFile'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return { asset: null };
  let data: Buffer;
  try {
    data = await fs.promises.readFile(picked.filePaths[0]);
  } catch {
    return { asset: null, error: 'Não foi possível ler o arquivo selecionado.' };
  }
  return storeAudioBuffer(data, path.basename(picked.filePaths[0]));
}

/** Stores an audio file the renderer already holds (paste/drop inside editors). */
export async function saveAudio(name: string, data: Uint8Array): Promise<AudioImportResult> {
  return storeAudioBuffer(Buffer.from(data), name);
}

export function deleteAudioFile(fileName: string): void {
  if (!/^[a-z0-9]+\.[a-z0-9]+$/i.test(fileName)) return;
  try {
    fs.rmSync(audioFilePath(fileName), { force: true });
  } catch {
    // best-effort cleanup
  }
}

const AUDIO_URL_RE = /mythril-audio:\/\/asset\/([a-z0-9]+\.[a-z0-9]+)/gi;

/** Audio file names referenced inside a document's content JSON. */
export function extractAudioRefs(content: string | null | undefined): string[] {
  if (!content) return [];
  const out = new Set<string>();
  for (const m of content.matchAll(AUDIO_URL_RE)) out.add(m[1]);
  return [...out];
}

/** Deletes stored audio files not referenced by any of the given doc contents
 *  (orphans left behind by removed blocks/shapes/highlight attachments). */
export function gcAudioFiles(allContents: (string | null)[]): void {
  const referenced = new Set(allContents.flatMap(extractAudioRefs));
  let files: string[];
  try {
    files = fs.readdirSync(audioDir());
  } catch {
    return;
  }
  for (const fileName of files) {
    if (!/^[a-z0-9]+\.[a-z0-9]+$/i.test(fileName)) continue;
    if (!referenced.has(fileName)) deleteAudioFile(fileName);
  }
}

/** Registers the privileged scheme; must run before app 'ready'. */
export function registerAudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: AUDIO_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
    },
  ]);
}

/** Serves `mythril-audio://asset/<file>` from disk, with Range support for seeking. */
export function registerAudioProtocol(): void {
  protocol.handle(AUDIO_SCHEME, (request) => {
    let fileName: string;
    try {
      fileName = new URL(request.url).pathname.replace(/^\/+/, '');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (!/^[a-z0-9]+\.[a-z0-9]+$/i.test(fileName)) return new Response('Not found', { status: 404 });
    const file = audioFilePath(fileName);
    if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });

    // CORS: in dev the renderer origin is the Vite server (http://127.0.0.1:5173)
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const mime = MIME_BY_EXT[path.extname(fileName).slice(1).toLowerCase()] ?? 'application/octet-stream';

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
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            ...cors,
          },
        });
      }
      // unparseable Range header: RFC 7233 says ignore it and serve the full body
    }
    const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        ...cors,
      },
    });
  });
}
