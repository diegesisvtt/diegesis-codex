import { Explorer } from '../../components/Explorer';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/** Contributes the document tree to the left border panel. */
export const explorerPlugin: Plugin = {
  manifest: {
    id: 'core/explorer',
    name: 'Explorer',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Árvore de documentos do universo ativo.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'docs:read'],
  },
  activate(ctx) {
    ctx.views.add({
      id: 'explorer',
      title: 'Explorer',
      location: 'border-left',
      component: Explorer,
      tab: { id: 'explorer', name: 'Explorer', default: true },
      order: 0,
    });
  },
};
