// Floating toolbar de construção da ficha, inspirada no tldraw: pill flutuante
// na base do canvas com ferramentas (blocos). Clique arma a ferramenta
// (clique no canvas posiciona); arrastar da toolbar também funciona.
import { useDraggable } from '@dnd-kit/core';
import {
  CheckSquare,
  Dices,
  Hash,
  Heading,
  MousePointer2,
  Sigma,
  Sparkles,
  StickyNote,
  Type,
  UserSquare,
} from 'lucide-react';
import type { SheetBlock } from '@shared/sheetLayout';
import { newBlockId } from '@shared/sheetLayout';

export interface ToolItem {
  kind: string;
  label: string;
  icon: React.ReactNode;
  /** cria o bloco na célula (x, y) do drop/clique */
  make: (x: number, y: number) => SheetBlock;
}

let customCounter = 0;

export const TOOL_ITEMS: ToolItem[] = [
  {
    kind: 'number',
    label: 'Número',
    icon: <Hash size={14} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.campo${customCounter}`, label: 'Campo', input: 'number', x, y, w: 3, h: 2 };
    },
  },
  {
    kind: 'text-field',
    label: 'Texto',
    icon: <Type size={14} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.texto${customCounter}`, label: 'Texto', input: 'text', x, y, w: 4, h: 2 };
    },
  },
  {
    kind: 'checkbox',
    label: 'Checkbox',
    icon: <CheckSquare size={14} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.flag${customCounter}`, label: 'Flag', input: 'checkbox', x, y, w: 3, h: 2 };
    },
  },
  {
    kind: 'die',
    label: 'Dado',
    icon: <Dices size={14} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.dado${customCounter}`, label: 'Dado', input: 'die', x, y, w: 3, h: 2 };
    },
  },
  {
    kind: 'derived',
    label: 'Derivado',
    icon: <Sigma size={14} />,
    make: (x, y) => ({ id: newBlockId(), type: 'derived', path: 'pv.metade', label: 'pv.metade', x, y, w: 3, h: 2 }),
  },
  {
    kind: 'identity',
    label: 'Identidade',
    icon: <UserSquare size={14} />,
    make: (x, y) => ({ id: newBlockId(), type: 'identity', key: 'notas', label: 'Notas', multiline: true, x, y, w: 4, h: 3 }),
  },
  {
    kind: 'rolls',
    label: 'Rolagens',
    icon: <Dices size={14} />,
    make: (x, y) => ({ id: newBlockId(), type: 'rolls', templates: [], x, y, w: 12, h: 2 }),
  },
  {
    kind: 'effects',
    label: 'Efeitos',
    icon: <Sparkles size={14} />,
    make: (x, y) => ({ id: newBlockId(), type: 'effects', x, y, w: 12, h: 4 }),
  },
  {
    kind: 'note',
    label: 'Anotação',
    icon: <StickyNote size={14} />,
    make: (x, y) => ({ id: newBlockId(), type: 'text', text: '', x, y, w: 4, h: 3 }),
  },
  {
    kind: 'section',
    label: 'Seção',
    icon: <Heading size={14} />,
    make: (x, y) => ({ id: newBlockId(), type: 'section', title: 'Seção', x, y, w: 12, h: 1 }),
  },
];

export function toolItem(kind: string): ToolItem | undefined {
  return TOOL_ITEMS.find((i) => i.kind === kind);
}

export interface FloatingToolbarProps {
  armedTool: string | null;
  onArm: (kind: string | null) => void;
  /** chamado após qualquer drag de ferramenta (para suprimir o clique pós-drag) */
  dragGuardRef: React.MutableRefObject<boolean>;
}

export function FloatingToolbar({ armedTool, onArm, dragGuardRef }: FloatingToolbarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 select-none">
      <div className="flex items-center gap-0.5 rounded-full border border-line-strong bg-overlay/95 backdrop-blur-md px-1.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
        <ToolButton
          label="Selecionar"
          active={armedTool === null}
          onClick={() => onArm(null)}
        >
          <MousePointer2 size={14} />
        </ToolButton>
        <div className="w-px h-5 bg-line mx-1" />
        {TOOL_ITEMS.map((item) => (
          <DraggableTool key={item.kind} item={item} armed={armedTool === item.kind} onArm={onArm} dragGuardRef={dragGuardRef} />
        ))}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`p-2 rounded-full transition-colors ${
        active ? 'bg-sheet-soft text-sheet-strong ring-1 ring-sheet/50' : 'text-ink-2 hover:text-ink-1 hover:bg-hover'
      }`}
    >
      {children}
    </button>
  );
}

function DraggableTool({
  item,
  armed,
  onArm,
  dragGuardRef,
}: {
  item: ToolItem;
  armed: boolean;
  onArm: (kind: string | null) => void;
  dragGuardRef: React.MutableRefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${item.kind}` });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-40' : ''}>
      <ToolButton
        label={`${item.label} — clique p/ armar ou arraste p/ a ficha`}
        active={armed}
        onClick={() => {
          // suprime o clique que o browser dispara ao fim de um drag real
          if (dragGuardRef.current) {
            dragGuardRef.current = false;
            return;
          }
          onArm(armed ? null : item.kind);
        }}
      >
        {item.icon}
      </ToolButton>
    </div>
  );
}
