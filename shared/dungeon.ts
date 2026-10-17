// Modelo do "Mapa de Dungeon" (diegesis/dungeon): grid de células pintadas
// (salas/corredores, estilo Dungeon Scrawl) com paredes derivadas
// automaticamente das fronteiras, portas, markers linkados a documentos,
// shapes livres de overlay (estilo tldraw), fog of war por célula e metadados
// da geração procedural. TS puro — usado pelo renderer, pelo main (FTS) e
// pela player view.

import { newId } from '@diegesis/core';
import { blocksToPlainText } from './blockContent';

export const DUNGEON_DOC_KIND = 'diegesis-dungeon';

export type DungeonCellKind = 'room' | 'corridor';

export interface DungeonGrid {
  cols: number;
  rows: number;
  /** tamanho da célula em unidades de mundo (px) */
  cellSize: number;
}

export interface DungeonCell {
  x: number;
  y: number;
  kind: DungeonCellKind;
  /** sala à qual a célula pertence (null para corredores soltos) */
  roomId: string | null;
}

export interface DungeonRoom {
  id: string;
  /** numeração exibida no mapa e na legenda */
  number: number;
  name: string;
  /** descrição rica da sala (JSON de blocos BlockNote, mesmo schema das notes) */
  description: string;
  /** cor de preenchimento opcional (hex); null = padrão do tema */
  color: string | null;
}

export type DungeonDoorKind = 'normal' | 'secret' | 'locked' | 'portcullis';
export type DungeonWallSide = 'n' | 's' | 'e' | 'w';

export interface DungeonDoor {
  id: string;
  /** célula de CHÃO cuja parede recebe a porta */
  x: number;
  y: number;
  side: DungeonWallSide;
  kind: DungeonDoorKind;
}

export interface DungeonMarker {
  id: string;
  /** posição livre em coordenadas de mundo (px) */
  x: number;
  y: number;
  icon: string;
  label: string;
  /** descrição rica do pin (JSON de blocos BlockNote; noteRefs substituem o antigo docId) */
  description: string;
}

export type DungeonShapeType = 'rect' | 'ellipse' | 'freehand' | 'text' | 'arrow';

