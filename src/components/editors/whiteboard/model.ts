/* ============================================================
   Whiteboard model — tldraw-inspired shape document
   Everything on the canvas is a shape: { id, type, x, y, parentId, props }
   Groups are shapes too; children reference them via parentId
   and store coordinates relative to the group origin.
   ============================================================ */

export type ShapeType = 'group' | 'text' | 'note' | 'tracker' | 'clock' | 'initiative' | 'arrow' | 'image';

/** text shape style variant (plain text or header sizes) */
export type TextSize = 'text' | 'h1' | 'h2' | 'h3';

/** tracker variants: value/max with progress bar, or a single big value */
export type TrackerKind = 'bar' | 'value';

/** one combatant in the initiative tracker / one step in a sequence */
export interface InitiativeEntry {
  id: string;
  name: string;
  value: number;
  /** optional detail line, shown in sequence mode */
  note?: string;
}

/** initiative tracker modes: sorted by manual value, or a fixed step sequence */
export type InitiativeMode = 'initiative' | 'sequence';

/** arrow endpoint: free canvas point, or bound to a shape (renders on its border) */
export interface ArrowPoint {
  x: number;
  y: number;
  shapeId: string | null;
}

export interface WBShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  /** id of the parent group, or null when on the canvas root */
  parentId: string | null;
  props: Record<string, any>;
}

export type WBShapeMap = Record<string, WBShape>;

export interface WBBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

/* ---------- per-type defaults (shape registry) ---------- */

export const DEFAULT_PROPS: Record<ShapeType, Record<string, any>> = {
  group: { w: 0, h: 0 },
  text: { text: '', w: 260, size: 'text' as TextSize },
  note: {
    doc: '',
    html: '',
    w: 300,
    // linked-reference cards (dropped from the Explorer)
    refKind: null as 'note' | 'pin' | 'bookmark' | 'highlight' | null,
    docId: null as string | null,
    docTitle: '',
    pdfDocId: null as string | null,
    pinId: null as string | null,
    highlightId: null as string | null,
    refPage: null as number | null,
    refColor: null as string | null,
  },
  tracker: { name: 'Novo Tracker', kind: 'bar' as TrackerKind, value: 10, max: 20 },
  clock: { name: 'Novo Relógio', segments: 4, filled: 0 },
  initiative: {
    title: 'Iniciativa',
    mode: 'initiative' as InitiativeMode,
    cycleLabel: 'Rodada',
    entries: [] as InitiativeEntry[],
    current: null as string | null,
    round: 1,
  },
  arrow: {
    start: { x: 0, y: 0, shapeId: null } as ArrowPoint,
    end: { x: 0, y: 0, shapeId: null } as ArrowPoint,
    text: '',
  },
  image: { src: '', w: 320, h: 240, name: '' },
};

/** Fallback sizes used before a shape has been measured on screen */
export const DEFAULT_SIZE: Record<ShapeType, { w: number; h: number }> = {
  group: { w: 0, h: 0 },
  text: { w: 260, h: 40 },
  note: { w: 300, h: 140 },
  tracker: { w: 288, h: 190 },
  clock: { w: 200, h: 250 },
  initiative: { w: 300, h: 220 },
  arrow: { w: 0, h: 0 },
  image: { w: 320, h: 240 },
};

export function createShape(type: ShapeType, x: number, y: number): WBShape {
  return {
    id: generateId(),
    type,
    x,
    y,
    parentId: null,
    props: { ...DEFAULT_PROPS[type] },
  };
}

/* ---------- serialization + legacy migration ---------- */

const HEADER_LEVEL_TO_SIZE: Record<number, TextSize> = { 1: 'h1', 2: 'h2', 3: 'h3' };

/** normalize a parsed shape: legacy 'header' shapes become text with a size prop */
function normalizeShape(raw: any): WBShape | null {
  if (!raw || !raw.id || typeof raw.type !== 'string') return null;
  let shape: WBShape | null = null;
  if (raw.type === 'header') {
    shape = {
      id: raw.id,
      type: 'text',
      x: raw.x ?? 0,
      y: raw.y ?? 0,
      parentId: raw.parentId ?? null,
      props: {
        ...DEFAULT_PROPS.text,
        ...raw.props,
        size: HEADER_LEVEL_TO_SIZE[raw.props?.level] ?? 'h1',
        level: undefined,
      },
    };
  } else if (raw.type in DEFAULT_PROPS) {
    shape = {
      id: raw.id,
      type: raw.type,
      x: raw.x ?? 0,
      y: raw.y ?? 0,
      parentId: raw.parentId ?? null,
      props: { ...DEFAULT_PROPS[raw.type as ShapeType], ...(raw.props ?? {}) },
    };
  }
  if (!shape) return null;
  // drop corrupted near-zero measurements (persisted while the tab was hidden);
  // missing sizes fall back to defaults and get re-measured on screen
  if (typeof shape.props.w === 'number' && shape.props.w < 4) delete shape.props.w;
  if (typeof shape.props.h === 'number' && shape.props.h < 4) delete shape.props.h;
  return shape;
}

