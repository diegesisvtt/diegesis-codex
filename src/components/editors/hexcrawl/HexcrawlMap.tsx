/* ============================================================
   Hexcrawl map editor — tldraw-inspired canvas
   SVG renderer with camera (pan/zoom), tool state machine and
   fixed z-ordering: terrain < regions < features < lines < text.
   ============================================================ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileCode, Image as ImageIcon, Maximize, Minus, Plus } from 'lucide-react';
import type { DocNode, MapViewport } from '@shared/types';
import { REF_DRAG_MIME, parseExplorerDragRef } from '@shared/dragDrop';
import { useStore, useRealmFonts } from '../../../state/store';
import { ContextMenu, type CtxMenuEntry } from '../../ContextMenu';
import {
  computeTravel,
  createRegion,
  findTravelPath,
  generateId,
  geomOf,
  hexKey,
  hexNumber,
  kmToDisplay,
  lineStyleOf,
  parseHexMap,
  resolveDisplayUnit,
  resolveLabelStyle,
  resolvePin,
  serializeHexMap,
  straightTravel,
  textStyleOf,
  updateCell,
  type DistanceUnit,
  type HexLine,
  type HexMapDoc,
  type LabelOverride,
  type MapLabel,
  type MapPin,
  type TravelResult,
} from './model';
import {
  cornersPath,
  edgePathBetween,
  gridPixelSize,
  hexCenter,
  hexCorners,
  nearestCorner,
  pixelToHex,
  pointToSegmentDistance,
  type HexCoord,
  type Point,
} from './hexMath';
import { getGlyph } from './icons';
import { HexcrawlToolbar, HexPalette, type HexTool, type PanelTab } from './Toolbar';
import { HexSidePanel } from './SidePanel';
import { ConfirmModal } from './ConfirmDelete';
import { MARGIN, ORIGIN, MapRenderer, type LayerVisibility, type MapCamera } from './MapRenderer';

export type { LayerVisibility } from './MapRenderer';

const CANVAS_BG = 'var(--color-app)';

const PANEL_MIN = 220;
const PANEL_MAX = 560;
const PANEL_DEFAULT = 288;

/** literal values used to resolve the CSS vars above in standalone SVG/PNG exports */
const EXPORT_VARS: Record<string, string> = {
  'var(--color-overlay)': '#161d2e',
  'var(--color-app)': '#090c12',
  'var(--color-line-strong)': 'rgba(148,163,184,0.18)',
  'var(--color-accent)': '#38bdf8',
  'var(--color-danger)': '#f43f5e',
};

