/* ============================================================
   Hexcrawl model — tldraw-inspired document store
   The whole map is a plain JSON document persisted in doc.content:
   { grid, settings, terrains, features, lineStyles, textStyles,
     cells, lines, labels, regions, background }
   ============================================================ */

import type { HexCoord, HexGeom, HexOffset, HexOrientation, Point } from './hexMath';
import { findPath, hexCenter, hexDistance, hexKey, parseHexKey, pixelToHex, polylineDistance } from './hexMath';
import { newId } from '@diegesis/core';

export { hexKey, parseHexKey };
export type { HexCoord, Point };

/* ---------- grid & settings ---------- */

export interface HexGridConfig {
  cols: number;
  rows: number;
  orientation: HexOrientation;
  offset: HexOffset;
  /** circumradius in px (render units — display zoom is separate) */
  size: number;
}

export type DistanceUnit = 'm' | 'km' | 'mi';

export interface NumberingConfig {
  show: boolean;
  position: 'top' | 'bottom';
  order: 'row-col' | 'col-row';
  startRow: number;
  startCol: number;
  separator: string;
  pad: number;
  color: string;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
}

export interface HexMapSettings {
  /** real-world width of one hex (flat-to-flat) */
  hexSize: { value: number; unit: DistanceUnit };
  travelSpeed: { value: number; unit: 'km' | 'mi'; per: 'hour' | 'day' };
  /** unit used to display measured distances ('auto' picks by magnitude) */
  displayUnit: 'auto' | DistanceUnit;
  numbering: NumberingConfig;
}

/* ---------- defs (cloned per map, customizable like Hexographer) ---------- */

export interface TerrainDef {
  id: string;
  name: string;
  /** hex fill color */
  color: string;
  /** travel cost multiplier (1 = normal); ignored when impassable */
  travelCost: number;
  impassable?: boolean;
  /** built-in glyph id (see icons.tsx) drawn over the fill */
  icon: string | null;
  /** custom PNG data URL (takes precedence over `icon`) */
  iconSrc?: string | null;
  custom?: boolean;
}

export interface FeatureDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  iconSrc?: string | null;
  custom?: boolean;
}

/* ---------- styles & content ---------- */

export type LayerTag = 'natural' | 'infrastructure' | 'political';

export interface LineStyle {
  id: string;
  name: string;
  color: string;
  width: number;
  dash: boolean;
  tags: LayerTag[];
  /** travel multiplier applied when a path step follows this line (roads/trails) */
  travelMultiplier?: number;
}

export interface TextStyle {
  id: string;
  name: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  letterSpacing: number;
  uppercase: boolean;
  /** outline/halo around the glyphs for readability over terrain */
  halo: boolean;
  haloColor: string;
  tags: LayerTag[];
}

export interface HexCell {
  terrain: string | null;
  /** linked 'core/note' document (child of the map doc) with this hex's details */
  noteDocId?: string | null;
}

/**
 * A point marker on the map (Legend Keeper style): an icon with a name and a
 * linked note document. The marker type (icon/color) references a def in
 * `doc.features`; `color` overrides the def's color per pin.
 */
export interface MapPin {
  id: string;
  x: number;
  y: number;
  markerId: string;
  /** linked 'core/note' document (child of the map doc) */
  docId: string | null;
  name: string;
  color?: string | null;
}

export interface HexLine {
  id: string;
  styleId: string;
  points: Point[];
  tags: LayerTag[];
}

/** per-label overrides take precedence over the referenced text style */
export interface LabelOverride {
  size?: number;
  font?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  halo?: boolean;
  haloColor?: string;
}

export interface MapLabel {
  id: string;
  text: string;
  styleId: string;
  x: number;
  y: number;
  tags: LayerTag[];
  override?: LabelOverride;
}

export interface HexRegion {
  id: string;
  name: string;
  color: string;
  hexes: string[];
  /** thematic tags — regions can be filtered per tag in the layers panel */
  tags: LayerTag[];
  /** where the region's name appears: text inside the region or only in the map key */
  labelMode: 'inside' | 'key';
  modifiers: {
    travelMultiplier: number;
    climate: string;
    notes: string;
  };
}

export interface MapBackground {
  src: string;
  opacity: number;
  x: number;
  y: number;
  scale: number;
}

