// WebDAV sync provider: covers Nextcloud, ownCloud and any generic WebDAV
// server. Runs in the main process (Node fetch — no CORS constraints).
// Auth: HTTP Basic, ideally with a Nextcloud app-password.
import type { RemoteEntry, SyncProvider } from '../types';
import { SyncError } from '../types';

export interface WebdavProviderConfig {
  /** full WebDAV endpoint, e.g. https://cloud.example.com/remote.php/dav/files/user */
  url: string;
  username: string;
  password: string;
  /** optional subfolder used as the sync root, e.g. "DiegesisSync" */
  basePath?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Torna a URL WebDAV tolerante a entradas incompletas. Se o usuário colar o
 * domínio do servidor (raiz) ou os endpoints antigos do Nextcloud/ownCloud
 * (`remote.php/webdav`, `remote.php/dav`, `remote.php`), montamos o endpoint
 * canônico de arquivos usando o nome de usuário.
 */
function normalizeBaseUrl(url: string, username: string): string {
  let raw = (url ?? '').trim();
  if (!raw) return raw;
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return (url ?? '').trim();
  }
  const path = u.pathname.replace(/\/+$/, '');
  const incomplete =
    path === '' ||
    /\/remote\.php$/i.test(path) ||
    /\/remote\.php\/webdav$/i.test(path) ||
    /\/remote\.php\/dav$/i.test(path);
  if (incomplete && username) {
    u.pathname = `/remote.php/dav/files/${encodeURIComponent(username)}`;
  }
  return u.toString().replace(/\/+$/, '');
}

