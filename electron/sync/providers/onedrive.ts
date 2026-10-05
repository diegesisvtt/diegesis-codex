// OneDrive sync provider: Microsoft Graph API with OAuth 2.0 + PKCE.
// The sign-in flow opens the system browser and receives the authorization
// code on a local loopback server; tokens are stored encrypted (safeStorage)
// and refreshed automatically, persisting rotations through onTokensChanged.
import crypto from 'node:crypto';
import http from 'node:http';
import { shell } from 'electron';
import type { RemoteEntry, SyncProvider } from '../types';
import { SyncError } from '../types';

export interface OneDriveTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when accessToken expires */
  expiresAt: number;
}

export interface OneDriveProviderConfig extends OneDriveTokens {
  /** Azure app registration (public client). Falls back to the app default. */
  clientId?: string;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'offline_access Files.ReadWrite';
const ROOT_FOLDER = 'DiegesisSync';
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
const UPLOAD_CHUNK = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenRequest(params: Record<string, string>): Promise<OneDriveTokens> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new SyncError(`Autenticação Microsoft falhou: ${String(json.error_description ?? json.error ?? res.status)}`, 'auth');
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
}

/**
 * Runs the interactive PKCE sign-in: starts a loopback server, opens the
 * system browser and resolves with tokens when the user completes sign-in.
 */