export interface HexMapDoc {
  version: 1;
  grid: HexGridConfig;
  settings: HexMapSettings;
  terrains: TerrainDef[];
  features: FeatureDef[];
  lineStyles: LineStyle[];
  textStyles: TextStyle[];
  cells: Record<string, HexCell>;
  lines: HexLine[];
  labels: MapLabel[];
  /** point markers with linked notes */
  pins: MapPin[];
  regions: HexRegion[];
  /** fog-of-war: hex keys currently hidden under the veil */
  fog: string[];
  background: MapBackground | null;
}

/* ---------- defaults ---------- */

export const DEFAULT_TERRAINS: TerrainDef[] = [
  { id: 'plains', name: 'Planície', color: '#b5c98a', travelCost: 1, icon: null },
  { id: 'farmland', name: 'Campos', color: '#cfc47a', travelCost: 1, icon: 'farmland' },
  { id: 'forest', name: 'Floresta', color: '#7ba66b', travelCost: 1.5, icon: 'trees' },
  { id: 'jungle', name: 'Selva', color: '#5d9c66', travelCost: 2, icon: 'jungle' },
  { id: 'hills', name: 'Colinas', color: '#c2ab76', travelCost: 1.5, icon: 'hills' },
  { id: 'mountains', name: 'Montanhas', color: '#9a9184', travelCost: 2.5, icon: 'mountains' },
  { id: 'snowpeaks', name: 'Picos Nevados', color: '#b8bcc4', travelCost: 3, icon: 'snowpeaks' },
  { id: 'swamp', name: 'Pântano', color: '#8fa37e', travelCost: 2, icon: 'swamp' },
  { id: 'desert', name: 'Deserto', color: '#e0cd8e', travelCost: 1.5, icon: 'desert' },
  { id: 'tundra', name: 'Tundra', color: '#c4cbc2', travelCost: 1.5, icon: 'tundra' },
  { id: 'wasteland', name: 'Ermo', color: '#b7a692', travelCost: 1, icon: 'wasteland' },
  { id: 'volcanic', name: 'Vulcânico', color: '#8f7672', travelCost: 3, icon: 'volcano' },
  { id: 'water', name: 'Água', color: '#7db3d8', travelCost: 1, impassable: true, icon: 'waves' },
  { id: 'ocean', name: 'Oceano', color: '#5b93c4', travelCost: 1, impassable: true, icon: null },
];

const FEATURE_COLOR = '#efe9db';

export const DEFAULT_FEATURES: FeatureDef[] = [
  { id: 'city', name: 'Cidade', icon: 'city', color: FEATURE_COLOR },
  { id: 'town', name: 'Vila', icon: 'town', color: FEATURE_COLOR },
  { id: 'hamlet', name: 'Aldeia', icon: 'hamlet', color: FEATURE_COLOR },
  { id: 'castle', name: 'Castelo', icon: 'castle', color: FEATURE_COLOR },
  { id: 'fort', name: 'Forte', icon: 'fort', color: FEATURE_COLOR },
  { id: 'tower', name: 'Torre', icon: 'tower', color: FEATURE_COLOR },
  { id: 'mine', name: 'Mina', icon: 'mine', color: FEATURE_COLOR },
  { id: 'cave', name: 'Caverna', icon: 'cave', color: FEATURE_COLOR },
  { id: 'dungeon', name: 'Masmorra', icon: 'dungeon', color: FEATURE_COLOR },
  { id: 'ruin', name: 'Ruína', icon: 'ruin', color: FEATURE_COLOR },
  { id: 'camp', name: 'Acampamento', icon: 'camp', color: FEATURE_COLOR },
  { id: 'temple', name: 'Templo', icon: 'temple', color: FEATURE_COLOR },
  { id: 'port', name: 'Porto', icon: 'port', color: FEATURE_COLOR },
  { id: 'bridge', name: 'Ponte', icon: 'bridge', color: FEATURE_COLOR },
  { id: 'landmark', name: 'Marco', icon: 'landmark', color: FEATURE_COLOR },
  { id: 'lair', name: 'Covil', icon: 'lair', color: FEATURE_COLOR },
];

export const DEFAULT_LINE_STYLES: LineStyle[] = [
  { id: 'river', name: 'Rio', color: '#3f7fbf', width: 3, dash: false, tags: ['natural'] },
  { id: 'coast', name: 'Costa', color: '#2c5f8f', width: 2, dash: false, tags: ['natural'] },
  { id: 'road', name: 'Estrada', color: '#7d5a3a', width: 3, dash: false, tags: ['infrastructure'], travelMultiplier: 0.75 },
  { id: 'trail', name: 'Trilha', color: '#97805a', width: 2, dash: true, tags: ['infrastructure'], travelMultiplier: 0.9 },
  { id: 'border', name: 'Fronteira', color: '#b03a2e', width: 2.5, dash: true, tags: ['political'] },
];

