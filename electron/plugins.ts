// External (community) plugin discovery. Plugins live in
// <userData>/plugins/<folder>/ with a manifest.json and a JS entry file.
// The main process only READS files — evaluation happens sandboxed in the
// renderer (see src/plugins/external/).

import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_API_VERSION, type ExternalPluginInfo, type ExternalPluginManifest } from '../shared/types';

export function pluginsRoot(): string {
  return path.join(app.getPath('userData'), 'plugins');
}

/** external plugin ids must be namespaced ('vendor/name') and must not squat the core namespace */
const PLUGIN_ID_PATTERN = /^(?!core\/)[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/i;

function validateManifest(raw: unknown): { manifest?: ExternalPluginManifest; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'manifest.json não é um objeto' };
  const m = raw as Record<string, unknown>;
  for (const key of ['id', 'name', 'version'] as const) {
    if (typeof m[key] !== 'string' || !m[key]) return { error: `campo obrigatório ausente: "${key}"` };
  }
  if (!PLUGIN_ID_PATTERN.test(m.id as string)) {
    return { error: `"id" deve ser namespaced como "vendor/name" e não pode usar o namespace "core/"` };
  }
  if (m.apiVersion !== PLUGIN_API_VERSION) {
    return { error: `apiVersion incompatível (plugin: ${String(m.apiVersion)}, app: ${PLUGIN_API_VERSION})` };
  }
  if (m.main !== undefined && typeof m.main !== 'string') return { error: '"main" deve ser uma string' };
  if (m.permissions !== undefined && !Array.isArray(m.permissions)) {
    return { error: '"permissions" deve ser um array' };
  }
  return { manifest: m as unknown as ExternalPluginManifest };
}

export function listPlugins(): ExternalPluginInfo[] {
  const root = pluginsRoot();
  fs.mkdirSync(root, { recursive: true });
  const out: ExternalPluginInfo[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'manifest.json'), 'utf8'));
      const { manifest, error } = validateManifest(raw);
      out.push({ dir: entry.name, manifest: manifest ?? null, error });
    } catch (err) {
      out.push({
        dir: entry.name,
        manifest: null,
        error: err instanceof Error ? err.message : 'manifest.json ilegível',
      });
    }
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

/** Reads the plugin entry file, guarding against path traversal and symlink escapes. */
export function readPluginCode(dir: string): string {
  const root = fs.realpathSync(pluginsRoot());
  const pluginDir = fs.realpathSync(path.resolve(root, dir));
  // realpath resolves symlinks/junctions, so this also rejects linked folders
  if (!pluginDir.startsWith(root + path.sep)) {
    throw new Error(`pasta de plugin inválida: ${dir}`);
  }
  const raw = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8')) as { main?: string };
  const main = raw.main || 'main.js';
  const mainPath = fs.realpathSync(path.resolve(pluginDir, main));
  if (!mainPath.startsWith(pluginDir + path.sep)) {
    throw new Error(`arquivo principal fora da pasta do plugin: ${main}`);
  }
  return fs.readFileSync(mainPath, 'utf8');
}

export async function openPluginsFolder(): Promise<void> {
  const root = pluginsRoot();
  fs.mkdirSync(root, { recursive: true });
  const result = await shell.openPath(root);
  if (result) throw new Error(result);
}
