/* Player-facing hexcrawl map: read-only, fog of war fully opaque,
   camera driven by the GM (viewport pushed over IPC) with smooth
   transitions. Re-parses the doc content whenever it changes, so fog
   painted by the GM appears here in realtime. */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewport } from '@shared/types';
import { geomOf, parseHexMap } from '../components/editors/hexcrawl/model';
import { gridPixelSize } from '../components/editors/hexcrawl/hexMath';
import { MARGIN, ORIGIN, MapRenderer, type LayerVisibility, type MapCamera } from '../components/editors/hexcrawl/MapRenderer';

const PLAYER_LAYERS: LayerVisibility = {
  natural: true,
  infrastructure: true,
  political: true,
  features: true,
  notes: false,
  regions: true,
  fog: true,
  grid: true,
};

export function PlayerMapView({ content, viewport }: { content: string | null; viewport?: MapViewport | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ w: 800, h: 600 });

  const map = useMemo(() => parseHexMap(content), [content]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // no GM viewport yet: frame the whole map (same math as the editor's fitToMap)
  const fitCamera = useMemo<MapCamera>(() => {
    const geom = geomOf(map);
    const gridSize = gridPixelSize(geom, map.grid.cols, map.grid.rows);
    const contentW = gridSize.w + MARGIN * 2;
    const contentH = gridSize.h + MARGIN * 2;
    const zoom = Math.max(0.15, Math.min(2, Math.min(viewSize.w / contentW, viewSize.h / contentH) * 0.96));
    return {
      zoom,
      x: viewSize.w / 2 - (ORIGIN + gridSize.w / 2) * zoom,
      y: viewSize.h / 2 - (ORIGIN + gridSize.h / 2) * zoom,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.grid, viewSize]);

  // the viewport is a hex-space world CENTER + zoom (window-size independent);
  // rebuild this window's screen transform from its own view size
  const camera = useMemo<MapCamera>(() => {
    if (!viewport) return fitCamera;
    return {
      zoom: viewport.zoom,
      x: viewSize.w / 2 - (viewport.x + ORIGIN) * viewport.zoom,
      y: viewSize.h / 2 - (viewport.y + ORIGIN) * viewport.zoom,
    };
  }, [viewport, fitCamera, viewSize]);

  return (
    <div ref={containerRef} className="pw-map">
      <svg>
        <MapRenderer
          map={map}
          layers={PLAYER_LAYERS}
          camera={camera}
          viewSize={viewSize}
          fogOpacity={1}
          showSecrets={false}
          transitionMs={350}
        />
      </svg>
    </div>
  );
}
