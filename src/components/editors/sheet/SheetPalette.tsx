// Paleta de blocos arrastáveis (modo edição): cada chip é um useDraggable
// com id `palette:<kind>`; o drop no canvas cria o bloco correspondente.
import { useDraggable } from '@dnd-kit/core';
import {
  CheckSquare,
  Dices,
  Hash,
  Heading,
  Sigma,
  Sparkles,
  StickyNote,
  Type,
  UserSquare,
} from 'lucide-react';
import type { SheetBlock } from '@shared/sheetLayout';
import { newBlockId } from '@shared/sheetLayout';

export interface PaletteItem {
  kind: string;
  label: string;
  icon: React.ReactNode;
  /** cria o bloco na célula (x, y) do drop */
  make: (x: number, y: number) => SheetBlock;
}

let customCounter = 0;

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    kind: 'number',
    label: 'Número',
    icon: <Hash size={12} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.campo${customCounter}`, label: 'Campo', input: 'number', x, y, w: 3, h: 2 };
    },
  },
  {
    kind: 'text-field',
    label: 'Texto',
    icon: <Type size={12} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.texto${customCounter}`, label: 'Texto', input: 'text', x, y, w: 4, h: 2 };
    },
  },
  {
    kind: 'checkbox',
    label: 'Checkbox',
    icon: <CheckSquare size={12} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.flag${customCounter}`, label: 'Flag', input: 'checkbox', x, y, w: 3, h: 2 };
    },
  },
  {
    kind: 'die',
    label: 'Dado',
    icon: <Dices size={12} />,
    make: (x, y) => {
      customCounter += 1;
      return { id: newBlockId(), type: 'field', path: `custom.dado${customCounter}`, label: 'Dado', input: 'die', x, y, w: 3, h: 2 };
    },
  },
  {
    kind: 'derived',
    label: 'Derivado',
    icon: <Sigma size={12} />,
    make: (x, y) => ({ id: newBlockId(), type: 'derived', path: 'pv.metade', label: 'pv.metade', x, y, w: 3, h: 2 }),
  },
  {
    kind: 'identity',
    label: 'Identidade',
    icon: <UserSquare size={12} />,
    make: (x, y) => ({ id: newBlockId(), type: 'identity', key: 'notas', label: 'Notas', multiline: true, x, y, w: 4, h: 3 }),
  },
  {
    kind: 'rolls',
    label: 'Rolagens',
    icon: <Dices size={12} />,
    make: (x, y) => ({ id: newBlockId(), type: 'rolls', templates: [], x, y, w: 12, h: 2 }),
  },
  {
    kind: 'effects',
    label: 'Efeitos',
    icon: <Sparkles size={12} />,
    make: (x, y) => ({ id: newBlockId(), type: 'effects', x, y, w: 12, h: 4 }),
  },
  {
    kind: 'note',
    label: 'Anotação',
    icon: <StickyNote size={12} />,
    make: (x, y) => ({ id: newBlockId(), type: 'text', text: '', x, y, w: 4, h: 3 }),
  },
  {
    kind: 'section',
    label: 'Seção',
    icon: <Heading size={12} />,
    make: (x, y) => ({ id: newBlockId(), type: 'section', title: 'Seção', x, y, w: 12, h: 1 }),
  },
];

export function paletteItem(kind: string): PaletteItem | undefined {
  return PALETTE_ITEMS.find((i) => i.kind === kind);
}

export function SheetPalette() {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <span className="text-[10.5px] uppercase tracking-wide text-ink-3 select-none mr-1">Arrastar p/ ficha:</span>
      {PALETTE_ITEMS.map((item) => (
        <PaletteChip key={item.kind} item={item} />
      ))}
    </div>
  );
}

function PaletteChip({ item }: { item: PaletteItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${item.kind}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 px-2 py-1 rounded-md border border-line bg-elevated/60 text-[11.5px] text-ink-2 hover:text-ink-1 hover:border-accent/50 cursor-grab active:cursor-grabbing touch-none select-none ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {item.icon}
      {item.label}
    </div>
  );
}
