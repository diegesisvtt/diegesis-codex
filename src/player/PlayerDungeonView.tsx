/* Player-side dungeon view: mesmo renderer Pixi do editor, mas read-only
   (interação desabilitada), fog opaco (audiência 'player') e câmera
   espelhada do GM via viewport empurrado pela janela principal. O conteúdo
   chega pelo broadcast docs:changed — fog pintada pelo GM aparece ao vivo. */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@diegesis/canvas';
import { gridSquarePlugin } from '@diegesis/canvas-plugin-grid-square';
import type { MapViewport } from '@shared/types';
import { parseDungeon } from '../components/editors/dungeon/model';
import { dungeonCanvasPlugin } from '../components/editors/dungeon/canvas/plugin';
import { controllerOf } from '../components/editors/dungeon/canvas/controller';
import { setDungeonAudience } from '../components/editors/dungeon/canvas/DungeonMapPlaceable';

export function PlayerDungeonView({
  content,
  viewport,
}: {
  content: string | null;
  viewport?: MapViewport | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDungeonAudience('player');
    const host = hostRef.current;
    if (!host) return;
    const initial = parseDungeon(content);
    const canvas = new Canvas(host, {
      background: '#090c12',
      plugins: [gridSquarePlugin, dungeonCanvasPlugin],
      contextMenu: false,
    });
    canvasRef.current = canvas;
    let disposed = false;
    let initialized = false;
    let destroyed = false;
    const safeDestroy = () => {
      if (destroyed) return;
      destroyed = true;
      try {
        canvas.destroy();
      } catch {
        try {
          canvas.app.destroy({ removeView: true }, { children: true });
        } catch {
          /* app já destruído */
        }
      }
    };
    void (async () => {
      try {
        await canvas.initialize();
        initialized = true;
        if (disposed) {
          safeDestroy();
          return;
        }
        const { cols, rows, cellSize } = initial.grid;
        canvas.grid.set({ type: 'square', size: cellSize });
        await canvas.draw({
          width: cols * cellSize,
          height: rows * cellSize,
          grid: { type: 'square', size: cellSize },
        });
        if (disposed) return;
        await controllerOf(canvas).hydrate(initial);
        if (disposed) return;
        canvas.setInteractionDisabled(true);
        canvas.fit();
        setReady(true);
      } catch {
        // desmontado no meio do boot
        return;
      }
    })();
    return () => {
      disposed = true;
      if (initialized) safeDestroy();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live-reload do conteúdo (fog revelada pelo GM, edições, novo mapa)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas || content == null) return;
    void controllerOf(canvas).hydrate(parseDungeon(content));
  }, [content, ready]);

  // câmera espelhada do GM (ou fit quando não há viewport)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas?.viewport) return;
    if (viewport) {
      canvas.viewport.pixi.setZoom(viewport.zoom);
      canvas.viewport.pixi.moveCenter(viewport.x, viewport.y);
    } else {
      canvas.fit();
    }
  }, [viewport, ready]);

  return <div ref={hostRef} className="pw-map" />;
}
