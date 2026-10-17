// Tools do editor de dungeon — máquinas de estado sobre o ToolManager do
// kernel (mesmo modelo mental do tldraw: uma tool ativa, handlers de pointer
// por estado). Todas as mutações passam pelo DungeonController (undoable).

import { Tool, dynamicBus, type CanvasKeyInfo, type CanvasPointerInfo, type Point } from '@diegesis/canvas';
import {
  cellKey,
  cellIndex,
  generateDungeonId,
  ROOM_COLORS,
  type DungeonCell,
  type DungeonDoorKind,
  type DungeonRoom,
  type DungeonWallSide,
} from '../model';
import { controllerOf, type DungeonController } from './controller';

// ---------- helpers ----------

function cellOf(ctrl: DungeonController, point: Point): { x: number; y: number } {
  const s = ctrl.doc().grid.cellSize;
  return { x: Math.floor(point.x / s), y: Math.floor(point.y / s) };
}

function rectCells(
  ctrl: DungeonController,
  a: { x: number; y: number },
  b: { x: number; y: number },
  fill: (x: number, y: number) => DungeonCell
): DungeonCell[] {
  const { grid } = ctrl.doc();
  const cells: DungeonCell[] = [];
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(grid.cols - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(grid.rows - 1, Math.max(a.y, b.y));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(fill(x, y));
  return cells;
}

/** parede (célula+lado) mais próxima do ponto, dentro do limiar */
function nearestWall(
  ctrl: DungeonController,
  point: Point
): { x: number; y: number; side: DungeonWallSide; dist: number } | null {
  const doc = ctrl.doc();
  const s = doc.grid.cellSize;
  const floor = cellIndex(doc.cells);
  const SIDES: Record<DungeonWallSide, { dx: number; dy: number }> = {
    n: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    e: { dx: 1, dy: 0 },
    w: { dx: -1, dy: 0 },
  };
  let best: { x: number; y: number; side: DungeonWallSide; dist: number } | null = null;
  const cx = Math.floor(point.x / s);
  const cy = Math.floor(point.y / s);
  // só células ao redor do ponto importam
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!floor.has(cellKey(x, y))) continue;
      for (const side of Object.keys(SIDES) as DungeonWallSide[]) {
        const { dx, dy } = SIDES[side];
        if (floor.has(cellKey(x + dx, y + dy))) continue;
        const x0 = x * s;
        const y0 = y * s;
        const [x1, y1, x2, y2] =
          side === 'n'
            ? [x0, y0, x0 + s, y0]
            : side === 's'
              ? [x0, y0 + s, x0 + s, y0 + s]
              : side === 'e'
                ? [x0 + s, y0, x0 + s, y0 + s]
                : [x0, y0, x0, y0 + s];
        // distância ponto-segmento
        const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        const t = Math.max(
          0,
          Math.min(1, ((point.x - x1) * (x2 - x1) + (point.y - y1) * (y2 - y1)) / len2)
        );
        const dist = Math.hypot(point.x - (x1 + t * (x2 - x1)), point.y - (y1 + t * (y2 - y1)));
        if (dist <= s * 0.6 && (!best || dist < best.dist)) best = { x, y, side, dist };
      }
    }
  }
  return best;
}

/** acumulador de stroke: células pintadas entre pointerdown/up */
abstract class CellStrokeTool extends Tool {
  protected painting = false;
  protected erase = false;
  protected readonly cells = new Map<string, DungeonCell>();

  onExit(): void {
    // troca de tool por hotkey no meio do stroke: fecha o batch para não
    // vazar batchDepth (o HistoryManager morre silenciosamente se vazar)
    if (this.painting) {
      this.painting = false;
      this.canvas.history.endBatch();
    }
    this.cells.clear();
    this.preview.clear();
  }

  protected startStroke(info: CanvasPointerInfo): void {
    this.painting = true;
    this.erase = info.button === 2 || info.altKey;
    this.cells.clear();
    this.canvas.history.beginBatch();
  }

  protected endStroke(): void {
    this.painting = false;
    this.cells.clear();
    this.canvas.history.endBatch();
    this.preview.clear();
  }

  /** redesenha os fantasmas a partir do conjunto acumulado (sem stacking) */
  protected ghostCells(keys: Iterable<string>): void {
    const s = controllerOf(this.canvas).doc().grid.cellSize;
    this.preview.clear();
    for (const key of keys) {
      const [x, y] = key.split(',').map(Number);
      this.preview.ghostRect(x * s, y * s, s, s, this.erase ? 0xd47f6f : 0xd9a45f);
    }
  }
}

// ---------- sala (retângulo) ----------

