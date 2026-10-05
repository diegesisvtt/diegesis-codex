import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/**
 * Global search. The palette itself is rendered by the app shell; this plugin
 * owns the entry points: the Mod+K keybinding and the ribbon button, both
 * routed through the command registry and the event bus.
 */
export const searchPlugin: Plugin = {
  manifest: {
    id: 'core/search',
    name: 'Busca',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Busca full-text e semântica em todos os documentos.',
    author: 'Diegesis Codex',
    permissions: ['commands', 'events', 'docs:read'],
  },
  activate(ctx) {
    ctx.commands.add({
      id: 'core/search:open',
      title: 'Buscar em tudo',
      shortcut: 'Mod+K',
      run: () => ctx.events.emit('palette:toggle', { palette: 'search' }),
    });

  },
};
