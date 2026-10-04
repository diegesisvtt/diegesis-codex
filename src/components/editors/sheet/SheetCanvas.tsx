// Canvas de grid da ficha: posiciona blocos por {x,y,w,h} em unidades de grid,
// com drag (snap-to-grid via dnd-kit), resize por grip, drop/arm-to-place da
// floating toolbar no modo edição. Envolve toda a área do editor no DndContext
// para que a toolbar flutuante (fora da área de scroll) participe do drag.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { GripVertical, X } from 'lucide-react';
import { layoutRows, type SheetBlock, type SheetLayout } from '@shared/sheetLayout';

export interface SheetCanvasProps {
  layout: SheetLayout;
  editing: boolean;
  selectedId: string | null;
  /** ferramenta armada (floating toolbar): clique no canvas posiciona o bloco */
  armedTool: string | null;
  onSelect: (id: string | null) => void;
  onMoveBlock: (id: string, dx: number, dy: number) => void;
  onResizeBlock: (id: string, w: number, h: number) => void;
  onRemoveBlock: (id: string) => void;
  onDropTool: (kind: string, x: number, y: number) => void;
  /** chamado após qualquer drag de ferramenta da toolbar (suprime clique pós-drag) */
  onToolDragEnd?: () => void;
  renderContent: (block: SheetBlock) => React.ReactNode;
  /** barra superior (menu de modelos, ações) */
  topbar?: React.ReactNode;
  /** conteúdo abaixo do canvas (audit trail) */
  footer?: React.ReactNode;
  /** overlays flutuantes (toolbar) — dentro do DndContext */
  floating?: React.ReactNode;
  /** painel lateral docked de propriedades (PanelShell) */
  sidePanel?: React.ReactNode;
}

interface Metrics {
  colW: number;
  rowHeight: number;
  gap: number;
}

export function SheetCanvas(props: SheetCanvasProps) {
  const { layout, editing, onMoveBlock, onDropTool } = props;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { cols, rowHeight, gap } = layout.grid;
  const metrics: Metrics = useMemo(
    () => ({ colW: width > 0 ? (width - gap * (cols - 1)) / cols : 0, rowHeight, gap }),
    [width, cols, rowHeight, gap],
  );
  const stepX = metrics.colW + gap;
  const stepY = rowHeight + gap;

  const snapToGrid: Modifier = useMemo(
    () =>
      ({ transform }) => ({
        ...transform,
        x: stepX > gap ? Math.round(transform.x / stepX) * stepX : transform.x,
        y: Math.round(transform.y / stepY) * stepY,
      }),
    [stepX, stepY, gap],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    if (id.startsWith('palette:')) {
      props.onToolDragEnd?.();
      if (e.over?.id !== 'canvas' || !canvasRef.current || stepX <= gap) return;
      const start = e.activatorEvent as PointerEvent;
      const rect = canvasRef.current.getBoundingClientRect();
      const px = start.clientX + e.delta.x - rect.left;
      const py = start.clientY + e.delta.y - rect.top;
      onDropTool(id.slice('palette:'.length), Math.max(0, Math.round(px / stepX)), Math.max(0, Math.round(py / stepY)));
      return;
    }
    if (stepX <= gap) return;
    onMoveBlock(id, Math.round(e.delta.x / stepX), Math.round(e.delta.y / stepY));
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editing || !props.armedTool || !canvasRef.current || stepX <= gap) return;
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.round((e.clientX - rect.left) / stepX));
    const y = Math.max(0, Math.round((e.clientY - rect.top) / stepY));
    onDropTool(props.armedTool, x, y);
  };

  const rows = layoutRows(layout);

  return (
    <DndContext sensors={sensors} modifiers={editing ? [snapToGrid] : []} onDragEnd={onDragEnd}>
      <div className="sheet-theme h-full bg-app flex min-h-0">
        <div className="relative flex-1 min-w-0">
          <div className="h-full overflow-y-auto custom-scrollbar" onClick={() => props.onSelect(null)}>
            <div className="max-w-[860px] mx-auto px-6 pt-4 pb-24 flex flex-col gap-3">
              {props.topbar}
              <CanvasDropZone
                innerRef={canvasRef}
                editing={editing}
                height={rows * stepY}
                crosshair={editing && props.armedTool !== null}
                onClick={onCanvasClick}
              >
                {width > 0 &&
                  layout.blocks.map((b) => (
                    <BlockShell key={b.id} block={b} metrics={metrics} canvasProps={props} />
                  ))}
              </CanvasDropZone>
              {props.footer}
            </div>
          </div>
          {props.floating}
        </div>
        {props.sidePanel}
      </div>
    </DndContext>
  );
}

