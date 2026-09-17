import { useRef, useState } from 'react';
import { Link2, MapPin, MessageSquare, Pin as PinIcon, Trash2 } from 'lucide-react';
import type { PdfPin, PdfDocContent } from './model';
import { pinIcon } from './rpg';
import type { DocNode } from '@shared/types';
import { PinEmbed, PinTooltip } from './PinPanels';

interface PinLayerProps {
  pins: PdfPin[];
  docs: DocNode[];
  /** sequential monster numbers (#N chips) */
  numbers: Map<string, number>;
  onOpenPanel: (pinId: string) => void;
  onUpdate: (pinId: string, patch: Partial<PdfPin>) => void;
  onMove: (pinId: string, x: number, y: number) => void;
  onJumpToPin: (pinId: string) => void;
  onStartLink: (pinId: string) => void;
  onDelete: (pinId: string) => void;
  selectedPinId: string | null;
}

/** Renders pins over a page. Each pin shows as a marker with a rich hover
 *  tooltip (default) or as an embedded inline card (per-pin setting).
 *  Supports drag-to-move (4px threshold) and a right-click context menu. */
export function PinLayer({
  pins,
  docs,
  numbers,
  onOpenPanel,
  onUpdate,
  onMove,
  onJumpToPin,
  onStartLink,
  onDelete,
  selectedPinId,
}: PinLayerProps) {
  return (
    <>
      {pins.map((pin) => (
        <PinMarker
          key={pin.id}
          pin={pin}
          docs={docs}
          number={numbers.get(pin.id)}
          selected={pin.id === selectedPinId}
          onOpenPanel={onOpenPanel}
          onUpdate={onUpdate}
          onMove={onMove}
          onJumpToPin={onJumpToPin}
          onStartLink={onStartLink}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

/** Sequential number among monster pins (encounter-style #N chips). */
export function monsterNumbers(content: PdfDocContent): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const p of content.pins) {
    if (p.tag === 'monster' && !p.linkTargetPinId) map.set(p.id, ++n);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Pin context menu (right-click on the marker)
// ---------------------------------------------------------------------------

function PinContextMenu({
  pin,
  x,
  y,
  onClose,
  onOpenPanel,
  onUpdate,
  onJumpToPin,
  onStartLink,
  onDelete,
}: {
  pin: PdfPin;
  x: number;
  y: number;
  onClose: () => void;
  onOpenPanel: (pinId: string) => void;
  onUpdate: (patch: Partial<PdfPin>) => void;
  onJumpToPin: (pinId: string) => void;
  onStartLink: (pinId: string) => void;
  onDelete: (pinId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isToken = !!pin.linkTargetPinId;
  const mode = pin.display ?? 'tooltip';

  // keep the menu inside the window
  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - 240);

  const item = 'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-hover hover:text-ink-1 text-left';

  return (
    <>
      <div
        className="fixed inset-0 z-[90]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[91] w-[200px] bg-elevated border border-line rounded-lg shadow-xl py-1"
        style={{ left, top }}
      >
        {isToken ? (
          <>
            <button
              className={item}
              onClick={() => {
                onJumpToPin(pin.linkTargetPinId!);
                onClose();
              }}
            >
              <MapPin size={12} /> Ir à anotação original
            </button>
            <button
              className={`${item} ${confirmDelete ? 'text-danger hover:text-danger' : ''}`}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                onDelete(pin.id);
                onClose();
              }}
            >
              <Trash2 size={12} /> {confirmDelete ? 'Confirmar exclusão' : 'Excluir token'}
            </button>
          </>
        ) : (
          <>
            <button
              className={item}
              onClick={() => {
                onOpenPanel(pin.id);
                onClose();
              }}
            >
              <MapPin size={12} /> Abrir painel
            </button>

            <div className="my-1 border-t border-line/60" />
            <div className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Exibição</div>
            <button
              className={`${item} ${mode === 'tooltip' ? 'text-accent-ink' : ''}`}
              onClick={() => {
                onUpdate({ display: 'tooltip' });
                onClose();
              }}
            >
              <MessageSquare size={12} /> Tooltip ao passar o mouse
              {mode === 'tooltip' && <span className="ml-auto text-accent-ink">✓</span>}
            </button>
            <button
              className={`${item} ${mode === 'embed' ? 'text-accent-ink' : ''}`}
              onClick={() => {
                onUpdate({ display: 'embed' });
                onClose();
              }}
            >
              <PinIcon size={12} /> Embutir na página
              {mode === 'embed' && <span className="ml-auto text-accent-ink">✓</span>}
            </button>

            <label className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-ink-2 hover:bg-hover cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-accent"
                checked={!!pin.showLabel}
                onChange={(e) => onUpdate({ showLabel: e.target.checked })}
              />
              Rótulo no mapa
            </label>

            <div className="my-1 border-t border-line/60" />
            <button
              className={item}
              onClick={() => {
                onStartLink(pin.id);
                onClose();
              }}
            >
              <Link2 size={12} /> Criar token de link
            </button>
            <button
              className={`${item} ${confirmDelete ? 'text-danger hover:text-danger' : ''}`}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                onDelete(pin.id);
                onClose();
              }}
            >
              <Trash2 size={12} /> {confirmDelete ? 'Confirmar exclusão' : 'Excluir anotação'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

function PinMarker({
  pin,
  docs,
  number,
  selected,
  onOpenPanel,
  onUpdate,
  onMove,
  onJumpToPin,
  onStartLink,
  onDelete,
}: {
  pin: PdfPin;
  docs: DocNode[];
  number?: number;
  selected: boolean;
  onOpenPanel: (pinId: string) => void;
  onUpdate: (pinId: string, patch: Partial<PdfPin>) => void;
  onMove: (pinId: string, x: number, y: number) => void;
  onJumpToPin: (pinId: string) => void;
  onStartLink: (pinId: string) => void;
  onDelete: (pinId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const note = docs.find((d) => d.id === pin.noteId);
  const title = note?.title ?? '—';
  // the pin inherits the note's page icon (falling back to its own legacy icon)
  const Icon = pinIcon(note?.icon ?? pin.icon);
  const isToken = !!pin.linkTargetPinId;
  const embedded = !isToken && pin.display === 'embed';

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { px: e.clientX, py: e.clientY, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (!start.moved && Math.hypot(e.clientX - start.px, e.clientY - start.py) < 4) return;
    start.moved = true;
    setDragging(true);
    const page = (e.currentTarget as HTMLElement).closest('.pdf-page') as HTMLElement;
    if (!page) return;
    const rect = page.getBoundingClientRect();
    setPos({
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (start?.moved && pos) {
      onMove(pin.id, pos.x, pos.y);
      setPos(null);
      setDragging(false);
    } else if (start) {
      if (isToken) onJumpToPin(pin.linkTargetPinId!);
      else onOpenPanel(pin.id);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHovered(false);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const enter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), 250);
  };
  const leave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(false), 200);
  };

  const x = pos?.x ?? pin.x;
  const y = pos?.y ?? pin.y;

  // embedded mode: the inline card replaces the marker (drag previews locally,
  // persists on release — same pattern as the marker drag)
  if (embedded && note) {
    return (
      <div
        className="absolute z-[7] select-none"
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, 6px)' }}
        onContextMenu={onContextMenu}
      >
        <PinEmbed
          pin={pin}
          note={note}
          onOpenPanel={onOpenPanel}
          onUpdate={(patch) => onUpdate(pin.id, patch)}
          onPreviewMove={(nx, ny) => setPos({ x: nx, y: ny })}
          onMoveEnd={(nx, ny) => {
            onMove(pin.id, nx, ny);
            setPos(null);
          }}
        />
        {menu && (
          <PinContextMenu
            pin={pin}
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onOpenPanel={onOpenPanel}
            onUpdate={(patch) => onUpdate(pin.id, patch)}
            onJumpToPin={onJumpToPin}
            onStartLink={onStartLink}
            onDelete={onDelete}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="absolute z-[6] -translate-x-1/2 -translate-y-1/2 select-none"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onContextMenu={onContextMenu}
    >
      <div
        role="button"
        tabIndex={-1}
        title={isToken ? `Referência: ${title} — clique para ir` : `${title} — clique para abrir, arraste para mover`}
        className={`flex items-center justify-center rounded-full shadow-md cursor-grab active:cursor-grabbing transition-transform
          ${dragging ? 'scale-110' : ''} ${selected ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-black/40' : ''}`}
        style={{
          width: isToken ? 22 : 26,
          height: isToken ? 22 : 26,
          background: pin.color,
          color: '#1a1a1a',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {isToken ? (
          <span className="text-[10px] font-bold leading-none">{pin.tokenFace || '→'}</span>
        ) : number !== undefined ? (
          <span className="text-[10px] font-bold leading-none">#{number}</span>
        ) : (
          <Icon size={14} strokeWidth={2.2} />
        )}
      </div>
      {pin.showLabel && !isToken && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shadow"
          style={{ background: pin.color, color: '#1a1a1a' }}
        >
          {title}
        </div>
      )}
      {hovered && !isToken && !dragging && !menu && (
        <PinTooltip
          pin={pin}
          note={note}
          onEmbed={() => {
            setHovered(false);
            onUpdate(pin.id, { display: 'embed' });
          }}
          onOpenPanel={onOpenPanel}
        />
      )}
      {menu && (
        <PinContextMenu
          pin={pin}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onOpenPanel={onOpenPanel}
          onUpdate={(patch) => onUpdate(pin.id, patch)}
          onJumpToPin={onJumpToPin}
          onStartLink={onStartLink}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
