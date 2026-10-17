// Plugin do canvas para mapas de dungeon: registra o documento raiz
// (`dungeon-map`), markers (`dungeon-marker`), as tools de desenho e o
// context menu. Instalado junto com `gridSquarePlugin` no editor.

// Pixi gera shaders via new Function — o CSP do Electron exige o módulo
// unsafe-eval (import de side-effect, uma vez para editor e player view)
import 'pixi.js/unsafe-eval';
import * as v from 'valibot';
import {
  definePlugin,
  dynamicBus,
  LockableSchemaEntries,
  menu,
  menuWhen,
  MENU_ORDER,
} from '@diegesis/canvas';
import { DUNGEON_DOC_KIND } from '../model';
import { DungeonMapPlaceable } from './DungeonMapPlaceable';
import { MarkerPlaceable } from './MarkerPlaceable';
import { ShapePlaceable } from './ShapePlaceable';
import { DungeonController, controllerOf } from './controller';
import {
  BrushTool,
  CorridorTool,
  DoorTool,
  DungeonEraserTool,
  FogTool,
  HighlightTool,
  LineTool,
  MarkerTool,
  RoomTool,
  TextTool,
} from './tools';

const DungeonRootSchema = v.looseObject({
  ...LockableSchemaEntries,
  id: v.optional(v.string()),
  kind: v.literal(DUNGEON_DOC_KIND),
});

const DungeonMarkerSchema = v.object({
  ...LockableSchemaEntries,
  id: v.optional(v.string()),
  x: v.number(),
  y: v.number(),
  icon: v.optional(v.string(), 'map-pin'),
  label: v.optional(v.string(), ''),
  /** descrição rica (JSON BlockNote) — noteRefs substituem o antigo docId */
  description: v.optional(v.string(), ''),
});

const DungeonShapeSchema = v.looseObject({
  ...LockableSchemaEntries,
  id: v.optional(v.string()),
  type: v.picklist(['rect', 'ellipse', 'freehand', 'text', 'arrow']),
  x: v.number(),
  y: v.number(),
});

