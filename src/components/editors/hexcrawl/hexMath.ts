/* ============================================================
   Hex math — offset/axial coordinates, pixel layout, A* pathfinding
   Supports flat-top (columns offset) and pointy-top (rows offset)
   grids with odd/even shift, redblobgames-style.
   ============================================================ */

export const SQRT3 = Math.sqrt(3);

export interface Point {
  x: number;
  y: number;
}

export type HexOrientation = 'flat' | 'pointy';
export type HexOffset = 'odd' | 'even';

export interface HexGeom {
  orientation: HexOrientation;
  /** which column (flat) or row (pointy) is shifted half a hex */
  offset: HexOffset;
  /** circumradius in px */
  size: number;
}

export interface HexCoord {
  col: number;
  row: number;
}

export const hexKey = (col: number, row: number) => `${col},${row}`;
export const coordKey = (c: HexCoord) => hexKey(c.col, c.row);

export function parseHexKey(key: string): HexCoord {
  const [col, row] = key.split(',').map(Number);
  return { col, row };
}

/* ---------- offset <-> axial ---------- */

export interface Axial {
  q: number;
  r: number;
}

export function offsetToAxial(g: Pick<HexGeom, 'orientation' | 'offset'>, col: number, row: number): Axial {
  if (g.orientation === 'flat') {
    const q = col;
    const r = g.offset === 'odd' ? row - (col - (col & 1)) / 2 : row - (col + (col & 1)) / 2;
    return { q, r };
  }
  const r = row;
  const q = g.offset === 'odd' ? col - (row - (row & 1)) / 2 : col - (row + (row & 1)) / 2;
  return { q, r };
}

export function axialToOffset(g: Pick<HexGeom, 'orientation' | 'offset'>, q: number, r: number): HexCoord {
  if (g.orientation === 'flat') {
    const col = q;
    const row = g.offset === 'odd' ? r + (q - (q & 1)) / 2 : r + (q + (q & 1)) / 2;
    return { col, row };
  }
  const row = r;
  const col = g.offset === 'odd' ? q + (row - (row & 1)) / 2 : q + (row + (row & 1)) / 2;
  return { col, row };
}

/* ---------- pixel layout ---------- */

export function hexCenter(g: HexGeom, col: number, row: number): Point {
  // both layouts shift the ODD columns/rows: 'odd' shifts them down (+0.5),
  // 'even' shifts them up (-0.5) — this is the layout pixelToHex inverts
  if (g.orientation === 'flat') {
    const dy = (col & 1) === 1 ? (g.offset === 'odd' ? 0.5 : -0.5) : 0;
    return { x: g.size * 1.5 * col, y: g.size * SQRT3 * (row + dy) };
  }
  const dx = (row & 1) === 1 ? (g.offset === 'odd' ? 0.5 : -0.5) : 0;
  return { x: g.size * SQRT3 * (col + dx), y: g.size * 1.5 * row };
}

/** 6 corner points starting at the rightmost (flat) or top (pointy) corner */
export function hexCorners(g: HexGeom, col: number, row: number): Point[] {
  const c = hexCenter(g, col, row);
  const base = g.orientation === 'flat' ? 0 : -30;
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((base + 60 * i) * Math.PI) / 180;
    corners.push({ x: c.x + g.size * Math.cos(angle), y: c.y + g.size * Math.sin(angle) });
  }
  return corners;
}

export const cornersPath = (corners: Point[]): string =>
  corners.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';

/** pixel -> hex via fractional axial + cube rounding */
export function pixelToHex(g: HexGeom, x: number, y: number): HexCoord {
  let q: number;
  let r: number;
  if (g.orientation === 'flat') {
    q = ((2 / 3) * x) / g.size;
    r = ((-1 / 3) * x + (SQRT3 / 3) * y) / g.size;
  } else {
    q = ((SQRT3 / 3) * x - (1 / 3) * y) / g.size;
    r = ((2 / 3) * y) / g.size;
  }
  // cube round
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return axialToOffset(g, rx, rz);
}

/* ---------- grid metrics ---------- */

