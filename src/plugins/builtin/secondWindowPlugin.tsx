import { ScreenShare } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { SecondWindowController } from './secondWindow/controller';
import { SecondWindowControlPanel } from './secondWindow/ControlPanel';

/**
 * Second Window — janela secundária voltada aos jogadores. Exibe notas como
 * pergaminhos antigos e mapas hexcrawl na visão do jogador (névoa de guerra
 * opaca), com conteúdo atualizado em tempo real e viewport controlável por
 * outros plugins via eventos ('secondwindow:*').
 */
export const secondWindowPlugin: Plugin = {
  manifest: {
    id: 'diegesis/second-window',
    name: 'Second Window',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Janela secundária para os jogadores: notas como pergaminhos antigos, mapas hexcrawl com névoa de guerra e viewport controlado em tempo real.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'commands', 'events', 'settings'],
  },
  activate(ctx) {
    const controller = new SecondWindowController(ctx);
    controller.init();
    // deactivate() below holds the closure; IPC subscription cleanup goes
    // through the auto-disposed register()
    ctx.register({ dispose: () => controller.dispose() });

    ctx.commands.add({
      id: 'second-window:toggle',
      title: 'Second Window: abrir/fechar janela do jogador',
      shortcut: 'mod+shift+w',
      run: () => controller.toggleWindow(),
    });

    ctx.views.addRibbonItem({
      id: 'second-window:toggle',
      title: 'Janela do jogador (Ctrl+Shift+W)',
      icon: ScreenShare,
      command: 'second-window:toggle',
      order: 50,
    });

    ctx.views.add({
      id: 'second-window:panel',
      title: 'Janela do Jogador',
      location: 'border-left',
      component: () => <SecondWindowControlPanel controller={controller} />,
      tab: { id: 'second-window', name: 'Jogador', default: true },
      order: 40,
    });

    // only meaningful while the hexcrawl plugin is active — demonstrates the
    // plugin-status introspection added to the app facade
    const hexcrawlActive = ctx.app.plugins.isActive('diegesis/hexcrawl');
    if (!hexcrawlActive) {
      console.info("[second-window] plugin 'diegesis/hexcrawl' inativo — exibição de mapas indisponível");
    }
  },
};
