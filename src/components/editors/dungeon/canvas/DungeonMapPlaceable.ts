// Placeable raiz do mapa de dungeon: renderiza células de chão, paredes
// derivadas, portas, shapes de overlay, numeração de salas e fog of war.
// O documento do placeable É o DungeonMapDoc inteiro — mutações parciais via
// layer.update(id, changes, { before }) são undoable pelo HistoryManager.

import { Container, Graphics, Text } from 'pixi.js';
import { PlaceableObject, type CanvasLike } from '@diegesis/canvas';
import { cellKey, deriveWalls, roomCenter, type DungeonMapDoc, type DungeonWallSegment } from '../model';
import { CORRIDOR_COLOR, DOOR_COLORS, FOG_COLOR, FOG_GM_ALPHA, ROOM_COLORS, SELECTION_COLOR, WALL_COLOR } from '../model';
import { controllerFor } from './controller';

/** audiência do render: GM vê fog translúcida; jogadores só veem o revelado */
let audience: 'gm' | 'player' = 'gm';
export function setDungeonAudience(a: 'gm' | 'player'): void {
  audience = a;
}
export function isPlayerAudience(): boolean {
  return audience === 'player';
}

export class DungeonMapPlaceable extends PlaceableObject<DungeonMapDoc> {
  readonly objectType = 'dungeon-map';

  private readonly floor = new Graphics();
  private readonly walls = new Graphics();
  private readonly doors = new Graphics();
  private readonly selectionGfx = new Graphics();
  private readonly fog = new Graphics();
  private readonly labels = new Container();

  constructor(document: DungeonMapDoc, canvas: CanvasLike) {
    super(document, canvas, { interactive: false });
    this.content.addChild(this.floor, this.walls, this.doors, this.selectionGfx, this.labels, this.fog);
  }

  get bounds() {
    const { cols, rows, cellSize } = this.document.grid;
    return { x: 0, y: 0, width: cols * cellSize, height: rows * cellSize };
  }

  refresh(): void {
    for (const child of this.labels.removeChildren()) child.destroy();
    this.drawFloor();
    this.drawWalls();
    this.drawSelection();
    this.drawLabels();
    this.drawFog();
  }

  // ---------- sala selecionada (contorno accent nas bordas externas) ----------

  private drawSelection(): void {
    const g = this.selectionGfx.clear();
    const roomId = controllerFor(this.canvas)?.selectedRoomId;
    if (!roomId) return;
    const doc = this.document;
    const s = doc.grid.cellSize;
    const inRoom = new Set(doc.cells.filter((c) => c.roomId === roomId).map((c) => cellKey(c.x, c.y)));
    if (inRoom.size === 0) return;
    for (const key of inRoom) {
      const [cx, cy] = key.split(',').map(Number);
      const x0 = cx * s;
      const y0 = cy * s;
      if (!inRoom.has(cellKey(cx, cy - 1))) g.moveTo(x0, y0).lineTo(x0 + s, y0);
      if (!inRoom.has(cellKey(cx, cy + 1))) g.moveTo(x0, y0 + s).lineTo(x0 + s, y0 + s);
      if (!inRoom.has(cellKey(cx - 1, cy))) g.moveTo(x0, y0).lineTo(x0, y0 + s);
      if (!inRoom.has(cellKey(cx + 1, cy))) g.moveTo(x0 + s, y0).lineTo(x0 + s, y0 + s);
    }
    g.stroke({ width: 3, color: SELECTION_COLOR, cap: 'round', join: 'round', alpha: 0.9 });
  }

  // ---------- chão ----------

  private drawFloor(): void {
    const doc = this.document;
    const s = doc.grid.cellSize;
    const g = this.floor.clear();
    const colorOf = new Map(doc.rooms.map((r, i) => [r.id, r.color ?? ROOM_COLORS[i % ROOM_COLORS.length]]));
    for (const c of doc.cells) {
      const color = c.kind === 'corridor' ? CORRIDOR_COLOR : (colorOf.get(c.roomId ?? '') ?? ROOM_COLORS[0]);
      g.rect(c.x * s + 0.5, c.y * s + 0.5, s - 1, s - 1).fill(color);
    }
  }

  // ---------- paredes & portas ----------

