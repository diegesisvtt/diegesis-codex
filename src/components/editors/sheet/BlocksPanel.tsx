// Painel "Blocos": lista arrastável de tipos de bloco (mesma fonte da
// floating toolbar). Arraste um item para o canvas para adicioná-lo.
import { useDraggable } from '@dnd-kit/core';
import { TOOL_ITEMS, type ToolItem } from './FloatingToolbar';

export function BlocksPanel() {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1">Arraste para a ficha</div>
      {TOOL_ITEMS.map((item) => (
        <DraggableBlockRow key={item.kind} item={item} />
      ))}
    </div>
  );
}

function DraggableBlockRow({ item }: { item: ToolItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${item.kind}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-line bg-elevated/50 text-[12px] text-ink-2 hover:text-ink-1 hover:border-sheet/40 cursor-grab active:cursor-grabbing touch-none select-none transition-colors ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {item.icon}
      {item.label}
    </div>
  );
}