export class RoomTool extends Tool {
  static id = 'dungeon-room';
  private start: { x: number; y: number } | null = null;
  private hoverCell: { x: number; y: number } | null = null;
  private erase = false;

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onExit(): void {
    this.start = null;
    this.preview.clear();
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0 && info.button !== 2) return;
    this.erase = info.button === 2 || info.altKey;
    this.start = cellOf(controllerOf(this.canvas), info.point);
    this.hoverCell = this.start;
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (!this.start) return;
    const ctrl = controllerOf(this.canvas);
    this.hoverCell = cellOf(ctrl, info.point);
    const s = ctrl.doc().grid.cellSize;
    const x = Math.min(this.start.x, this.hoverCell.x) * s;
    const y = Math.min(this.start.y, this.hoverCell.y) * s;
    const w = (Math.abs(this.hoverCell.x - this.start.x) + 1) * s;
    const h = (Math.abs(this.hoverCell.y - this.start.y) + 1) * s;
    this.preview.clear();
    this.preview.ghostRect(x, y, w, h, this.erase ? 0xd47f6f : 0xd9a45f);
  }

  onPointerUp(): void {
    if (!this.start || !this.hoverCell) return;
    const ctrl = controllerOf(this.canvas);
    const start = this.start;
    const current = this.hoverCell;
    this.start = null;
    this.hoverCell = null;
    this.preview.clear();
    if (this.erase) {
      const keys = new Set(rectCells(ctrl, start, current, (x, y) => ({ x, y, kind: 'room', roomId: null })).map((c) => cellKey(c.x, c.y)));
      ctrl.eraseCells(keys);
      return;
    }
    const room: DungeonRoom = {
      id: generateDungeonId(),
      number: ctrl.nextRoomNumber(),
      name: '',
      description: '',
      color: ROOM_COLORS[(ctrl.nextRoomNumber() - 1) % ROOM_COLORS.length],
    };
    ctrl.paintCells(
      rectCells(ctrl, start, current, (x, y) => ({ x, y, kind: 'room' as const, roomId: room.id })),
      room
    );
  }
}

// ---------- corredor (freehand por célula) ----------

export class CorridorTool extends CellStrokeTool {
  static id = 'dungeon-corridor';
  private last: { x: number; y: number } | null = null;

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0 && info.button !== 2) return;
    this.startStroke(info);
    this.last = null;
    this.paintAt(info.point);
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (!this.painting) return;
    this.paintAt(info.point);
  }

  onPointerUp(): void {
    if (!this.painting) return;
    this.strokeKeys.clear();
    this.endStroke();
    this.last = null;
  }

  private readonly strokeKeys = new Set<string>();

  private paintAt(point: Point): void {
    const ctrl = controllerOf(this.canvas);
    const cell = cellOf(ctrl, point);
    const { grid } = ctrl.doc();
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows) return;
    // linha discreta entre a última célula e a atual (sem diagonais quebradas)
    const path = this.last ? lineCells(this.last, cell) : [cell];
    this.last = cell;
    for (const c of path) {
      this.cells.set(cellKey(c.x, c.y), { x: c.x, y: c.y, kind: 'corridor', roomId: null });
      this.strokeKeys.add(cellKey(c.x, c.y));
    }
    this.ghostCells(this.strokeKeys);
    this.flush(ctrl);
  }

  private flush(ctrl: DungeonController): void {
    if (this.cells.size === 0) return;
    if (this.erase) ctrl.eraseCells(new Set(this.cells.keys()));
    else ctrl.paintCells([...this.cells.values()]);
    this.cells.clear();
  }

  override onExit(): void {
    this.strokeKeys.clear();
    super.onExit();
  }
}

/** linha de células ortogonal (L) entre duas células */
function lineCells(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let { x, y } = a;
  while (x !== b.x) {
    x += Math.sign(b.x - x);
    out.push({ x, y });
  }
  while (y !== b.y) {
    y += Math.sign(b.y - y);
    out.push({ x, y });
  }
  return out;
}

// ---------- borracha ----------

