import { useEffect, useRef } from 'react';
import { Bookmark } from 'lucide-react';
import { PIN_TAG_COLORS, PIN_TAG_LABELS, UNTAGGED_PIN_COLOR, type PdfPinTag } from './model';
import { pinIcon, TAG_DEFAULT_ICON } from './rpg';

export interface ContextMenuState {
  /** screen coords for the menu */
  x: number;
  y: number;
  /** page and fractional position where the right-click happened */
  page: number;
  fx: number;
  fy: number;
  bookmarked: boolean;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onPickPin: (tag: PdfPinTag) => void;
  onToggleBookmark: () => void;
  onClose: () => void;
}

/** Right-click menu on a PDF page: pin types + bookmark toggle. */
export function PdfContextMenu({ state, onPickPin, onToggleBookmark, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const tags: (NonNullable<PdfPinTag>)[] = ['monster', 'npc', 'trap', 'treasure', 'clue', 'room', 'table'];

  // keep the menu inside the window
  const style: React.CSSProperties = {
    left: Math.min(state.x, window.innerWidth - 220),
    top: Math.min(state.y, window.innerHeight - 320),
  };

  return (
    <div ref={ref} className="fixed z-50 w-52 bg-elevated border border-line rounded-lg shadow-xl py-1 animate-fade-in" style={style}>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">
        Soltar pin aqui
      </div>
      <MenuItem color={UNTAGGED_PIN_COLOR} icon="pencil" label="Nota" onClick={() => onPickPin(null)} />
      {tags.map((tag) => (
        <MenuItem key={tag} color={PIN_TAG_COLORS[tag]} icon={TAG_DEFAULT_ICON[tag]} label={PIN_TAG_LABELS[tag]} onClick={() => onPickPin(tag)} />
      ))}
      <div className="my-1 border-t border-line" />
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 text-left"
        onClick={onToggleBookmark}
      >
        <Bookmark size={13} className={state.bookmarked ? 'fill-current text-danger' : 'text-ink-3'} />
        {state.bookmarked ? 'Remover marcador' : 'Marcar página'}
      </button>
    </div>
  );
}

function MenuItem({ color, icon, label, onClick }: { color: string; icon: string; label: string; onClick: () => void }) {
  const Icon = pinIcon(icon);
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 text-left"
      onClick={onClick}
    >
      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: color, color: '#1a1a1a' }}>
        <Icon size={10} strokeWidth={2.4} />
      </span>
      {label}
    </button>
  );
}