const TEXT_HALO = '#1e1e1e';

export const DEFAULT_TEXT_STYLES: TextStyle[] = [
  { id: 'label', name: 'Rótulo', font: 'inherit', size: 13, color: '#e8e2d6', bold: false, italic: false, letterSpacing: 0, uppercase: false, halo: true, haloColor: TEXT_HALO, tags: [] },
  { id: 'city', name: 'Cidade', font: 'inherit', size: 14, color: '#f2ecdc', bold: true, italic: false, letterSpacing: 0, uppercase: false, halo: true, haloColor: TEXT_HALO, tags: ['political'] },
  { id: 'country', name: 'País/Reino', font: 'Georgia, serif', size: 20, color: '#d9cfb6', bold: false, italic: true, letterSpacing: 3, uppercase: true, halo: true, haloColor: TEXT_HALO, tags: ['political'] },
  { id: 'river', name: 'Rio', font: 'Georgia, serif', size: 12, color: '#7db3d8', bold: false, italic: true, letterSpacing: 1, uppercase: false, halo: true, haloColor: TEXT_HALO, tags: ['natural'] },
  { id: 'mountain', name: 'Cordilheira', font: 'Georgia, serif', size: 14, color: '#cfc5ae', bold: false, italic: false, letterSpacing: 4, uppercase: true, halo: true, haloColor: TEXT_HALO, tags: ['natural'] },
];

export const DEFAULT_SETTINGS: HexMapSettings = {
  hexSize: { value: 10, unit: 'km' },
  travelSpeed: { value: 30, unit: 'km', per: 'day' },
  displayUnit: 'auto',
  numbering: {
    show: false,
    position: 'bottom',
    order: 'col-row',
    startRow: 1,
    startCol: 1,
    separator: '',
    pad: 2,
    color: '#a09a8e',
    size: 10,
    font: 'inherit',
    bold: false,
    italic: false,
  },
};

export const DEFAULT_GRID: HexGridConfig = { cols: 32, rows: 24, orientation: 'flat', offset: 'odd', size: 46 };

export const generateId = newId;

export const REGION_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d68910', '#16a085', '#e84393', '#6c7a35'];

export function createRegion(index: number): HexRegion {
  return {
    id: generateId(),
    name: `Região ${index + 1}`,
    color: REGION_COLORS[index % REGION_COLORS.length],
    hexes: [],
    tags: [],
    labelMode: 'inside',
    modifiers: { travelMultiplier: 1, climate: '', notes: '' },
  };
}

export function createDefaultHexMap(): HexMapDoc {
  return {
    version: 1,
    grid: { ...DEFAULT_GRID },
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    terrains: DEFAULT_TERRAINS.map((t) => ({ ...t })),
    features: DEFAULT_FEATURES.map((f) => ({ ...f })),
    lineStyles: DEFAULT_LINE_STYLES.map((s) => ({ ...s, tags: [...s.tags] })),
    textStyles: DEFAULT_TEXT_STYLES.map((s) => ({ ...s, tags: [...s.tags] })),
    cells: {},
    lines: [],
    labels: [],
    pins: [],
    regions: [],
    fog: [],
    background: null,
  };
}

/* ---------- (de)serialization ---------- */

export function parseHexMap(content: string | null | undefined): HexMapDoc {
  const base = createDefaultHexMap();
  if (!content) return base;
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object' || !raw.grid) return base;
    return {
      version: 1,
      grid: { ...base.grid, ...raw.grid },
      settings: {
        ...base.settings,
        ...(raw.settings ?? {}),
        numbering: { ...base.settings.numbering, ...(raw.settings?.numbering ?? {}) },
      },
      terrains: Array.isArray(raw.terrains) && raw.terrains.length > 0 ? raw.terrains : base.terrains,
      features: Array.isArray(raw.features) && raw.features.length > 0 ? raw.features : base.features,
      lineStyles: Array.isArray(raw.lineStyles) && raw.lineStyles.length > 0 ? raw.lineStyles : base.lineStyles,
      textStyles:
        Array.isArray(raw.textStyles) && raw.textStyles.length > 0
          ? raw.textStyles.map((s: Partial<TextStyle> & Pick<TextStyle, 'id'>) => ({ halo: false, haloColor: '#1e1e1e', ...s }))
          : base.textStyles,
      cells: raw.cells && typeof raw.cells === 'object' ? raw.cells : {},
      lines: Array.isArray(raw.lines) ? raw.lines : [],
      labels: Array.isArray(raw.labels) ? raw.labels : [],
      pins: Array.isArray(raw.pins) ? raw.pins : [],
      regions: Array.isArray(raw.regions)
        ? raw.regions.map((r: Partial<HexRegion> & Pick<HexRegion, 'id'>) => ({ tags: [], labelMode: 'inside' as const, ...r }))
        : [],
      fog: Array.isArray(raw.fog) ? raw.fog : [],
      background: raw.background ?? null,
    };
  } catch {
    return base;
  }
}