  private drawWalls(): void {
    const s = this.document.grid.cellSize;
    const walls = this.walls.clear();
    const doors = this.doors.clear();
    for (const seg of deriveWalls(this.document)) {
      if (!seg.door) {
        walls.moveTo(seg.x1, seg.y1).lineTo(seg.x2, seg.y2);
        continue;
      }
      // stub 30% em cada ponta, gap central para a porta
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      walls
        .moveTo(seg.x1, seg.y1)
        .lineTo(seg.x1 + dx * 0.3, seg.y1 + dy * 0.3)
        .moveTo(seg.x1 + dx * 0.7, seg.y1 + dy * 0.7)
        .lineTo(seg.x2, seg.y2);
      this.drawDoor(doors, seg, s);
    }
    walls.stroke({ width: 2.5, color: WALL_COLOR, cap: 'round', join: 'round' });
  }

  private drawDoor(g: Graphics, seg: DungeonWallSegment, s: number): void {
    const door = seg.door!;
    const horizontal = seg.y1 === seg.y2;
    const cx = (seg.x1 + seg.x2) / 2;
    const cy = (seg.y1 + seg.y2) / 2;
    const leaf = s * 0.4;
    const color = DOOR_COLORS[door.kind] ?? DOOR_COLORS.normal;
    if (door.kind === 'secret') {
      // tracejado discreto no lugar do gap
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const t0 = 0.3 + (0.4 * i) / steps;
        const t1 = t0 + 0.4 / steps / 2;
        g.moveTo(seg.x1 + (seg.x2 - seg.x1) * t0, seg.y1 + (seg.y2 - seg.y1) * t0).lineTo(
          seg.x1 + (seg.x2 - seg.x1) * t1,
          seg.y1 + (seg.y2 - seg.y1) * t1
        );
      }
      g.stroke({ width: 2, color });
      return;
    }
    if (door.kind === 'portcullis') {
      // trama de grades no gap
      for (const t of [0.38, 0.5, 0.62]) {
        const px = seg.x1 + (seg.x2 - seg.x1) * t;
        const py = seg.y1 + (seg.y2 - seg.y1) * t;
        if (horizontal) g.moveTo(px, cy - s * 0.14).lineTo(px, cy + s * 0.14);
        else g.moveTo(cx - s * 0.14, py).lineTo(cx + s * 0.14, py);
      }
      g.stroke({ width: 1.8, color });
      return;
    }
    // normal/locked: folha da porta + arco de abertura (tela é y-down)
    if (horizontal) {
      g.moveTo(cx - leaf / 2, cy).lineTo(cx + leaf / 2, cy);
      g.moveTo(cx - leaf / 2, cy).lineTo(cx - leaf / 2, cy - leaf);
      g.arc(cx - leaf / 2, cy, leaf, -Math.PI / 2, 0);
    } else {
      g.moveTo(cx, cy - leaf / 2).lineTo(cx, cy + leaf / 2);
      g.moveTo(cx, cy - leaf / 2).lineTo(cx + leaf, cy - leaf / 2);
      g.arc(cx, cy - leaf / 2, leaf, 0, Math.PI / 2);
    }
    g.stroke({ width: 1.8, color });
    if (door.kind === 'locked') {
      const r = s * 0.09;
      g.rect(cx - r, cy - r, r * 2, r * 2).fill(color);
    }
  }

  // ---------- numeração das salas ----------

  private drawLabels(): void {
    const labels = this.labels;
    const doc = this.document;
    const size = Math.max(10, doc.grid.cellSize * 0.45);
    for (const room of doc.rooms) {
      const center = roomCenter(doc, room.id);
      if (!center) continue;
      const t = new Text({
        text: String(room.number),
        style: {
          fill: '#e8e2d0',
          fontSize: size,
          fontWeight: '700',
          fontFamily: 'Cinzel, serif',
          stroke: { color: '#090c12', width: 3 },
        },
      });
      t.anchor.set(0.5);
      t.position.set(center.x, center.y);
      labels.addChild(t);
    }
  }

  // ---------- fog of war ----------

  private drawFog(): void {
    const g = this.fog.clear();
    const doc = this.document;
    if (doc.fog.enabled) {
      const s = doc.grid.cellSize;
      const revealed = new Set(doc.fog.revealed);
      const alpha = audience === 'player' ? 1 : FOG_GM_ALPHA;
      for (let y = 0; y < doc.grid.rows; y++) {
        for (let x = 0; x < doc.grid.cols; x++) {
          if (revealed.has(`${x},${y}`)) continue;
          g.rect(x * s, y * s, s, s).fill({ color: FOG_COLOR, alpha });
        }
      }
    }
    // markers reavaliam a própria visibilidade quando a fog muda
    if (audience === 'player') {
      const markers = controllerFor(this.canvas)?.canvas.documents.layer('dungeon-marker');
      if (markers) for (const m of markers.placeables) m.refresh();
    }
  }
}
