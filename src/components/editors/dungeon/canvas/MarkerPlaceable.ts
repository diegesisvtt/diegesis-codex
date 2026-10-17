// Marcador de dungeon: pin colorido com rótulo, arrastável pela Select tool.
// Vive como documento `dungeon-marker` na sua própria PlaceablesLayer —
// picking, drag, lock e undo vêm de graça do kernel.

import { Graphics, Text } from 'pixi.js';
import { PlaceableObject, type CanvasLike, type PlaceableObjectOptions } from '@diegesis/canvas';
import { cellKey, type DungeonMarker } from '../model';
import { controllerFor } from './controller';
import { isPlayerAudience } from './DungeonMapPlaceable';

const PIN_COLOR = '#d9a45f';
const PIN_RADIUS = 7;

export class MarkerPlaceable extends PlaceableObject<DungeonMarker> {
  readonly objectType = 'dungeon-marker';

  private readonly pin = new Graphics();
  private readonly labelText: Text;

  constructor(
    document: DungeonMarker & { id?: string },
    canvas: CanvasLike,
    options?: PlaceableObjectOptions
  ) {
    super(document, canvas, options);
    this.labelText = new Text({
      text: '',
      style: {
        fill: '#e8e2d0',
        fontSize: 11,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        stroke: { color: '#090c12', width: 3 },
      },
    });
    this.labelText.anchor.set(0.5, 0);
    this.labelText.position.set(0, PIN_RADIUS + 3);
    this.content.addChild(this.pin, this.labelText);
  }

  get bounds() {
    return { x: -PIN_RADIUS, y: -PIN_RADIUS, width: PIN_RADIUS * 2, height: PIN_RADIUS * 2 + 16 };
  }

  refresh(): void {
    // fog: na visão do jogador, markers em células não reveladas somem
    const ctrl = controllerFor(this.canvas);
    if (ctrl && isPlayerAudience()) {
      const doc = ctrl.doc();
      if (doc.fog.enabled) {
        const s = doc.grid.cellSize;
        const key = cellKey(Math.floor(this.document.x / s), Math.floor(this.document.y / s));
        this.visible = doc.fog.revealed.includes(key);
      } else {
        this.visible = true;
      }
    }
    // pin com descrição ganha a cor de destaque; vazio fica neutro
    const filled = !!this.document.description;
    const g = this.pin.clear();
    // pin: círculo + ponta inferior
    g.circle(0, 0, PIN_RADIUS).fill(filled ? PIN_COLOR : '#9aa2b8');
    g.moveTo(-4, PIN_RADIUS - 2).lineTo(0, PIN_RADIUS + 4).lineTo(4, PIN_RADIUS - 2).fill(filled ? PIN_COLOR : '#9aa2b8');
    g.circle(0, 0, PIN_RADIUS * 0.38).fill('#090c12');
    this.labelText.text = this.document.label ?? '';
    this.labelText.visible = !!this.document.label;
    this.refreshSelection();
  }
}
