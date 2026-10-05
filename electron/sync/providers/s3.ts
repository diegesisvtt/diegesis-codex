// S3-compatible sync provider (AWS S3, Backblaze B2, Cloudflare R2, MinIO).
// Signature Version 4 implemented with node:crypto — no SDK dependency.
// Path-style addressing (<endpoint>/<bucket>/<key>) works across all vendors.
import crypto from 'node:crypto';
import type { RemoteEntry, SyncProvider } from '../types';
import { SyncError } from '../types';

export interface S3ProviderConfig {
  /** e.g. https://s3.us-east-1.amazonaws.com or https://s3.us-west-004.backblazeb2.com */
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

function sha256Hex(data: string | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/** RFC 3986 encoding (SigV4 canonical URIs must not encode '/'). */
function uriEncode(str: string, encodeSlash: boolean): string {
  let out = '';
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (ch === '/' && !encodeSlash)) {
      out += ch;
    } else {
      out += '%' + Buffer.from(ch, 'utf8').toString('hex').toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

export function createS3Provider(cfg: S3ProviderConfig): SyncProvider {
  for (const [k, v] of Object.entries({ endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket, accessKey: cfg.accessKey, secretKey: cfg.secretKey })) {
    if (!v) throw new SyncError(`Configuração S3 incompleta: falta ${k}.`, 'unknown');
  }
  const endpoint = cfg.endpoint.replace(/\/+$/, '');
  const host = new URL(endpoint).host;

  async function signedRequest(
    method: string,
    key: string,
    opts: { query?: Record<string, string>; body?: Uint8Array; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(opts.body ?? new Uint8Array());

    const canonicalUri = `/${uriEncode(cfg.bucket, false)}/${uriEncode(key, false)}`;
    const query = opts.query ?? {};
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${uriEncode(k, true)}=${uriEncode(query[k], true)}`)
      .join('&');

    // 'host' is signed but never set explicitly — undici forbids overriding it
    // and adds the same value from the request URL.
    const signable: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(opts.headers ?? {}),
    };
    const signedHeaderNames = Object.keys(signable).sort();
    const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${signable[k].trim()}\n`).join('');
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaderNames.join(';'), payloadHash].join('\n');

    const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
    const kDate = hmac(`AWS4${cfg.secretKey}`, dateStamp);
    const kRegion = hmac(kDate, cfg.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const fetchHeaders: Record<string, string> = {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(opts.headers ?? {}),
      Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`,
    };

    const url = `${endpoint}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      const bodyBuf = opts.body ? (opts.body.buffer.slice(opts.body.byteOffset, opts.body.byteOffset + opts.body.byteLength) as ArrayBuffer) : undefined;
      res = await fetch(url, { method, headers: fetchHeaders, body: bodyBuf, signal: controller.signal });
    } catch (err) {
      throw new SyncError(`Falha de rede ao acessar o storage: ${err instanceof Error ? err.message : String(err)}`, 'network');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new SyncError('Credenciais S3 recusadas.', 'auth');
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new SyncError(`S3 ${method} ${key}: HTTP ${res.status} ${text.slice(0, 200)}`, 'unknown');
    }
    return res;
  }

  return {
    kind: 's3',

    async test() {
      const probe = `.diegesis-probe-${Date.now()}`;
      await this.put(probe, new TextEncoder().encode('ok'));
      await this.delete(probe);
    },

    async list(prefix) {
      const out: RemoteEntry[] = [];
      let token: string | undefined;
      do {
        const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' };
        if (prefix) query.prefix = prefix;
        if (token) query['continuation-token'] = token;
        const res = await signedRequest('GET', '', query);
        const xml = await res.text();
        const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
        for (const c of contents) {
          const k = /<Key>([\s\S]*?)<\/Key>/.exec(c)?.[1];
          if (!k) continue;
          const size = parseInt(/<Size>(\d+)<\/Size>/.exec(c)?.[1] ?? '0', 10);
          const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(c)?.[1]?.replace(/^&quot;|"$/g, '').replace(/&quot;|"/g, '');
          const lastMod = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(c)?.[1];
          out.push({ path: decodeXml(k), size, etag, mtime: lastMod ? Date.parse(lastMod) : undefined });
        }
        token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
      } while (token);
      return out;
    },

    async get(key) {
      const res = await signedRequest('GET', key);
      if (res.status === 404) throw new SyncError(`Objeto não encontrado: ${key}`, 'unknown');
      return new Uint8Array(await res.arrayBuffer());
    },

    async put(key, data) {
      // S3 PUT is atomic per object by design.
      await signedRequest('PUT', key, { body: data });
    },

    async delete(key) {
      await signedRequest('DELETE', key);
    },
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
