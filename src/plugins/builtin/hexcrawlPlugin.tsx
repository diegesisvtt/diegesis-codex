import { Map } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin, type PluginContext } from '../api/types';
import { HexcrawlMap } from '../../components/editors/hexcrawl/HexcrawlMap';
import {
  createDefaultHexMap,
  DEFAULT_GRID,
  DEFAULT_SETTINGS,
  serializeHexMap,
} from '../../components/editors/hexcrawl/model';
import { HexcrawlSettingsPage } from './hexcrawl/HexcrawlSettingsPage';

/**
 * Hexcrawl — mapas de hexágonos estilo Worldographer/Hexographer como tipo de
 * documento próprio ('hexcrawl/map'). O plugin registra o editor, o tipo
 * criável e uma página de settings com os PADRÕES de novos mapas.
 */

/** constrói um novo mapa aplicando os padrões configurados no settings do plugin */
function buildDefaultMap(ctx: PluginContext): string {
  const doc = createDefaultHexMap();
  doc.grid = {
    ...doc.grid,
    cols: ctx.settings.get('gridCols', DEFAULT_GRID.cols),
    rows: ctx.settings.get('gridRows', DEFAULT_GRID.rows),
    orientation: ctx.settings.get('hexOrientation', DEFAULT_GRID.orientation),
    offset: ctx.settings.get('hexOffset', DEFAULT_GRID.offset),
  };
  doc.settings = {
    ...doc.settings,
    hexSize: {
      value: ctx.settings.get('hexSizeValue', DEFAULT_SETTINGS.hexSize.value),
      unit: ctx.settings.get('hexSizeUnit', DEFAULT_SETTINGS.hexSize.unit),
    },
    travelSpeed: {
      value: ctx.settings.get('travelSpeedValue', DEFAULT_SETTINGS.travelSpeed.value),
      unit: ctx.settings.get('travelSpeedUnit', DEFAULT_SETTINGS.travelSpeed.unit),
      per: ctx.settings.get('travelSpeedPer', DEFAULT_SETTINGS.travelSpeed.per),
    },
    displayUnit: ctx.settings.get('displayUnit', DEFAULT_SETTINGS.displayUnit),
  };
  return serializeHexMap(doc);
}

export const hexcrawlPlugin: Plugin = {
  manifest: {
    id: 'diegesis/hexcrawl',
    name: 'Hexcrawl',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Mapas hexcrawl: pintura de terreno, features, rios/estradas com regras de viagem, regiões com modificadores, notas por hex e gerador de terreno.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'events', 'settings'],
  },
  activate(ctx) {
    // defaults de novos mapas vivem nas settings do plugin (Settings → Hexcrawl)
    ctx.settingsPages.add({
      id: 'diegesis/hexcrawl:settings',
      title: 'Hexcrawl',
      icon: Map,
      order: 35,
      component: HexcrawlSettingsPage,
    });

    // camera moves are published on the event bus so other plugins (e.g.
    // diegesis/player-view) can mirror the GM viewport in realtime
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
      defaultContent: () => buildDefaultMap(ctx),
    });
  },
};