export function serializeHexMap(doc: HexMapDoc): string {
  return JSON.stringify(doc);
}

/* ---------- cell helpers (immutable updates) ---------- */

export const EMPTY_CELL: HexCell = { terrain: null, noteDocId: null };

export function getCell(doc: HexMapDoc, col: number, row: number): HexCell {
  return doc.cells[hexKey(col, row)] ?? EMPTY_CELL;
}

export function updateCell(doc: HexMapDoc, col: number, row: number, patch: Partial<HexCell>): HexMapDoc {
  const key = hexKey(col, row);
  const current = doc.cells[key] ?? EMPTY_CELL;
  const next: HexCell = { ...current, ...patch };
  const cells = { ...doc.cells };
  if (!next.terrain && !next.noteDocId) delete cells[key];
  else cells[key] = next;
  return { ...doc, cells };
}

/** keep only cells inside the grid (used after shrinking the map) */
export function clipCells(doc: HexMapDoc): HexMapDoc {
  const cells: Record<string, HexCell> = {};
  for (const [key, cell] of Object.entries(doc.cells)) {
    const { col, row } = parseHexKey(key);
    if (col >= 0 && col < doc.grid.cols && row >= 0 && row < doc.grid.rows) cells[key] = cell;
  }
  const regions = doc.regions.map((r) => ({ ...r, hexes: r.hexes.filter((h) => inGrid(doc.grid, h)) }));
  return { ...doc, cells, regions };
}

function inGrid(grid: HexGridConfig, key: string): boolean {
  const { col, row } = parseHexKey(key);
  return col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;
}

/* ---------- lookups ---------- */

export const terrainOf = (doc: HexMapDoc, id: string | null | undefined): TerrainDef | undefined =>
  doc.terrains.find((t) => t.id === id);

export const featureOf = (doc: HexMapDoc, id: string): FeatureDef | undefined =>
  doc.features.find((f) => f.id === id);

export interface ResolvedPin {
  name: string;
  icon: string;
  color: string;
  iconSrc: string | null;
}

/** pin visuals: per-pin color override wins, then the marker def, then fallbacks */
export function resolvePin(doc: HexMapDoc, pin: MapPin): ResolvedPin {
  const def = featureOf(doc, pin.markerId);
  return {
    name: pin.name || def?.name || 'Marcador',
    icon: def?.icon ?? 'landmark',
    color: pin.color ?? def?.color ?? '#efe9db',
    iconSrc: def?.iconSrc ?? null,
  };
}

export const lineStyleOf = (doc: HexMapDoc, id: string): LineStyle | undefined =>
  doc.lineStyles.find((s) => s.id === id);

export const textStyleOf = (doc: HexMapDoc, id: string): TextStyle | undefined =>
  doc.textStyles.find((s) => s.id === id);

export interface ResolvedLabelStyle {
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  letterSpacing: number;
  uppercase: boolean;
  halo: boolean;
  haloColor: string;
}

/** style merged with the label's own overrides (direct text editing) */
export function resolveLabelStyle(doc: HexMapDoc, label: MapLabel): ResolvedLabelStyle {
  const style = textStyleOf(doc, label.styleId);
  const o = label.override ?? {};
  return {
    font: o.font ?? style?.font ?? 'inherit',
    size: o.size ?? style?.size ?? 13,
    color: o.color ?? style?.color ?? '#3d3630',
    bold: o.bold ?? style?.bold ?? false,
    italic: o.italic ?? style?.italic ?? false,
    letterSpacing: style?.letterSpacing ?? 0,
    uppercase: style?.uppercase ?? false,
    halo: o.halo ?? style?.halo ?? false,
    haloColor: o.haloColor ?? style?.haloColor ?? '#1e1e1e',
  };
}

