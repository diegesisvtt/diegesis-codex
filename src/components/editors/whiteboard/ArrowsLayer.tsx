import React from 'react';
import type { WBShape, WBShapeMap, ArrowPoint } from './model';
import { arrowEndpoints, topLevelShapes } from './model';

/* ============================================================
   ArrowsLayer — SVG overlay with bound arrows + HTML labels
   ============================================================ */

const HEAD_LEN = 12;
const HEAD_W = 7;

function ArrowHead({ x, y, angleDeg, color }: { x: number; y: number; angleDeg: number; color: string }) {
  return (
    <polygon
      points={`${-HEAD_LEN},${-HEAD_W / 2} 0,0 ${-HEAD_LEN},${HEAD_W / 2}`}
      transform={`translate(${x} ${y}) rotate(${angleDeg})`}
      fill={color}
      strokeLinejoin="round"
    />
  );
}

function ArrowLine({
  id,
  x1,
  y1,
  x2,
  y2,
  color,
  dashed,
  hitTarget,
}: {
  id?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dashed?: boolean;
  hitTarget?: {
    onPointerDown(e: React.PointerEvent): void;
    onDoubleClick(): void;
    onContextMenu(e: React.MouseEvent): void;
  };
}) {
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <g key={id}>
      {hitTarget && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="transparent"
          strokeWidth={14}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onPointerDown={hitTarget.onPointerDown}
          onDoubleClick={hitTarget.onDoubleClick}
          onContextMenu={hitTarget.onContextMenu}
        />
      )}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={dashed ? '6 5' : undefined}
      />
      <ArrowHead x={x2} y={y2} angleDeg={angle} color={color} />
    </g>
  );
}

function EndpointHandle({ x, y, onPointerDown }: { x: number; y: number; onPointerDown(e: React.PointerEvent): void }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={5.5}
      fill="var(--color-elevated)"
      stroke="var(--color-accent)"
      strokeWidth={1.5}
      style={{ pointerEvents: 'all', cursor: 'crosshair' }}
      onPointerDown={onPointerDown}
    />
  );
}

function ArrowLabel({
  arrow,
  x,
  y,
  editing,
  onCommit,
  onDoubleClick,
  onExitEdit,
}: {
  arrow: WBShape;
  x: number;
  y: number;
  editing: boolean;
  onCommit(text: string): void;
  onDoubleClick(): void;
  onExitEdit(): void;
}) {
  const text: string = arrow.props.text ?? '';
  if (!editing && !text) return null;
  return (
    <div className="absolute z-30" style={{ left: x, top: y, transform: 'translate(-50%,-50%)' }}>
      {editing ? (
        <input
          autoFocus
          defaultValue={text}
          placeholder="Texto…"
          className="bg-elevated border border-accent rounded-md px-2 py-0.5 text-[12px] text-ink-1 outline-none text-center min-w-[90px] shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value);
            else if (e.key === 'Escape') onExitEdit();
          }}
        />
      ) : (
        <div
          className="px-1.5 py-0.5 rounded-md bg-app/85 border border-line text-[12px] text-ink-1 whitespace-nowrap cursor-default select-none"
          onDoubleClick={onDoubleClick}
        >
          {text}
        </div>
      )}
    </div>
  );
}

export interface ArrowsLayerProps {
  shapes: WBShapeMap;
  selectedIds: Set<string>;
  editingId: string | null;
  /** live arrow being drawn with the arrow tool */
  draft: { start: ArrowPoint; end: ArrowPoint } | null;
  onPointerDownArrow(arrow: WBShape, e: React.PointerEvent): void;
  onDoubleClickArrow(arrow: WBShape): void;
  onContextMenuArrow(arrow: WBShape, e: React.MouseEvent): void;
  onEndpointDown(arrow: WBShape, end: 'start' | 'end', e: React.PointerEvent): void;
  onLabelCommit(arrow: WBShape, text: string): void;
  onExitEdit(): void;
}

export function ArrowsLayer({
  shapes,
  selectedIds,
  editingId,
  draft,
  onPointerDownArrow,
  onDoubleClickArrow,
  onContextMenuArrow,
  onEndpointDown,
  onLabelCommit,
  onExitEdit,
}: ArrowsLayerProps) {
  const arrows = topLevelShapes(shapes).filter((s) => s.type === 'arrow');

  return (
    <>
      <svg className="absolute inset-0 z-20 w-full h-full overflow-visible pointer-events-none">
        {arrows.map((arrow) => {
          const { x1, y1, x2, y2 } = arrowEndpoints(arrow, shapes);
          const selected = selectedIds.has(arrow.id);
          const color = selected ? 'var(--color-accent)' : 'var(--color-ink-2)';
          return (
            <g key={arrow.id}>
              <ArrowLine
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                color={color}
                hitTarget={{
                  onPointerDown: (e) => onPointerDownArrow(arrow, e),
                  onDoubleClick: () => onDoubleClickArrow(arrow),
                  onContextMenu: (e) => onContextMenuArrow(arrow, e),
                }}
              />
              {selected && (
                <>
                  <EndpointHandle x={x1} y={y1} onPointerDown={(e) => onEndpointDown(arrow, 'start', e)} />
                  <EndpointHandle x={x2} y={y2} onPointerDown={(e) => onEndpointDown(arrow, 'end', e)} />
                </>
              )}
            </g>
          );
        })}
        {draft && (
          <ArrowLine
            x1={draft.start.x}
            y1={draft.start.y}
            x2={draft.end.x}
            y2={draft.end.y}
            color="var(--color-accent)"
            dashed
          />
        )}
      </svg>

      {/* labels live in HTML for easy editing */}
      {arrows.map((arrow) => {
        const { x1, y1, x2, y2 } = arrowEndpoints(arrow, shapes);
        return (
          <ArrowLabel
            key={arrow.id}
            arrow={arrow}
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2}
            editing={editingId === arrow.id}
            onCommit={(text) => onLabelCommit(arrow, text)}
            onDoubleClick={() => onDoubleClickArrow(arrow)}
            onExitEdit={onExitEdit}
          />
        );
      })}
    </>
  );
}
