import { AudioPanel } from '../../components/AudioPanel';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/** Global audio manager: a left-border tab, like the highlights panel. */
export const audioPlugin: Plugin = {
  manifest: {
    id: 'core/audio',
    name: 'Áudios',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Painel global de reprodução de áudio e soundboards.',
    author: 'Diegesis Codex',
    permissions: ['ui'],
  },
  activate(ctx) {
    ctx.views.add({
      id: 'audio',
      title: 'Áudios',
      location: 'border-left',
      component: AudioPanel,
      tab: { id: '__audio__', name: 'Áudios', default: true },
      order: 2,
    });
  },
};
