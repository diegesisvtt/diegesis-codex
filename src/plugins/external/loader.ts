import type { ExternalPluginInfo, ExternalPluginManifest } from '@shared/types';
import { PLUGIN_API_VERSION, type Plugin, type PluginPermission } from '../api/types';
import { evaluatePlugin, gateContext, parsePermissions, type PluginExports } from './sandbox';

/**
 * Loads external (community) plugins from <userData>/plugins. Invalid folders
 * become "broken" plugins: they show up in the settings list with their error
 * instead of failing silently.
 *
 * Plugin CODE is only read and evaluated lazily, on first activation — a
 * plugin the user disabled is never executed, not even its top-level scope.
 */
export async function loadExternalPlugins(): Promise<Plugin[]> {
  let infos: ExternalPluginInfo[];
  try {
    infos = await window.mythril.plugins.list();
  } catch (err) {
    console.error('[plugins] falha ao listar plugins externos', err);
    return [];
  }
  return infos.map(buildPlugin);
}

function buildPlugin(info: ExternalPluginInfo): Plugin {
  if (!info.manifest) return brokenPlugin(info.dir, info.dir, info.error ?? 'manifest.json inválido');

  const manifest = info.manifest;
  const perms = parsePermissions(manifest);
  let exports: PluginExports | null = null;
  /** flipped on activate/deactivate; revoked capabilities throw when false */
  let live = false;

  return {
    manifest: toHostManifest(manifest, perms),
    activate: async (ctx) => {
      if (!exports) {
        const code = await window.mythril.plugins.read(info.dir);
        exports = evaluatePlugin(code, manifest, perms);
      }
      live = true;
      try {
        await exports.activate(gateContext(ctx, perms, () => live));
      } catch (err) {
        live = false;
        throw err; // o manager registra o erro e limpa contribuições parciais
      }
    },
    deactivate: async () => {
      live = false;
      await exports?.deactivate?.();
    },
  };
}

function toHostManifest(manifest: ExternalPluginManifest, perms: Set<PluginPermission>): Plugin['manifest'] {
  // built field-by-field: host-controlled flags like `required` are NOT
  // copied — an external plugin can never make itself mandatory
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    description: manifest.description,
    author: manifest.author,
    permissions: [...perms],
    external: true,
  };
}

/** A placeholder that surfaces load errors in the plugin list. */
function brokenPlugin(id: string, name: string, error: string): Plugin {
  return {
    manifest: {
      id,
      name,
      version: '0.0.0',
      apiVersion: PLUGIN_API_VERSION,
      description: 'Plugin com manifest.json inválido ou ausente.',
      external: true,
    },
    activate: () => {
      throw new Error(error);
    },
  };
}