export interface DungeonShape {
  id: string;
  type: DungeonShapeType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** polyline para freehand/arrow: [x0,y0,x1,y1,…] relativos a x,y */
  points?: number[];
  text?: string;
  color: string;
  /** preenchimento translúcido (destaques rect/ellipse) */
  fill?: boolean;
  /** estilo de texto (type='text') — font family CSS ('inherit' = fonte da UI) */
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface DungeonGeneration {
  seed: string;
  theme: string;
  roomCount: number;
  /** 0..1 — quão ramificado o dungeon é (corredores extras além da MST) */
  looping: number;
}

export interface DungeonMapDoc {
  kind: typeof DUNGEON_DOC_KIND;
  version: 1;
  grid: DungeonGrid;
  cells: DungeonCell[];
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
  markers: DungeonMarker[];
  shapes: DungeonShape[];
  fog: { enabled: boolean; revealed: string[] };
  generation: DungeonGeneration | null;
}

export const DEFAULT_DUNGEON_GRID: DungeonGrid = { cols: 48, rows: 48, cellSize: 32 };

export function generateDungeonId(): string {
  return newId();
}

export function createDefaultDungeon(): DungeonMapDoc {
  return {
    kind: DUNGEON_DOC_KIND,
    version: 1,
    grid: { ...DEFAULT_DUNGEON_GRID },
    cells: [],
    rooms: [],
    doors: [],
    markers: [],
    shapes: [],
    fog: { enabled: false, revealed: [] },
    generation: null,
  };
}

// ---------- células ----------

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function cellIndex(cells: readonly DungeonCell[]): Map<string, DungeonCell> {
  const map = new Map<string, DungeonCell>();
  for (const c of cells) map.set(cellKey(c.x, c.y), c);
  return map;
}

export function inGrid(grid: DungeonGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.cols && y < grid.rows;
}

/** células de chão de uma sala, na ordem em que foram pintadas */
export function roomCells(doc: DungeonMapDoc, roomId: string): DungeonCell[] {
  return doc.cells.filter((c) => c.roomId === roomId);
}

/** centro de massa da sala em coordenadas de mundo (para rótulos/números) */
export function roomCenter(doc: DungeonMapDoc, roomId: string): { x: number; y: number } | null {
  const cells = roomCells(doc, roomId);
  if (cells.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  const s = doc.grid.cellSize;
  return { x: (sx / cells.length + 0.5) * s, y: (sy / cells.length + 0.5) * s };
}

// ---------- paredes derivadas ----------

export interface DungeonWallSegment {
  /** coordenadas de mundo (px) */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** porta neste segmento, se houver */
  door: DungeonDoor | null;
}

const SIDES: Record<DungeonWallSide, { dx: number; dy: number }> = {
  n: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  e: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 },
};

/** porta na parede `side` da célula (x,y), se existir */
export function doorAt(doc: DungeonMapDoc, x: number, y: number, side: DungeonWallSide): DungeonDoor | null {
  return doc.doors.find((d) => d.x === x && d.y === y && d.side === side) ?? null;
}

/**
 * Deriva os segmentos de parede do dungeon: toda fronteira entre célula de
 * chão e célula vazia vira um segmento (em unidades de mundo). Portas ficam
 * embutidas nos segmentos para renderização e para os hooks de visão/luz.
 */
export function deriveWalls(doc: DungeonMapDoc): DungeonWallSegment[] {
  const floor = cellIndex(doc.cells);
  const s = doc.grid.cellSize;
  const walls: DungeonWallSegment[] = [];
  for (const c of doc.cells) {
    for (const side of Object.keys(SIDES) as DungeonWallSide[]) {
      const { dx, dy } = SIDES[side];
      if (floor.has(cellKey(c.x + dx, c.y + dy))) continue;
      const x0 = c.x * s;
      const y0 = c.y * s;
      let seg: DungeonWallSegment;
      switch (side) {
        case 'n':
          seg = { x1: x0, y1: y0, x2: x0 + s, y2: y0, door: null };
          break;
        case 's':
          seg = { x1: x0, y1: y0 + s, x2: x0 + s, y2: y0 + s, door: null };
          break;
        case 'e':
          seg = { x1: x0 + s, y1: y0, x2: x0 + s, y2: y0 + s, door: null };
          break;
        default:
          seg = { x1: x0, y1: y0, x2: x0, y2: y0 + s, door: null };
      }
      seg.door = doorAt(doc, c.x, c.y, side);
      walls.push(seg);
    }
  }
  return walls;
}

// ---------- parsing / serialização ----------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** um parágrafo BlockNote serializado a partir de inline content (migração legado) */
function paragraphBlocks(content: unknown[]): string {
  return JSON.stringify([{ type: 'paragraph', content }]);
}

/** sala legada (summary plain-text + noteDocId) → description BlockNote */
function migrateRoomDescription(r: { description?: unknown; summary?: unknown; noteDocId?: unknown }): string {
  if (isStr(r.description)) return r.description;
  const content: unknown[] = [];
  if (isStr(r.summary) && r.summary)
    content.push({ type: 'text', text: r.summary, styles: {} });
  if (isStr(r.noteDocId) && r.noteDocId)
    content.push({ type: 'noteRef', props: { docId: r.noteDocId, label: '' } });
  return content.length ? paragraphBlocks(content) : '';
}

/** marker legado (docId vinculado) → description com chip noteRef */
function migrateMarkerDescription(m: { description?: unknown; docId?: unknown }): string {
  if (isStr(m.description)) return m.description;
  if (isStr(m.docId) && m.docId)
    return paragraphBlocks([{ type: 'noteRef', props: { docId: m.docId, label: '' } }]);
  return '';
}

/** descrição BlockNote a partir de texto puro (gerador procedural) */
export function plainTextDescription(text: string): string {
  return text ? paragraphBlocks([{ type: 'text', text, styles: {} }]) : '';
}

/** descrição BlockNote contendo apenas um chip [[nota]] (drop do Explorer) */
export function noteRefDescription(docId: string): string {
  return paragraphBlocks([{ type: 'noteRef', props: { docId, label: '' } }]);
}

/** entrada hostil (import de realm, versões futuras): valida campo a campo */
export function parseDungeon(content: string | null | undefined): DungeonMapDoc {
  const base = createDefaultDungeon();
  if (!content) return base;
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object' || raw.kind !== DUNGEON_DOC_KIND) return base;
    const grid = raw.grid ?? {};
    const doc = createDefaultDungeon();
    doc.grid = {
      cols: isNum(grid.cols) && grid.cols > 0 ? Math.floor(grid.cols) : DEFAULT_DUNGEON_GRID.cols,
      rows: isNum(grid.rows) && grid.rows > 0 ? Math.floor(grid.rows) : DEFAULT_DUNGEON_GRID.rows,
      cellSize:
        isNum(grid.cellSize) && grid.cellSize > 0 ? grid.cellSize : DEFAULT_DUNGEON_GRID.cellSize,
    };
    doc.cells = Array.isArray(raw.cells)
      ? raw.cells
          .filter((c: DungeonCell) => c && isNum(c.x) && isNum(c.y) && inGrid(doc.grid, c.x, c.y))
          .map((c: DungeonCell) => ({
            x: Math.floor(c.x),
            y: Math.floor(c.y),
            kind: c.kind === 'corridor' ? ('corridor' as const) : ('room' as const),
            roomId: isStr(c.roomId) ? c.roomId : null,
          }))
      : [];
    doc.rooms = Array.isArray(raw.rooms)
      ? raw.rooms
          .filter((r: DungeonRoom) => r && isStr(r.id))
          .map((r: DungeonRoom, i: number) => ({
            id: r.id,
            number: isNum(r.number) ? r.number : i + 1,
            name: isStr(r.name) ? r.name : '',
            description: migrateRoomDescription(r),
            color: isStr(r.color) ? r.color : null,
          }))
      : [];
    doc.doors = Array.isArray(raw.doors)
      ? raw.doors
          .filter((d: DungeonDoor) => d && isStr(d.id) && isNum(d.x) && isNum(d.y))
          .map((d: DungeonDoor) => ({
            id: d.id,
            x: Math.floor(d.x),
            y: Math.floor(d.y),
            side: (['n', 's', 'e', 'w'] as const).includes(d.side) ? d.side : ('n' as const),
            kind: (['normal', 'secret', 'locked', 'portcullis'] as const).includes(d.kind)
              ? d.kind
              : ('normal' as const),
          }))
      : [];
    doc.markers = Array.isArray(raw.markers)
      ? raw.markers
          .filter((m: DungeonMarker) => m && isStr(m.id) && isNum(m.x) && isNum(m.y))
          .map((m: DungeonMarker) => ({
            id: m.id,
            x: m.x,
            y: m.y,
            icon: isStr(m.icon) ? m.icon : 'map-pin',
            label: isStr(m.label) ? m.label : '',
            description: migrateMarkerDescription(m),
          }))
      : [];
    doc.shapes = Array.isArray(raw.shapes)
      ? raw.shapes
          .filter((s: DungeonShape) => s && isStr(s.id) && isNum(s.x) && isNum(s.y))
          .map((s: DungeonShape) => ({
            id: s.id,
            type: (['rect', 'ellipse', 'freehand', 'text', 'arrow'] as const).includes(s.type)
              ? s.type
              : ('rect' as const),
            x: s.x,
            y: s.y,
            w: isNum(s.w) ? s.w : undefined,
            h: isNum(s.h) ? s.h : undefined,
            points: Array.isArray(s.points) ? s.points.filter(isNum) : undefined,
            text: isStr(s.text) ? s.text : undefined,
            color: isStr(s.color) ? s.color : '#d9a45f',
            fill: s.fill === true,
            font: isStr(s.font) ? s.font : undefined,
            size: isNum(s.size) ? s.size : undefined,
            bold: s.bold === true,
            italic: s.italic === true,
          }))
      : [];
    if (raw.fog && typeof raw.fog === 'object') {
      doc.fog = {
        enabled: raw.fog.enabled === true,
        revealed: Array.isArray(raw.fog.revealed) ? raw.fog.revealed.filter(isStr) : [],
      };
    }
    if (raw.generation && typeof raw.generation === 'object' && isStr(raw.generation.seed)) {
      doc.generation = {
        seed: raw.generation.seed,
        theme: isStr(raw.generation.theme) ? raw.generation.theme : 'dungeon',
        roomCount: isNum(raw.generation.roomCount) ? raw.generation.roomCount : 8,
        looping: isNum(raw.generation.looping) ? raw.generation.looping : 0.25,
      };
    }
    return doc;
  } catch {
    return base;
  }
}

export function serializeDungeon(doc: DungeonMapDoc): string {
  return JSON.stringify(doc);
}

/** texto indexável (FTS/RAG): nomes/descrições de salas, pins e textos soltos */
export function extractDungeonText(content: string): string {
  const doc = parseDungeon(content);
  const parts: string[] = [];
  for (const r of doc.rooms) {
    if (r.name) parts.push(r.name);
    const d = blocksToPlainText(r.description);
    if (d) parts.push(d);
  }
  for (const m of doc.markers) {
    if (m.label) parts.push(m.label);
    const d = blocksToPlainText(m.description);
    if (d) parts.push(d);
  }
  for (const s of doc.shapes) if (s.text) parts.push(s.text);
  return parts.join(' ');
}

// ---------- RNG seeded (geração procedural) ----------

/** hash de string → u32 (FNV-1a) */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG determinístico (mulberry32) — mesmo seed, mesmo dungeon */
export function createRng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