export async function startOneDriveAuth(clientId: string): Promise<OneDriveTokens> {
  if (!clientId) throw new SyncError('Informe o Client ID do seu aplicativo registrado no Azure.', 'auth');
  const id = clientId;
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());

  return new Promise<OneDriveTokens>((resolvePromise, rejectPromise) => {
    const server = http.createServer();
    const timeout = setTimeout(() => {
      server.close();
      rejectPromise(new SyncError('Tempo esgotado aguardando o login no navegador.', 'auth'));
    }, 5 * 60_000);

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding:3rem"><h2>Conexão concluída</h2><p>Você já pode voltar ao Diegesis Codex.</p></body></html>');
      clearTimeout(timeout);
      server.close();
      if (error || !code) {
        rejectPromise(new SyncError(`Login cancelado: ${error ?? 'sem código'}`, 'auth'));
        return;
      }
      const port = (server.address() as { port: number }).port;
      tokenRequest({
        client_id: id,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `http://127.0.0.1:${port}/callback`,
        code_verifier: verifier,
        scope: SCOPES,
      }).then(resolvePromise, rejectPromise);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const authorize =
        `${AUTHORITY}/authorize?client_id=${encodeURIComponent(id)}` +
        `&response_type=code&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/callback`)}` +
        `&response_mode=query&scope=${encodeURIComponent(SCOPES)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`;
      shell.openExternal(authorize);
    });
    server.on('error', (err) => {
      clearTimeout(timeout);
      rejectPromise(new SyncError(`Não foi possível iniciar o servidor local de autenticação: ${err.message}`, 'unknown'));
    });
  });
}

export function createOneDriveProvider(
  cfg: OneDriveProviderConfig,
  onTokensChanged?: (tokens: OneDriveTokens) => void
): SyncProvider {
  const clientId = cfg.clientId ?? '';
  if (!clientId) throw new SyncError('Informe o Client ID do seu aplicativo registrado no Azure.', 'auth');
  let tokens: OneDriveTokens = { accessToken: cfg.accessToken, refreshToken: cfg.refreshToken, expiresAt: cfg.expiresAt };
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new SyncError('Conecte sua conta Microsoft primeiro.', 'auth');
  }

  async function ensureFresh(): Promise<void> {
    if (Date.now() < tokens.expiresAt - 60_000) return;
    tokens = await tokenRequest({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      scope: SCOPES,
    });
    onTokensChanged?.(tokens);
  }

  /** Graph item URL for a sync-relative path (rooted at /DiegesisSync). */
  function itemUrl(rel: string): string {
    const clean = rel.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return clean ? `${GRAPH}/me/drive/root:/${ROOT_FOLDER}/${clean}` : `${GRAPH}/me/drive/root:/${ROOT_FOLDER}`;
  }

  async function graph(method: string, rel: string, init: RequestInit = {}, opts: { allow404?: boolean; content?: boolean } = {}): Promise<Response> {
    await ensureFresh();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = opts.content ? `${itemUrl(rel)}:/content` : itemUrl(rel);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        ...init,
        headers: { Authorization: `Bearer ${tokens.accessToken}`, ...(init.headers ?? {}) },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (err) {
      throw new SyncError(`Falha de rede ao acessar o OneDrive: ${err instanceof Error ? err.message : String(err)}`, 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new SyncError('Sessão do OneDrive expirada — reconecte a conta.', 'auth');
    if (res.status === 507) throw new SyncError('Espaço insuficiente no OneDrive (quota excedida).', 'quota');
    if (opts.allow404 && res.status === 404) return res;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SyncError(`OneDrive ${method} ${rel}: HTTP ${res.status} ${text.slice(0, 200)}`, res.status >= 500 ? 'network' : 'unknown');
    }
    return res;
  }

  /** Creates every missing folder along the path. Graph needs explicit folder
   *  items before a file can be uploaded into them. */
  async function ensureFolder(rel: string): Promise<void> {
    await ensureFresh();
    const segments = [ROOT_FOLDER, ...rel.split('/').filter(Boolean)];
    let parentPath = '';
    for (const name of segments) {
      const parent = parentPath
        ? `${GRAPH}/me/drive/root:/${parentPath.split('/').map(encodeURIComponent).join('/')}:/children`
        : `${GRAPH}/me/drive/root/children`;
      const res = await fetch(parent, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
      if (res.status === 401) throw new SyncError('Sessão do OneDrive expirada — reconecte a conta.', 'auth');
      // 409 = already exists (conflictBehavior fail) — fine
      if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => '');
        throw new SyncError(`OneDrive criar pasta "${name}": HTTP ${res.status} ${text.slice(0, 200)}`, res.status >= 500 ? 'network' : 'unknown');
      }
      await res.arrayBuffer().catch(() => {});
      parentPath = parentPath ? `${parentPath}/${name}` : name;
    }
  }

  /** Lists one folder level; returns null when the folder doesn't exist. */
  async function listChildren(rel: string): Promise<{ name: string; folder: boolean; size: number; mtime?: number; etag?: string }[] | null> {
    const url = `${itemUrl(rel)}:/children?$top=200&$select=name,size,folder,lastModifiedDateTime,eTag`;
    await ensureFresh();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new SyncError(`OneDrive list ${rel}: HTTP ${res.status}`, 'network');
    const json = (await res.json()) as { value?: Record<string, unknown>[] };
    return (json.value ?? []).map((v) => ({
      name: String(v.name),
      folder: typeof v.folder === 'object' && v.folder !== null,
      size: Number(v.size ?? 0),
      mtime: v.lastModifiedDateTime ? Date.parse(String(v.lastModifiedDateTime)) : undefined,
      etag: v.eTag ? String(v.eTag) : undefined,
    }));
  }

  return {
    kind: 'onedrive',

    async test() {
      await ensureFolder('');
      const probe = `.diegesis-probe-${Date.now()}`;
      await this.put(probe, new TextEncoder().encode('ok'));
      await this.delete(probe);
    },

    async list(prefix) {
      const out: RemoteEntry[] = [];
      const walk = async (rel: string): Promise<void> => {
        const children = await listChildren(rel);
        if (!children) return;
        for (const c of children) {
          const childRel = rel ? `${rel}/${c.name}` : c.name;
          if (c.folder) await walk(childRel);
          else out.push({ path: childRel, size: c.size, mtime: c.mtime, etag: c.etag });
        }
      };
      await walk(prefix.replace(/\/+$/, ''));
      return out;
    },

    async get(rel) {
      const res = await graph('GET', rel, {}, { allow404: true, content: true });
      if (res.status === 404) throw new SyncError(`Objeto não encontrado: ${rel}`, 'unknown');
      return new Uint8Array(await res.arrayBuffer());
    },

    async put(rel, data) {
      await ensureFolder(rel.split('/').slice(0, -1).join('/'));
      if (data.byteLength <= SIMPLE_UPLOAD_LIMIT) {
        // simple upload: one PUT, atomic per item
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        await graph('PUT', rel, { body: buf, headers: { 'Content-Type': 'application/octet-stream' } }, { content: true });
        return;
      }
      // resumable upload session for large assets (audio files, PDFs)
      await ensureFresh();
      const session = await fetch(`${itemUrl(rel)}:/createUploadSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
      });
      if (!session.ok) throw new SyncError(`OneDrive upload session: HTTP ${session.status}`, 'unknown');
      const uploadUrl = String(((await session.json()) as { uploadUrl?: string }).uploadUrl ?? '');
      if (!uploadUrl) throw new SyncError('OneDrive não retornou a URL de upload.', 'unknown');
      for (let offset = 0; offset < data.byteLength; offset += UPLOAD_CHUNK) {
        const end = Math.min(offset + UPLOAD_CHUNK, data.byteLength);
        const chunk = data.buffer.slice(data.byteOffset + offset, data.byteOffset + end) as ArrayBuffer;
        const res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Length': String(end - offset), 'Content-Range': `bytes ${offset}-${end - 1}/${data.byteLength}` },
          body: chunk,
        });
        if (!res.ok && res.status !== 202) throw new SyncError(`OneDrive upload chunk: HTTP ${res.status}`, 'network');
      }
    },

    async delete(rel) {
      await graph('DELETE', rel, {}, { allow404: true });
    },

    async ensureDir(rel) {
      await ensureFolder(rel);
    },
  };
}
