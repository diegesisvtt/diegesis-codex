import { Settings2 } from 'lucide-react';
import { SettingsPanel } from '../../components/SettingsPanel';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/** Application settings as a workspace-tab view + ribbon button + command. */
export const settingsPlugin: Plugin = {
  manifest: {
    id: 'core/settings',
    name: 'Configurações',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Painel de configurações do aplicativo.',
    author: 'Mythril',
    permissions: ['ui', 'commands', 'settings'],
    // sem o gerenciador de plugins o usuário não consegue reativar os demais
    required: true,
  },
  activate(ctx) {
    ctx.views.add({
      id: 'settings',
      title: 'Configurações',
      location: 'workspace-tab',
      component: SettingsPanel,
    });
    // legacy tab id from layouts saved before the plugin system
    ctx.views.add({
      id: 'ai-settings',
      title: 'Configurações',
      location: 'workspace-tab',
      component: SettingsPanel,
    });

    ctx.commands.add({
      id: 'core/settings:open',
      title: 'Abrir configurações',
      run: () => ctx.app.openPanel('settings'),
    });

    ctx.views.addRibbonItem({
      id: 'core/settings:ribbon',
      title: 'Configurações',
      icon: Settings2,
      command: 'core/settings:open',
      order: 30,
    });
  },
};
