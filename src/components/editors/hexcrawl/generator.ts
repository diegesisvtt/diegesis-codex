/* ============================================================
   Terrain generation — seeded fBm value-noise generator with a
   biome table (elevation × moisture × temperature), procedural
   rivers and points of interest; plus the "terrain wizard"
   (fills empty cells from a painted sketch).
   ============================================================ */

import type { HexCoord, HexLine, HexMapDoc, MapPin } from './model';
import { generateId, geomOf, hexKey } from './model';
import { hexCenter, hexDistance, neighbors } from './hexMath';
import { createRng } from '@diegesis/dice-core';

/**
 * PRNG com seed para geração reproduzível — delegado ao dice-core (seedrandom).
 * O seed é sorteado a cada geração (não exposto na UI); a sequência muda
 * entre versões do algoritmo, então não há garantia de reprodução histórica.
 */
export function seededRandom(seed: number): () => number {
  return createRng(String(seed));
}

export const randomSeed = () => Math.floor(Math.random() * 1e9);

/** smooth 2D value noise on the integer lattice, bilinear interpolation */
function valueNoise(rand: () => number): (x: number, y: number) => number {
  // integer keys — a string-keyed map allocates millions of strings on large grids
  const cache = new Map<number, number>();
  const lattice = (x: number, y: number) => {
    const key = x * 65536 + y;
    let v = cache.get(key);
    if (v === undefined) {
      v = rand();
      cache.set(key, v);
    }
    return v;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const v00 = lattice(x0, y0);
    const v10 = lattice(x0 + 1, y0);
    const v01 = lattice(x0, y0 + 1);
    const v11 = lattice(x0 + 1, y0 + 1);
    return v00 + (v10 - v00) * fx + (v01 - v00) * fy + (v00 - v10 - v01 + v11) * fx * fy;
  };
}

