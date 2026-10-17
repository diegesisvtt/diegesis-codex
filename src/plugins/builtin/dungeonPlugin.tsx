import { Castle } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin, type PluginContext } from '../api/types';
import { DungeonMap } from '../../components/editors/dungeon/DungeonMap';
import {
  createDefaultDungeon,
  DEFAULT_DUNGEON_GRID,
  serializeDungeon,
} from '../../components/editors/dungeon/model';
import { DungeonSettingsPage } from './dungeon/DungeonSettingsPage';

/**
 * Dungeon — mapas de dungeon estilo Dungeon Scrawl como tipo de documento
 * próprio ('diegesis/dungeon'). Salas/corredores pintados em grade com
 * paredes derivadas, portas, marcadores vinculados a documentos, fog de
 * guerra, geração procedural por seed e player view espelhada.
 */

/** constrói um novo mapa aplicando os padrões configurados no settings do plugin */
function buildDefaultMap(ctx: PluginContext): string {
  const doc = createDefaultDungeon();
  doc.grid = {
    cols: ctx.settings.get('gridCols', DEFAULT_DUNGEON_GRID.cols),
    rows: ctx.settings.get('gridRows', DEFAULT_DUNGEON_GRID.rows),
    cellSize: ctx.settings.get('cellSize', DEFAULT_DUNGEON_GRID.cellSize),
  };
  return serializeDungeon(doc);
}

export const dungeonPlugin: Plugin = {
  manifest: {
    id: 'diegesis/dungeon',
    name: 'Dungeon',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Mapas de dungeon: salas e corredores em grade com paredes automáticas, portas, marcadores com vínculo a documentos, fog de guerra, gerador procedural e player view.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'events', 'settings'],
  },
  activate(ctx) {
    ctx.settingsPages.add({
      id: 'diegesis/dungeon:settings',
      title: 'Dungeon',
      icon: Castle,
      order: 36,
      component: DungeonSettingsPage,
    });

    // camera moves são publicados no bus para o player view espelhar o GM
    ctx.editors.add({
      docType: 'diegesis/dungeon',
      component: ({ doc }) => (
        <DungeonMap
          doc={doc}
          onCameraChange={(viewport) => ctx.events.emit('dungeon:camera', { docId: doc.id, ...viewport })}
        />
      ),
    });
    ctx.docTypes.add({
      docType: 'diegesis/dungeon',
      label: 'Mapa de Dungeon',
      icon: Castle,
      iconColor: 'text-dungeon',
      defaultTitle: 'Nova Dungeon',
      defaultContent: () => buildDefaultMap(ctx),
    });
  },
};
