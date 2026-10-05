import { ScreenShare } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { PlayerViewController, SETTINGS_MIRROR } from './playerView/controller';
import { PlayerViewControlPanel } from './playerView/ControlPanel';

/**
 * Player View — janela secundária voltada aos jogadores. Exibe notas como
 * pergaminhos antigos, mapas hexcrawl na visão do jogador (névoa de guerra
 * opaca) e imagens anexadas a notas/whiteboards, com conteúdo atualizado em
 * tempo real e viewport controlável por outros plugins via eventos
 * ('playerview:*').
 */
export const playerViewPlugin: Plugin = {
  manifest: {
    id: 'diegesis/player-view',
    name: 'Player View',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Janela secundária para os jogadores: notas como pergaminhos antigos, mapas hexcrawl com névoa de guerra, imagens anexadas e viewport controlado em tempo real.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'commands', 'events', 'settings'],
  },
  activate(ctx) {
    const controller = new PlayerViewController(ctx);
    controller.init();
    // deactivate() below holds the closure; IPC subscription cleanup goes
    // through the auto-disposed register()
    ctx.register({ dispose: () => controller.dispose() });

    // schema declarativo → página "Player View" em Configurações; mudanças
    // feitas lá aplicam ao vivo no controller (o guard do setMirrorViewport
    // evita loop nas escritas vindas do próprio painel de controle)
    ctx.settings.registerAll([
      {
        key: SETTINGS_MIRROR,
        type: 'boolean',
        label: 'Espelhar a câmera do mestre',
        description:
          'Ao exibir um mapa hexcrawl na janela do jogador, acompanha automaticamente o zoom e a posição da câmera do mestre.',
        default: true,
      },
    ]);
    ctx.settingsPages.add({ id: 'diegesis/player-view:settings', title: 'Player View', icon: ScreenShare, order: 50 });
    ctx.settings.subscribe(() => controller.setMirrorViewport(ctx.settings.get(SETTINGS_MIRROR, true)));

    ctx.commands.add({
      id: 'player-view:toggle',
      title: 'Player View: abrir/fechar janela do jogador',
      shortcut: 'mod+shift+w',
      run: () => controller.toggleWindow(),
    });

    ctx.views.addRibbonItem({
      id: 'player-view:toggle',
      title: 'Janela do jogador (Ctrl+Shift+W)',
      icon: ScreenShare,
      command: 'player-view:toggle',
      order: 50,
    });

    ctx.views.add({
      id: 'player-view:panel',
      title: 'Janela do Jogador',
      location: 'border-left',
      component: () => <PlayerViewControlPanel controller={controller} />,
      tab: { id: 'player-view', name: 'Jogador', default: true },
      order: 40,
    });

    // only meaningful while the hexcrawl plugin is active — demonstrates the
    // plugin-status introspection added to the app facade
    const hexcrawlActive = ctx.app.plugins.isActive('diegesis/hexcrawl');
    if (!hexcrawlActive) {
      console.info("[player-view] plugin 'diegesis/hexcrawl' inativo — exibição de mapas indisponível");
    }
  },
};
