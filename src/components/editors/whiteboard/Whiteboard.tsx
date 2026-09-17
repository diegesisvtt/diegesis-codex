import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Pencil,
  BringToFront,
  SendToBack,
  Type,
  StickyNote,
  Gauge,
  Clock,
  Group,
  Ungroup,
  Trash2,
  CheckSquare,
  Magnet,
  Grid3x3,
  Image as ImageIcon,
} from 'lucide-react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../../state/store';
import {
  createShape,
  generateId,
  parseShapes,
  serializeShapes,
  topLevelShapes,
  childrenOf,
  shapeBounds,
  boundsIntersect,
  groupShapes,
  ungroupShape,
  deleteShapes,
  duplicateShapes,
  bringToFront,
  sendToBack,
  arrowBounds,
  syncArrowBounds,
  DEFAULT_SIZE,
} from './model';
import type { WBShape, WBShapeMap, WBBounds, ShapeType, ArrowPoint } from './model';
import { ShapeView } from './ShapeView';
import { ArrowsLayer } from './ArrowsLayer';
import { WhiteboardToolbar } from './Toolbar';
import type { WBTool } from './Toolbar';
import { ContextMenu } from './ContextMenu';
import type { CtxMenuEntry } from './ContextMenu';

/** px the pointer must travel before a press becomes a drag (tldraw "pointing" state) */
const DRAG_THRESHOLD = 4;

/** grid size for snapping */
const SNAP = 20;
const snapVal = (v: number) => Math.round(v / SNAP) * SNAP;

