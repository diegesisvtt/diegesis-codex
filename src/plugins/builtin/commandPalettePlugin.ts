import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/**
 * Command palette entry point. The palette itself is rendered by the app shell
 * (it reads the command registry); this plugin owns the Mod+Shift+P keybinding.
 */
export const commandPalettePlugin: Plugin = {
  manifest: {
    id: 'core/command-palette',
    name: 'Paleta de comandos',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Acesse todos os comandos do app com Ctrl+Shift+P.',
    author: 'Mythril',
    permissions: ['commands', 'events'],
  },
  activate(ctx) {
    ctx.commands.add({
      id: 'core/command-palette:toggle',
      title: 'Alternar paleta de comandos',
      shortcut: 'Mod+Shift+P',
      run: () => ctx.events.emit('palette:toggle', { palette: 'command' }),
    });
  },
};
