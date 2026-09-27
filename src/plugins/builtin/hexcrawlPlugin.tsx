import { Map } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { HexcrawlMap } from '../../components/editors/hexcrawl/HexcrawlMap';
import { createDefaultHexMap, serializeHexMap } from '../../components/editors/hexcrawl/model';

/**
 * Hexcrawl — mapas de hexágonos estilo Worldographer/Hexographer como tipo de
 * documento próprio ('hexcrawl/map'). O plugin registra o editor e o tipo
 * criável; o Explorer renderiza a criação a partir do registro de docTypes.
 */
export const hexcrawlPlugin: Plugin = {
  manifest: {
    id: 'mythril/hexcrawl',
    name: 'Hexcrawl',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Mapas hexcrawl: pintura de terreno, features, rios/estradas com regras de viagem, regiões com modificadores, notas por hex e gerador de terreno.',
    author: 'Mythril',
    permissions: ['ui', 'events'],
  },
  activate(ctx) {
    // camera moves are published on the event bus so other plugins (e.g.
    // mythril/second-window) can mirror the GM viewport in realtime
    ctx.editors.add({
      docType: 'hexcrawl/map',
      component: ({ doc }) => (
        <HexcrawlMap doc={doc} onCameraChange={(viewport) => ctx.events.emit('hexcrawl:camera', { docId: doc.id, ...viewport })} />
      ),
    });
    ctx.docTypes.add({
      docType: 'hexcrawl/map',
      label: 'Mapa Hexcrawl',
      icon: Map,
      iconColor: 'text-map',
      defaultTitle: 'Novo Mapa',
      defaultContent: () => serializeHexMap(createDefaultHexMap()),
    });
  },
};