export const dungeonCanvasPlugin = definePlugin({
  id: 'dungeon',
  name: 'Dungeon',
  install(ctx) {
    const canvas = ctx.canvas;
    const controller = new DungeonController(canvas);

    // mutações que bypassam o controller (drag de markers pela Select tool,
    // undo/redo do HistoryManager) também disparam save/refresh do React
    for (const ev of ['document:create', 'document:update', 'document:delete', 'document:moved'] as const) {
      ctx.onDispose(canvas.on(ev, () => controller.emitChange()));
    }

    ctx.registerDocumentType({
      type: 'dungeon-map',
      schema: DungeonRootSchema,
      placeable: DungeonMapPlaceable,
      layer: { id: 'dungeon-map', label: 'Dungeon', order: 10 },
      behavior: { movable: false },
    });

    ctx.registerDocumentType({
      type: 'dungeon-shape',
      schema: DungeonShapeSchema,
      placeable: ShapePlaceable,
      layer: { id: 'dungeon-shapes', label: 'Anotações', order: 15 },
      behavior: { movable: true },
    });

    ctx.registerDocumentType({
      type: 'dungeon-marker',
      schema: DungeonMarkerSchema,
      placeable: MarkerPlaceable,
      layer: { id: 'dungeon-markers', label: 'Marcadores', order: 20 },
      behavior: { movable: true },
    });

    // V/H/E são reservados pelo core (select/hand/eraser) — o hotkey do core
    // vence empates, então a borracha de células usa 'x'
    ctx.registerTool({ tool: RoomTool, hotkey: 'b' });
    ctx.registerTool({ tool: CorridorTool, hotkey: 'c' });
    ctx.registerTool({ tool: DungeonEraserTool, hotkey: 'x' });
    ctx.registerTool({ tool: DoorTool, hotkey: 'd', defaults: { kind: 'normal' } });
    ctx.registerTool({ tool: MarkerTool, hotkey: 'p' });
    ctx.registerTool({ tool: FogTool, hotkey: 'g' });
    ctx.registerTool({
      tool: TextTool,
      hotkey: 't',
      defaults: { color: '#e8e2d0', font: 'inherit', size: 15, bold: false, italic: false },
    });
    ctx.registerTool({ tool: LineTool, hotkey: 'l', defaults: { color: '#d9a45f', arrow: false } });
    ctx.registerTool({ tool: BrushTool, hotkey: 'f', defaults: { color: '#d9a45f' } });
    ctx.registerTool({
      tool: HighlightTool,
      hotkey: 'r',
      defaults: { color: '#d9a45f', ellipse: false, fill: true },
    });

    // tools que usam botão direito (apagar/esconder) vetam o context menu
    ctx.bus.tap('contextmenu:before', 'dungeon', (payload) => {
      const toolId = canvas.getCurrentToolId();
      if (
        toolId === 'dungeon-room' ||
        toolId === 'dungeon-corridor' ||
        toolId === 'dungeon-fog' ||
        toolId === 'dungeon-erase'
      ) {
        return { ...payload, handled: true };
      }
      return payload;
    });

    // clique da Select tool numa célula de chão seleciona a SALA (salas não
    // são placeables — a seleção é efêmera, no controller). Clique em
    // markers/shapes segue o fluxo normal do kernel (seleção de documentos).
    ctx.bus.tap('select:pointerdown', 'dungeon', (payload) => {
      if (payload.handled || (payload.button ?? 0) !== 0) return payload;
      if (canvas.pick({ x: payload.x, y: payload.y })) return payload;
      const ctrl = controllerOf(canvas);
      const world = canvas.toWorld(payload.x, payload.y);
      const s = ctrl.doc().grid.cellSize;
      const cx = Math.floor(world.x / s);
      const cy = Math.floor(world.y / s);
      const cell = ctrl.doc().cells.find((c) => c.x === cx && c.y === cy);
      // clique no vazio fora do grid sem sala selecionada: box-select normal
      if (!cell && !ctrl.selectedRoomId) return payload;
      // ordem importa: clearSelection emite selection:change([]) e o React
      // limpa a seleção — o evento de sala tem que chegar DEPOIS
      canvas.clearSelection();
      ctrl.setSelectedRoom(cell?.roomId ?? null);
      return { ...payload, handled: true };
    });

    // selecionar um documento (marker/shape) limpa a seleção de sala
    ctx.onDispose(
      canvas.on('selection:change', ({ ids }) => {
        if (ids.length > 0) controllerOf(canvas).setSelectedRoom(null);
      })
    );

    // duplo clique: shape de texto → edição inline
    ctx.bus.tap('select:doubleclick', 'dungeon', (payload) => {
      if (payload.handled) return payload;
      const hit = canvas.pick({ x: payload.x, y: payload.y });
      if (hit?.objectType === 'dungeon-shape' && (hit.document as { type?: string }).type === 'text') {
        dynamicBus(canvas.bus).emit('dungeon:edit-text', { shapeId: hit.id });
        return { ...payload, handled: true };
      }
      return payload;
    });

    // context menu de shapes: editar texto / remover
    ctx.registerContextMenu({
      id: 'dungeon:shape',
      when: menuWhen.target('dungeon-shape'),
      items: (menuCtx) => {
        const ctrl = controllerOf(canvas);
        const shapeId = menuCtx.target.type === 'object' ? menuCtx.target.object.id : null;
        const shape = shapeId ? (canvas.documents.get('dungeon-shape', shapeId)?.document ?? null) : null;
        return [
          menu.action('dungeon:edit-shape-text', 'Editar texto', {
            order: MENU_ORDER.canvas,
            disabled: !shape || (shape as { type?: string }).type !== 'text',
            onClick: () => {
              if (shapeId) dynamicBus(canvas.bus).emit('dungeon:edit-text', { shapeId });
            },
          }),
          menu.action('dungeon:remove-shape', 'Remover anotação', {
            order: MENU_ORDER.delete,
            danger: true,
            onClick: () => {
              if (shapeId) ctrl.removeShape(shapeId);
            },
          }),
        ];
      },
    });

    // context menu de markers
    ctx.registerContextMenu({
      id: 'dungeon:marker',
      when: menuWhen.target('dungeon-marker'),
      items: (menuCtx) => {
        const ctrl = controllerOf(canvas);
        const target = menuCtx.target;
        const markerId = target.type === 'object' ? target.object.id : null;
        return [
          menu.action('dungeon:remove-marker', 'Remover marcador', {
            order: MENU_ORDER.delete,
            danger: true,
            onClick: () => {
              if (markerId) ctrl.removeMarker(markerId);
            },
          }),
        ];
      },
    });
  },
});
