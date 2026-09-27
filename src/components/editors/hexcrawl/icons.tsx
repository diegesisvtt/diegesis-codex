/* ============================================================
   Built-in hex icon set — stroke-based SVG glyphs (24x24 grid,
   lucide-style) rendered inside hexes for terrains and features.
   Custom PNGs (data URLs) are used instead when a def sets `iconSrc`.
   ============================================================ */

import React from 'react';

export interface GlyphProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export type Glyph = React.FC<GlyphProps>;

function makeGlyph(paths: React.ReactNode): Glyph {
  return function Glyph({ size = 24, color = 'currentColor', strokeWidth = 1.8 }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        // lets glyph sub-paths filled with currentColor follow the color prop
        style={{ color }}
      >
        {paths}
      </svg>
    );
  };
}

/* ---------- terrain glyphs (overlay on the fill color) ---------- */

export const TERRAIN_ICONS: Record<string, Glyph> = {
  trees: makeGlyph(
    <>
      <path d="M7 20v-6M4 14l3-8 3 8H4z" />
      <path d="M17 20v-5M14 15l3-7 3 7h-6z" />
      <path d="M12 20v-3" />
    </>
  ),
  jungle: makeGlyph(
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c-4 0-6-3-6-6 4 0 6 2 6 6z" />
      <path d="M12 13c4 0 6-3 6-6-4 0-6 2-6 6z" />
      <path d="M8 21c0-3 1.5-4 4-4s4 1 4 4" />
    </>
  ),
  hills: makeGlyph(
    <>
      <path d="M2 18c2-4 4-6 6-6s3 2 4 4" />
      <path d="M12 16c1.5-3 3.5-5 5.5-5S21 14 22 16" />
    </>
  ),
  mountains: makeGlyph(
    <>
      <path d="M3 19L9 7l4 7 2-3 6 8H3z" />
      <path d="M9 7l1.5 2.6L9 11l-1.5-1.4L9 7z" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  snowpeaks: makeGlyph(
    <>
      <path d="M3 19L9 7l4 7 2-3 6 8H3z" />
      <path d="M7.5 9.5L9 7l1.5 2.5L9 11l-1.5-1.5zM14.5 12.5L15 11l1 1.5-1 1-1-1z" fill="#fff" stroke="none" />
    </>
  ),
  waves: makeGlyph(
    <>
      <path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </>
  ),
  desert: makeGlyph(
    <>
      <circle cx="6" cy="9" r=".6" fill="currentColor" />
      <circle cx="12" cy="7" r=".6" fill="currentColor" />
      <circle cx="18" cy="10" r=".6" fill="currentColor" />
      <circle cx="9" cy="13" r=".6" fill="currentColor" />
      <circle cx="15" cy="15" r=".6" fill="currentColor" />
      <path d="M3 19c3-2 6-2 9 0s6 2 9 0" />
    </>
  ),
  swamp: makeGlyph(
    <>
      <path d="M6 20v-8M6 12c-2-1-2-4 0-5 2 1 2 4 0 5z" />
      <path d="M12 20v-6" />
      <path d="M18 20v-9M18 11c-2-1-2-4 0-5 2 1 2 4 0 5z" />
      <path d="M2 20h20" />
    </>
  ),
  farmland: makeGlyph(
    <>
      <path d="M4 6c4 2 12 2 16 0M4 11c4 2 12 2 16 0M4 16c4 2 12 2 16 0" />
    </>
  ),
  volcano: makeGlyph(
    <>
      <path d="M5 20l4-9h6l4 9H5z" />
      <path d="M10 11c0-2 1-2 1-4M14 11c0-2-1-2-1-4M12 10V6" />
    </>
  ),
  tundra: makeGlyph(
    <>
      <path d="M12 4v16M6 6l12 12M18 6L6 18" opacity=".7" />
      <path d="M12 8l-2-2M12 8l2-2M12 16l-2 2M12 16l2 2" />
    </>
  ),
  wasteland: makeGlyph(
    <>
      <path d="M4 8l3 2-2 3 4 2M20 9l-3 2 2 3-4 2M10 18l2-2 3 2" />
    </>
  ),
};

/* ---------- feature glyphs (settlements, sites...) ---------- */

export const FEATURE_ICONS: Record<string, Glyph> = {
  city: makeGlyph(
    <>
      <rect x="3" y="10" width="6" height="10" />
      <rect x="11" y="6" width="6" height="14" />
      <path d="M17 12h4v8h-4zM6 13v2M6 17v2M14 9v2M14 13v2M14 17v2" />
    </>
  ),
  town: makeGlyph(
    <>
      <path d="M4 20v-8l5-4 5 4v8" />
      <path d="M14 20v-6l4-3 3 3v6" />
      <path d="M2 20h20M8 20v-4h2v4" />
    </>
  ),
  hamlet: makeGlyph(
    <>
      <path d="M5 20v-7l6-5 6 5v7" />
      <path d="M3 20h18M10 20v-4h4v4" />
    </>
  ),
  castle: makeGlyph(
    <>
      <path d="M5 21V9h3V6h2v3h4V6h2v3h3v12H5z" />
      <path d="M10 21v-4a2 2 0 014 0v4" />
    </>
  ),
  fort: makeGlyph(
    <>
      <path d="M4 20V10l8-6 8 6v10" />
      <path d="M2 20h20" />
      <path d="M12 4v6M9 20v-3h6v3" />
    </>
  ),
  tower: makeGlyph(
    <>
      <path d="M8 21V8h8v13" />
      <path d="M7 8V5h2v2h2V5h2v2h2V5h2v3" />
      <path d="M6 21h12" />
    </>
  ),
  mine: makeGlyph(
    <>
      <path d="M4 20a8 8 0 0116 0" />
      <path d="M8 20a4 4 0 018 0" />
      <path d="M12 3v4M9 5l6 2M15 5l-6 2" />
    </>
  ),
  cave: makeGlyph(
    <>
      <path d="M3 20c2-8 5-12 9-12s7 4 9 12" />
      <path d="M8.5 20c1-4.5 2-6.5 3.5-6.5s2.5 2 3.5 6.5" />
    </>
  ),
  dungeon: makeGlyph(
    <>
      <rect x="5" y="8" width="14" height="12" />
      <path d="M5 8l7-5 7 5" />
      <path d="M10 20v-5h4v5M12 3v3" />
    </>
  ),
  ruin: makeGlyph(
    <>
      <path d="M5 21V9M19 21V7M9 21v-6M13 21v-4" />
      <path d="M5 9h4M15 7h4M9 15h4" />
      <path d="M3 21h18" />
    </>
  ),
  camp: makeGlyph(
    <>
      <path d="M12 6L4 20h16L12 6z" />
      <path d="M12 13l-3 7h6l-3-7z" />
    </>
  ),
  temple: makeGlyph(
    <>
      <path d="M4 9l8-6 8 6" />
      <path d="M6 9v10M10 9v10M14 9v10M18 9v10" />
      <path d="M3 19h18M3 22h18" />
    </>
  ),
  port: makeGlyph(
    <>
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8v12" />
      <path d="M5 13c0 5 3 8 7 8s7-3 7-8" />
      <path d="M3 13h4M17 13h4" />
    </>
  ),
  bridge: makeGlyph(
    <>
      <path d="M3 10h18" />
      <path d="M4 10v8M20 10v8" />
      <path d="M4 14a8 8 0 0116 0" />
    </>
  ),
  landmark: makeGlyph(
    <>
      <path d="M12 2l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6-5-2.9-5 2.9 1.2-5.6L4 7.9l5.6-.6L12 2z" />
    </>
  ),
  lair: makeGlyph(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
    </>
  ),
};

export function getGlyph(id: string | null | undefined): Glyph | null {
  if (!id) return null;
  return TERRAIN_ICONS[id] ?? FEATURE_ICONS[id] ?? null;
}
