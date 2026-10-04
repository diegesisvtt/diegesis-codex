/* ============================================================
   Terrain generation — seeded value-noise random generator and
   the "terrain wizard" (fills empty cells from a painted sketch).
   ============================================================ */

import type { HexMapDoc } from './model';
import { hexKey } from './model';
import { neighbors } from './hexMath';
import { createRng } from '@diegesis/dice-core';

/**
 * PRNG com seed para geração reproduzível — delegado ao dice-core (seedrandom).
 * Nota: desde a adoção do dice-core a sequência mudou (antes mulberry32) —
 * o mesmo seed gera um mapa diferente do gerado por versões antigas.
 */
export function seededRandom(seed: number): () => number {
  return createRng(String(seed));
}

/** smooth 2D value noise on the integer lattice, bilinear interpolation */
function valueNoise(rand: () => number): (x: number, y: number) => number {
  const cache = new Map<string, number>();
  const lattice = (x: number, y: number) => {
    const key = `${x},${y}`;
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

export interface GeneratorOptions {
  seed: number;
  /** noise scale — larger = bigger landmasses */
  scale: number;
  /** 0..1 — fraction of the map covered by water */
  waterLevel: number;
  /** 0..1 — threshold above which terrain becomes mountains */
  mountainLevel: number;
  forestLevel: number;
  /** terrain ids from the map's own defs */
  terrains: { water: string; plains: string; forest: string; hills: string; mountains: string };
}

export const DEFAULT_GENERATOR: Omit<GeneratorOptions, 'terrains'> = {
  seed: Math.floor(Math.random() * 1e9),
  scale: 8,
  waterLevel: 0.3,
  mountainLevel: 0.85,
  forestLevel: 0.55,
};

/**
 * Fill every cell with generated terrain (two octaves: elevation + moisture).
 * Uses the map's own terrain ids when they exist, else the first defs.
 */
export function generateTerrain(doc: HexMapDoc, opts: GeneratorOptions): HexMapDoc {
  const rand = seededRandom(opts.seed);
  const elevation = valueNoise(rand);
  const moisture = valueNoise(rand);
  const { cols, rows } = doc.grid;
  const s = Math.max(2, opts.scale);
  // build the cells record once — per-cell updateCell would be O(n²)
  const cells = { ...doc.cells };
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const e = elevation(col / s, row / s);
      const m = moisture(col / s + 100, row / s + 100);
      let terrain: string;
      if (e < opts.waterLevel) terrain = opts.terrains.water;
      else if (e > opts.mountainLevel) terrain = opts.terrains.mountains;
      else if (e > opts.mountainLevel - 0.08) terrain = opts.terrains.hills;
      else if (m > opts.forestLevel) terrain = opts.terrains.forest;
      else terrain = opts.terrains.plains;
      const key = hexKey(col, row);
      const current = cells[key];
      cells[key] = { terrain, noteDocId: current?.noteDocId ?? null };
    }
  }
  return { ...doc, cells };
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
