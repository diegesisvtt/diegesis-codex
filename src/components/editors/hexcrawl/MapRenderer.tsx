/* ============================================================
   Hexcrawl map renderer — pure SVG layer stack, no interaction.
   Shared by the GM editor (HexcrawlMap, which adds tools and
   transient overlays as children) and the player-facing second
   window (read-only, fog fully opaque).
   ============================================================ */

import React, { useMemo } from 'react';
import {
  geomOf,
  hexKey,
  hexNumber,
  lineStyleOf,
  parseHexKey,
  resolveLabelStyle,
  resolvePin,
  type HexMapDoc,
  type LayerTag,
} from './model';
import { cornersPath, gridPixelSize, hexCenter, hexCorners, pixelToHex, regionBoundaryPath } from './hexMath';
import { getGlyph } from './icons';

/** outer world-space padding around the parchment (px) */
export const PAD = 120;
/** parchment margin between its edge and the outermost hexes (px) */
export const MARGIN = 80;
/** translate applied to the hex-space group inside the camera group */
export const ORIGIN = PAD + MARGIN;

/* theme-driven chrome colors (terrain/feature colors are map content) */
const PARCHMENT = 'var(--color-overlay)';
const PARCHMENT_EDGE = 'var(--color-line-strong)';
const GRID_STROKE = 'var(--color-line-strong)';

export interface LayerVisibility {
  natural: boolean;
  infrastructure: boolean;
  political: boolean;
  /** pins (marcadores) */
  features: boolean;
  notes: boolean;
  regions: boolean;
  fog: boolean;
  /** hex grid strokes */
  grid: boolean;
}

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface MapRendererProps {
  map: HexMapDoc;
  layers: LayerVisibility;
  camera: MapCamera;
  viewSize: { w: number; h: number };
  /** fog veil opacity — 0.78 in the GM view, ~1 in the player view */
  fogOpacity?: number;
  /** GM-only affordances: note indicators on hexes, note dots on pins */
  showSecrets?: boolean;
  /** selection highlights (GM editor only) */
  selectedLineId?: string | null;
  selectedLabelId?: string | null;
  selectedPinId?: string | null;
  /** smooth camera transitions (player window), in ms */
  transitionMs?: number;
  /** transient overlays rendered above the fog (GM editor only) */
  children?: React.ReactNode;
}