/** width/height in px of the bounding box of a cols x rows grid */
export function gridPixelSize(g: HexGeom, cols: number, rows: number): { w: number; h: number } {
  if (g.orientation === 'flat') {
    return { w: g.size * (1.5 * (cols - 1) + 2), h: g.size * SQRT3 * (rows + 0.5) };
  }
  return { w: g.size * SQRT3 * (cols + 0.5), h: g.size * (1.5 * (rows - 1) + 2) };
}

/** center-to-center distance between adjacent hexes (= flat-to-flat width) */
export const hexStep = (g: HexGeom) => g.size * SQRT3;

/* ---------- topology ---------- */

const AXIAL_DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors(
  g: Pick<HexGeom, 'orientation' | 'offset'>,
  col: number,
  row: number,
  cols: number,
  rows: number
): HexCoord[] {
  const a = offsetToAxial(g, col, row);
  const out: HexCoord[] = [];
  for (const d of AXIAL_DIRS) {
    const c = axialToOffset(g, a.q + d.q, a.r + d.r);
    if (c.col >= 0 && c.col < cols && c.row >= 0 && c.row < rows) out.push(c);
  }
  return out;
}

export function hexDistance(g: Pick<HexGeom, 'orientation' | 'offset'>, a: HexCoord, b: HexCoord): number {
  const aa = offsetToAxial(g, a.col, a.row);
  const bb = offsetToAxial(g, b.col, b.row);
  return (Math.abs(aa.q - bb.q) + Math.abs(aa.r - bb.r) + Math.abs(aa.q + aa.r - bb.q - bb.r)) / 2;
}

/* ---------- A* pathfinding ---------- */

class MinHeap<T> {
  private items: { prio: number; value: T }[] = [];

  get size() {
    return this.items.length;
  }

  push(value: T, prio: number): void {
    this.items.push({ prio, value });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].prio <= this.items[i].prio) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l].prio < this.items[smallest].prio) smallest = l;
        if (r < this.items.length && this.items[r].prio < this.items[smallest].prio) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top?.value;
  }
}

/**
 * A* between two hexes. `stepCost(from, to)` returns the movement multiplier
 * for entering `to` (Infinity = impassable). Returns the hex sequence
 * (including both ends) or null when unreachable.
 */
export function findPath(
  g: Pick<HexGeom, 'orientation' | 'offset'>,
  cols: number,
  rows: number,
  from: HexCoord,
  to: HexCoord,
  stepCost: (from: HexCoord, to: HexCoord) => number,
  maxIterations = 200_000,
  /** lower bound of one step's cost — scales the heuristic so it stays admissible */
  minStepCost = 1
): HexCoord[] | null {
  if (from.col === to.col && from.row === to.row) return [from];
  const open = new MinHeap<HexCoord>();
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const startKey = coordKey(from);
  gScore.set(startKey, 0);
  open.push(from, 0);

  const closed = new Set<string>();
  let iterations = 0;
  while (open.size > 0 && iterations++ < maxIterations) {
    const current = open.pop()!;
    const currentKey = coordKey(current);
    if (closed.has(currentKey)) continue; // stale heap entry
    closed.add(currentKey);
    if (current.col === to.col && current.row === to.row) {
      const path: HexCoord[] = [current];
      let key = currentKey;
      while (key !== startKey) {
        key = cameFrom.get(key)!;
        path.push(parseHexKey(key));
      }
      return path.reverse();
    }
    const currentG = gScore.get(currentKey)!;
    for (const next of neighbors(g, current.col, current.row, cols, rows)) {
      const cost = stepCost(current, next);
      if (!Number.isFinite(cost) || cost <= 0) continue;
      const tentative = currentG + cost;
      const nextKey = coordKey(next);
      if (closed.has(nextKey) || tentative >= (gScore.get(nextKey) ?? Infinity)) continue;
      gScore.set(nextKey, tentative);
      cameFrom.set(nextKey, currentKey);
      open.push(next, tentative + hexDistance(g, next, to) * minStepCost);
    }
  }
  return null;
}

/**
 * SVG path of a region's outer boundary: for every hex edge whose neighbor is
 * outside the set, the shared edge is the consecutive corner pair whose
 * midpoint is closest to the (missing) neighbor's center.
 */
