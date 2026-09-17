import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../../state/store';
import {
  createShape,
  parseShapes,
  serializeShapes,
  topLevelShapes,
  childrenOf,
  shapeBounds,
  boundsIntersect,
  groupShapes,
  ungroupShape,
  deleteShapes,
  DEFAULT_SIZE,
} from './model';
import type { WBShape, WBShapeMap, WBBounds } from './model';
import { ShapeView } from './ShapeView';
import { WhiteboardToolbar } from './Toolbar';
import type { WBTool } from './Toolbar';

/** px the pointer must travel before a press becomes a drag (tldraw "pointing" state) */
const DRAG_THRESHOLD = 4;

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
};
const MIN_GROUP_SIZE = 40;

/* ============================================================
   Shape frame — positioning, selection chrome, size reporting
   ============================================================ */

function ShapeFrame({
  shape,
  isSelected,
  showHandles,
  panning,
  onPointerDownShape,
  onDoubleClickShape,
  onResizeStart,
  onReportSize,
  children,
}: {
  shape: WBShape;
  isSelected: boolean;
  showHandles: boolean;
  /** hand tool active: frames let pointer events bubble up to the canvas pan */
  panning: boolean;
  onPointerDownShape(shape: WBShape, e: React.PointerEvent): void;
  onDoubleClickShape(shape: WBShape): void;
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
    >
      {isSelected && (
        <div className="absolute -inset-1.5 rounded-lg border-2 border-accent pointer-events-none" />
      )}
      {showHandles &&
        HANDLE_DEFS.filter((h) => shape.type === 'group' || WIDTH_HANDLES.has(h.id)).map((h) => (
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
  /** space key held down: temporary hand tool (tldraw-style) */
  const [spacePan, setSpacePan] = useState(false);
  /** a pan gesture is in progress */
  const [panning, setPanning] = useState(false);
  /** transient shape positions while dragging (persisted on pointer up) */
  const [liveShapes, setLiveShapes] = useState<WBShapeMap | null>(null);

  const handActive = tool === 'hand' || spacePan;

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
    origins: Map<string, { x: number; y: number }>;
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
      const origins = new Map<string, { x: number; y: number }>();
      for (const id of ids) {
        const s = base[id];
        if (s && !s.parentId) origins.set(id, { x: s.x, y: s.y });
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
        const next: WBShapeMap = { ...drag.base };
        for (const [id, origin] of drag.origins) {
          const s = next[id];
          next[id] = { ...s, x: Math.max(0, Math.round(origin.x + dx)), y: Math.max(0, Math.round(origin.y + dy)) };
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
    [save]
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
          if (handle.includes('e')) newW = orig.w + dx;
          if (handle.includes('w')) newW = orig.w - dx;
          if (handle.includes('s')) newH = orig.h + dy;
          if (handle.includes('n')) newH = orig.h - dy;
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
          let newW = orig.w;
          let newX = orig.x;
          if (handle.includes('e')) newW = Math.max(minW, orig.w + dx);
          if (handle.includes('w')) {
            newW = Math.max(minW, orig.w - dx);
            newX = orig.x + (orig.w - newW); // keep the right edge pinned
          }
          next[session.shapeId] = { ...target, x: Math.round(newX), props: { ...target.props, w: Math.round(newW) } };
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
      if (shape.type === 'text' || shape.type === 'note') {
        setSelectedIds(new Set([shape.id]));
        setEditingId(shape.id);
      }
    },
    [handActive]
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

      if (tool !== 'select') {
        const size = DEFAULT_SIZE[tool];
        const shape = createShape(
          tool,
          Math.max(0, Math.round(point.x - size.w / 2)),
          Math.max(0, Math.round(point.y - size.h / 2))
        );
        save({ ...latestRef.current, [shape.id]: shape });
        setSelectedIds(new Set([shape.id]));
        if (tool === 'text' || tool === 'note') setEditingId(shape.id);
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
          .filter((s) => boundsIntersect(shapeBounds(s), rect))
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
    [tool, handActive, beginPan, save, selectedIds, toCanvas]
  );

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
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setEditingId(null);
        setTool('select');
      } else if (e.key === 'Enter' && selectedIds.size === 1) {
        const shape = latestRef.current[[...selectedIds][0]];
        if (shape && (shape.type === 'text' || shape.type === 'note')) {
          e.preventDefault();
          setEditingId(shape.id);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const keyTool: Record<string, WBTool> = { v: 'select', h: 'hand', t: 'text', n: 'note' };
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
  }, [selectedIds, handleDelete, handleGroup, handleUngroup]);

  /* ---------- derived ---------- */

  const selectedShapes = [...selectedIds].map((id) => shapes[id]).filter(Boolean);
  const canGroup = selectedShapes.filter((s) => !s.parentId).length >= 2;
  const canUngroup = selectedShapes.length === 1 && selectedShapes[0].type === 'group';
  const singleText =
    selectedShapes.length === 1 && selectedShapes[0].type === 'text' ? selectedShapes[0] : null;

  return (
    <div ref={rootRef} className="h-full w-full relative bg-app overflow-hidden flex flex-col">
      <div
        ref={scrollRef}
        className={`flex-1 relative w-full overflow-auto custom-scrollbar ${
          handActive ? (panning ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onPointerDown={handleCanvasPointerDown}
      >
        <div ref={contentRef} className="min-w-[2400px] min-h-[2400px] relative">
          {/* dot grid */}
          <div
            className="absolute inset-0 z-0 pointer-events-none opacity-[0.15]"
            style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />

          {topLevelShapes(shapes).map((shape) => (
            <ShapeFrame
              key={shape.id}
              shape={shape}
              isSelected={selectedIds.has(shape.id)}
              showHandles={!handActive && selectedIds.size === 1 && selectedIds.has(shape.id)}
              panning={handActive}
              onPointerDownShape={handlePointerDownShape}
              onDoubleClickShape={handleDoubleClickShape}
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
    </div>
  );
}
