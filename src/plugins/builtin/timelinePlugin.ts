import { History } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { TimelineEditor } from '../../components/editors/timeline/TimelineEditor';
import { createDefaultTimeline, serializeTimeline } from '@shared/timeline';

/**
 * Timeline — ferramenta de worldbuilding estilo LegendKeeper como tipo de
 * documento próprio ('diegesis/timeline'): eventos, storylines paralelas,
 * eras aninhadas, causa e efeito, fases de lua e retcon livre com
 * calendários customizáveis (templates inclusos).
 */
export const timelinePlugin: Plugin = {
  manifest: {
    id: 'diegesis/timeline',
    name: 'Timeline',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Linhas do tempo para worldbuilding: eventos, eras aninhadas, storylines paralelas, causa e efeito, fases de lua e calendários de fantasia.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'docs:read'],
  },
  activate(ctx) {
    ctx.editors.add({ docType: 'diegesis/timeline', component: TimelineEditor });
    ctx.docTypes.add({
      docType: 'diegesis/timeline',
      label: 'Timeline',
      icon: History,
      iconColor: 'text-timeline',
      defaultTitle: 'Nova Timeline',
      defaultContent: () => serializeTimeline(createDefaultTimeline()),
    });
  },
};