export function MapRenderer({
  map,
  layers,
  camera,
  viewSize,
  fogOpacity = 0.78,
  showSecrets = true,
  selectedLineId = null,
  selectedLabelId = null,
  selectedPinId = null,
  transitionMs,
  children,
}: MapRendererProps) {
  const geom = useMemo(
    () => geomOf(map),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map.grid.orientation, map.grid.offset, map.grid.size]
  );
  const gridSize = useMemo(() => gridPixelSize(geom, map.grid.cols, map.grid.rows), [geom, map.grid.cols, map.grid.rows]);

  /* ---------- visible range (culling) ---------- */
  const visibleRange = useMemo(() => {
    const x0 = -camera.x / camera.zoom - ORIGIN;
    const y0 = -camera.y / camera.zoom - ORIGIN;
    const x1 = (viewSize.w - camera.x) / camera.zoom - ORIGIN;
    const y1 = (viewSize.h - camera.y) / camera.zoom - ORIGIN;
    const corners = [
      pixelToHex(geom, x0, y0),
      pixelToHex(geom, x1, y0),
      pixelToHex(geom, x0, y1),
      pixelToHex(geom, x1, y1),
      pixelToHex(geom, (x0 + x1) / 2, (y0 + y1) / 2),
    ];
    const m = 2;
    return {
      col0: Math.max(0, Math.min(...corners.map((c) => c.col)) - m),
      col1: Math.min(map.grid.cols - 1, Math.max(...corners.map((c) => c.col)) + m),
      row0: Math.max(0, Math.min(...corners.map((c) => c.row)) - m),
      row1: Math.min(map.grid.rows - 1, Math.max(...corners.map((c) => c.row)) + m),
    };
  }, [camera, viewSize, geom, map.grid]);

  const tagVisible = (tags: LayerTag[]): boolean => tags.every((t) => layers[t]);

  const gridStrokePath = useMemo(() => {
    let d = '';
    for (let col = visibleRange.col0; col <= visibleRange.col1; col++) {
      for (let row = visibleRange.row0; row <= visibleRange.row1; row++) {
        d += cornersPath(hexCorners(geom, col, row));
      }
    }
    return d;
  }, [geom, visibleRange]);

  const numbering = map.settings.numbering;
  const showNumbers = numbering.show && camera.zoom * geom.size >= 15;
  const showNoteIndicators = showSecrets && layers.notes && camera.zoom * geom.size >= 12;
  const glyphSize = geom.size * 0.86;

  const visibleCells: { col: number; row: number; key: string }[] = [];
  for (let col = visibleRange.col0; col <= visibleRange.col1; col++) {
    for (let row = visibleRange.row0; row <= visibleRange.row1; row++) {
      const key = hexKey(col, row);
      if (map.cells[key]) visibleCells.push({ col, row, key });
    }
  }

  const regionHexSet = useMemo(() => {
    const out = new Map<string, { color: string; tags: LayerTag[] }>();
    if (!layers.regions) return out;
    for (const r of map.regions) for (const h of r.hexes) out.set(h, { color: r.color, tags: r.tags });
    return out;
  }, [map.regions, layers.regions]);

  /** thick outline around each region's outer boundary */
  const regionBoundaries = useMemo(() => {
    if (!layers.regions) return [];
    return map.regions
      .filter((r) => r.hexes.length > 0)
      .map((r) => ({ id: r.id, color: r.color, tags: r.tags, d: regionBoundaryPath(geom, new Set(r.hexes)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.regions, geom, layers.regions]);

  /** region name labels rendered at the centroid (labelMode 'inside') */
  const regionLabels = useMemo(() => {
    if (!layers.regions) return [];
    return map.regions
      .filter((r) => r.labelMode === 'inside' && r.hexes.length > 0)
      .map((r) => {
        let sx = 0;
        let sy = 0;
        for (const h of r.hexes) {
          const { col, row } = parseHexKey(h);
          const c = hexCenter(geom, col, row);
          sx += c.x;
          sy += c.y;
        }
        return { id: r.id, name: r.name, tags: r.tags, x: sx / r.hexes.length, y: sy / r.hexes.length };
      });
  }, [map.regions, geom, layers.regions]);

  /** fog hexes within the visible range */
  const visibleFog = useMemo(() => {
    if (!layers.fog || map.fog.length === 0) return [];
    return map.fog
      .map(parseHexKey)
      .filter((c) => c.col >= visibleRange.col0 && c.col <= visibleRange.col1 && c.row >= visibleRange.row0 && c.row <= visibleRange.row1);
  }, [map.fog, layers.fog, visibleRange]);

  const cameraProps = transitionMs
    ? {
        style: {
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transition: `transform ${transitionMs}ms ease-out`,
        },
      }
    : { transform: `translate(${camera.x},${camera.y}) scale(${camera.zoom})` };

  return (
    <g {...cameraProps}>
      <g transform={`translate(${ORIGIN},${ORIGIN})`}>
        {/* map parchment (margin keeps hexes off the edges) */}
        <rect
          x={-MARGIN}
          y={-MARGIN}
          width={gridSize.w + MARGIN * 2}
          height={gridSize.h + MARGIN * 2}
          fill={PARCHMENT}
          stroke={PARCHMENT_EDGE}
          strokeWidth={3}
        />

        {/* trace background */}
        {map.background && (
          <image
            href={map.background.src}
            x={map.background.x}
            y={map.background.y}
            width={gridSize.w * map.background.scale}
            opacity={map.background.opacity}
            preserveAspectRatio="xMinYMin meet"
          />
        )}

        {/* terrain fills + glyphs */}
        {visibleCells.map(({ col, row, key }) => {
          const cell = map.cells[key];
          const terrain = map.terrains.find((t) => t.id === cell.terrain);
          if (!terrain) return null;
          const c = hexCenter(geom, col, row);
          const Glyph = getGlyph(terrain.icon);
          return (
            <g key={key}>
              <path d={cornersPath(hexCorners(geom, col, row))} fill={terrain.color} />
              {terrain.iconSrc ? (
                <image href={terrain.iconSrc} x={c.x - glyphSize / 2} y={c.y - glyphSize / 2} width={glyphSize} height={glyphSize} />
              ) : Glyph ? (
                <g transform={`translate(${c.x - glyphSize / 2},${c.y - glyphSize / 2})`} opacity={0.55}>
                  <Glyph size={glyphSize} color="rgba(40,30,15,.8)" />
                </g>
              ) : null}
            </g>
          );
        })}

        {/* region overlays (filtered by the region's own tags) */}
        {[...regionHexSet.entries()].map(([key, r]) => {
          if (!tagVisible(r.tags)) return null;
          const { col, row } = parseHexKey(key);
          if (col < visibleRange.col0 || col > visibleRange.col1 || row < visibleRange.row0 || row > visibleRange.row1) return null;
          return (
            <path
              key={`rg-${key}`}
              d={cornersPath(hexCorners(geom, col, row))}
              fill={r.color}
              opacity={0.32}
            />
          );
        })}

        {/* thick region boundaries */}
        {regionBoundaries.map((r) =>
          tagVisible(r.tags) ? (
            <path
              key={`rb-${r.id}`}
              d={r.d}
              fill="none"
              stroke={r.color}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
          ) : null
        )}

        {/* grid strokes */}
        {layers.grid && <path d={gridStrokePath} fill="none" stroke={GRID_STROKE} strokeWidth={1} opacity={0.8} />}

        {/* region name labels (labelMode 'inside') */}
        {regionLabels.map((r) =>
          tagVisible(r.tags) ? (
            <text
              key={`rl-${r.id}`}
              x={r.x}
              y={r.y}
              textAnchor="middle"
              fontSize={geom.size * 0.34}
              fontWeight={600}
              fill="#efe9db"
              stroke="rgba(15,15,15,.85)"
              strokeWidth={geom.size * 0.09}
              strokeLinejoin="round"
              paintOrder="stroke"
              letterSpacing={2}
              style={{ textTransform: 'uppercase' }}
            >
              {r.name}
            </text>
          ) : null
        )}

        {/* styled lines */}
        {map.lines.map((line) => {
          if (!tagVisible(line.tags)) return null;
          const style = lineStyleOf(map, line.styleId);
          if (!style || line.points.length < 2) return null;
          const d = line.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          const isSelected = selectedLineId === line.id;
          return (
            <g key={line.id}>
              {isSelected && (
                <path
                  className="hx-transient"
                  d={d}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={style.width + 6}
                  opacity={0.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={style.color}
                strokeWidth={style.width}
                strokeDasharray={style.dash ? `${style.width * 2.2} ${style.width * 1.6}` : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* hex numbering */}
        {showNumbers &&
          Array.from({ length: visibleRange.col1 - visibleRange.col0 + 1 }, (_, i) => visibleRange.col0 + i).map((col) =>
            Array.from({ length: visibleRange.row1 - visibleRange.row0 + 1 }, (_, i) => visibleRange.row0 + i).map((row) => {
              const c = hexCenter(geom, col, row);
              const y = numbering.position === 'top' ? c.y - geom.size * 0.62 : c.y + geom.size * 0.78;
              return (
                <text
                  key={`n-${col}-${row}`}
                  x={c.x}
                  y={y}
                  textAnchor="middle"
                  fontSize={numbering.size}
                  fill={numbering.color}
                  fontFamily={numbering.font === 'inherit' ? undefined : numbering.font}
                  fontWeight={numbering.bold ? 700 : 400}
                  fontStyle={numbering.italic ? 'italic' : 'normal'}
                >
                  {hexNumber(map, col, row)}
                </text>
              );
            })
          )}

        {/* note indicators (GM only) */}
        {showNoteIndicators &&
          visibleCells.map(({ col, row, key }) => {
            if (!map.cells[key].noteDocId) return null;
            const c = hexCenter(geom, col, row);
            return (
              <rect
                key={`note-${key}`}
                x={c.x + geom.size * 0.32}
                y={c.y - geom.size * 0.62}
                width={geom.size * 0.28}
                height={geom.size * 0.2}
                rx={2}
                fill="var(--color-accent)"
                opacity={0.9}
              />
            );
          })}

        {/* styled labels (style merged with direct overrides) */}
        {map.labels.map((label) => {
          if (!tagVisible(label.tags)) return null;
          const s = resolveLabelStyle(map, label);
          const selected = selectedLabelId === label.id;
          return (
            <text
              key={label.id}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              fontSize={s.size}
              fill={s.color}
              fontFamily={s.font !== 'inherit' ? s.font : undefined}
              fontWeight={s.bold ? 700 : 400}
              fontStyle={s.italic ? 'italic' : 'normal'}
              letterSpacing={s.letterSpacing || undefined}
              stroke={selected ? 'var(--color-accent)' : s.halo ? s.haloColor : undefined}
              strokeWidth={selected ? Math.max(s.size * 0.22, 2) : s.halo ? s.size * 0.18 : 0}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {s.uppercase ? label.text.toUpperCase() : label.text}
            </text>
          );
        })}

        {/* pins — point markers with linked notes */}
        {layers.features &&
          map.pins.map((pin) => {
            const r = resolvePin(map, pin);
            const Glyph = getGlyph(r.icon);
            const size = geom.size * 0.52;
            const selected = selectedPinId === pin.id;
            return (
              <g key={pin.id}>
                {selected && (
                  <circle
                    className="hx-transient"
                    cx={pin.x}
                    cy={pin.y}
                    r={size * 0.78}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth={2 / camera.zoom + 1}
                  />
                )}
                <g style={{ filter: 'drop-shadow(0 0 1.5px rgba(15,15,15,.85))' }}>
                  {r.iconSrc ? (
                    <image href={r.iconSrc} x={pin.x - size / 2} y={pin.y - size / 2} width={size} height={size} />
                  ) : Glyph ? (
                    <g transform={`translate(${pin.x - size / 2},${pin.y - size / 2})`}>
                      <Glyph size={size} color={r.color} strokeWidth={2.4} />
                    </g>
                  ) : null}
                </g>
                {pin.name && camera.zoom * geom.size >= 14 && (
                  <text
                    x={pin.x}
                    y={pin.y + size * 0.85}
                    textAnchor="middle"
                    fontSize={Math.max(10, geom.size * 0.24)}
                    fontWeight={600}
                    fill="#e8e2d6"
                    stroke="#1e1e1e"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {pin.name}
                  </text>
                )}
                {showSecrets && pin.docId && (
                  <circle cx={pin.x + size * 0.42} cy={pin.y - size * 0.42} r={size * 0.16} fill="var(--color-accent)" stroke="#fff" strokeWidth={1} />
                )}
              </g>
            );
          })}

        {/* fog of war — veils everything beneath it */}
        {layers.fog &&
          visibleFog.map((c) => (
            <path
              key={`fog-${c.col},${c.row}`}
              d={cornersPath(hexCorners(geom, c.col, c.row))}
              fill="var(--color-app)"
              fillOpacity={fogOpacity}
              stroke="var(--color-app)"
              strokeWidth={2}
            />
          ))}

        {/* transient overlays (GM editor: hover/selection/draft/measure) */}
        {children}
      </g>
    </g>
  );
}