/** fractal Brownian motion: sums octaves of value noise (amp ½, freq ×2), result 0..1 */
function fbmNoise(rand: () => number, octaves: number): (x: number, y: number) => number {
  const noise = valueNoise(rand);
  const n = Math.max(1, Math.round(octaves));
  return (x, y) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < n; i++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

export type GeneratorShape = 'continent' | 'island' | 'archipelago' | 'inland';

/** terrain ids resolved from the map's own defs (substring match in the UI) */
export interface GeneratorTerrains {
  water: string;
  ocean: string;
  plains: string;
  forest: string;
  jungle: string;
  hills: string;
  mountains: string;
  snowpeaks: string;
  swamp: string;
  desert: string;
  tundra: string;
}

export interface GeneratorOptions {
  seed: number;
  /** noise scale — larger = bigger landmasses */
  scale: number;
  /** fBm octaves — more = more detailed coastlines/borders */
  octaves: number;
  /** 0..1 — fraction of the map covered by water */
  waterLevel: number;
  /** 0..1 — threshold above which terrain becomes mountains */
  mountainLevel: number;
  forestLevel: number;
  /** landmass silhouette (radial falloff + water bias) */
  shape: GeneratorShape;
  /** -0.3..0.3 — shifts the latitude gradient (cold at the top, hot at the bottom) */
  temperature: number;
  /** target number of procedural rivers (0 = off) */
  rivers: number;
  /** target number of points of interest per category (0 = off) */
  poi: number;
  /** only fill empty cells, keeping hand-painted terrain */
  respectPainted: boolean;
  terrains: GeneratorTerrains;
}

export const DEFAULT_GENERATOR: Omit<GeneratorOptions, 'seed' | 'terrains'> = {
  scale: 8,
  octaves: 4,
  waterLevel: 0.3,
  mountainLevel: 0.85,
  forestLevel: 0.55,
  shape: 'continent',
  temperature: 0,
  rivers: 3,
  poi: 0,
  respectPainted: false,
};

/** tag applied to lines created by the generator, so re-generation replaces them (reserved prefix) */
const GENERATED_TAG = '__gerado';

const SHAPE_CFG: Record<GeneratorShape, { falloff: number; water: number }> = {
  continent: { falloff: 0.45, water: 0 },
  island: { falloff: 0.7, water: 0.05 },
  archipelago: { falloff: 0.5, water: 0.15 },
  inland: { falloff: 0, water: -0.15 },
};

/** biome lookup: elevation × moisture × temperature → terrain id */
function biome(e: number, m: number, t: number, ridge: number, waterLevel: number, oceanLevel: number, opts: GeneratorOptions): string {
  const T = opts.terrains;
  if (e < oceanLevel) return T.ocean;
  if (e < waterLevel) return T.water;
  if (e > opts.mountainLevel) return t < 0.35 ? T.snowpeaks : T.mountains;
  if (e > opts.mountainLevel - 0.08 || ridge > 0.93) return T.hills;
  if (t < 0.2) return T.tundra;
  if (t > 0.7 && m > opts.forestLevel) return T.jungle;
  if (e < waterLevel + 0.05 && m > opts.forestLevel + 0.08) return T.swamp;
  if (t > 0.65 && m < 0.32) return T.desert;
  if (m > opts.forestLevel) return T.forest;
  return T.plains;
}

const spaced = (grid: Pick<HexMapDoc['grid'], 'orientation' | 'offset'>, placed: HexCoord[], c: HexCoord, min: number) =>
  placed.every((p) => hexDistance(grid, p, c) >= min);

/**
 * Fill the map with generated terrain (fBm elevation/moisture, latitude
 * temperature, ridged hills), carve rivers as 'river' lines and optionally
 * scatter points of interest. Painted cells are kept when respectPainted.
 */
export function generateTerrain(doc: HexMapDoc, opts: GeneratorOptions): HexMapDoc {
  const { cols, rows } = doc.grid;
  const s = Math.max(2, opts.scale);
  const rand = seededRandom(opts.seed);
  const elevationN = fbmNoise(rand, opts.octaves);
  const moistureN = fbmNoise(rand, opts.octaves);
  const tempN = fbmNoise(rand, 2);
  const ridgeN = fbmNoise(rand, Math.max(2, opts.octaves - 1));

  const cfg = SHAPE_CFG[opts.shape];
  const waterLevel = Math.min(0.9, Math.max(0.05, opts.waterLevel + cfg.water));
  // inland maps get lakes, never deep ocean
  const oceanLevel = opts.shape === 'inland' ? -Infinity : waterLevel - 0.12;
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const maxD = Math.hypot(cx || 1, cy || 1);

  const T = opts.terrains;
  const isWater = (t: string | null) => t === T.water || t === T.ocean;
  const isSource = (t: string | null) => t === T.mountains || t === T.hills || t === T.snowpeaks;

  const size = cols * rows;
  const idx = (col: number, row: number) => row * cols + col;
  const elev = new Float64Array(size);
  const moist = new Float64Array(size);
  const ridge = new Float64Array(size);
  const terrain: (string | null)[] = new Array(size).fill(null);
  const painted = new Uint8Array(size);

  // pass 1: raw noise fields (falloff applied to elevation)
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const i = idx(col, row);
      let e = elevationN(col / s, row / s);
      if (cfg.falloff > 0) {
        const d = Math.hypot(col - cx, row - cy) / maxD;
        e -= cfg.falloff * Math.pow(d, 1.8);
      }
      elev[i] = e;
      moist[i] = moistureN(col / s + 100, row / s + 100);
      ridge[i] = 1 - Math.abs(2 * ridgeN(col / s + 300, row / s + 300) - 1);
    }
  }

  // fBm output clusters around 0.5 — stretch both fields to the observed
  // range so the thresholds keep their meaning (0.3 water ≈ 30% do mapa)
  const stretch = (field: Float64Array) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < size; i++) {
      if (field[i] < lo) lo = field[i];
      if (field[i] > hi) hi = field[i];
    }
    const span = hi - lo;
    if (span < 1e-6) return;
    for (let i = 0; i < size; i++) field[i] = (field[i] - lo) / span;
  };
  stretch(elev);
  stretch(moist);
  stretch(ridge);

  // pass 2: temperature (latitude + altitude penalty) → biome per cell
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const i = idx(col, row);
      const e = elev[i];
      let t = rows > 1 ? row / (rows - 1) : 0.5;
      t += opts.temperature - Math.max(0, e) * 0.35 + (tempN(col / s + 200, row / s + 200) - 0.5) * 0.2;

      const existing = doc.cells[hexKey(col, row)]?.terrain ?? null;
      if (existing && opts.respectPainted) {
        painted[i] = 1;
        terrain[i] = existing;
      } else {
        terrain[i] = biome(e, moist[i], t, ridge[i], waterLevel, oceanLevel, opts);
      }
    }
  }

  const geom = geomOf(doc);

  /* ---------- rivers: greedy descent from the highlands to water ---------- */

  const riverCells: HexCoord[] = [];
  const riverLines: HexLine[] = [];
  if (opts.rivers > 0) {
    const sources: HexCoord[] = [];
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        if (isSource(terrain[idx(col, row)])) sources.push({ col, row });
      }
    }
    // shuffle sources deterministically
    for (let i = sources.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [sources[i], sources[j]] = [sources[j], sources[i]];
    }
    const used: HexCoord[] = [];
    // only draw rivers with a river-ish style — a wrong fallback (road/border)
    // would render oddly and leak travel-cost multipliers onto rivers
    const riverStyle = doc.lineStyles.find((l) => /river|rio/i.test(l.id) || /river|rio/i.test(l.name));
    for (const start of sources) {
      if (riverLines.length >= opts.rivers) break;
      if (!spaced(doc.grid, used, start, 4)) continue;
      const path: HexCoord[] = [start];
      const visited = new Set([hexKey(start.col, start.row)]);
      let cur = start;
      for (let step = 0; step < 2 * (cols + rows); step++) {
        if (isWater(terrain[idx(cur.col, cur.row)])) break;
        let next: HexCoord | null = null;
        let best = Infinity;
        for (const n of neighbors(doc.grid, cur.col, cur.row, cols, rows)) {
          if (visited.has(hexKey(n.col, n.row))) continue;
          const score = elev[idx(n.col, n.row)] + rand() * 0.03;
          if (score < best) {
            best = score;
            next = n;
          }
        }
        if (!next || elev[idx(next.col, next.row)] > elev[idx(cur.col, cur.row)] + 0.02) break; // depression
        cur = next;
        visited.add(hexKey(cur.col, cur.row));
        path.push(cur);
      }
      // a river that stopped over land ends in a lake (never on painted/source cells)
      const end = idx(cur.col, cur.row);
      if (!isWater(terrain[end]) && !painted[end] && !isSource(terrain[end])) terrain[end] = T.water;
      if (path.length < 3) continue;
      used.push(start);
      riverCells.push(...path);
      if (riverStyle) {
        riverLines.push({
          id: generateId(),
          styleId: riverStyle.id,
          points: path.map((c) => hexCenter(geom, c.col, c.row)),
          tags: [GENERATED_TAG],
        });
      }
    }
  }

  /* ---------- points of interest ---------- */

  const pins: MapPin[] = [];
  if (opts.poi > 0) {
    const feat = (needle: string) => doc.features.find((f) => f.id.includes(needle))?.id ?? null;
    const addPin = (c: HexCoord, markerId: string) =>
      pins.push({ id: generateId(), ...hexCenter(geom, c.col, c.row), markerId, docId: null, name: '', generated: true });

    // cities & towns: land next to water or along a river
    const nearRiver = new Set(riverCells.map((c) => hexKey(c.col, c.row)));
    const cityMarker = feat('city') ?? feat('town');
    const townMarker = feat('town') ?? feat('hamlet') ?? feat('city');
    const settled: HexCoord[] = [];
    if (cityMarker || townMarker) {
      const spots: HexCoord[] = [];
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const i = idx(col, row);
          if (isWater(terrain[i])) continue;
          const byWater = neighbors(doc.grid, col, row, cols, rows).some((n) => isWater(terrain[idx(n.col, n.row)]));
          if (byWater || nearRiver.has(hexKey(col, row))) spots.push({ col, row });
        }
      }
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }
      let want = opts.poi * 2;
      for (const spot of spots) {
        if (want <= 0) break;
        const marker = settled.length % 3 === 0 && cityMarker ? cityMarker : townMarker;
        if (!marker) break;
        if (!spaced(doc.grid, settled, spot, Math.max(3, s / 2))) continue;
        settled.push(spot);
        addPin(spot, marker);
        want--;
      }
    }

    // wilderness: ruins, dungeons and lairs away from settlements
    const wildMarkers = [feat('ruin'), feat('dungeon'), feat('lair'), feat('cave'), feat('tower')].filter((f): f is string => !!f);
    if (wildMarkers.length > 0) {
      const wildTerrain = new Set([T.mountains, T.snowpeaks, T.hills, T.forest, T.jungle, T.swamp]);
      const wild: HexCoord[] = [];
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          if (wildTerrain.has(terrain[idx(col, row)] ?? '')) wild.push({ col, row });
        }
      }
      for (let i = wild.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [wild[i], wild[j]] = [wild[j], wild[i]];
      }
      const placed: HexCoord[] = [];
      let want = opts.poi;
      let k = 0;
      for (const spot of wild) {
        if (want <= 0) break;
        if (!spaced(doc.grid, settled, spot, Math.max(3, s / 2)) || !spaced(doc.grid, placed, spot, 4)) continue;
        placed.push(spot);
        addPin(spot, wildMarkers[k++ % wildMarkers.length]);
        want--;
      }
    }
  }

  /* ---------- commit ---------- */

  const cells = { ...doc.cells };
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const i = idx(col, row);
      if (painted[i]) continue;
      const key = hexKey(col, row);
      const current = cells[key];
      cells[key] = { terrain: terrain[i], noteDocId: current?.noteDocId ?? null };
    }
  }
  const lines = [...doc.lines.filter((l) => !(l.tags ?? []).includes(GENERATED_TAG)), ...riverLines];
  const keptPins = doc.pins.filter((p) => !p.generated);
  return { ...doc, cells, lines, pins: [...keptPins, ...pins] };
}

