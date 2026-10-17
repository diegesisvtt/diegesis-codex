// Shape de anotação do dungeon (retângulo, elipse, seta, desenho livre,
// texto) como documento `dungeon-shape` na layer própria — picking, drag,
// seleção, context menu e undo vêm do kernel, como no hexmap.

import { Graphics, Text } from 'pixi.js';
import { PlaceableObject, type CanvasLike, type PlaceableObjectOptions } from '@diegesis/canvas';
import { cellKey, resolveFont, type DungeonShape } from '../model';
import { controllerFor } from './controller';
import { isPlayerAudience } from './DungeonMapPlaceable';

export class ShapePlaceable extends PlaceableObject<DungeonShape> {
  readonly objectType = 'dungeon-shape';

  private readonly g = new Graphics();
  private readonly labelText: Text;

  constructor(document: DungeonShape & { id?: string }, canvas: CanvasLike, options?: PlaceableObjectOptions) {
    super(document, canvas, options);
    this.labelText = new Text({
      text: '',
      style: { fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif', fill: '#d9a45f' },
    });
    this.content.addChild(this.g, this.labelText);
  }

  get bounds() {
    const s = this.document;
    if (s.type === 'text') return { x: 0, y: 0, width: this.labelText.width, height: this.labelText.height };
    if (s.type === 'rect' || s.type === 'ellipse') return { x: 0, y: 0, width: s.w ?? 0, height: s.h ?? 0 };
    const pts = s.points ?? [0, 0];
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]);
      maxX = Math.max(maxX, pts[i]);
      minY = Math.min(minY, pts[i + 1]);
      maxY = Math.max(maxY, pts[i + 1]);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  refresh(): void {
    // fog: na visão do jogador, shapes em células não reveladas somem
    const ctrl = controllerFor(this.canvas);
    if (ctrl && isPlayerAudience()) {
      const doc = ctrl.doc();
      const s = doc.grid.cellSize;
      this.visible =
        !doc.fog.enabled ||
        doc.fog.revealed.includes(cellKey(Math.floor(this.document.x / s), Math.floor(this.document.y / s)));
    }

    const shape = this.document;
    const color = shape.color;
    const g = this.g.clear();
    this.labelText.visible = false;
    switch (shape.type) {
      case 'rect':
        g.rect(0, 0, shape.w ?? 0, shape.h ?? 0);
        if (shape.fill) g.fill({ color, alpha: 0.25 });
        g.stroke({ width: 2, color });
        break;
      case 'ellipse':
        g.ellipse((shape.w ?? 0) / 2, (shape.h ?? 0) / 2, Math.abs((shape.w ?? 0) / 2), Math.abs((shape.h ?? 0) / 2));
        if (shape.fill) g.fill({ color, alpha: 0.25 });
        g.stroke({ width: 2, color });
        break;
      case 'freehand': {
        const pts = shape.points ?? [];
        if (pts.length >= 4) {
          g.moveTo(pts[0], pts[1]);
          for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
          g.stroke({ width: 2, color, cap: 'round', join: 'round' });
        }
        break;
      }
      case 'arrow': {
        const pts = shape.points ?? [];
        if (pts.length >= 4) {
          g.moveTo(pts[0], pts[1]);
          for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
          // ponta na direção do último segmento
          const n = pts.length;
          const x1 = pts[n - 4];
          const y1 = pts[n - 3];
          const x2 = pts[n - 2];
          const y2 = pts[n - 1];
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = 9;
          g.moveTo(x2, y2)
            .lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45))
            .moveTo(x2, y2)
            .lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
          g.stroke({ width: 2, color, cap: 'round' });
        }
        break;
      }
      case 'text': {
        this.labelText.text = shape.text ?? '';
        this.labelText.style = {
          fill: color,
          fontFamily: resolveFont(shape.font),
          fontSize: shape.size ?? 15,
          fontWeight: shape.bold ? '700' : '400',
          fontStyle: shape.italic ? 'italic' : 'normal',
          // halo para legibilidade sobre o mapa (padrão do hexmap)
          stroke: { color: '#090c12', width: 3 },
        };
        this.labelText.visible = true;
        break;
      }
    }
    this.refreshSelection();
  }
}