export class DungeonEraserTool extends CellStrokeTool {
  static id = 'dungeon-erase';

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    this.startStroke(info);
    this.erase = true;
    this.eraseAt(info.point);
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (!this.painting) return;
    this.eraseAt(info.point);
  }

  private readonly strokeKeys = new Set<string>();

  private eraseAt(point: Point): void {
    const ctrl = controllerOf(this.canvas);
    const cell = cellOf(ctrl, point);
    const key = cellKey(cell.x, cell.y);
    this.cells.set(key, { x: cell.x, y: cell.y, kind: 'room', roomId: null });
    this.strokeKeys.add(key);
    this.ghostCells(this.strokeKeys);
    if (this.cells.size >= 8) {
      ctrl.eraseCells(new Set(this.cells.keys()));
      this.cells.clear();
    }
  }

  override onPointerUp(): void {
    if (!this.painting) return;
    this.strokeKeys.clear();
    this.endStroke();
  }

  override onExit(): void {
    this.strokeKeys.clear();
    super.onExit();
  }

  protected endStroke(): void {
    if (this.cells.size > 0) controllerOf(this.canvas).eraseCells(new Set(this.cells.keys()));
    super.endStroke();
  }
}

// ---------- portas ----------

export class DoorTool extends Tool {
  static id = 'dungeon-door';

  onEnter(): void {
    this.setCursor('pointer');
  }

  onPointerMove(info: CanvasPointerInfo): void {
    const ctrl = controllerOf(this.canvas);
    this.preview.clear();
    const wall = nearestWall(ctrl, info.point);
    if (!wall) return;
    const s = ctrl.doc().grid.cellSize;
    this.preview.ghostRect(wall.x * s, wall.y * s, s, s, 0xc8b088);
  }

  onPointerUp(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    const ctrl = controllerOf(this.canvas);
    const wall = nearestWall(ctrl, info.point);
    if (!wall) return;
    const kind = this.toolOptions<{ kind?: DungeonDoorKind }>().kind ?? 'normal';
    ctrl.toggleDoor(wall.x, wall.y, wall.side, kind);
  }

  onExit(): void {
    this.preview.clear();
  }
}

// ---------- marcadores ----------

export class MarkerTool extends Tool {
  static id = 'dungeon-pin';

  onEnter(): void {
    this.setCursor('pointer');
  }

  onPointerUp(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    void controllerOf(this.canvas).addMarker({
      x: info.point.x,
      y: info.point.y,
      icon: 'map-pin',
      label: '',
      description: '',
    });
  }
}

// ---------- fog of war ----------

export class FogTool extends Tool {
  static id = 'dungeon-fog';
  private painting = false;
  private reveal = true;
  private keys: string[] = [];

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0 && info.button !== 2) return;
    this.painting = true;
    this.reveal = info.button !== 2 && !info.altKey;
    this.keys = [];
    this.canvas.history.beginBatch();
    this.paintAt(info.point);
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (!this.painting) return;
    this.paintAt(info.point);
  }

  onPointerUp(): void {
    if (!this.painting) return;
    this.flush(controllerOf(this.canvas));
    this.painting = false;
    this.canvas.history.endBatch();
    this.preview.clear();
  }

  onExit(): void {
    if (this.painting) {
      this.flush(controllerOf(this.canvas));
      this.painting = false;
      this.canvas.history.endBatch();
    }
    this.preview.clear();
  }

  private paintAt(point: Point): void {
    const ctrl = controllerOf(this.canvas);
    const s = ctrl.doc().grid.cellSize;
    // brush 3x3 para pintura rápida
    const cx = Math.floor(point.x / s);
    const cy = Math.floor(point.y / s);
    this.preview.clear();
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        this.keys.push(cellKey(x, y));
        this.preview.ghostRect(x * s, y * s, s, s, this.reveal ? 0x7fd48a : 0xd47f6f);
      }
    }
    if (this.keys.length >= 36) this.flush(ctrl);
  }

  private flush(ctrl: DungeonController): void {
    if (this.keys.length === 0) return;
    ctrl.setCellsRevealed(this.keys, this.reveal);
    this.keys = [];
  }
}

// ---------- anotações (shapes são documentos pickable/movíveis) ----------

/** texto: clique coloca um rótulo e já abre a edição inline (estilo tldraw) */
export class TextTool extends Tool {
  static id = 'dungeon-text';

  onEnter(): void {
    this.setCursor('text');
  }

  onPointerUp(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    const o = this.toolOptions<{
      color?: string;
      font?: string;
      size?: number;
      bold?: boolean;
      italic?: boolean;
    }>();
    const ctrl = controllerOf(this.canvas);
    void ctrl
      .addShape({
        type: 'text',
        x: info.point.x,
        y: info.point.y,
        text: '',
        color: o.color ?? '#e8e2d0',
        font: o.font ?? 'inherit',
        size: o.size ?? 15,
        bold: o.bold ?? false,
        italic: o.italic ?? false,
      })
      .then((id) => dynamicBus(this.canvas.bus).emit('dungeon:edit-text', { shapeId: id, fresh: true }));
  }
}