/**
 * Terrain wizard: fill every EMPTY cell with the most common terrain among
 * its painted neighbors (iterative flood from the sketch). Cells with no
 * painted neighbor anywhere keep the fallback terrain.
 */
export function terrainWizard(doc: HexMapDoc, fallbackTerrain: string): HexMapDoc {
  const { cols, rows } = doc.grid;
  const grid: (string | null)[][] = [];
  for (let col = 0; col < cols; col++) {
    grid[col] = [];
    for (let row = 0; row < rows; row++) {
      grid[col][row] = doc.cells[hexKey(col, row)]?.terrain ?? null;
    }
  }
  // iterate: each round fills empties adjacent to filled cells (majority vote)
  for (let pass = 0; pass < cols + rows; pass++) {
    const fills: { col: number; row: number; terrain: string }[] = [];
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        if (grid[col][row]) continue;
        const counts = new Map<string, number>();
        for (const n of neighbors(doc.grid, col, row, cols, rows)) {
          const t = grid[n.col][n.row];
          if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        if (counts.size === 0) continue;
        let best: string | null = null;
        let bestCount = 0;
        for (const [t, c] of counts) {
          if (c > bestCount) {
            best = t;
            bestCount = c;
          }
        }
        if (best) fills.push({ col, row, terrain: best });
      }
    }
    if (fills.length === 0) break;
    for (const f of fills) grid[f.col][f.row] = f.terrain;
  }
  const cells = { ...doc.cells };
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const terrain = grid[col][row] ?? fallbackTerrain;
      const key = hexKey(col, row);
      if (terrain && !cells[key]?.terrain) {
        const current = cells[key];
        cells[key] = { terrain, noteDocId: current?.noteDocId ?? null };
      }
    }
  }
  return { ...doc, cells };
}