/* ---------- resize handles ---------- */

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_DEFS: { id: ResizeHandle; className: string; cursor: string }[] = [
  { id: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
  { id: 'n', className: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ns-resize' },
  { id: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
  { id: 'e', className: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
  { id: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2', cursor: 'ns-resize' },
  { id: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
  { id: 'w', className: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

/** auto-height shapes resize horizontally only (content reflows) */
const WIDTH_HANDLES = new Set<ResizeHandle>(['nw', 'ne', 'e', 'se', 'sw', 'w']);

const MIN_WIDTH: Record<WBShape['type'], number> = {
  text: 60,
  note: 200,
  tracker: 230,
  clock: 170,
  group: 40,
  arrow: 0,
  image: 40,
};
const MIN_GROUP_SIZE = 40;
const MIN_IMAGE_SIZE = 40;

/* ============================================================
   Shape frame — positioning, selection chrome, size reporting
   ============================================================ */

function ShapeFrame({
  shape,
  isSelected,
  showHandles,
  panning,
  isBindTarget,
  onPointerDownShape,
  onDoubleClickShape,
  onContextMenuShape,
  onResizeStart,
  onReportSize,
  children,
}: {
  shape: WBShape;
  isSelected: boolean;
  showHandles: boolean;
  /** hand tool active: frames let pointer events bubble up to the canvas pan */
  panning: boolean;
  /** highlighted as an arrow binding target */
  isBindTarget: boolean;
  onPointerDownShape(shape: WBShape, e: React.PointerEvent): void;
  onDoubleClickShape(shape: WBShape): void;
  onContextMenuShape(shape: WBShape, e: React.MouseEvent): void;
  onResizeStart(shape: WBShape, handle: ResizeHandle, e: React.PointerEvent): void;
  onReportSize(id: string, w: number, h: number): void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // measure rendered size so marquee selection and grouping have real bounds
  useEffect(() => {
    const el = ref.current;
    if (!el || shape.type === 'group') return;
    const observer = new ResizeObserver(() => {
      onReportSize(shape.id, el.offsetWidth, el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [shape.id, shape.type, onReportSize]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (panning) return; // bubble to the canvas pan handler
    e.stopPropagation();
    onPointerDownShape(shape, e);
  };

  return (
    <div
      ref={ref}
      className={`absolute select-none touch-none ${isSelected ? 'z-30' : 'z-10'}`}
      style={{ transform: `translate(${shape.x}px, ${shape.y}px)` }}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onDoubleClickShape(shape)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenuShape(shape, e);
      }}
    >
      {isSelected && (
        <div className="absolute -inset-1.5 rounded-lg border-2 border-accent pointer-events-none" />
      )}
      {isBindTarget && (
        <div className="absolute -inset-1.5 rounded-lg border-2 border-dashed border-accent pointer-events-none" />
      )}
      {showHandles &&
        HANDLE_DEFS.filter((h) => shape.type === 'group' || shape.type === 'image' || WIDTH_HANDLES.has(h.id)).map((h) => (
          <div
            key={h.id}
            className={`absolute z-50 w-2.5 h-2.5 rounded-[2px] bg-elevated border border-accent shadow-md touch-none ${h.className}`}
            style={{ cursor: h.cursor }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onResizeStart(shape, h.id, e);
            }}
          />
        ))}
      {children}
    </div>
  );
}

/* ============================================================
   Whiteboard — tldraw-inspired infinite canvas
   ============================================================ */

export function Whiteboard({ doc }: { doc: DocNode }) {
  const { updateDocument } = useStore();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<WBTool>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<WBBounds | null>(null);
  /** grid snapping (default on; hold Alt to bypass during a gesture) */
  const [snapEnabled, setSnapEnabled] = useState(true);
  /** dot grid visibility */
  const [gridVisible, setGridVisible] = useState(true);
  /** right-click context menu state */
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    canvas: { x: number; y: number };
    shapeId: string | null;
  } | null>(null);
  /** space key held down: temporary hand tool (tldraw-style) */
  const [spacePan, setSpacePan] = useState(false);
  /** arrow being drawn with the arrow tool */
  const [arrowDraft, setArrowDraft] = useState<{ start: ArrowPoint; end: ArrowPoint } | null>(null);
  /** shape highlighted as an arrow binding target during arrow gestures */
  const [bindTargetId, setBindTargetId] = useState<string | null>(null);
  /** a pan gesture is in progress */
  const [panning, setPanning] = useState(false);
  /** transient shape positions while dragging (persisted on pointer up) */
  const [liveShapes, setLiveShapes] = useState<WBShapeMap | null>(null);

  const handActive = tool === 'hand' || spacePan;

  /** snap a coordinate to the grid when enabled; Alt inverts the setting */
  const applySnap = useCallback(
    (v: number, altKey: boolean) => (snapEnabled !== altKey ? snapVal(v) : Math.round(v)),
    [snapEnabled]
  );

  const persisted = useMemo(() => parseShapes(doc.content), [doc.content]);
  const shapes = liveShapes ?? persisted;

  /** latest shape map — mutations build on this so batched updates never clobber each other */
  const latestRef = useRef<WBShapeMap>(persisted);
  useEffect(() => {
    latestRef.current = persisted;
  }, [persisted]);
  /** last transient map during a drag, committed on pointer up */
  const liveRef = useRef<WBShapeMap | null>(null);
  /** removes window listeners of the active pointer session */
  const sessionCleanupRef = useRef<(() => void) | null>(null);

  const save = useCallback(
    (next: WBShapeMap) => {
      latestRef.current = next;
      updateDocument(doc.id, { content: serializeShapes(next) });
    },
    [doc.id, updateDocument]
  );

  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    anchorId: string;
    anchorType: WBShape['type'];
    shiftKey: boolean;
    /** anchor was already selected when the pointer went down */
    wasSelected: boolean;
    origins: Map<string, { x: number; y: number; arrow?: { start: ArrowPoint; end: ArrowPoint } }>;
    base: WBShapeMap;
    moved: boolean;
  } | null>(null);

  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    baseSelection: Set<string>;
  } | null>(null);

  const resizeRef = useRef<{
    shapeId: string;
    handle: ResizeHandle;
    startClientX: number;
    startClientY: number;
    orig: { x: number; y: number; w: number; h: number };
    /** snapshot of group children for proportional scaling */
    children: { id: string; x: number; y: number; w: number; h: number }[] | null;
    base: WBShapeMap;
  } | null>(null);

  /** live arrow draft during the arrow creation gesture */
  const arrowDraftRef = useRef<{ start: ArrowPoint; end: ArrowPoint } | null>(null);
  /** hidden file input for the image tool */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** canvas point where the pending image will be dropped */
  const imagePointRef = useRef<{ x: number; y: number } | null>(null);

  /* ---------- hit testing ---------- */

  /** topmost bindable shape at a canvas point (arrows excluded) */
  const shapeAtPoint = useCallback((point: { x: number; y: number }, excludeId?: string): WBShape | null => {
    const tops = topLevelShapes(latestRef.current);
    for (let i = tops.length - 1; i >= 0; i--) {
      const s = tops[i];
      if (s.type === 'arrow' || s.id === excludeId) continue;
      const b = shapeBounds(s);
      if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return s;
    }
    return null;
  }, []);

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = contentRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // force-end any active pointer session on unmount
  useEffect(() => {
    return () => {
      sessionCleanupRef.current?.();
      dragRef.current = null;
      marqueeRef.current = null;
      resizeRef.current = null;
    };
  }, []);

  /* ---------- mutations ---------- */

  const updateProps = useCallback(
    (id: string, patch: Record<string, any>) => {
      const shape = latestRef.current[id];
      if (!shape) return;
      save({ ...latestRef.current, [id]: { ...shape, props: { ...shape.props, ...patch } } });
    },
    [save]
  );

  const handleReportSize = useCallback(
    (id: string, w: number, h: number) => {
      // inactive flexlayout tabs stay mounted with display:none — the observer
      // fires with 0x0 there; never persist hidden-element sizes
      if (w < 2 || h < 2) return;
      // during a gesture (resize), fold size reports into the transient map so
      // reflowed heights are committed together with the gesture
      const map = liveRef.current ?? latestRef.current;
      const shape = map[id];
      if (!shape) return;
      if (Math.abs((shape.props.w ?? 0) - w) < 2 && Math.abs((shape.props.h ?? 0) - h) < 2) return;
      const next = { ...map, [id]: { ...shape, props: { ...shape.props, w, h } } };
      if (liveRef.current) {
        liveRef.current = next;
        setLiveShapes(next);
      } else {
        save(next);
      }
    },
    [save]
  );

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    save(deleteShapes(latestRef.current, [...selectedIds]));
    setSelectedIds(new Set());
    setEditingId(null);
  }, [save, selectedIds]);

  const handleGroup = useCallback(() => {
    const result = groupShapes(latestRef.current, [...selectedIds]);
    if (!result) return;
    save(result.next);
    setSelectedIds(new Set([result.groupId]));
    setEditingId(null);
  }, [save, selectedIds]);

  const handleUngroup = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const result = ungroupShape(latestRef.current, [...selectedIds][0]);
    if (!result) return;
    save(result.next);
    setSelectedIds(new Set(result.childIds));
    setEditingId(null);
  }, [save, selectedIds]);

  /* ---------- pan session (hand tool / space / middle mouse) ---------- */

  const beginPan = useCallback((e: React.PointerEvent) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = scroller.scrollLeft;
    const startTop = scroller.scrollTop;
    setPanning(true);

    const endSession = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      sessionCleanupRef.current = null;
    };

    const onMove = (ev: PointerEvent) => {
      scroller.scrollLeft = startLeft - (ev.clientX - startX);
      scroller.scrollTop = startTop - (ev.clientY - startY);
    };

    const onUp = () => {
      endSession();
      setPanning(false);
    };

    const onCancel = () => {
      endSession();
      setPanning(false);
    };

    sessionCleanupRef.current = onCancel;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }, []);

  /* ---------- drag session (move selected shapes) ----------
     tldraw-style state machine: pointer down = "pointing" (select only);
     crossing DRAG_THRESHOLD promotes it to "dragging". A press released
     without moving is a click — it never moves the shape. */

  const beginDrag = useCallback(
    (anchor: WBShape, e: React.PointerEvent, ids: Set<string>, wasSelected: boolean) => {
      const base = latestRef.current;
      const origins = new Map<string, { x: number; y: number; arrow?: { start: ArrowPoint; end: ArrowPoint } }>();
      for (const id of ids) {
        const s = base[id];
        if (!s || s.parentId) continue;
        if (s.type === 'arrow') {
          // anchor reference is the start point; endpoints are moved individually
          origins.set(id, {
            x: s.props.start.x,
            y: s.props.start.y,
            arrow: { start: { ...s.props.start }, end: { ...s.props.end } },
          });
        } else {
          origins.set(id, { x: s.x, y: s.y });
        }
      }
      if (origins.size === 0) return;
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        anchorId: anchor.id,
        anchorType: anchor.type,
        shiftKey: e.shiftKey,
        wasSelected,
        origins,
        base,
        moved: false,
      };

      const endSession = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        sessionCleanupRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = ev.clientX - drag.startClientX;
        const dy = ev.clientY - drag.startClientY;
        if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        const anchorOrigin = drag.origins.get(drag.anchorId);
        if (!anchorOrigin) return;
        // snap the anchor's target to the grid, apply the same delta to the rest
        const snappedX = Math.max(0, applySnap(anchorOrigin.x + dx, ev.altKey));
        const snappedY = Math.max(0, applySnap(anchorOrigin.y + dy, ev.altKey));
        const appliedDx = snappedX - anchorOrigin.x;
        const appliedDy = snappedY - anchorOrigin.y;
        const next: WBShapeMap = { ...drag.base };
        for (const [id, origin] of drag.origins) {
          const s = next[id];
          if (s.type === 'arrow' && origin.arrow) {
            // bound ends stay bound (they follow their shapes); free ends move
            const shiftPoint = (p: ArrowPoint): ArrowPoint =>
              p.shapeId
                ? { ...p }
                : { ...p, x: Math.max(0, p.x + appliedDx), y: Math.max(0, p.y + appliedDy) };
            const moved = {
              ...s,
              props: { ...s.props, start: shiftPoint(origin.arrow.start), end: shiftPoint(origin.arrow.end) },
            };
            next[id] = syncArrowBounds(moved, next);
          } else {
            next[id] = { ...s, x: Math.max(0, origin.x + appliedDx), y: Math.max(0, origin.y + appliedDy) };
          }
        }
        liveRef.current = next;
        setLiveShapes(next);
      };

      const onUp = () => {
        endSession();
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag?.moved && liveRef.current) {
          save(liveRef.current);
        } else if (drag && !drag.shiftKey) {
          if (drag.origins.size > 1) {
            // plain click on a shape inside a multi-selection: collapse to it
            setSelectedIds(new Set([drag.anchorId]));
          } else if (drag.wasSelected && (drag.anchorType === 'text' || drag.anchorType === 'note')) {
            // click on an already-selected text/note: enter edit mode
            setEditingId(drag.anchorId);
          }
        }
        liveRef.current = null;
        setLiveShapes(null);
      };

      const onCancel = () => {
        endSession();
        dragRef.current = null;
        liveRef.current = null;
        setLiveShapes(null);
      };

      sessionCleanupRef.current = onCancel;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [save, applySnap]
  );

  /* ---------- resize session ----------
     Width-driven shapes (text, note, cards) resize horizontally and reflow;
     groups scale their children proportionally on both axes. */

  const beginResize = useCallback(
    (shape: WBShape, handle: ResizeHandle, e: React.PointerEvent) => {
      const base = latestRef.current;
      const s = base[shape.id];
      if (!s) return;
      const orig = {
        x: s.x,
        y: s.y,
        w: s.props.w ?? DEFAULT_SIZE[s.type].w,
        h: s.props.h ?? DEFAULT_SIZE[s.type].h,
      };
      const children =
        s.type === 'group'
          ? childrenOf(base, s.id).map((c) => ({
              id: c.id,
              x: c.x,
              y: c.y,
              w: c.props.w ?? DEFAULT_SIZE[c.type].w,
              h: c.props.h ?? DEFAULT_SIZE[c.type].h,
            }))
          : null;
      resizeRef.current = {
        shapeId: s.id,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        orig,
        children,
        base,
      };

      const endSession = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        sessionCleanupRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        const session = resizeRef.current;
        if (!session) return;
        const dx = ev.clientX - session.startClientX;
        const dy = ev.clientY - session.startClientY;
        const { orig, handle } = session;

        // build on the transient map so folded size reports (reflowed heights) survive
        const next: WBShapeMap = { ...(liveRef.current ?? session.base) };
        const target = next[session.shapeId];
        if (!target) return;

        if (target.type === 'group' && session.children) {
          let newX = orig.x;
          let newY = orig.y;
          let newW = orig.w;
          let newH = orig.h;
          if (handle.includes('e')) newW = applySnap(orig.w + dx, ev.altKey);
          if (handle.includes('w')) newW = applySnap(orig.w - dx, ev.altKey);
          if (handle.includes('s')) newH = applySnap(orig.h + dy, ev.altKey);
          if (handle.includes('n')) newH = applySnap(orig.h - dy, ev.altKey);
          newW = Math.max(MIN_GROUP_SIZE, newW);
          newH = Math.max(MIN_GROUP_SIZE, newH);
          // keep the opposite edge pinned when dragging west/north handles
          if (handle.includes('w')) newX = orig.x + (orig.w - newW);
          if (handle.includes('n')) newY = orig.y + (orig.h - newH);

          const scaleX = newW / (orig.w || 1);
          const scaleY = newH / (orig.h || 1);
          next[session.shapeId] = { ...target, x: newX, y: newY, props: { ...target.props, w: newW, h: newH } };
          for (const c of session.children) {
            const child = next[c.id];
            if (!child) continue;
            next[c.id] = {
              ...child,
              x: Math.round(c.x * scaleX),
              y: Math.round(c.y * scaleY),
              props: { ...child.props, w: Math.round(c.w * scaleX), h: Math.round(c.h * scaleY) },
            };
          }
        } else {
          const minW = MIN_WIDTH[target.type] ?? 60;
          const isImage = target.type === 'image';
          let newW = orig.w;
          let newX = orig.x;
          let newH = orig.h;
          let newY = orig.y;
          if (handle.includes('e')) newW = Math.max(minW, applySnap(orig.w + dx, ev.altKey));
          if (handle.includes('w')) {
            newW = Math.max(minW, applySnap(orig.w - dx, ev.altKey));
            newX = orig.x + (orig.w - newW); // keep the right edge pinned
          }
          if (isImage) {
            // images resize freely on both axes (no aspect lock)
            if (handle.includes('s')) newH = Math.max(MIN_IMAGE_SIZE, applySnap(orig.h + dy, ev.altKey));
            if (handle.includes('n')) {
              newH = Math.max(MIN_IMAGE_SIZE, applySnap(orig.h - dy, ev.altKey));
              newY = orig.y + (orig.h - newH);
            }
          }
          next[session.shapeId] = {
            ...target,
            x: Math.round(newX),
            y: Math.round(newY),
            props: { ...target.props, w: Math.round(newW), ...(isImage ? { h: Math.round(newH) } : {}) },
          };
        }

        liveRef.current = next;
        setLiveShapes(next);
      };

      const onUp = () => {
        endSession();
        resizeRef.current = null;
        if (liveRef.current) save(liveRef.current);
        liveRef.current = null;
        setLiveShapes(null);
      };

      const onCancel = () => {
        endSession();
        resizeRef.current = null;
        liveRef.current = null;
        setLiveShapes(null);
      };

      sessionCleanupRef.current = onCancel;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [save, applySnap]
  );

  /* ---------- arrow sessions ---------- */

  /** arrow tool: press to set the start (binds to a shape under the cursor), drag, release */
  const beginArrowDraft = useCallback(
    (e: React.PointerEvent) => {
      const point = toCanvas(e.clientX, e.clientY);
      const hit = shapeAtPoint(point);
      const start: ArrowPoint = hit
        ? { x: point.x, y: point.y, shapeId: hit.id }
        : { x: applySnap(point.x, e.altKey), y: applySnap(point.y, e.altKey), shapeId: null };
      arrowDraftRef.current = { start, end: { ...point, shapeId: null } };
      setArrowDraft(arrowDraftRef.current);

      const endSession = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        sessionCleanupRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        const draft = arrowDraftRef.current;
        if (!draft) return;
        const p = toCanvas(ev.clientX, ev.clientY);
        const target = shapeAtPoint(p);
        // never bind both ends to the same shape
        const bindable = target && target.id !== draft.start.shapeId ? target : null;
        const end: ArrowPoint = bindable
          ? { x: p.x, y: p.y, shapeId: bindable.id }
          : { x: applySnap(p.x, ev.altKey), y: applySnap(p.y, ev.altKey), shapeId: null };
        arrowDraftRef.current = { ...draft, end };
        setArrowDraft(arrowDraftRef.current);
        setBindTargetId(end.shapeId);
      };

      const onUp = () => {
        endSession();
        const draft = arrowDraftRef.current;
        arrowDraftRef.current = null;
        setArrowDraft(null);
        setBindTargetId(null);
        setTool('select');
        if (!draft) return;
        const dist = Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y);
        if (dist < 8 && !draft.end.shapeId) return; // mere click, not an arrow
        const arrow: WBShape = {
          id: generateId(),
          type: 'arrow',
          x: 0,
          y: 0,
          parentId: null,
          props: { start: draft.start, end: draft.end, text: '' },
        };
        const next = { ...latestRef.current };
        next[arrow.id] = syncArrowBounds(arrow, next);
        save(next);
        setSelectedIds(new Set([arrow.id]));
      };

      const onCancel = () => {
        endSession();
        arrowDraftRef.current = null;
        setArrowDraft(null);
        setBindTargetId(null);
      };

      sessionCleanupRef.current = onCancel;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [toCanvas, shapeAtPoint, applySnap, save]
  );

  /** drag an arrow endpoint: rebinds to shapes it hovers, frees on empty canvas */
  const beginArrowEndpointDrag = useCallback(
    (arrow: WBShape, end: 'start' | 'end', e: React.PointerEvent) => {
      e.stopPropagation();
      const base = latestRef.current;

      const endSession = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        sessionCleanupRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        const p = toCanvas(ev.clientX, ev.clientY);
        const target = shapeAtPoint(p, arrow.id);
        const current = (liveRef.current ?? base)[arrow.id];
        if (!current) return;
        const other: ArrowPoint = current.props[end === 'start' ? 'end' : 'start'];
        const bindable = target && target.id !== other.shapeId ? target : null;
        const point: ArrowPoint = bindable
          ? { x: p.x, y: p.y, shapeId: bindable.id }
          : { x: applySnap(p.x, ev.altKey), y: applySnap(p.y, ev.altKey), shapeId: null };
        const next: WBShapeMap = { ...(liveRef.current ?? base) };
        next[arrow.id] = syncArrowBounds(
          { ...current, props: { ...current.props, [end]: point } },
          next
        );
        liveRef.current = next;
        setLiveShapes(next);
        setBindTargetId(point.shapeId);
      };

      const onUp = () => {
        endSession();
        setBindTargetId(null);
        if (liveRef.current) save(liveRef.current);
        liveRef.current = null;
        setLiveShapes(null);
      };

      const onCancel = () => {
        endSession();
        setBindTargetId(null);
        liveRef.current = null;
        setLiveShapes(null);
      };

      sessionCleanupRef.current = onCancel;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [toCanvas, shapeAtPoint, applySnap, save]
  );

  /* ---------- images ---------- */

  const pickImage = useCallback((point: { x: number; y: number }) => {
    imagePointRef.current = point;
    fileInputRef.current?.click();
  }, []);

  const onImageChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow picking the same file again
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 480 / (img.naturalWidth || 480));
          const w = Math.max(MIN_IMAGE_SIZE, snapVal(img.naturalWidth * scale));
          const h = Math.max(MIN_IMAGE_SIZE, snapVal(img.naturalHeight * scale));
          const point = imagePointRef.current ?? { x: 200, y: 200 };
          const shape: WBShape = {
            id: generateId(),
            type: 'image',
            x: Math.max(0, snapVal(point.x - w / 2)),
            y: Math.max(0, snapVal(point.y - h / 2)),
            parentId: null,
            props: { src, w, h, name: file.name },
          };
          save({ ...latestRef.current, [shape.id]: shape });
          setSelectedIds(new Set([shape.id]));
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [save]
  );

  /* ---------- selection ---------- */

  const handlePointerDownShape = useCallback(
    (shape: WBShape, e: React.PointerEvent) => {
      const el = e.target as HTMLElement;
      // controls inside card shapes (tracker inputs, clock wedges) are always interactive;
      // text editing surfaces only swallow the drag while that shape is in edit mode
      const alwaysInteractive = el.closest('input, button, path, a');
      const editInteractive = editingId === shape.id ? el.closest('textarea, .ProseMirror') : null;
      const interactive = alwaysInteractive || editInteractive;

      const wasSelected = selectedIds.has(shape.id);
      let next: Set<string>;
      if (e.shiftKey) {
        next = new Set(selectedIds);
        if (next.has(shape.id)) next.delete(shape.id);
        else next.add(shape.id);
      } else {
        next = wasSelected ? new Set(selectedIds) : new Set([shape.id]);
      }
      setSelectedIds(next);

      // selecting a different shape leaves the current edit mode
      if (!e.shiftKey && editingId && editingId !== shape.id) setEditingId(null);

      if (!interactive && tool === 'select') {
        beginDrag(shape, e, next, wasSelected);
      }
    },
    [beginDrag, selectedIds, editingId, tool]
  );

  const handleDoubleClickShape = useCallback(
    (shape: WBShape) => {
      if (handActive) return;
      if (shape.type === 'text' || shape.type === 'note' || shape.type === 'arrow') {
        setSelectedIds(new Set([shape.id]));
        setEditingId(shape.id);
      }
    },
    [handActive]
  );

  /* ---------- creation ---------- */

  const createAt = useCallback(
    (tool: Exclude<ShapeType, 'group'>, point: { x: number; y: number }, altKey = false) => {
      const size = DEFAULT_SIZE[tool];
      const shape = createShape(
        tool,
        Math.max(0, applySnap(point.x - size.w / 2, altKey)),
        Math.max(0, applySnap(point.y - size.h / 2, altKey))
      );
      save({ ...latestRef.current, [shape.id]: shape });
      setSelectedIds(new Set([shape.id]));
      if (tool === 'text' || tool === 'note') setEditingId(shape.id);
      return shape;
    },
    [save, applySnap]
  );

  /* ---------- canvas pointer down: marquee or shape creation ---------- */

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // middle mouse pans from anywhere (tldraw-style), regardless of tool
      if (e.button === 1) {
        e.preventDefault();
        beginPan(e);
        return;
      }
      if (e.button !== 0) return;

      // hand tool (or space held): drag pans the canvas
      if (handActive) {
        beginPan(e);
        return;
      }

      const point = toCanvas(e.clientX, e.clientY);
      setEditingId(null);

      if (tool === 'arrow') {
        beginArrowDraft(e);
        return;
      }
      if (tool === 'image') {
        pickImage(point);
        setTool('select');
        return;
      }

      if (tool !== 'select') {
        createAt(tool, point, e.altKey);
        setTool('select');
        return;
      }

      // marquee selection
      if (!e.shiftKey) setSelectedIds(new Set());
      marqueeRef.current = {
        startX: point.x,
        startY: point.y,
        baseSelection: e.shiftKey ? new Set(selectedIds) : new Set(),
      };

      const endSession = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        sessionCleanupRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        const m = marqueeRef.current;
        if (!m) return;
        const current = toCanvas(ev.clientX, ev.clientY);
        const rect: WBBounds = {
          x: Math.min(m.startX, current.x),
          y: Math.min(m.startY, current.y),
          w: Math.abs(current.x - m.startX),
          h: Math.abs(current.y - m.startY),
        };
        setMarquee(rect);
        const hit = topLevelShapes(latestRef.current)
          .filter((s) => boundsIntersect(s.type === 'arrow' ? arrowBounds(s, latestRef.current) : shapeBounds(s), rect))
          .map((s) => s.id);
        setSelectedIds(new Set([...m.baseSelection, ...hit]));
      };

      const onUp = () => {
        endSession();
        marqueeRef.current = null;
        setMarquee(null);
      };

      const onCancel = () => {
        endSession();
        marqueeRef.current = null;
        setMarquee(null);
      };

      sessionCleanupRef.current = onCancel;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [tool, handActive, beginPan, beginArrowDraft, createAt, pickImage, selectedIds, toCanvas]
  );

  /* ---------- context menu ---------- */

  const handleContextMenuShape = useCallback(
    (shape: WBShape, e: React.MouseEvent) => {
      // right-clicking an unselected shape selects it first (standard behavior)
      if (!selectedIds.has(shape.id)) {
        setSelectedIds(new Set([shape.id]));
        setEditingId(null);
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, canvas: toCanvas(e.clientX, e.clientY), shapeId: shape.id });
    },
    [selectedIds, toCanvas]
  );

  const handleContextMenuCanvas = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, canvas: toCanvas(e.clientX, e.clientY), shapeId: null });
    },
    [toCanvas]
  );

  const handleDuplicate = useCallback(() => {
    if (selectedIds.size === 0) return;
    const { next, cloneIds } = duplicateShapes(latestRef.current, [...selectedIds], SNAP);
    save(next);
    setSelectedIds(new Set(cloneIds));
  }, [save, selectedIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(topLevelShapes(latestRef.current).map((s) => s.id)));
  }, []);

  const handleBringToFront = useCallback(() => {
    save(bringToFront(latestRef.current, [...selectedIds]));
  }, [save, selectedIds]);

  const handleSendToBack = useCallback(() => {
    save(sendToBack(latestRef.current, [...selectedIds]));
  }, [save, selectedIds]);

  /* ---------- keyboard shortcuts ---------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || root.offsetParent === null) return; // hidden tab
      const target = document.activeElement as HTMLElement | null;
      const editing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (editing) return;
      // only handle keys when this canvas (or nothing in particular) has focus
      if (target && target !== document.body && !root.contains(target)) return;

      if (e.key === ' ') {
        // hold space for a temporary hand tool (tldraw-style)
        e.preventDefault();
        if (!e.repeat) setSpacePan(true);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        handleDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) handleUngroup();
        else handleGroup();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicate();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setEditingId(null);
        setTool('select');
      } else if (e.key === 'Enter' && selectedIds.size === 1) {
        const shape = latestRef.current[[...selectedIds][0]];
        if (shape && (shape.type === 'text' || shape.type === 'note' || shape.type === 'arrow')) {
          e.preventDefault();
          setEditingId(shape.id);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const keyTool: Record<string, WBTool> = { v: 'select', h: 'hand', t: 'text', n: 'note', a: 'arrow', i: 'image' };
        const next = keyTool[e.key.toLowerCase()];
        if (next) setTool(next);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedIds, handleDelete, handleGroup, handleUngroup, handleDuplicate, handleSelectAll]);

  /* ---------- derived ---------- */

  const selectedShapes = [...selectedIds].map((id) => shapes[id]).filter(Boolean);
  const canGroup = selectedShapes.filter((s) => !s.parentId && s.type !== 'arrow').length >= 2;
  const canUngroup = selectedShapes.length === 1 && selectedShapes[0].type === 'group';
  const singleText =
    selectedShapes.length === 1 && selectedShapes[0].type === 'text' ? selectedShapes[0] : null;

  /* ---------- context menu entries ---------- */

  const menuShape = ctxMenu?.shapeId ? shapes[ctxMenu.shapeId] : null;
  const menuEntries: CtxMenuEntry[] = ctxMenu
    ? menuShape
      ? menuShape.type === 'arrow'
        ? [
            {
              icon: Pencil,
              label: 'Editar texto',
              shortcut: 'Enter',
              onClick: () => setEditingId(menuShape.id),
            },
            { icon: Copy, label: 'Duplicar', shortcut: 'Ctrl+D', onClick: handleDuplicate },
            'divider',
            { icon: Trash2, label: 'Excluir', shortcut: 'Del', danger: true, onClick: handleDelete },
          ]
        : [
            ...(menuShape.type === 'text' || menuShape.type === 'note'
              ? ([
                  {
                    icon: Pencil,
                    label: 'Editar',
                    shortcut: 'Enter',
                    onClick: () => setEditingId(menuShape.id),
                  },
                  'divider',
                ] as CtxMenuEntry[])
              : []),
            { icon: Copy, label: 'Duplicar', shortcut: 'Ctrl+D', onClick: handleDuplicate },
            'divider',
            { icon: BringToFront, label: 'Trazer para frente', onClick: handleBringToFront },
            { icon: SendToBack, label: 'Enviar para trás', onClick: handleSendToBack },
            'divider',
            { icon: Group, label: 'Agrupar', shortcut: 'Ctrl+G', disabled: !canGroup, onClick: handleGroup },
            {
              icon: Ungroup,
              label: 'Desagrupar',
              shortcut: 'Ctrl+Shift+G',
              disabled: !canUngroup,
              onClick: handleUngroup,
            },
            'divider',
            { icon: Trash2, label: 'Excluir', shortcut: 'Del', danger: true, onClick: handleDelete },
          ]
      : [
          { icon: Type, label: 'Texto', onClick: () => createAt('text', ctxMenu.canvas) },
          { icon: StickyNote, label: 'Bloco de texto', onClick: () => createAt('note', ctxMenu.canvas) },
          { icon: Gauge, label: 'Tracker', onClick: () => createAt('tracker', ctxMenu.canvas) },
          { icon: Clock, label: 'Relógio', onClick: () => createAt('clock', ctxMenu.canvas) },
          { icon: ImageIcon, label: 'Imagem…', onClick: () => pickImage(ctxMenu.canvas) },
          'divider',
          { icon: CheckSquare, label: 'Selecionar tudo', shortcut: 'Ctrl+A', onClick: handleSelectAll },
          'divider',
          {
            icon: Magnet,
            label: 'Snap à grade',
            checked: snapEnabled,
            onClick: () => setSnapEnabled((v) => !v),
          },
          {
            icon: Grid3x3,
            label: 'Mostrar grade',
            checked: gridVisible,
            onClick: () => setGridVisible((v) => !v),
          },
        ]
    : [];

  return (
    <div ref={rootRef} className="h-full w-full relative bg-app overflow-hidden flex flex-col">
      <div
        ref={scrollRef}
        className={`flex-1 relative w-full overflow-auto custom-scrollbar ${
          handActive ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onPointerDown={handleCanvasPointerDown}
        onContextMenu={handleContextMenuCanvas}
      >
        <div ref={contentRef} className="min-w-[2400px] min-h-[2400px] relative">
          {/* dot grid */}
          {gridVisible && (
            <div
              className="absolute inset-0 z-0 pointer-events-none opacity-[0.15]"
              style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
            />
          )}

          {topLevelShapes(shapes)
            .filter((s) => s.type !== 'arrow')
            .map((shape) => (
              <ShapeFrame
                key={shape.id}
                shape={shape}
                isSelected={selectedIds.has(shape.id)}
                showHandles={!handActive && selectedIds.size === 1 && selectedIds.has(shape.id)}
                panning={handActive}
                isBindTarget={bindTargetId === shape.id}
                onPointerDownShape={handlePointerDownShape}
                onDoubleClickShape={handleDoubleClickShape}
                onContextMenuShape={handleContextMenuShape}
                onResizeStart={beginResize}
                onReportSize={handleReportSize}
              >
                <ShapeView
                  shape={shape}
                  shapes={shapes}
                  interactive
                  autoFocus={editingId === shape.id}
                  updateProps={(patch) => updateProps(shape.id, patch)}
                  onExitEdit={() => setEditingId(null)}
                />
              </ShapeFrame>
            ))}

          <ArrowsLayer
            shapes={shapes}
            selectedIds={selectedIds}
            editingId={editingId}
            draft={arrowDraft}
            onPointerDownArrow={handlePointerDownShape}
            onDoubleClickArrow={handleDoubleClickShape}
            onContextMenuArrow={handleContextMenuShape}
            onEndpointDown={beginArrowEndpointDrag}
            onLabelCommit={(arrow, text) => {
              updateProps(arrow.id, { text });
              setEditingId(null);
            }}
            onExitEdit={() => setEditingId(null)}
          />

          {/* marquee rect */}
          {marquee && (
            <div
              className="absolute z-40 border border-accent bg-accent-soft pointer-events-none"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}
        </div>
      </div>

      <WhiteboardToolbar
        tool={tool}
        onToolChange={setTool}
        textStyle={
          singleText
            ? {
                size: singleText.props.size ?? 'text',
                onChange: (size) => updateProps(singleText.id, { size }),
              }
            : null
        }
        canGroup={canGroup}
        canUngroup={canUngroup}
        canDelete={selectedIds.size > 0}
        onGroup={handleGroup}
        onUngroup={handleUngroup}
        onDelete={handleDelete}
      />

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} entries={menuEntries} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  );
}