export function parseShapes(content: string | null | undefined): WBShapeMap {
  if (!content) return {};
  try {
    const raw = JSON.parse(content);
    if (raw && raw.shapes && typeof raw.shapes === 'object') {
      const shapes: WBShapeMap = {};
      for (const [id, s] of Object.entries(raw.shapes)) {
        const normalized = normalizeShape(s);
        if (normalized) shapes[id] = normalized;
      }
      // groups are never re-measured on screen: recover missing bounds from children
      for (const shape of Object.values(shapes)) {
        if (shape.type !== 'group') continue;
        if (typeof shape.props.w === 'number' && typeof shape.props.h === 'number') continue;
        const b = unionBounds(childrenOf(shapes, shape.id).map(shapeBounds));
        if (b.w > 0 && b.h > 0) {
          // children coords are relative to the group origin: keep the full extent
          shape.props = { ...shape.props, w: Math.ceil(b.x + b.w), h: Math.ceil(b.y + b.h) };
        }
      }
      return shapes;
    }
    // legacy format: { nodes: [{ id, type: 'rpg/tracker' | 'rpg/clock', x, y, data }] }
    if (raw && Array.isArray(raw.nodes)) {
      const shapes: WBShapeMap = {};
      for (const n of raw.nodes) {
        const type: ShapeType | null =
          n.type === 'rpg/tracker' ? 'tracker' : n.type === 'rpg/clock' ? 'clock' : null;
        if (!type || !n.id) continue;
        shapes[n.id] = {
          id: n.id,
          type,
          x: n.x ?? 0,
          y: n.y ?? 0,
          parentId: null,
          props: { ...DEFAULT_PROPS[type], ...(n.data ?? {}) },
        };
      }
      return shapes;
    }
  } catch {
    /* corrupted content -> start empty */
  }
  return {};
}

export function serializeShapes(shapes: WBShapeMap): string {
  return JSON.stringify({ shapes });
}

/* ---------- queries ---------- */

export function topLevelShapes(shapes: WBShapeMap): WBShape[] {
  return Object.values(shapes).filter((s) => !s.parentId);
}

export function childrenOf(shapes: WBShapeMap, groupId: string): WBShape[] {
  return Object.values(shapes).filter((s) => s.parentId === groupId);
}

export function shapeBounds(shape: WBShape): WBBounds {
  const fallback = DEFAULT_SIZE[shape.type];
  return {
    x: shape.x,
    y: shape.y,
    w: shape.props.w ?? fallback.w,
    h: shape.props.h ?? fallback.h,
  };
}