export const geomOf = (doc: HexMapDoc): HexGeom => ({
  orientation: doc.grid.orientation,
  offset: doc.grid.offset,
  size: doc.grid.size,
});

/* ---------- numbering ---------- */

export function hexNumber(doc: HexMapDoc, col: number, row: number): string {
  const n = doc.settings.numbering;
  const r = String(row + n.startRow).padStart(n.pad, '0');
  const c = String(col + n.startCol).padStart(n.pad, '0');
  return n.order === 'row-col' ? `${r}${n.separator}${c}` : `${c}${n.separator}${r}`;
}

/* ---------- travel rules ---------- */

export interface TravelSegment {
  from: HexCoord;
  to: HexCoord;
  /** combined multiplier for this step (terrain × road × region) */
  multiplier: number;
  /** road/trail style applied, if any */
  roadStyleId: string | null;
}

export interface TravelResult {
  path: HexCoord[];
  steps: TravelSegment[];
  /** straight hex count (path length - 1) */
  hexes: number;
  /** effective distance already weighted by multipliers, in hex units */
  effectiveHexes: number;
  /** display distance + unit */
  distance: number;
  unit: DistanceUnit;
  /** raw (unweighted) distance in the display unit */
  rawDistance: number;
  /** canonical km values (sum segments in km, convert once for display) */
  distanceKm: number;
  rawDistanceKm: number;
  /** steps through impassable terrain were charged cost 1 */
  hasImpassable: boolean;
  travelTime: { value: number; unit: 'hour' | 'day' };
}

export const UNIT_TO_KM: Record<DistanceUnit, number> = { m: 0.001, km: 1, mi: 1.609344 };

/** convert a canonical km value into the map's display unit */
export function kmToDisplay(doc: HexMapDoc, km: number): { value: number; unit: DistanceUnit } {
  const unit = resolveDisplayUnit(doc, km);
  return { value: unit === 'm' ? km * 1000 : km / UNIT_TO_KM[unit], unit };
}

export function convertDistance(value: number, from: DistanceUnit, to: DistanceUnit): number {
  return (value * UNIT_TO_KM[from]) / UNIT_TO_KM[to];
}

function pickDisplayUnit(km: number, preferMi: boolean): DistanceUnit {
  if (preferMi) return 'mi';
  if (km < 1) return 'm';
  return 'km';
}

/** unit resolved for displaying a distance of `km` under the map settings */
export function resolveDisplayUnit(doc: HexMapDoc, km: number): DistanceUnit {
  if (doc.settings.displayUnit !== 'auto') return doc.settings.displayUnit;
  const preferMi = doc.settings.hexSize.unit === 'mi' || doc.settings.travelSpeed.unit === 'mi';
  return pickDisplayUnit(km, preferMi);
}

/** regions containing a hex */
export function regionsAt(doc: HexMapDoc, col: number, row: number): HexRegion[] {
  const key = hexKey(col, row);
  return doc.regions.filter((r) => r.hexes.includes(key));
}

/** combined travel multiplier for entering (col,row) — Infinity when impassable */
export function enterCost(doc: HexMapDoc, col: number, row: number): number {
  const cell = getCell(doc, col, row);
  const terrain = terrainOf(doc, cell.terrain);
  if (terrain?.impassable) return Infinity;
  let mult = terrain?.travelCost ?? 1;
  for (const region of regionsAt(doc, col, row)) mult *= region.modifiers.travelMultiplier || 1;
  return mult;
}

/** most favorable road multiplier for a step between two hex centers (road/trail line proximity) */
export function roadMultiplier(doc: HexMapDoc, a: Point, b: Point): { mult: number; styleId: string | null } {
  const threshold = doc.grid.size * 0.5;
  let bestDiscount = 1;
  let discountId: string | null = null;
  let mildestPenalty = Infinity;
  let penaltyId: string | null = null;
  for (const line of doc.lines) {
    const style = lineStyleOf(doc, line.styleId);
    const mult = style?.travelMultiplier;
    if (!mult || mult === 1 || line.points.length < 2) continue;
    if (mult > 1 && penaltyId !== null && mult >= mildestPenalty) continue;
    if (mult < 1 && mult >= bestDiscount) continue;
    if (polylineDistance([a, b], line.points) > threshold) continue;
    if (mult < 1) {
      bestDiscount = mult;
      discountId = style!.id;
    } else {
      mildestPenalty = mult;
      penaltyId = style!.id;
    }
  }
  // the traveler takes the best available route; a slow road only counts alone
  return bestDiscount < 1 ? { mult: bestDiscount, styleId: discountId } : { mult: penaltyId ? mildestPenalty : 1, styleId: penaltyId };
}