/** linha/seta: cliques adicionam pontos, botão direito remove o último,
 *  duplo clique ou Enter finaliza (padrão da tool de linha do hexmap) */
export class LineTool extends Tool {
  static id = 'dungeon-line';
  private draft: Point[] = [];
  private hover: Point | null = null;

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onExit(): void {
    this.draft = [];
    this.hover = null;
    this.preview.clear();
  }

  private redraw(): void {
    this.preview.clear();
    const pts = this.hover ? [...this.draft, this.hover] : this.draft;
    if (pts.length >= 2) this.preview.ghostPolylineRaw(pts, 0xd9a45f, 2, true);
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button === 2) {
      // botão direito desfaz o último ponto; sem pontos, cancela
      this.draft = this.draft.slice(0, -1);
      this.redraw();
      return;
    }
    if (info.button !== 0) return;
    this.draft = [...this.draft, { ...info.point }];
    this.redraw();
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (this.draft.length === 0) return;
    this.hover = { ...info.point };
    this.redraw();
  }

  onDoubleClick(): void {
    this.commit();
  }

  onKeyDown(info: CanvasKeyInfo): void {
    if (info.key === 'Enter') this.commit();
  }

  onEscape(): void {
    this.draft = [];
    this.preview.clear();
  }

  private commit(): void {
    if (this.draft.length < 2) {
      this.draft = [];
      this.preview.clear();
      return;
    }
    const o = this.toolOptions<{ color?: string; arrow?: boolean }>();
    const first = this.draft[0];
    const points = this.draft.flatMap((p) => [p.x - first.x, p.y - first.y]);
    void controllerOf(this.canvas).addShape({
      type: o.arrow ? 'arrow' : 'freehand',
      x: first.x,
      y: first.y,
      points,
      color: o.color ?? '#d9a45f',
    });
    this.draft = [];
    this.hover = null;
    this.preview.clear();
  }
}

/** desenho livre: arrastar pinta uma polyline */
export class BrushTool extends Tool {
  static id = 'dungeon-brush';
  private start: Point | null = null;
  private points: Point[] = [];

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onExit(): void {
    this.start = null;
    this.points = [];
    this.preview.clear();
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    this.start = { ...info.point };
    this.points = [{ ...info.point }];
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (!this.start) return;
    this.points.push({ ...info.point });
    this.preview.clear();
    if (this.points.length >= 2) this.preview.ghostPolylineRaw(this.points, 0xd9a45f, 2, false);
  }

  onPointerUp(info: CanvasPointerInfo): void {
    if (!this.start || info.button !== 0) return;
    const start = this.start;
    const points = this.points;
    this.start = null;
    this.points = [];
    this.preview.clear();
    if (points.length < 2) return;
    const o = this.toolOptions<{ color?: string }>();
    void controllerOf(this.canvas).addShape({
      type: 'freehand',
      x: start.x,
      y: start.y,
      points: points.flatMap((p) => [p.x - start.x, p.y - start.y]),
      color: o.color ?? '#d9a45f',
    });
  }
}

/** destaque: retângulo/elipse translúcido para marcar áreas */
export class HighlightTool extends Tool {
  static id = 'dungeon-highlight';
  private start: Point | null = null;

  onEnter(): void {
    this.setCursor('crosshair');
  }

  onExit(): void {
    this.start = null;
    this.preview.clear();
  }

  onPointerDown(info: CanvasPointerInfo): void {
    if (info.button !== 0) return;
    this.start = { ...info.point };
  }

  onPointerMove(info: CanvasPointerInfo): void {
    if (!this.start) return;
    const x = Math.min(this.start.x, info.point.x);
    const y = Math.min(this.start.y, info.point.y);
    const w = Math.abs(info.point.x - this.start.x);
    const h = Math.abs(info.point.y - this.start.y);
    this.preview.clear();
    this.preview.ghostRect(x, y, w, h, 0xd9a45f);
  }

  onPointerUp(info: CanvasPointerInfo): void {
    if (!this.start || info.button !== 0) return;
    const start = this.start;
    this.start = null;
    this.preview.clear();
    const x = Math.min(start.x, info.point.x);
    const y = Math.min(start.y, info.point.y);
    const w = Math.abs(info.point.x - start.x);
    const h = Math.abs(info.point.y - start.y);
    if (w < 4 && h < 4) return;
    const o = this.toolOptions<{ color?: string; ellipse?: boolean; fill?: boolean }>();
    void controllerOf(this.canvas).addShape({
      type: o.ellipse ? 'ellipse' : 'rect',
      x,
      y,
      w,
      h,
      fill: o.fill ?? true,
      color: o.color ?? '#d9a45f',
    });
  }
}
