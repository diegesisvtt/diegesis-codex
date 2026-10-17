// Exportação do mapa de dungeon: PNG via renderer Pixi (WYSIWYG) e SVG
// vetorial reconstruído do modelo (células + paredes derivadas + rótulos).

import { Rectangle } from 'pixi.js';
import type { Canvas } from '@diegesis/canvas';
import { deriveWalls, roomCenter, type DungeonMapDoc } from './model';
import { CORRIDOR_COLOR, DOOR_COLORS, ROOM_COLORS, WALL_COLOR } from './model';

function download(filename: string, href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

function slug(title: string): string {
  return title.trim().toLowerCase().replace(/[^\w]+/g, '-') || 'dungeon';
}

/** PNG do mapa (frame do grid — o stage inclui um background de 200k px) */
export async function exportPng(canvas: Canvas, title: string): Promise<void> {
  // limpa overlays de edição para não vazar no export
  canvas.preview.clear();
  canvas.clearSelection();
  const root = canvas.documents.layer('dungeon-map')?.placeables[0];
  const grid = (root?.document as DungeonMapDoc | undefined)?.grid;
  const frame = grid
    ? new Rectangle(0, 0, grid.cols * grid.cellSize, grid.rows * grid.cellSize)
    : undefined;
  const dataUrl = await canvas.app.renderer.extract.base64({ target: canvas.stage, frame });
  download(`${slug(title)}.png`, dataUrl);
}

/** SVG vetorial: células como rects, paredes como lines, números como text */
export function exportSvg(doc: DungeonMapDoc, title: string): void {
  const { cols, rows, cellSize: s } = doc.grid;
  const w = cols * s;
  const h = rows * s;
  const colorOf = new Map(doc.rooms.map((r, i) => [r.id, r.color ?? ROOM_COLORS[i % ROOM_COLORS.length]]));
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#090c12"/>`,
  ];
  for (const c of doc.cells) {
    const fill = c.kind === 'corridor' ? CORRIDOR_COLOR : (colorOf.get(c.roomId ?? '') ?? ROOM_COLORS[0]);
    parts.push(`<rect x="${c.x * s + 0.5}" y="${c.y * s + 0.5}" width="${s - 1}" height="${s - 1}" fill="${fill}"/>`);
  }
  for (const seg of deriveWalls(doc)) {
    if (seg.door) {
      // stubs de parede + marca da porta na cor do tipo
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const doorColor = DOOR_COLORS[seg.door.kind] ?? DOOR_COLORS.normal;
      parts.push(
        `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x1 + dx * 0.3}" y2="${seg.y1 + dy * 0.3}" stroke="${WALL_COLOR}" stroke-width="2.5" stroke-linecap="round"/>`,
        `<line x1="${seg.x1 + dx * 0.7}" y1="${seg.y1 + dy * 0.7}" x2="${seg.x2}" y2="${seg.y2}" stroke="${WALL_COLOR}" stroke-width="2.5" stroke-linecap="round"/>`,
        `<line x1="${seg.x1 + dx * 0.3}" y1="${seg.y1 + dy * 0.3}" x2="${seg.x1 + dx * 0.7}" y2="${seg.y1 + dy * 0.7}" stroke="${doorColor}" stroke-width="3.5" stroke-linecap="round"/>`
      );
      continue;
    }
    parts.push(
      `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="${WALL_COLOR}" stroke-width="2.5" stroke-linecap="round"/>`
    );
  }
  for (const room of doc.rooms) {
    const center = roomCenter(doc, room.id);
    if (!center) continue;
    const size = Math.max(10, s * 0.45);
    parts.push(
      `<text x="${center.x}" y="${center.y}" fill="#e8e2d0" font-size="${size}" font-weight="700" font-family="serif" text-anchor="middle" dominant-baseline="central">${room.number}</text>`
    );
  }
  parts.push('</svg>');
  const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  download(`${slug(title)}.svg`, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