export function HexcrawlMap({ doc, onCameraChange }: { doc: DocNode; onCameraChange?: (viewport: MapViewport) => void }) {
  const { updateDocument } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [map, setMapState] = useState<HexMapDoc>(() => parseHexMap(doc.content));
  /** only persist after the first real mutation (never on mount) */
  const dirty = useRef(false);

  /* ---------- undo/redo ----------
     Time-grouped history: mutations separated by >500ms start a new undo
     step, so paint strokes and typing collapse into one entry each. */
  const past = useRef<HexMapDoc[]>([]);
  const future = useRef<HexMapDoc[]>([]);
  const lastMutateTs = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0);

  const setMap: React.Dispatch<React.SetStateAction<HexMapDoc>> = useCallback((action) => {
    dirty.current = true;
    const now = performance.now();
    if (now - lastMutateTs.current > 500) {
      past.current.push(mapRef.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      setHistoryVersion((v) => v + 1);
    }
    lastMutateTs.current = now;
    setMapState(action);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(mapRef.current);
    lastMutateTs.current = 0;
    dirty.current = true;
    setMapState(prev);
    setHistoryVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(mapRef.current);
    lastMutateTs.current = 0;
    dirty.current = true;
    setMapState(next);
    setHistoryVersion((v) => v + 1);
  }, []);

  const [camera, setCamera] = useState({ x: 60, y: 40, zoom: 1 });
  const [viewSize, setViewSize] = useState({ w: 800, h: 600 });

  const [tool, setTool] = useState<HexTool>('terrain');
  const [snap, setSnap] = useState(true);
  const [panel, setPanel] = useState<PanelTab | null>(null);

  /** companion panels open together with their tool (region→Regiões, measure→Viagem) */
  const TOOL_PANEL: Partial<Record<HexTool, PanelTab>> = { region: 'regions', measure: 'travel' };
  const activateTool = useCallback((t: HexTool) => {
    setTool(t);
    const companion = TOOL_PANEL[t];
    if (companion) setPanel(companion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTerrain, setActiveTerrain] = useState('plains');
  const [activeMarker, setActiveMarker] = useState('city');
  const [activeLineStyle, setActiveLineStyle] = useState('river');
  const [activeTextStyle, setActiveTextStyle] = useState('label');
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);

  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [labelEditorId, setLabelEditorId] = useState<string | null>(null);
  const [pinEditorId, setPinEditorId] = useState<string | null>(null);
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null);
  /** raw world point under the cursor (only tracked while a placement ghost is shown) */
  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);
  /** pin/label under the cursor with the select tool (hover affordance) */
  const [hoverSel, setHoverSel] = useState<{ kind: 'pin' | 'label'; id: string } | null>(null);

  const [draftLine, setDraftLine] = useState<Point[] | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const [measureMode, setMeasureMode] = useState<'path' | 'straight'>('path');
  const [measureAnchors, setMeasureAnchors] = useState<HexCoord[]>([]);
  const [previewHex, setPreviewHex] = useState<HexCoord | null>(null);
  const previewTs = useRef(0);

  const [layers, setLayers] = useState<LayerVisibility>({
    natural: true,
    infrastructure: true,
    political: true,
    features: true,
    notes: true,
    regions: true,
    fog: true,
    grid: true,
  });
  const [showKey, setShowKey] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmLabelDelete, setConfirmLabelDelete] = useState(false);
  const [confirmPinDelete, setConfirmPinDelete] = useState(false);
  const realmFonts = useRealmFonts();
  const { docs, createDocument, openDocument, uiState, saveUiState } = useStore();

  // linked notes show their Notion-style page icon on the pin (same as the Explorer)
  const pinDocIcon = useCallback((docId: string) => docs.find((d) => d.id === docId)?.icon, [docs]);

  /* ---------- resizable side panel (mirrors the AI panel in App.tsx) ---------- */
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(uiState.hexmapPanelWidth ?? PANEL_DEFAULT);
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

  const startPanelDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const right = root.getBoundingClientRect().right;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, right - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveUiState({ hexmapPanelWidth: panelWidthRef.current });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* ---------- persistence (debounced, flush on unmount) ---------- */
  const mapRef = useRef(map);
  mapRef.current = map;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updateDocument(doc.id, { content: serializeHexMap(mapRef.current) }), 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [map, doc.id, updateDocument]);
  useEffect(
    () => () => {
      if (dirty.current) updateDocument(doc.id, { content: serializeHexMap(mapRef.current) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.id]
  );

  /* ---------- container size ---------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- zoom (non-passive wheel) ---------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setCamera((cam) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const zoom = Math.min(4, Math.max(0.15, cam.zoom * factor));
        const wx = (sx - cam.x) / cam.zoom;
        const wy = (sy - cam.y) / cam.zoom;
        return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ---------- coordinate helpers ---------- */
  const geom = useMemo(
    () => geomOf(map),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map.grid.orientation, map.grid.offset, map.grid.size]
  );
  const gridSize = useMemo(() => gridPixelSize(geom, map.grid.cols, map.grid.rows), [geom, map.grid.cols, map.grid.rows]);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - camera.x) / camera.zoom - ORIGIN,
        y: (clientY - rect.top - camera.y) / camera.zoom - ORIGIN,
      };
    },
    [camera]
  );

  const worldToScreen = useCallback(
    (p: Point): Point => ({ x: (p.x + ORIGIN) * camera.zoom + camera.x, y: (p.y + ORIGIN) * camera.zoom + camera.y }),
    [camera]
  );

  const inGrid = useCallback((c: HexCoord) => c.col >= 0 && c.col < map.grid.cols && c.row >= 0 && c.row < map.grid.rows, [map.grid]);

  /* ---------- camera: fit + zoom controls ---------- */
  const fitToMap = useCallback(() => {
    const contentW = gridSize.w + MARGIN * 2;
    const contentH = gridSize.h + MARGIN * 2;
    const zoom = Math.max(0.15, Math.min(2, Math.min(viewSize.w / contentW, viewSize.h / contentH) * 0.96));
    setCamera({
      zoom,
      x: viewSize.w / 2 - (ORIGIN + gridSize.w / 2) * zoom,
      y: viewSize.h / 2 - (ORIGIN + gridSize.h / 2) * zoom,
    });
  }, [gridSize, viewSize]);

  const zoomBy = useCallback((factor: number) => {
    setCamera((cam) => {
      const zoom = Math.min(4, Math.max(0.15, cam.zoom * factor));
      const cx = viewSize.w / 2;
      const cy = viewSize.h / 2;
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { zoom, x: cx - wx * zoom, y: cy - wy * zoom };
    });
  }, [viewSize]);

  // first open: fit the whole map into view (camera is not persisted)
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!didInitialFit.current && viewSize.w > 100) {
      didInitialFit.current = true;
      fitToMap();
    }
  }, [viewSize, fitToMap]);

  /* ---------- camera change notifications (throttled ~15/s) ----------
     Reports the viewport as a hex-space world CENTER + zoom (independent of
     window size) so the player-view plugin can mirror the GM viewport. */
  const cameraNotifyLast = useRef(0);
  const cameraNotifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const toWorldCenter = useCallback(
    (cam: MapCamera): MapViewport => ({
      x: (viewSize.w / 2 - cam.x) / cam.zoom - ORIGIN,
      y: (viewSize.h / 2 - cam.y) / cam.zoom - ORIGIN,
      zoom: cam.zoom,
    }),
    [viewSize]
  );
  useEffect(() => {
    const cb = onCameraChangeRef.current;
    // nothing meaningful to report before the initial fit
    if (!cb || !didInitialFit.current) return;
    const now = performance.now();
    const elapsed = now - cameraNotifyLast.current;
    if (elapsed >= 66) {
      cameraNotifyLast.current = now;
      cb(toWorldCenter(camera));
    } else if (!cameraNotifyTimer.current) {
      cameraNotifyTimer.current = setTimeout(() => {
        cameraNotifyTimer.current = null;
        cameraNotifyLast.current = performance.now();
        onCameraChangeRef.current?.(toWorldCenter(camera));
      }, 66 - elapsed);
    }
  }, [camera, toWorldCenter]);
  useEffect(
    () => () => {
      if (cameraNotifyTimer.current) clearTimeout(cameraNotifyTimer.current);
    },
    []
  );

  /* ---------- space-held panning / Alt-held snap bypass ---------- */
  const [spaceDown, setSpaceDown] = useState(false);
  const [altDown, setAltDown] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (e.key === 'Alt') setAltDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceDown(false);
      if (e.key === 'Alt') setAltDown(false);
    };
    const blur = () => {
      setSpaceDown(false);
      setAltDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  /** Alt temporarily disables snap while held */
  const effectiveSnap = snap && !altDown;

  /* ---------- gestures ---------- */
  type Gesture =
    | { kind: 'pan'; startX: number; startY: number; camX: number; camY: number }
    | { kind: 'paint'; erase: boolean; lastKey: string | null }
    | { kind: 'region'; remove: boolean; lastKey: string | null }
    | { kind: 'fog'; remove: boolean; lastKey: string | null }
    | { kind: 'pin-drag'; id: string; dx: number; dy: number; moved: boolean }
    | { kind: 'label-drag'; id: string; dx: number; dy: number; moved: boolean }
    | { kind: 'maybe-select'; startX: number; startY: number; camX: number; camY: number; moved: boolean };
  const gestureRef = useRef<Gesture | null>(null);
  /** set when the right button was consumed by a tool gesture — suppresses the context menu that follows */
  const suppressCtxMenu = useRef(false);

  /* ---------- mutations ---------- */
  const paintTerrain = useCallback(
    (c: HexCoord, erase: boolean) => {
      if (!inGrid(c)) return;
      setMap((m) => updateCell(m, c.col, c.row, { terrain: erase ? null : activeTerrain }));
    },
    [activeTerrain, inGrid, setMap]
  );

  const paintRegion = useCallback(
    (c: HexCoord, remove: boolean) => {
      if (!inGrid(c)) return;
      const key = hexKey(c.col, c.row);
      if (remove) {
        // right-click strips the hex from whichever region contains it
        setMap((m) => ({ ...m, regions: m.regions.map((r) => (r.hexes.includes(key) ? { ...r, hexes: r.hexes.filter((h) => h !== key) } : r)) }));
        return;
      }
      let rid = activeRegionId;
      if (!rid || !mapRef.current.regions.some((r) => r.id === rid)) {
        const region = createRegion(mapRef.current.regions.length);
        rid = region.id;
        setMap((m) => ({ ...m, regions: [...m.regions, region] }));
        setActiveRegionId(rid);
      }
      setMap((m) => ({
        ...m,
        regions: m.regions.map((r) => (r.id === rid && !r.hexes.includes(key) ? { ...r, hexes: [...r.hexes, key] } : r)),
      }));
    },
    [activeRegionId, inGrid, setMap]
  );

  const paintFog = useCallback(
    (c: HexCoord, remove: boolean) => {
      if (!inGrid(c)) return;
      const key = hexKey(c.col, c.row);
      setMap((m) => ({
        ...m,
        fog: remove ? m.fog.filter((h) => h !== key) : m.fog.includes(key) ? m.fog : [...m.fog, key],
      }));
    },
    [inGrid, setMap]
  );

  const createPin = useCallback(
    (p: Point, overrides?: Partial<MapPin>) => {
      const pin: MapPin = { id: generateId(), x: p.x, y: p.y, markerId: activeMarker, docId: null, name: '', ...overrides };
      setMap((m) => ({ ...m, pins: [...m.pins, pin] }));
      setSelectedPinId(pin.id);
      setSelectedLabelId(null);
      setSelectedLineId(null);
      // pins dropped from the Explorer already have a name + note: select, don't edit
      if (!overrides?.docId) setPinEditorId(pin.id);
    },
    [activeMarker, setMap]
  );

  const updatePin = useCallback(
    (id: string, patch: Partial<MapPin>) => {
      setMap((m) => ({ ...m, pins: m.pins.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    },
    [setMap]
  );

  /* ---------- Explorer note drag-drop ----------
     Dropping a note from the Explorer creates a pin linked to that note.
     react-dnd's HTML5 backend (behind the Explorer tree) force-sets
     dropEffect='none' in a window-level dragover handler whenever the pointer
     is outside its own drop targets — which suppresses the drop event even
     after our preventDefault. That handler lives on window and was registered
     at app boot, so a window listener registered here (on mount) runs AFTER
     it and wins. (Same workaround as the whiteboard.) */
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(REF_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    window.addEventListener('dragover', onDragOver);
    return () => window.removeEventListener('dragover', onDragOver);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(REF_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const ref = parseExplorerDragRef(e.dataTransfer.getData(REF_DRAG_MIME));
      if (!ref || ref.kind !== 'note') return;
      e.preventDefault();
      const p = screenToWorld(e.clientX, e.clientY);
      const hex = pixelToHex(geom, p.x, p.y);
      const pt = effectiveSnap && inGrid(hex) ? hexCenter(geom, hex.col, hex.row) : p;
      const title = docs.find((d) => d.id === ref.docId)?.title ?? '';
      createPin(pt, { docId: ref.docId, name: title });
    },
    [docs, screenToWorld, effectiveSnap, inGrid, geom, createPin]
  );

  const commitDraftLine = useCallback(() => {
    setDraftLine((draft) => {
      if (!draft) return null;
      // drop consecutive near-duplicate points (double-click adds the last point twice)
      const epsilon = mapRef.current.grid.size * 0.08;
      const points = draft.filter((p, i) => i === 0 || Math.hypot(p.x - draft[i - 1].x, p.y - draft[i - 1].y) > epsilon);
      if (points.length >= 2) {
        const style = lineStyleOf(mapRef.current, activeLineStyle);
        const line: HexLine = { id: generateId(), styleId: activeLineStyle, points, tags: style?.tags ?? [] };
        setMap((m) => ({ ...m, lines: [...m.lines, line] }));
      }
      return null;
    });
  }, [activeLineStyle, setMap]);

  const createLabel = useCallback(
    (p: Point) => {
      const style = textStyleOf(mapRef.current, activeTextStyle);
      const label: MapLabel = { id: generateId(), text: 'Texto', styleId: activeTextStyle, x: p.x, y: p.y, tags: style?.tags ?? [] };
      setMap((m) => ({ ...m, labels: [...m.labels, label] }));
      setSelectedLabelId(label.id);
      setSelectedLineId(null);
      setLabelEditorId(label.id);
    },
    [activeTextStyle, setMap]
  );

  const updateLabel = useCallback(
    (id: string, patch: Partial<MapLabel>) => {
      setMap((m) => ({ ...m, labels: m.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    },
    [setMap]
  );

  const updateLabelOverride = useCallback(
    (id: string, patch: Partial<LabelOverride>) => {
      setMap((m) => ({ ...m, labels: m.labels.map((l) => (l.id === id ? { ...l, override: { ...l.override, ...patch } } : l)) }));
    },
    [setMap]
  );

  /** switch a label to another preset style (clears direct overrides) */
  const applyLabelStyle = useCallback(
    (id: string, styleId: string) => {
      setMap((m) => {
        const style = textStyleOf(m, styleId);
        return {
          ...m,
          labels: m.labels.map((l) => (l.id === id ? { ...l, styleId, tags: style?.tags ?? l.tags, override: undefined } : l)),
        };
      });
    },
    [setMap]
  );

  /** Ctrl+D — duplicate the selected label/line with an offset */
  const duplicateSelection = useCallback(() => {
    const off = mapRef.current.grid.size * 0.6;
    if (selectedLabelId) {
      const id = generateId();
      setMap((m) => ({
        ...m,
        labels: [
          ...m.labels,
          ...m.labels.filter((l) => l.id === selectedLabelId).map((l) => ({ ...l, id, x: l.x + off, y: l.y + off })),
        ],
      }));
      setSelectedLabelId(id);
      return;
    }
    if (selectedLineId) {
      const id = generateId();
      setMap((m) => ({
        ...m,
        lines: [
          ...m.lines,
          ...m.lines
            .filter((l) => l.id === selectedLineId)
            .map((l) => ({ ...l, id, points: l.points.map((p) => ({ x: p.x + off, y: p.y + off })) })),
        ],
      }));
      setSelectedLineId(id);
    }
  }, [selectedLabelId, selectedLineId, setMap]);

  /* ---------- pointer handlers ---------- */
  const hexAt = useCallback((p: Point): HexCoord => pixelToHex(geom, p.x, p.y), [geom]);

  const hitTestPin = useCallback(
    (p: Point): MapPin | null => {
      const r = geom.size * 0.45;
      for (let i = map.pins.length - 1; i >= 0; i--) {
        const pin = map.pins[i];
        if (Math.hypot(p.x - pin.x, p.y - pin.y) <= r) return pin;
      }
      return null;
    },
    [map, geom]
  );

  const hitTestLabel = useCallback(
    (p: Point): MapLabel | null => {
      for (let i = map.labels.length - 1; i >= 0; i--) {
        const label = map.labels[i];
        const size = resolveLabelStyle(map, label).size;
        const w = label.text.length * size * 0.62 + 8;
        if (Math.abs(p.x - label.x) <= w / 2 + 6 && Math.abs(p.y - label.y) <= size * 0.8 + 6) return label;
      }
      return null;
    },
    [map]
  );

  const hitTestLine = useCallback(
    (p: Point): HexLine | null => {
      const threshold = Math.max(8 / camera.zoom, 5);
      for (let i = map.lines.length - 1; i >= 0; i--) {
        const line = map.lines[i];
        for (let j = 0; j < line.points.length - 1; j++) {
          if (pointToSegmentDistance(p, line.points[j], line.points[j + 1]) <= threshold) return line;
        }
      }
      return null;
    },
    [map, camera.zoom]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = screenToWorld(e.clientX, e.clientY);
    const hex = hexAt(p);

    // these tools consume the right button as a gesture (erase/reveal/undo-point)
    if (e.button === 2 && (tool === 'terrain' || tool === 'region' || tool === 'fog' || tool === 'line')) {
      suppressCtxMenu.current = true;
    }
    // safety: a stale suppression (e.g. canceled pointer) never eats a left click's menu
    if (e.button === 0) suppressCtxMenu.current = false;

    // middle button / hand tool / space-held always pans
    if (e.button === 1 || tool === 'pan' || (spaceDown && e.button === 0)) {
      // the hand tool consumes the right button as a pan gesture — no menu on release
      if (e.button === 2) suppressCtxMenu.current = true;
      gestureRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y };
      return;
    }

    if (tool === 'terrain') {
      const erase = e.button === 2;
      gestureRef.current = { kind: 'paint', erase, lastKey: hexKey(hex.col, hex.row) };
      paintTerrain(hex, erase);
      return;
    }
    if (tool === 'region') {
      if (!inGrid(hex)) return;
      const remove = e.button === 2;
      gestureRef.current = { kind: 'region', remove, lastKey: hexKey(hex.col, hex.row) };
      paintRegion(hex, remove);
      return;
    }
    if (tool === 'fog') {
      if (!inGrid(hex)) return;
      const remove = e.button === 2;
      gestureRef.current = { kind: 'fog', remove, lastKey: hexKey(hex.col, hex.row) };
      paintFog(hex, remove);
      return;
    }
    if (tool === 'line') {
      // right-click walks back the draft: removes the last point, then cancels
      if (e.button === 2) {
        setDraftLine((draft) => (draft && draft.length > 1 ? draft.slice(0, -1) : null));
        return;
      }
      if (e.button !== 0) return;
      if (effectiveSnap) {
        const pt = nearestCorner(geom, map.grid.cols, map.grid.rows, p);
        // rivers/coasts follow hex edges: insert the perimeter walk between corners
        setDraftLine((draft) => {
          if (!draft || draft.length === 0) return [pt];
          const last = draft[draft.length - 1];
          return [...draft, ...edgePathBetween(geom, map.grid.cols, map.grid.rows, last, pt)];
        });
      } else {
        setDraftLine((draft) => (draft ? [...draft, p] : [p]));
      }
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'pin') {
      // snap to the hex center (Alt bypasses, same as line snap)
      createPin(effectiveSnap && inGrid(hex) ? hexCenter(geom, hex.col, hex.row) : p);
      return;
    }
    if (tool === 'text') {
      createLabel(effectiveSnap && inGrid(hex) ? hexCenter(geom, hex.col, hex.row) : p);
      return;
    }
    if (tool === 'measure') {
      if (inGrid(hex)) {
        setMeasureAnchors((anchors) => [...anchors, hex]);
        setPreviewHex(null);
      }
      return;
    }
    // select tool
    setLabelEditorId(null);
    setPinEditorId(null);
    const pin = hitTestPin(p);
    if (pin) {
      setSelectedPinId(pin.id);
      setSelectedLabelId(null);
      setSelectedLineId(null);
      gestureRef.current = { kind: 'pin-drag', id: pin.id, dx: p.x - pin.x, dy: p.y - pin.y, moved: false };
      return;
    }
    const label = hitTestLabel(p);
    if (label) {
      setSelectedLabelId(label.id);
      setSelectedLineId(null);
      gestureRef.current = { kind: 'label-drag', id: label.id, dx: p.x - label.x, dy: p.y - label.y, moved: false };
      return;
    }
    const line = hitTestLine(p);
    if (line) {
      setSelectedLineId(line.id);
      setSelectedLabelId(null);
      setSelectedPinId(null);
      setSelectedHex(null);
      setPanel('styles');
      return;
    }
    setSelectedLineId(null);
    setSelectedLabelId(null);
    setSelectedPinId(null);
    gestureRef.current = { kind: 'maybe-select', startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = screenToWorld(e.clientX, e.clientY);
    if (draftLine) setCursor(p);
    if (tool === 'pin') setHoverWorld(p);
    const hex = hexAt(p);
    setHoverHex((prev) => (prev && prev.col === hex.col && prev.row === hex.row ? prev : hex));

    // select-tool hover affordance (click/drag targets under the cursor)
    if (tool === 'select' && !gestureRef.current) {
      const pin = hitTestPin(p);
      const label = pin ? null : hitTestLabel(p);
      const next = pin ? { kind: 'pin' as const, id: pin.id } : label ? { kind: 'label' as const, id: label.id } : null;
      setHoverSel((prev) => (prev?.kind === next?.kind && prev?.id === next?.id ? prev : next));
    }

    // throttled measure preview (A* per mousemove is too expensive)
    if (tool === 'measure' && measureAnchors.length > 0) {
      const now = performance.now();
      if (now - previewTs.current > 90) {
        previewTs.current = now;
        setPreviewHex(hex);
      }
    }

    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'pan') {
      setCamera((cam) => ({ ...cam, x: g.camX + (e.clientX - g.startX), y: g.camY + (e.clientY - g.startY) }));
      return;
    }
    if (g.kind === 'maybe-select') {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 4) {
        gestureRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, camX: g.camX, camY: g.camY };
      }
      return;
    }
    if (g.kind === 'paint') {
      const key = hexKey(hex.col, hex.row);
      if (key !== g.lastKey) {
        g.lastKey = key;
        paintTerrain(hex, g.erase);
      }
      return;
    }
    if (g.kind === 'region') {
      const key = hexKey(hex.col, hex.row);
      if (key !== g.lastKey) {
        g.lastKey = key;
        paintRegion(hex, g.remove);
      }
      return;
    }
    if (g.kind === 'fog') {
      const key = hexKey(hex.col, hex.row);
      if (key !== g.lastKey) {
        g.lastKey = key;
        paintFog(hex, g.remove);
      }
      return;
    }
    if (g.kind === 'label-drag') {
      g.moved = true;
      updateLabel(g.id, { x: p.x - g.dx, y: p.y - g.dy });
      return;
    }
    if (g.kind === 'pin-drag') {
      g.moved = true;
      updatePin(g.id, { x: p.x - g.dx, y: p.y - g.dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    // click (not drag) on a pin opens its editor popover
    if (g?.kind === 'pin-drag' && !g.moved) {
      setPinEditorId(g.id);
      return;
    }
    if (g?.kind === 'maybe-select' && !g.moved) {
      const p = screenToWorld(e.clientX, e.clientY);
      const hex = hexAt(p);
      if (inGrid(hex)) {
        setSelectedHex(hex);
        setPanel('hex');
      } else {
        setSelectedHex(null);
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool === 'line') {
      commitDraftLine();
      return;
    }
    if (tool === 'select') {
      const p = screenToWorld(e.clientX, e.clientY);
      const pin = hitTestPin(p);
      if (pin) {
        // double-click a pin: open the linked note (or the editor when unlinked)
        if (pin.docId) openDocument(pin.docId);
        else setPinEditorId(pin.id);
        return;
      }
      const label = hitTestLabel(p);
      if (label) {
        setSelectedLabelId(label.id);
        setLabelEditorId(label.id);
      }
    }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      )
        return;
      if (e.key === 'Escape') {
        if (pinEditorId) setPinEditorId(null);
        else if (labelEditorId) setLabelEditorId(null);
        else if (draftLine) setDraftLine(null);
        else if (measureAnchors.length > 0) setMeasureAnchors([]);
        else {
          setSelectedHex(null);
          setSelectedLineId(null);
          setSelectedLabelId(null);
          setSelectedPinId(null);
          // nothing left to cancel: Esc returns placement tools to select
          if (tool !== 'select' && tool !== 'pan') activateTool('select');
        }
        return;
      }
      if (e.key === 'Enter' && draftLine) {
        commitDraftLine();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select' && !labelEditorId && !pinEditorId) {
        if (selectedLineId) setMap((m) => ({ ...m, lines: m.lines.filter((l) => l.id !== selectedLineId) }));
        if (selectedLabelId) setMap((m) => ({ ...m, labels: m.labels.filter((l) => l.id !== selectedLabelId) }));
        if (selectedPinId) setMap((m) => ({ ...m, pins: m.pins.filter((p) => p.id !== selectedPinId) }));
        setSelectedLineId(null);
        setSelectedLabelId(null);
        setSelectedPinId(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          redo();
        } else if (k === 'd' && tool === 'select') {
          e.preventDefault();
          duplicateSelection();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const toolKeys: Record<string, HexTool> = { v: 'select', h: 'pan', t: 'terrain', p: 'pin', l: 'line', x: 'text', r: 'region', g: 'fog', m: 'measure' };
      if (toolKeys[k]) activateTool(toolKeys[k]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [labelEditorId, pinEditorId, draftLine, measureAnchors, selectedLineId, selectedLabelId, selectedPinId, tool, commitDraftLine, setMap, undo, redo, duplicateSelection, activateTool]);

  /* ---------- measure computation ---------- */
  const measureSegments = useMemo(() => {
    const segments: { path: HexCoord[]; travel: TravelResult | null }[] = [];
    const tail = tool === 'measure' && measureAnchors.length > 0 && previewHex ? [previewHex] : [];
    const pts = [...measureAnchors, ...tail];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.col === b.col && a.row === b.row) continue;
      if (measureMode === 'path') {
        const path = findTravelPath(map, a, b);
        if (path) segments.push({ path, travel: computeTravel(map, path) });
        else segments.push({ path: [a, b], travel: null });
      } else {
        const travel = straightTravel(map, a, b);
        if (travel) segments.push({ path: travel.path, travel });
      }
    }
    return segments;
  }, [map, measureAnchors, previewHex, measureMode, tool]);

  const measureTotals = useMemo(() => {
    let hexes = 0;
    let distanceKm = 0;
    let rawDistanceKm = 0;
    let time = 0;
    let hasImpassable = false;
    for (const s of measureSegments) {
      if (!s.travel) continue;
      hexes += s.travel.hexes;
      distanceKm += s.travel.distanceKm;
      rawDistanceKm += s.travel.rawDistanceKm;
      time += s.travel.travelTime.value;
      hasImpassable = hasImpassable || s.travel.hasImpassable;
    }
    const unit: DistanceUnit = resolveDisplayUnit(map, rawDistanceKm);
    const distance = kmToDisplay(map, distanceKm).value;
    const rawDistance = kmToDisplay(map, rawDistanceKm).value;
    return { hexes, distance, rawDistance, time, unit, timeUnit: map.settings.travelSpeed.per, hasImpassable };
  }, [measureSegments, map]);

  /* ---------- export ---------- */
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const serializeCurrentSvg = (): { source: string; w: number; h: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // transient overlays (hover, selection, measure) don't belong in exports
    clone.querySelectorAll('.hx-transient').forEach((n) => n.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(Math.round(rect.width)));
    clone.setAttribute('height', String(Math.round(rect.height)));
    // standalone SVGs can't resolve the app's CSS variables
    let source = clone.outerHTML;
    for (const [token, literal] of Object.entries(EXPORT_VARS)) {
      source = source.split(token).join(literal);
    }
    return { source, w: Math.round(rect.width), h: Math.round(rect.height) };
  };

  const exportSvg = () => {
    const s = serializeCurrentSvg();
    if (!s) return;
    download(new Blob([s.source], { type: 'image/svg+xml' }), `${doc.title || 'mapa'}.svg`);
  };

  const exportPng = () => {
    const s = serializeCurrentSvg();
    if (!s) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = s.w * 2;
      canvas.height = s.h * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => blob && download(blob, `${doc.title || 'mapa'}.png`), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.source);
  };

  const usedSymbols = useMemo(() => {
    const terrains = new Set<string>();
    for (const cell of Object.values(map.cells)) {
      if (cell.terrain) terrains.add(cell.terrain);
    }
    const markers = new Set(map.pins.map((p) => p.markerId));
    const lineStyles = new Set(map.lines.map((l) => l.styleId));
    return { terrains, markers, lineStyles };
  }, [map.cells, map.pins, map.lines]);

  const editingLabel = labelEditorId ? (map.labels.find((l) => l.id === labelEditorId) ?? null) : null;
  const editingPin = pinEditorId ? (map.pins.find((p) => p.id === pinEditorId) ?? null) : null;

  const linkNoteToPin = useCallback(
    async (pin: MapPin) => {
      const title = pin.name || resolvePin(mapRef.current, pin).name;
      const note = await createDocument('core/note', doc.id, title);
      updatePin(pin.id, { docId: note.id });
      openDocument(note.id);
    },
    [createDocument, doc.id, openDocument, updatePin]
  );

  const cursorStyle =
    spaceDown || tool === 'pan' ? 'grab' : tool === 'text' ? 'text' : tool === 'select' ? (hoverSel ? 'pointer' : 'default') : 'crosshair';

  /* ---------- UX helpers: hints, status, zoom ---------- */
  const TOOL_HINTS: Record<HexTool, string> = {
    select:
      'Clique num hex para detalhes e notas · clique num pin para editar (duplo-clique abre a nota) · Ctrl+D duplica a seleção',
    pan: 'Arraste para mover a câmera · scroll para zoom',
    terrain: 'Clique ou arraste para pintar o terreno · botão direito apaga',
    pin: 'Clique para criar um marcador do tipo escolhido abaixo · alinha ao centro do hex (Alt desativa) · Esc volta à seleção',
    line: 'Com snap as linhas seguem as arestas (Alt desativa temporariamente) · botão direito desfaz o ponto · duplo-clique ou Enter finaliza',
    text: 'Clique no mapa para criar um rótulo editável · alinha ao centro do hex (Alt desativa)',
    region: 'Clique ou arraste para incluir hexes na região ativa · botão direito remove hexes',
    fog: 'Clique ou arraste para cobrir com névoa · botão direito revela · desative a camada em Camadas',
    measure: 'Clique nos hexes para traçar o caminho · Esc limpa a medição',
  };
  const paletteVisible = tool === 'terrain' || tool === 'pin' || tool === 'line' || tool === 'text' || tool === 'region';

  const overlayOffset = paletteVisible ? 'bottom-[60px]' : 'bottom-3';
  const isEmptyMap = Object.keys(map.cells).length === 0 && map.lines.length === 0 && map.pins.length === 0;
  // refs mutate outside React's render — historyVersion re-renders on changes
  void historyVersion;
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return (
    <div ref={rootRef} className="h-full flex min-h-0">
      <HexcrawlToolbar
        tool={tool}
        setTool={activateTool}
        snap={snap}
        setSnap={setSnap}
        panel={panel}
        setPanel={setPanel}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div
        ref={containerRef}
        className="relative flex-1 min-w-0 overflow-hidden"
        style={{ background: CANVAS_BG }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg
          ref={svgRef}
          className="w-full h-full touch-none select-none"
          style={{ cursor: cursorStyle }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (gestureRef.current = null)}
          onDoubleClick={onDoubleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            // right-button gestures (erase/reveal/undo-point) don't open the menu
            if (suppressCtxMenu.current) {
              suppressCtxMenu.current = false;
              return;
            }
            setCtxMenu({ x: e.clientX, y: e.clientY });
          }}
          onPointerLeave={() => {
            setHoverHex(null);
            setHoverWorld(null);
            setHoverSel(null);
          }}
        >
          <MapRenderer
            map={map}
            layers={layers}
            camera={camera}
            viewSize={viewSize}
            selectedLineId={selectedLineId}
            selectedLabelId={selectedLabelId}
            selectedPinId={selectedPinId}
            pinDocIcon={pinDocIcon}
          >
              {/* hover + selection (transient) */}
              {hoverHex && inGrid(hoverHex) && tool !== 'pan' && (
                <path
                  className="hx-transient"
                  d={cornersPath(hexCorners(geom, hoverHex.col, hoverHex.row))}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={2 / camera.zoom}
                  opacity={0.9}
                />
              )}
              {selectedHex && inGrid(selectedHex) && (
                <path
                  className="hx-transient"
                  d={cornersPath(hexCorners(geom, selectedHex.col, selectedHex.row))}
                  fill="var(--color-accent)"
                  fillOpacity={0.12}
                  stroke="var(--color-accent)"
                  strokeWidth={2.5 / camera.zoom}
                />
              )}

              {/* select-tool hover ring on the pin under the cursor */}
              {tool === 'select' &&
                hoverSel?.kind === 'pin' &&
                (() => {
                  const pin = map.pins.find((p) => p.id === hoverSel.id);
                  if (!pin) return null;
                  const size = geom.size * 0.52;
                  return (
                    <circle
                      className="hx-transient"
                      cx={pin.x}
                      cy={pin.y}
                      r={size * 0.78}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth={1.5 / camera.zoom + 0.5}
                      opacity={0.6}
                    />
                  );
                })()}

              {/* placement ghost: marker preview follows the cursor (pin tool) */}
              {tool === 'pin' &&
                hoverWorld &&
                (() => {
                  const f = map.features.find((x) => x.id === activeMarker) ?? map.features[0];
                  if (!f) return null;
                  const hex = hexAt(hoverWorld);
                  const pt = effectiveSnap && inGrid(hex) ? hexCenter(geom, hex.col, hex.row) : hoverWorld;
                  const Glyph = getGlyph(f.icon);
                  const size = geom.size * 0.52;
                  return (
                    <g className="hx-transient" opacity={0.45} pointerEvents="none">
                      {f.iconSrc ? (
                        <image href={f.iconSrc} x={pt.x - size / 2} y={pt.y - size / 2} width={size} height={size} />
                      ) : Glyph ? (
                        <g transform={`translate(${pt.x - size / 2},${pt.y - size / 2})`}>
                          <Glyph size={size} color={f.color} strokeWidth={2.4} />
                        </g>
                      ) : null}
                    </g>
                  );
                })()}

              {/* draft line (transient) */}
              {draftLine && (
                <g className="hx-transient">
                  <path
                    d={[...draftLine, ...(cursor ? (effectiveSnap ? [nearestCorner(geom, map.grid.cols, map.grid.rows, cursor)] : [cursor]) : [])]
                      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                      .join(' ')}
                    fill="none"
                    stroke={lineStyleOf(map, activeLineStyle)?.color ?? '#333'}
                    strokeWidth={(lineStyleOf(map, activeLineStyle)?.width ?? 3) + 0.5}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                  {draftLine.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3 / camera.zoom} fill="var(--color-accent)" />
                  ))}
                </g>
              )}

              {/* measure overlay (transient) */}
              <g className="hx-transient">
                {measureSegments.map((seg, i) => (
                  <path
                    key={`m-${i}`}
                    d={seg.path
                      .map((h, j) => {
                        const c = hexCenter(geom, h.col, h.row);
                        return `${j === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke={seg.travel ? 'var(--color-accent)' : 'var(--color-danger)'}
                    strokeWidth={3 / camera.zoom + 1.5}
                    strokeDasharray={`${8 / camera.zoom + 4} ${5 / camera.zoom + 2.5}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.9}
                  />
                ))}
                {measureAnchors.map((a, i) => {
                  const c = hexCenter(geom, a.col, a.row);
                  return <circle key={`a-${i}`} cx={c.x} cy={c.y} r={5 / camera.zoom + 2} fill="var(--color-accent)" stroke="#fff" strokeWidth={1.5 / camera.zoom} />;
                })}
              </g>
          </MapRenderer>
        </svg>

        {/* contextual tool hint */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[70%]">
          <div className="px-3 py-1.5 rounded-full bg-sidebar/90 border border-line shadow-md text-[11.5px] text-ink-2 text-center">
            {TOOL_HINTS[tool]}
            {spaceDown && ' · espaço: movendo câmera'}
          </div>
        </div>

        {/* empty map onboarding */}
        {isEmptyMap && tool !== 'measure' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="max-w-sm rounded-xl border border-line bg-sidebar/95 shadow-xl p-5 text-center">
              <div className="text-[14px] font-semibold text-ink-1 mb-1.5">Mapa vazio</div>
              <p className="text-[12px] text-ink-2 leading-relaxed">
                Pinte o terreno clicando nos hexes (ferramenta <strong>T</strong>), ou abra o painel{' '}
                <strong>Gerador</strong> (ícone de dado à esquerda) para criar um mapa aleatório ou usar o assistente de
                terreno.
              </p>
            </div>
          </div>
        )}

        {/* status chip: hex under cursor + zoom */}
        <div
          className={`absolute left-3 ${overlayOffset} z-20 px-2.5 py-1 rounded-md bg-sidebar/90 border border-line text-[11px] text-ink-2 tabular-nums pointer-events-none`}
        >
          {hoverHex && inGrid(hoverHex) ? `Hex ${hexNumber(map, hoverHex.col, hoverHex.row)} · ${hoverHex.col},${hoverHex.row}` : 'fora do mapa'}
        </div>

        {/* zoom controls */}
        <div className={`absolute right-3 ${overlayOffset} z-20 flex items-center gap-0.5 rounded-lg bg-sidebar/90 border border-line shadow-md p-0.5`}>
          <button title="Zoom out" onClick={() => zoomBy(1 / 1.25)} className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover">
            <Minus size={13} />
          </button>
          <button
            title="Zoom 100%"
            onClick={() =>
              setCamera((cam) => {
                const cx = viewSize.w / 2;
                const cy = viewSize.h / 2;
                const wx = (cx - cam.x) / cam.zoom;
                const wy = (cy - cam.y) / cam.zoom;
                return { zoom: 1, x: cx - wx, y: cy - wy };
              })
            }
            className="px-1.5 py-1 rounded-md text-[11px] text-ink-2 hover:text-ink-1 hover:bg-hover tabular-nums min-w-[42px] text-center"
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <button title="Zoom in" onClick={() => zoomBy(1.25)} className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover">
            <Plus size={13} />
          </button>
          <button title="Enquadrar mapa inteiro" onClick={fitToMap} className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover">
            <Maximize size={13} />
          </button>
        </div>

        {/* contextual palette */}
        <HexPalette
          tool={tool}
          map={map}
          activeTerrain={activeTerrain}
          setActiveTerrain={setActiveTerrain}
          activeMarker={activeMarker}
          setActiveMarker={setActiveMarker}
          activeLineStyle={activeLineStyle}
          setActiveLineStyle={setActiveLineStyle}
          activeTextStyle={activeTextStyle}
          setActiveTextStyle={setActiveTextStyle}
          activeRegionId={activeRegionId}
          setActiveRegionId={setActiveRegionId}
        />

        {/* label editor popover (direct text editing) */}
        {editingLabel &&
          (() => {
            const s = resolveLabelStyle(map, editingLabel);
            const pos = worldToScreen(editingLabel);
            return (
              <div
                className="absolute z-30 w-64 rounded-lg border border-line bg-sidebar shadow-xl p-2.5 space-y-1.5"
                style={{ left: Math.max(8, Math.min(pos.x, viewSize.w - 264)), top: Math.max(8, pos.y - 24), transform: 'translateY(-100%)' }}
              >
                <input
                  autoFocus
                  value={editingLabel.text}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => updateLabel(editingLabel.id, { text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setLabelEditorId(null);
                  }}
                  placeholder="Texto do rótulo"
                  className="w-full bg-overlay border border-line rounded px-2 py-1 text-[13px] text-ink-1 outline-none focus:border-accent"
                />
                <div className="flex gap-1.5">
                  <select
                    value={editingLabel.styleId}
                    onChange={(e) => applyLabelStyle(editingLabel.id, e.target.value)}
                    className="flex-1 min-w-0 bg-overlay border border-line rounded px-1.5 py-1 text-[12px] text-ink-1 outline-none"
                    title="Estilo predefinido"
                  >
                    {map.textStyles.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={s.size}
                    min={6}
                    max={96}
                    onChange={(e) => updateLabelOverride(editingLabel.id, { size: Math.max(6, Number(e.target.value) || 6) })}
                    className="w-14 bg-overlay border border-line rounded px-1.5 py-1 text-[12px] text-ink-1 outline-none text-right"
                    title="Tamanho"
                  />
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => updateLabelOverride(editingLabel.id, { color: e.target.value })}
                    className="w-8 h-7 rounded border border-line bg-overlay cursor-pointer"
                    title="Cor"
                  />
                </div>
                <div className="flex gap-1.5">
                  <select
                    value={s.font}
                    onChange={(e) => updateLabelOverride(editingLabel.id, { font: e.target.value })}
                    className="flex-1 min-w-0 bg-overlay border border-line rounded px-1.5 py-1 text-[12px] text-ink-1 outline-none"
                    title="Fonte"
                  >
                    <option value="inherit">UI (padrão)</option>
                    <option value="Georgia, serif">Serifada</option>
                    <option value="ui-monospace, monospace">Monoespaçada</option>
                    <option value="'Palatino Linotype', 'Book Antiqua', serif">Fantasia</option>
                    {realmFonts.map((f) => (
                      <option key={f.id} value={`"${f.name}"`}>
                        {f.name} (realm)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-ink-2">
                  <button
                    onClick={() => updateLabelOverride(editingLabel.id, { bold: !s.bold })}
                    className={`px-2 py-0.5 rounded border font-bold ${s.bold ? 'border-accent bg-accent-soft text-ink-1' : 'border-line text-ink-3'}`}
                    title="Negrito"
                  >
                    B
                  </button>
                  <button
                    onClick={() => updateLabelOverride(editingLabel.id, { italic: !s.italic })}
                    className={`px-2 py-0.5 rounded border italic ${s.italic ? 'border-accent bg-accent-soft text-ink-1' : 'border-line text-ink-3'}`}
                    title="Itálico"
                  >
                    I
                  </button>
                  <label className="flex items-center gap-1 cursor-pointer select-none" title="Sombreamento (contorno)">
                    <input
                      type="checkbox"
                      checked={s.halo}
                      onChange={(e) => updateLabelOverride(editingLabel.id, { halo: e.target.checked })}
                      className="accent-[#38bdf8]"
                    />
                    Sombra
                  </label>
                  {s.halo && (
                    <input
                      type="color"
                      value={s.haloColor}
                      onChange={(e) => updateLabelOverride(editingLabel.id, { haloColor: e.target.value })}
                      className="w-7 h-6 rounded border border-line bg-overlay cursor-pointer"
                      title="Cor da sombra"
                    />
                  )}
                  <div className="flex-1" />
                  <button onClick={() => setConfirmLabelDelete(true)} className="text-ink-3 hover:text-danger text-[11px] underline">
                    excluir
                  </button>
                </div>
                <ConfirmModal
                  open={confirmLabelDelete}
                  title="Excluir rótulo"
                  message={
                    <>
                      Excluir o rótulo <strong className="text-ink-1">“{editingLabel.text}”</strong>?
                    </>
                  }
                  onConfirm={() => {
                    setMap((m) => ({ ...m, labels: m.labels.filter((l) => l.id !== editingLabel.id) }));
                    setLabelEditorId(null);
                    setSelectedLabelId(null);
                  }}
                  onClose={() => setConfirmLabelDelete(false)}
                />
              </div>
            );
          })()}

        {/* pin editor popover (marker picker + linked note) */}
        {editingPin &&
          (() => {
            const r = resolvePin(map, editingPin);
            const pos = worldToScreen(editingPin);
            const linkedDoc = editingPin.docId ? docs.find((d) => d.id === editingPin.docId) : undefined;
            return (
              <div
                className="absolute z-30 w-72 rounded-lg border border-line bg-sidebar shadow-xl p-2.5 space-y-2"
                style={{ left: Math.max(8, Math.min(pos.x, viewSize.w - 296)), top: pos.y + 16 }}
              >
                <input
                  autoFocus
                  value={editingPin.name}
                  placeholder={r.name}
                  onChange={(e) => updatePin(editingPin.id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setPinEditorId(null);
                  }}
                  className="w-full bg-overlay border border-line rounded px-2 py-1 text-[13px] text-ink-1 outline-none focus:border-accent"
                />
                {/* icon marker picker */}
                <div className="grid grid-cols-8 gap-1">
                  {map.features.map((f) => {
                    const G = getGlyph(f.icon);
                    const active = editingPin.markerId === f.id;
                    return (
                      <button
                        key={f.id}
                        title={f.name}
                        onClick={() => updatePin(editingPin.id, { markerId: f.id })}
                        className={`aspect-square rounded-md border flex items-center justify-center transition-colors ${
                          active ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-3'
                        }`}
                      >
                        {f.iconSrc ? <img src={f.iconSrc} alt="" className="w-4 h-4 object-contain" /> : G ? <G size={15} color={f.color} /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-ink-2">
                  <span>Cor</span>
                  <input
                    type="color"
                    value={r.color}
                    onChange={(e) => updatePin(editingPin.id, { color: e.target.value })}
                    className="w-8 h-6 rounded border border-line bg-overlay cursor-pointer"
                  />
                  {editingPin.color && (
                    <button onClick={() => updatePin(editingPin.id, { color: null })} className="text-[11px] text-ink-3 hover:text-accent underline">
                      usar cor do tipo
                    </button>
                  )}
                </div>
                {linkedDoc ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openDocument(linkedDoc.id)}
                      className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md border border-line text-[12px] text-ink-1 hover:border-accent transition-colors"
                    >
                      <span className="truncate">{linkedDoc.title || 'Sem título'}</span>
                    </button>
                    <button
                      title="Desvincular nota (o documento não é excluído)"
                      onClick={() => updatePin(editingPin.id, { docId: null })}
                      className="p-1.5 rounded-md text-ink-3 hover:text-danger hover:bg-hover"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => linkNoteToPin(editingPin)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent transition-colors"
                  >
                    + Criar nota vinculada
                  </button>
                )}
                <div className="flex justify-end">
                  <button onClick={() => setConfirmPinDelete(true)} className="text-ink-3 hover:text-danger text-[11px] underline">
                    excluir marcador
                  </button>
                </div>
                <ConfirmModal
                  open={confirmPinDelete}
                  title="Excluir marcador"
                  message={
                    <>
                      Excluir o marcador <strong className="text-ink-1">{r.name}</strong>? A nota vinculada (se houver) permanece na árvore de
                      documentos.
                    </>
                  }
                  onConfirm={() => {
                    setMap((m) => ({ ...m, pins: m.pins.filter((p) => p.id !== editingPin.id) }));
                    setPinEditorId(null);
                    setSelectedPinId(null);
                  }}
                  onClose={() => setConfirmPinDelete(false)}
                />
              </div>
            );
          })()}

        {/* context menu (export etc.) */}
        {ctxMenu &&
          (() => {
            const entries: CtxMenuEntry[] = [
              { icon: ImageIcon, label: 'Exportar PNG (visão atual)', onClick: exportPng },
              { icon: FileCode, label: 'Exportar SVG (visão atual)', onClick: exportSvg },
            ];
            return <ContextMenu x={ctxMenu.x} y={ctxMenu.y} entries={entries} onClose={() => setCtxMenu(null)} />;
          })()}

        {/* measure badge */}
        {measureTotals.hexes > 0 && (
          <div className="absolute left-3 top-3 z-20 rounded-lg border border-line bg-sidebar/95 shadow-lg px-3 py-2 text-[12px] text-ink-1 space-y-0.5">
            <div className="font-semibold text-[11px] uppercase tracking-wide text-ink-3">Medição</div>
            <div>
              {measureTotals.hexes} hexes · {measureTotals.rawDistance.toFixed(measureTotals.unit === 'm' ? 0 : 1)} {measureTotals.unit} (efetivo:{' '}
              {measureTotals.distance.toFixed(measureTotals.unit === 'm' ? 0 : 1)} {measureTotals.unit})
            </div>
            <div className="text-accent font-medium">
              ≈ {measureTotals.time.toFixed(1)} {measureTotals.timeUnit === 'day' ? (measureTotals.time >= 2 ? 'dias' : 'dia') : 'horas'} de viagem
            </div>
            {measureTotals.hasImpassable && <div className="text-danger text-[11px]">cruza terreno intransitável (custo estimado)</div>}
            <button className="text-ink-3 hover:text-ink-1 text-[11px] underline" onClick={() => setMeasureAnchors([])}>
              limpar (Esc)
            </button>
          </div>
        )}

        {/* map key overlay */}
        {showKey && (
          <div className="absolute right-3 bottom-3 z-20 max-h-[60%] overflow-y-auto custom-scrollbar rounded-lg border border-line bg-sidebar/95 shadow-lg px-3 py-2 text-[12px] w-52">
            <div className="font-semibold text-[11px] uppercase tracking-wide text-ink-3 mb-1.5">Chave do mapa</div>
            {map.terrains.filter((t) => usedSymbols.terrains.has(t.id)).map((t) => {
              const Glyph = getGlyph(t.icon);
              return (
                <div key={t.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-4 h-4 rounded-sm border border-black/20 flex items-center justify-center shrink-0" style={{ background: t.color }}>
                    {Glyph && <Glyph size={11} color="rgba(0,0,0,.55)" />}
                  </span>
                  <span className="text-ink-1">{t.name}</span>
                </div>
              );
            })}
            {map.features.filter((f) => usedSymbols.markers.has(f.id)).map((f) => {
              const Glyph = getGlyph(f.icon);
              return (
                <div key={f.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">{Glyph && <Glyph size={13} color={f.color} />}</span>
                  <span className="text-ink-1">{f.name}</span>
                </div>
              );
            })}
            {map.regions
              .filter((r) => r.labelMode === 'key')
              .map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-0.5">
                  <span className="w-4 h-4 rounded-sm border shrink-0" style={{ background: `${r.color}55`, borderColor: r.color }} />
                  <span className="text-ink-1">{r.name}</span>
                </div>
              ))}
            {map.lineStyles.filter((s) => usedSymbols.lineStyles.has(s.id)).map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-0.5">
                <svg width="18" height="8" className="shrink-0">
                  <line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth={Math.min(s.width, 4)} strokeDasharray={s.dash ? '3 2' : undefined} strokeLinecap="round" />
                </svg>
                <span className="text-ink-1">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {panel && (
        <>
          <div
            onMouseDown={startPanelDrag}
            className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/50 transition-colors"
            title="Arraste para redimensionar"
          />
          <HexSidePanel
            width={panelWidth}
            tab={panel}
            setTab={setPanel}
            map={map}
            setMap={setMap}
            mapDocId={doc.id}
            selectedHex={selectedHex}
            setSelectedHex={setSelectedHex}
            setTool={activateTool}
            activeTerrain={activeTerrain}
            activeRegionId={activeRegionId}
            setActiveRegionId={setActiveRegionId}
            layers={layers}
            setLayers={setLayers}
            showKey={showKey}
            setShowKey={setShowKey}
            measureMode={measureMode}
            setMeasureMode={setMeasureMode}
            measureTotals={measureTotals}
            clearMeasure={() => setMeasureAnchors([])}
          />
        </>
      )}
    </div>
  );
}