export function unionBounds(list: WBBounds[]): WBBounds {
  if (list.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.min(...list.map((b) => b.x));
  const y1 = Math.min(...list.map((b) => b.y));
  const x2 = Math.max(...list.map((b) => b.x + b.w));
  const y2 = Math.max(...list.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function boundsIntersect(a: WBBounds, b: WBBounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ---------- arrows ---------- */

/** point on the border of a rect along the ray from its center toward `toward` */
export function rectBorderPoint(b: WBBounds, toward: { x: number; y: number }): { x: number; y: number } {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy };
  const s = Math.min(dx !== 0 ? b.w / 2 / Math.abs(dx) : Infinity, dy !== 0 ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** resolve both endpoints: bound ends land on the target shape's border */
export function arrowEndpoints(arrow: WBShape, shapes: WBShapeMap): { x1: number; y1: number; x2: number; y2: number } {
  const centerOf = (s: WBShape) => {
    const b = shapeBounds(s);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };
  const resolve = (p: ArrowPoint, other: ArrowPoint): { x: number; y: number } => {
    const target = p.shapeId ? shapes[p.shapeId] : null;
    if (!target) return { x: p.x, y: p.y };
    const otherTarget = other.shapeId ? shapes[other.shapeId] : null;
    const toward = otherTarget ? centerOf(otherTarget) : other;
    return rectBorderPoint(shapeBounds(target), toward);
  };
  const start = resolve(arrow.props.start, arrow.props.end);
  const end = resolve(arrow.props.end, arrow.props.start);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

export function arrowBounds(arrow: WBShape, shapes: WBShapeMap): WBBounds {
  const { x1, y1, x2, y2 } = arrowEndpoints(arrow, shapes);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** keep x/y and props.w/h in sync with the resolved endpoints (for marquee etc.) */
export function syncArrowBounds(arrow: WBShape, shapes: WBShapeMap): WBShape {
  const b = arrowBounds(arrow, shapes);
  return { ...arrow, x: b.x, y: b.y, props: { ...arrow.props, w: b.w, h: b.h } };
}

/* ---------- group operations ---------- */

/** Wrap the given top-level shape ids into a new group shape (arrows can't be grouped) */
export function groupShapes(shapes: WBShapeMap, ids: string[]): { next: WBShapeMap; groupId: string } | null {
  const members = ids.map((id) => shapes[id]).filter((s): s is WBShape => !!s && !s.parentId && s.type !== 'arrow');
  if (members.length < 2) return null;
  const bounds = unionBounds(members.map(shapeBounds));
  const group: WBShape = {
    id: generateId(),
    type: 'group',
    x: bounds.x,
    y: bounds.y,
    parentId: null,
    props: { w: bounds.w, h: bounds.h },
  };
  const next: WBShapeMap = { ...shapes, [group.id]: group };
  for (const m of members) {
    next[m.id] = { ...m, parentId: group.id, x: m.x - bounds.x, y: m.y - bounds.y };
  }
  return { next, groupId: group.id };
}

/** Dissolve a group, returning children to the canvas root with absolute coords */
export function ungroupShape(shapes: WBShapeMap, groupId: string): { next: WBShapeMap; childIds: string[] } | null {
  const group = shapes[groupId];
  if (!group || group.type !== 'group') return null;
  const next: WBShapeMap = { ...shapes };
  const childIds: string[] = [];
  for (const child of childrenOf(shapes, groupId)) {
    childIds.push(child.id);
    next[child.id] = { ...child, parentId: null, x: child.x + group.x, y: child.y + group.y };
  }
  delete next[groupId];
  return { next, childIds };
}

/** Delete shapes by id; deleting a group also deletes its children (recursively) */
export function deleteShapes(shapes: WBShapeMap, ids: string[]): WBShapeMap {
  const toRemove = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (toRemove.has(id)) continue;
    toRemove.add(id);
    if (shapes[id]?.type === 'group') {
      for (const child of childrenOf(shapes, id)) queue.push(child.id);
    }
  }
  const next: WBShapeMap = {};
  for (const [id, shape] of Object.entries(shapes)) {
    if (!toRemove.has(id)) next[id] = shape;
  }
  return next;
}

/** Clone top-level shapes with an offset; groups are cloned with their children */
export function duplicateShapes(shapes: WBShapeMap, ids: string[], offset = 20): { next: WBShapeMap; cloneIds: string[] } {
  const next: WBShapeMap = { ...shapes };
  const cloneIds: string[] = [];
  for (const id of ids) {
    const s = next[id];
    if (!s || s.parentId) continue;
    const cloneId = generateId();
    cloneIds.push(cloneId);
    next[cloneId] = { ...s, id: cloneId, x: s.x + offset, y: s.y + offset, props: { ...s.props } };
    if (s.type === 'group') {
      for (const child of childrenOf(shapes, s.id)) {
        const childCloneId = generateId();
        next[childCloneId] = { ...child, id: childCloneId, parentId: cloneId, props: { ...child.props } };
      }
    }
  }
  return { next, cloneIds };
}

/** Z-order: object key order is render order — last renders on top */
export function bringToFront(shapes: WBShapeMap, ids: string[]): WBShapeMap {
  const idSet = new Set(ids);
  const rest = Object.entries(shapes).filter(([id]) => !idSet.has(id));
  const moved = Object.entries(shapes).filter(([id]) => idSet.has(id));
  return Object.fromEntries([...rest, ...moved]);
}

export function sendToBack(shapes: WBShapeMap, ids: string[]): WBShapeMap {
  const idSet = new Set(ids);
  const rest = Object.entries(shapes).filter(([id]) => !idSet.has(id));
  const moved = Object.entries(shapes).filter(([id]) => idSet.has(id));
  return Object.fromEntries([...moved, ...rest]);
}
