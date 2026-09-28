import { HighlightsPanel } from '../../components/HighlightsPanel';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/** Contributes the PDF highlights panel to the left border. */
export const highlightsPlugin: Plugin = {
  manifest: {
    id: 'core/highlights',
    name: 'Destaques',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Painel de destaques e anotações de PDFs.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'docs:read'],
  },
  activate(ctx) {
    ctx.views.add({
      id: 'highlights',
      title: 'Destaques',
      location: 'border-left',
      component: HighlightsPanel,
      tab: { id: '__highlights__', name: 'Destaques', default: true },
      order: 1,
    });
  },
};
