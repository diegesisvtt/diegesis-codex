import React, { useCallback, useRef, useState } from 'react';
import { LayoutGrid, Plus, Clock, Trash2 } from 'lucide-react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../state/store';
import { Button } from '../ui';

const generateId = () => Math.random().toString(36).slice(2, 10);

interface WNode {
  id: string;
  type: 'rpg/tracker' | 'rpg/clock';
  x: number;
  y: number;
  data: any;
}

function ProgressClock({
  segments = 4,
  filled = 0,
  size = 120,
  onSegmentClick,
}: {
  segments?: number;
  filled?: number;
  size?: number;
  onSegmentClick?(n: number): void;
}) {
  const radius = size / 2 - 10;
  const center = size / 2;

  const wedge = (index: number) => {
    const angle = 360 / segments;
    const start = (index * angle - 90) * (Math.PI / 180);
    const end = ((index + 1) * angle - 90) * (Math.PI / 180);
    const x1 = center + radius * Math.cos(start);
    const y1 = center + radius * Math.sin(start);
    const x2 = center + radius * Math.cos(end);
    const y2 = center + radius * Math.sin(end);
    const d = [`M ${center} ${center}`, `L ${x1} ${y1}`, `A ${radius} ${radius} 0 ${angle > 180 ? 1 : 0} 1 ${x2} ${y2}`, 'Z'].join(' ');
    const isFilled = index < filled;
    return (
      <path
        key={index}
        d={d}
        fill={isFilled ? 'var(--color-accent)' : 'transparent'}
        stroke="var(--color-line-strong)"
        strokeWidth="2"
        className="transition-colors duration-200 cursor-pointer hover:opacity-80"
        onClick={(e) => {
          e.stopPropagation();
          if (!onSegmentClick) return;
          onSegmentClick(isFilled && index === filled - 1 ? filled - 1 : index + 1);
        }}
      />
    );
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="filter drop-shadow-md">
      <circle cx={center} cy={center} r={radius} fill="var(--color-sidebar)" stroke="var(--color-line-strong)" strokeWidth="2" />
      {Array.from({ length: segments }).map((_, i) => wedge(i))}
    </svg>
  );
}

function NodeWrapper({
  node,
  isSelected,
  onSelect,
  onMove,
  onRemove,
  children,
}: {
  node: WNode;
  isSelected: boolean;
  onSelect(id: string): void;
  onMove(id: string, x: number, y: number): void;
  onRemove(id: string): void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const tag = (e.target as HTMLElement).tagName;
    if (['INPUT', 'BUTTON', 'TEXTAREA', 'PATH'].includes(tag)) return;
    e.stopPropagation();
    onSelect(node.id);
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = ref.current!.getBoundingClientRect();
    setOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const parent = ref.current!.parentElement!.getBoundingClientRect();
    const x = Math.round((e.clientX - parent.left - offset.x) / 20) * 20;
    const y = Math.round((e.clientY - parent.top - offset.y) / 20) * 20;
    onMove(node.id, Math.max(0, x), Math.max(0, y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={ref}
      className={`absolute select-none group touch-none ${dragging ? 'z-50 cursor-grabbing' : 'z-10 cursor-grab'} ${
        isSelected ? 'ring-2 ring-accent rounded-lg' : ''
      }`}
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(node.id);
          }}
          className="bg-danger-soft text-danger p-1.5 rounded-full shadow-lg border border-line hover:bg-[rgba(235,87,87,0.28)]"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="bg-elevated/95 backdrop-blur border border-line rounded-lg shadow-xl overflow-hidden min-w-[200px]">
        {children}
      </div>
    </div>
  );
}