export function regionBoundaryPath(g: Pick<HexGeom, 'orientation' | 'offset' | 'size'>, hexKeys: Set<string>): string {
  const geom = g as HexGeom;
  let d = '';
  for (const key of hexKeys) {
    const { col, row } = parseHexKey(key);
    const corners = hexCorners(geom, col, row);
    const a = offsetToAxial(g, col, row);
    for (const dir of AXIAL_DIRS) {
      const n = axialToOffset(g, a.q + dir.q, a.r + dir.r);
      if (hexKeys.has(coordKey(n))) continue;
      const nCenter = hexCenter(geom, n.col, n.row);
      // edge i = corners[i] -> corners[(i+1)%6]; pick the one facing the neighbor
      let bestI = 0;
      let bestDist = Infinity;
      for (let i = 0; i < 6; i++) {
        const mx = (corners[i].x + corners[(i + 1) % 6].x) / 2;
        const my = (corners[i].y + corners[(i + 1) % 6].y) / 2;
        const dist = Math.hypot(mx - nCenter.x, my - nCenter.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
        }
      }
      const p1 = corners[bestI];
      const p2 = corners[(bestI + 1) % 6];
      d += `M${p1.x.toFixed(2)},${p1.y.toFixed(2)}L${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    }
  }
  return d;
}

/* ---------- segments (road proximity checks) ---------- */

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** minimum distance between two polylines (sampled per segment pair, endpoint approximation) */
export function polylineDistance(a: Point[], b: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      best = Math.min(
        best,
        pointToSegmentDistance(a[i], b[j], b[j + 1]),
        pointToSegmentDistance(a[i + 1], b[j], b[j + 1]),
        pointToSegmentDistance(b[j], a[i], a[i + 1]),
        pointToSegmentDistance(b[j + 1], a[i], a[i + 1])
      );
    }
  }
  return best;
}

export const polylineLength = (pts: Point[]): number => {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return len;
};

/** nearest hex corner to a pixel point (for line snapping) */
export function nearestCorner(g: HexGeom, cols: number, rows: number, p: Point): Point {
  const approx = pixelToHex(g, p.x, p.y);
  let best: Point = p;
  let bestDist = Infinity;
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const col = approx.col + dc;
      const row = approx.row + dr;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      for (const corner of hexCorners(g, col, row)) {
        const d = Math.hypot(corner.x - p.x, corner.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = corner;
        }
      }
    }
  }
  return best;
}

/* ---------- edge-aligned lines (rivers/coasts along hex edges) ---------- */

const CORNER_EPS = 0.75;

interface CornerRef {
  col: number;
  row: number;
  index: number;
  point: Point;
}

/** corner identities (hex + corner index) matching a point, from hexes around it */
function cornerRefsAt(g: HexGeom, cols: number, rows: number, p: Point): CornerRef[] {
  const approx = pixelToHex(g, p.x, p.y);
  const out: CornerRef[] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      const col = approx.col + dc;
      const row = approx.row + dr;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
      hexCorners(g, col, row).forEach((point, index) => {
        if (Math.hypot(point.x - p.x, point.y - p.y) <= CORNER_EPS) out.push({ col, row, index, point });
      });
    }
  }
  return out;
}

/**
 * Path from corner A to corner B following hex edges (Hexographer-style
 * rivers): when both corners belong to a common hex, walks its perimeter the
 * short way; otherwise falls back to a straight hop. Returns the points to
 * append — excludes A, includes B.
 */
export function edgePathBetween(g: HexGeom, cols: number, rows: number, a: Point, b: Point): Point[] {
  if (Math.hypot(b.x - a.x, b.y - a.y) <= CORNER_EPS) return [];
  const refsA = cornerRefsAt(g, cols, rows, a);
  const refsB = cornerRefsAt(g, cols, rows, b);
  for (const ra of refsA) {
    for (const rb of refsB) {
      if (ra.col !== rb.col || ra.row !== rb.row) continue;
      const diff = (rb.index - ra.index + 6) % 6;
      if (diff === 0) return [];
      const forward = diff <= 3;
      const steps = forward ? diff : 6 - diff;
      const corners = hexCorners(g, ra.col, ra.row);
      const pts: Point[] = [];
      for (let s = 1; s <= steps; s++) {
        pts.push(corners[(ra.index + (forward ? s : -s) + 12) % 6]);
      }
      return pts;
    }
  }
  return [b];
}
