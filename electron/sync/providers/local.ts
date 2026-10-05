// Local-folder sync provider: mirrors the remote layout into a directory on
// disk. Zero authentication and works offline — and when the directory is one
// already mirrored by a desktop client (OneDrive, Dropbox, Drive, Syncthing),
// it doubles as a frictionless bridge to those clouds.
import path from 'node:path';
import fs from 'node:fs';
import type { RemoteEntry, SyncProvider } from '../types';
import { SyncError } from '../types';

export interface LocalProviderConfig {
  path: string;
}

/** Resolves a remote relative path under the root, rejecting traversal. */
function resolve(root: string, rel: string): string {
  const abs = path.resolve(root, ...rel.split('/'));
  const normRoot = path.resolve(root);
  if (abs !== normRoot && !abs.startsWith(normRoot + path.sep)) {
    throw new SyncError(`Caminho inválido fora da pasta de sincronização: ${rel}`, 'unknown');
  }
  return abs;
}

export function createLocalProvider(cfg: LocalProviderConfig): SyncProvider {
  const root = cfg.path;
  if (!root) throw new SyncError('Informe a pasta de sincronização.', 'unknown');

  return {
    kind: 'local',

    async test() {
      await fs.promises.mkdir(root, { recursive: true });
      const probe = resolve(root, `.diegesis-probe-${Date.now()}`);
      try {
        await fs.promises.writeFile(probe, 'ok');
        await fs.promises.rm(probe, { force: true });
      } catch (err) {
        throw new SyncError(`A pasta não permite escrita: ${err instanceof Error ? err.message : String(err)}`, 'unknown');
      }
    },

    async list(prefix) {
      const out: RemoteEntry[] = [];
      const walk = async (relDir: string): Promise<void> => {
        const absDir = resolve(root, relDir || '.');
        let entries: fs.Dirent[];
        try {
          entries = await fs.promises.readdir(absDir, { withFileTypes: true });
        } catch {
          return; // missing directory = empty listing
        }
        for (const e of entries) {
          if (e.name.startsWith('.diegesis-probe-')) continue;
          const rel = relDir ? `${relDir}/${e.name}` : e.name;
          if (e.isDirectory()) {
            await walk(rel);
          } else if (e.isFile() && !e.name.endsWith('.tmp')) {
            const stat = await fs.promises.stat(resolve(root, rel));
            out.push({ path: rel, size: stat.size, mtime: Math.round(stat.mtimeMs) });
          }
        }
      };
      await walk(prefix);
      return out;
    },

    async get(rel) {
      try {
        const data = await fs.promises.readFile(resolve(root, rel));
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } catch (err) {
        throw new SyncError(`Objeto remoto não encontrado: ${rel}`, 'unknown');
      }
    },

    async put(rel, data) {
      const abs = resolve(root, rel);
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      // atomic: write a sibling tmp file, then rename over the target
      const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.promises.writeFile(tmp, data);
        await fs.promises.rename(tmp, abs);
      } catch (err) {
        await fs.promises.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
    },

    async delete(rel) {
      await fs.promises.rm(resolve(root, rel), { force: true });
    },

    async ensureDir(rel) {
      await fs.promises.mkdir(resolve(root, rel), { recursive: true });
    },
  };
}
