// Dice 3D assets (textures, sounds, HDR environments from the diegesis-sdk):
// served via a custom protocol because the packaged app runs on file://,
// where fetch/XHR of local files is blocked. The renderer points the DiceBox
// assetPath at `diegesis-asset://dice/`, which maps to <public|dist>/<path>.
import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const ASSET_SCHEME = 'diegesis-asset';

/** folders served (mirror of apps/playground/public in the diegesis-sdk repo) */
const ALLOWED_DIRS = new Set(['textures', 'sounds', 'environments', 'roughness-map', 'cubemap']);

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  hdr: 'application/octet-stream',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
};

function assetsRoot(): string {
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  // dev: vite serves public/ from disk; prod: public/ is copied into dist/
  return isDev ? path.join(__dirname, '../public') : path.join(__dirname, '../dist');
}

/** Registers the privileged scheme; must run before app 'ready'. */
export function registerDiceAssetsScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
    },
  ]);
}

/** Serves `diegesis-asset://dice/<dir>/<file>` from the bundled asset folders. */
export function registerDiceAssetsProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    // path traversal guard: a single folder from the allowlist + safe file name
    const parts = rel.split('/');
    if (parts.length !== 2 || !ALLOWED_DIRS.has(parts[0]) || !/^[\w.-]+$/.test(parts[1])) {
      return new Response('Not found', { status: 404 });
    }
    const root = assetsRoot();
    const file = path.join(root, parts[0], parts[1]);
    if (!file.startsWith(root) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });

    // CORS: in dev the renderer origin is the Vite server (http://127.0.0.1:5173)
    const cors = { 'Access-Control-Allow-Origin': '*' };
    const mime = MIME_BY_EXT[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': mime, ...cors } });
  });
}