function joinUrl(base: string, rel: string): string {
  const b = base.replace(/\/+$/, '');
  if (!rel) return b + '/';
  return b + '/' + rel.split('/').map(encodeURIComponent).join('/');
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

/** Last path segment of an href, decoded — the child's name. */
function lastSegment(href: string): string {
  return decodeHref(href).replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? '';
}

function hrefPath(href: string): string {
  return decodeHref(href).replace(/\/+$/, '');
}

export function createWebdavProvider(cfg: WebdavProviderConfig): SyncProvider {
  if (!cfg.url) throw new SyncError('Informe a URL do servidor WebDAV.', 'unknown');
  const normalizedUrl = normalizeBaseUrl(cfg.url, cfg.username ?? '');
  const base = cfg.basePath
    ? `${normalizedUrl.replace(/\/+$/, '')}/${cfg.basePath.replace(/^\/+|\/+$/g, '')}`
    : normalizedUrl;
  const auth = 'Basic ' + Buffer.from(`${cfg.username ?? ''}:${cfg.password ?? ''}`).toString('base64');

  async function request(method: string, rel: string, init: RequestInit = {}, allow404 = false): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(joinUrl(base, rel), {
        method,
        ...init,
        headers: { Authorization: auth, ...(init.headers ?? {}) },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (err) {
      throw new SyncError(`Falha de rede ao acessar o servidor: ${err instanceof Error ? err.message : String(err)}`, 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw new SyncError('Credenciais recusadas pelo servidor (verifique usuário e app-password).', 'auth');
    }
    if (res.status === 507) throw new SyncError('Espaço insuficiente no servidor (quota excedida).', 'quota');
    if (allow404 && res.status === 404) return res;
    if (!res.ok && res.status !== 207) {
      const hint =
        res.status === 405
          ? ` — o servidor recusou a escrita. No Nextcloud/ownCloud a URL deve ser .../remote.php/dav/files/${cfg.username ?? 'SEU-USUARIO'}`
          : '';
      throw new SyncError(`WebDAV ${method} ${rel}: HTTP ${res.status}${hint}`, res.status === 404 ? 'unknown' : 'network');
    }
    return res;
  }

  /** Tolerant multistatus parser: WebDAV servers vary wildly in namespace prefixes. */
  function parseMultistatus(xml: string): { href: string; collection: boolean; size: number; etag?: string; mtime?: number }[] {
    const out: { href: string; collection: boolean; size: number; etag?: string; mtime?: number }[] = [];
    const responses = xml.match(/<[^>]*:response[\s>][\s\S]*?<\/[^>]*:response>/gi) ?? [];
    for (const r of responses) {
      const href = /<[^>]*:href[^>]*>([\s\S]*?)<\/[^>]*:href>/i.exec(r)?.[1]?.trim();
      if (!href) continue;
      const collection = /<[^>]*:collection\s*\/?>/i.test(r);
      const size = parseInt(/<[^>]*:getcontentlength[^>]*>(\d+)</i.exec(r)?.[1] ?? '0', 10);
      const etag = /<[^>]*:getetag[^>]*>([\s\S]*?)<\/[^>]*:getetag>/i.exec(r)?.[1]?.trim().replace(/^"|"$/g, '');
      const lastMod = /<[^>]*:getlastmodified[^>]*>([\s\S]*?)<\/[^>]*:getlastmodified>/i.exec(r)?.[1]?.trim();
      const mtime = lastMod ? Date.parse(lastMod) : undefined;
      out.push({ href, collection, size: Number.isFinite(size) ? size : 0, etag, mtime });
    }
    return out;
  }

  async function propfind(rel: string): Promise<ReturnType<typeof parseMultistatus>> {
    const res = await request('PROPFIND', rel, {
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body: `<?xml version="1.0" encoding="utf-8" ?>
        <D:propfind xmlns:D="DAV:">
          <D:prop><D:resourcetype/><D:getcontentlength/><D:getetag/><D:getlastmodified/></D:prop>
        </D:propfind>`,
    });
    return parseMultistatus(await res.text());
  }

  return {
    kind: 'webdav',

    async test() {
      await this.ensureDir!('');
      // a real round-trip catches servers that accept MKCOL but reject writes
      const probe = `.diegesis-probe-${Date.now()}`;
      await this.put(probe, new TextEncoder().encode('ok'));
      await this.delete(probe);
      // PROPFIND confirms read/listing works — the operation the restore flow
      // (listRemoteRealms) and the pull side of a cycle actually depend on.
      await propfind('');
      return base;
    },

    async list(prefix) {
      const out: RemoteEntry[] = [];
      const walk = async (rel: string): Promise<void> => {
        let entries;
        try {
          entries = await propfind(rel);
        } catch (err) {
          if (err instanceof SyncError && /HTTP 404/.test(err.message)) return;
          throw err;
        }
        // Depth: 1 includes the collection itself — skip it to avoid recursion
        const selfPath = hrefPath(new URL(joinUrl(base, rel)).pathname);
        for (const e of entries) {
          if (hrefPath(e.href) === selfPath) continue;
          const name = lastSegment(e.href);
          if (!name) continue;
          const childRel = rel ? `${rel}/${name}` : name;
          if (e.collection) {
            await walk(childRel);
          } else {
            out.push({ path: childRel, size: e.size, etag: e.etag, mtime: e.mtime });
          }
        }
      };
      await walk(prefix.replace(/\/+$/, ''));
      return out;
    },

    async get(rel) {
      const res = await request('GET', rel);
      return new Uint8Array(await res.arrayBuffer());
    },

    async put(rel, data) {
      const parent = rel.split('/').slice(0, -1).join('/');
      if (parent) await this.ensureDir!(parent);
      // Nextcloud uploads via temporary .part files server-side, so PUT is atomic.
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      await request('PUT', rel, { body: buf, headers: { 'Content-Type': 'application/octet-stream' } });
    },

    async delete(rel) {
      await request('DELETE', rel, {}, true);
    },

    async ensureDir(rel) {
      // rel '' means the sync root itself (base URL); create it if missing.
      const segments = rel.split('/').filter(Boolean);
      if (segments.length === 0) {
        try {
          await request('MKCOL', '', {}, true);
        } catch (err) {
          if (err instanceof SyncError && /HTTP 405|HTTP 409/.test(err.message)) return;
          // base may already exist but reject MKCOL differently — verify with PUT later
        }
        return;
      }
      let acc = '';
      for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg;
        try {
          await request('MKCOL', acc, {}, true);
        } catch (err) {
          if (err instanceof SyncError && /HTTP 405|HTTP 409/.test(err.message)) continue;
          throw err;
        }
      }
    },
  };
}