export function Whiteboard({ doc }: { doc: DocNode }) {
  const { updateDocument } = useStore();
  const [selected, setSelected] = useState<string | null>(null);

  const nodes: WNode[] = (() => {
    try {
      return doc.content ? (JSON.parse(doc.content).nodes ?? []) : [];
    } catch {
      return [];
    }
  })();

  const save = useCallback(
    (next: WNode[]) => updateDocument(doc.id, { content: JSON.stringify({ nodes: next }) }),
    [doc.id, updateDocument]
  );

  const handleMove = (id: string, x: number, y: number) =>
    save(nodes.map((n) => (n.id === id ? { ...n, x, y } : n)));

  const updateData = (id: string, patch: any) =>
    save(nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));

  const remove = (id: string) => save(nodes.filter((n) => n.id !== id));

  const add = (type: WNode['type']) => {
    const base = { id: generateId(), type, x: Math.random() * 200 + 60, y: Math.random() * 200 + 60 };
    const node: WNode =
      type === 'rpg/tracker'
        ? { ...base, data: { name: 'Novo Atributo', value: 10, max: 20 } }
        : { ...base, data: { name: 'Novo Relógio', segments: 4, filled: 0 } };
    save([...nodes, node]);
  };

  return (
    <div className="h-full w-full relative bg-app overflow-hidden flex flex-col">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.15]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      />
      <div className="relative z-10 flex px-4 h-11 gap-2 border-b border-line bg-sidebar/60 backdrop-blur items-center justify-between shrink-0">
        <h2 className="text-[13px] font-semibold text-ink-1 flex items-center gap-2 truncate">
          <LayoutGrid className="text-board shrink-0" size={16} /> {doc.title}
        </h2>
        <div className="flex gap-1.5">
          <Button variant="secondary" onClick={() => add('rpg/tracker')} className="!text-xs !px-2.5 !py-1">
            <Plus size={13} /> Atributo
          </Button>
          <Button variant="secondary" onClick={() => add('rpg/clock')} className="!text-xs !px-2.5 !py-1">
            <Clock size={13} /> Relógio
          </Button>
        </div>
      </div>

      <div className="flex-1 relative w-full overflow-auto custom-scrollbar" onClick={() => setSelected(null)}>
        <div className="min-w-[2000px] min-h-[2000px] relative">
          {nodes.map((node) => (
            <NodeWrapper
              key={node.id}
              node={node}
              isSelected={selected === node.id}
              onSelect={setSelected}
              onMove={handleMove}
              onRemove={remove}
            >
              {node.type === 'rpg/tracker' && (
                <div className="p-4 w-64">
                  <input
                    className="bg-transparent text-ink-1 font-semibold mb-3 w-full border-none outline-none p-0 text-[15px] placeholder-ink-3"
                    value={node.data.name}
                    onChange={(e) => updateData(node.id, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-[10px] text-ink-3 uppercase font-semibold tracking-widest mb-1">Atual</div>
                      <input
                        type="number"
                        className="bg-sidebar text-ink-1 rounded-md p-2 w-full text-center text-xl font-bold border border-line focus:border-accent outline-none transition-colors"
                        value={node.data.value}
                        onChange={(e) => updateData(node.id, { value: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="text-ink-3 font-light text-2xl pt-4">/</div>
                    <div className="flex-1">
                      <div className="text-[10px] text-ink-3 uppercase font-semibold tracking-widest mb-1">Max</div>
                      <input
                        type="number"
                        className="bg-sidebar/60 text-ink-2 rounded-md p-2 w-full text-center text-xl font-bold border border-line outline-none"
                        value={node.data.max}
                        onChange={(e) => updateData(node.id, { max: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div className="h-1 w-full bg-sidebar rounded-full mt-4 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, (node.data.value / (node.data.max || 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              )}

              {node.type === 'rpg/clock' && (
                <div className="p-5 flex flex-col items-center">
                  <input
                    className="bg-transparent text-ink-1 font-semibold mb-4 w-full text-center border-none outline-none p-0 text-[15px]"
                    value={node.data.name}
                    onChange={(e) => updateData(node.id, { name: e.target.value })}
                  />
                  <ProgressClock
                    segments={node.data.segments}
                    filled={node.data.filled}
                    onSegmentClick={(filled) => updateData(node.id, { filled })}
                  />
                  <div className="flex items-center gap-2 mt-4 text-[13px] text-ink-2">
                    <button
                      onClick={() => updateData(node.id, { segments: Math.max(2, node.data.segments - 2) })}
                      className="hover:text-ink-1 px-2 py-0.5 bg-sidebar border border-line rounded-md transition-colors"
                    >
                      -
                    </button>
                    <span>{node.data.segments} seg</span>
                    <button
                      onClick={() => updateData(node.id, { segments: Math.min(12, node.data.segments + 2) })}
                      className="hover:text-ink-1 px-2 py-0.5 bg-sidebar border border-line rounded-md transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </NodeWrapper>
          ))}
        </div>
      </div>
    </div>
  );
}
