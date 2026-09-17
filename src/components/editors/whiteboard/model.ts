/* ============================================================
   Whiteboard model — tldraw-inspired shape document
   Everything on the canvas is a shape: { id, type, x, y, parentId, props }
   Groups are shapes too; children reference them via parentId
   and store coordinates relative to the group origin.
   ============================================================ */

export type ShapeType = 'group' | 'text' | 'note' | 'tracker' | 'clock';

/** text shape style variant (plain text or header sizes) */
export type TextSize = 'text' | 'h1' | 'h2' | 'h3';

/** tracker variants: value/max with progress bar, or a single big value */
export type TrackerKind = 'bar' | 'value';

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
  note: { doc: '', html: '', w: 300 },
  tracker: { name: 'Novo Tracker', kind: 'bar' as TrackerKind, value: 10, max: 20 },
  clock: { name: 'Novo Relógio', segments: 4, filled: 0 },
};

/** Fallback sizes used before a shape has been measured on screen */
export const DEFAULT_SIZE: Record<ShapeType, { w: number; h: number }> = {
  group: { w: 0, h: 0 },
  text: { w: 260, h: 40 },
  note: { w: 300, h: 140 },
  tracker: { w: 288, h: 190 },
  clock: { w: 200, h: 250 },
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

/* ---------- group operations ---------- */

/** Wrap the given top-level shape ids into a new group shape */
export function groupShapes(shapes: WBShapeMap, ids: string[]): { next: WBShapeMap; groupId: string } | null {
  const members = ids.map((id) => shapes[id]).filter((s): s is WBShape => !!s && !s.parentId);
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