function CanvasDropZone({
  innerRef,
  editing,
  height,
  crosshair,
  onClick,
  children,
}: {
  innerRef: React.MutableRefObject<HTMLDivElement | null>;
  editing: boolean;
  height: number;
  crosshair: boolean;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: 'canvas', disabled: !editing });
  return (
    <div
      ref={(el) => {
        innerRef.current = el;
        setNodeRef(el);
      }}
      onClick={onClick}
      className={`relative w-full ${editing ? 'rounded-lg outline outline-1 outline-dashed outline-line' : ''} ${crosshair ? 'cursor-crosshair' : ''}`}
      style={{ height }}
    >
      {children}
    </div>
  );
}

function BlockShell({
  block,
  metrics,
  canvasProps,
}: {
  block: SheetBlock;
  metrics: Metrics;
  canvasProps: SheetCanvasProps;
}) {
  const { editing, selectedId, onSelect, onResizeBlock, onRemoveBlock, renderContent } = canvasProps;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    disabled: !editing,
  });
  const [resize, setResize] = useState<{ w: number; h: number } | null>(null);

  const { colW, rowHeight, gap } = metrics;
  const stepX = colW + gap;
  const stepY = rowHeight + gap;
  const w = resize?.w ?? block.w;
  const h = resize?.h ?? block.h;
  const style: React.CSSProperties = {
    left: block.x * stepX,
    top: block.y * stepY,
    width: w * colW + (w - 1) * gap,
    height: h * rowHeight + (h - 1) * gap,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    zIndex: isDragging ? 30 : undefined,
  };

  const onGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    let next = { w: block.w, h: block.h };
    const onMove = (ev: PointerEvent) => {
      next = {
        w: Math.max(1, block.w + Math.round((ev.clientX - startX) / stepX)),
        h: Math.max(1, block.h + Math.round((ev.clientY - startY) / stepY)),
      };
      setResize(next);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setResize(null);
      if (next.w !== block.w || next.h !== block.h) onResizeBlock(block.id, next.w, next.h);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  if (!editing) {
    return (
      <div className="absolute" style={style}>
        {renderContent(block)}
      </div>
    );
  }

  const selected = selectedId === block.id;
  return (
    <div
      ref={setNodeRef}
      className={`absolute rounded-xl ${selected ? 'ring-1 ring-sheet/70' : 'ring-1 ring-dashed ring-line hover:ring-sheet/40'}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      {...attributes}
    >
      <div className="h-full w-full">{renderContent(block)}</div>
      <div
        {...listeners}
        title="Arrastar"
        className="absolute -top-2 -left-2 p-1 rounded-md bg-overlay border border-line text-ink-3 hover:text-ink-1 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={12} />
      </div>
      <button
        type="button"
        title="Remover bloco"
        onClick={(e) => {
          e.stopPropagation();
          onRemoveBlock(block.id);
        }}
        className="absolute -top-2 -right-2 p-1 rounded-md bg-overlay border border-line text-ink-3 hover:text-danger hover:border-danger/50"
      >
        <X size={11} />
      </button>
      <div
        title="Redimensionar"
        onPointerDown={onGripPointerDown}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize touch-none"
        style={{ background: 'linear-gradient(135deg, transparent 50%, var(--color-sheet) 50%)', borderRadius: '0 0 10px 0', opacity: 0.7 }}
      />
    </div>
  );
}