/**
 * Full travel computation for a path of hexes: weighted distance (terrain,
 * roads, regions) converted to the display unit plus travel time from the
 * configured speed.
 */
export function computeTravel(doc: HexMapDoc, path: HexCoord[]): TravelResult | null {
  if (path.length < 2) return null;
  const geom = geomOf(doc);
  const steps: TravelSegment[] = [];
  let effective = 0;
  let hasImpassable = false;
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const base = enterCost(doc, to.col, to.row);
    if (!Number.isFinite(base)) hasImpassable = true;
    const road = roadMultiplier(doc, hexCenter(geom, from.col, from.row), hexCenter(geom, to.col, to.row));
    const multiplier = (Number.isFinite(base) ? base : 1) * road.mult;
    effective += multiplier;
    steps.push({ from, to, multiplier, roadStyleId: road.styleId });
  }
  const hexes = path.length - 1;

  const hs = doc.settings.hexSize;
  const rawDistanceKm = hexes * hs.value * UNIT_TO_KM[hs.unit];
  const distanceKm = effective * hs.value * UNIT_TO_KM[hs.unit];
  const unit = resolveDisplayUnit(doc, rawDistanceKm);
  const distance = unit === 'm' ? distanceKm * 1000 : distanceKm / UNIT_TO_KM[unit];
  const rawDistance = unit === 'm' ? rawDistanceKm * 1000 : rawDistanceKm / UNIT_TO_KM[unit];

  const speed = doc.settings.travelSpeed;
  // speed.value is already expressed per the configured time unit (km|mi per hour|day)
  const speedKmPerUnit = speed.unit === 'km' ? speed.value : speed.value * UNIT_TO_KM.mi;
  const timeValue = distanceKm / speedKmPerUnit;

  return {
    path,
    steps,
    hexes,
    effectiveHexes: effective,
    distance,
    unit,
    rawDistance,
    distanceKm,
    rawDistanceKm,
    hasImpassable,
    travelTime: { value: timeValue, unit: speed.per },
  };
}

/** A* over the map using the travel rules (terrain × region, roads as heuristic bonus) */
export function findTravelPath(doc: HexMapDoc, from: HexCoord, to: HexCoord): HexCoord[] | null {
  // heuristic must be admissible: scale by the cheapest possible step on this map
  let minMult = Infinity;
  for (const t of doc.terrains) if (!t.impassable && t.travelCost > 0) minMult = Math.min(minMult, t.travelCost);
  for (const s of doc.lineStyles) if (s.travelMultiplier && s.travelMultiplier > 0) minMult = Math.min(minMult, s.travelMultiplier);
  for (const r of doc.regions) if (r.modifiers.travelMultiplier > 0) minMult = Math.min(minMult, r.modifiers.travelMultiplier);
  const minStepCost = Number.isFinite(minMult) ? Math.max(0.05, Math.min(1, minMult)) : 1;
  return findPath(
    doc.grid,
    doc.grid.cols,
    doc.grid.rows,
    from,
    to,
    (f, t) => {
      const base = enterCost(doc, t.col, t.row);
      if (!Number.isFinite(base)) return Infinity;
      const geom = geomOf(doc);
      const road = roadMultiplier(doc, hexCenter(geom, f.col, f.row), hexCenter(geom, t.col, t.row));
      return base * road.mult;
    },
    200_000,
    minStepCost
  );
}

/** straight-line hex path distance (no pathfinding) for the ruler tool */
export function straightTravel(doc: HexMapDoc, from: HexCoord, to: HexCoord): TravelResult | null {
  const dist = hexDistance(doc.grid, from, to);
  if (dist === 0) return null;
  // interpolate hexes along the line for a straight path
  const geom = geomOf(doc);
  const a = hexCenter(geom, from.col, from.row);
  const b = hexCenter(geom, to.col, to.row);
  const path: HexCoord[] = [from];
  for (let i = 1; i <= dist; i++) {
    const t = i / dist;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const c = pixelToHex(geom, x, y);
    const last = path[path.length - 1];
    if (c.col !== last.col || c.row !== last.row) path.push(c);
  }
  return computeTravel(doc, path);
}
