// Pin annotation surfaces: the docked PANEL and the on-page EMBED card both
// edit the underlying note with the main Notion-like editor (embedded mode) —
// there is no separate annotation editor. The hover TOOLTIP shows a snippet.
import { useRef, useState } from 'react';
import {
  Crosshair,
  GripVertical,
  Link2,
  MapPin,
  Maximize2,
  MessageSquare,
  Pin as PinIcon,
  Trash2,
  X,
} from 'lucide-react';
import type { DocNode } from '@shared/types';
import { blocksToPlainText } from '@shared/blockContent';
import { useStore } from '../../../state/store';
import { PIN_TAG_LABELS, type PdfDocContent, type PdfPin } from './model';
import { pinIcon } from './rpg';
import { NoteEditor } from '../NoteEditor';
import { DocIconPicker } from '../shared/DocIconPicker';
import type { usePdfAnnotations } from './useAnnotations';

type Annotations = ReturnType<typeof usePdfAnnotations>;

/** Plain-text snippet of a note's content (for tooltips). */
export function noteSnippet(content: string | null, max = 160): string {
  return blocksToPlainText(content).replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// Display mode toggle (tooltip vs embed), shared by panel + context menu
// ---------------------------------------------------------------------------

export function DisplayModeToggle({ pin, onUpdate }: { pin: PdfPin; onUpdate: (patch: Partial<PdfPin>) => void }) {
  const mode = pin.display ?? 'tooltip';
  return (
    <div className="flex items-center rounded-md border border-line overflow-hidden shrink-0" title="Como a anotação aparece na página">
      <button
        className={`p-1 ${mode === 'tooltip' ? 'bg-accent-soft text-accent-ink' : 'text-ink-3 hover:text-ink-1'}`}
        title="Tooltip ao passar o mouse"
        onClick={() => onUpdate({ display: 'tooltip' })}
      >
        <MessageSquare size={12} />
      </button>
      <button
        className={`p-1 ${mode === 'embed' ? 'bg-accent-soft text-accent-ink' : 'text-ink-3 hover:text-ink-1'}`}
        title="Embutir o editor na página"
        onClick={() => onUpdate({ display: 'embed' })}
      >
        <PinIcon size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docked panel — the annotation IS the note, edited with the main editor
// ---------------------------------------------------------------------------

export function PinPanel({
  pin,
  content,
  annotations,
  onJumpToPin,
  onStartLink,
  onLocate,
  onClose,
}: {
  pin: PdfPin;
  content: PdfDocContent;
  annotations: Annotations;
  onJumpToPin: (pinId: string) => void;
  onStartLink: (pinId: string) => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  const { docs, updateDocument } = useStore();
  const note = docs.find((d) => d.id === pin.noteId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!note) return null;

  const isToken = !!pin.linkTargetPinId;
  const tokens = content.pins.filter((p) => p.linkTargetPinId === pin.id);
  const onUpdate = (patch: Partial<PdfPin>) => annotations.updatePin(pin.id, patch);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* header */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 border-b border-line shrink-0"
        style={{ borderLeft: `3px solid ${pin.color}` }}
      >
        <DocIconPicker
          icon={note.icon ?? pin.icon}
          color={pin.color}
          size={14}
          onPick={(name) => updateDocument(note.id, { icon: name })}
        />
        <input
          className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-ink-1 outline-none placeholder:text-ink-3"
          value={note.title}
          placeholder="Sem título"
          onChange={(e) => updateDocument(note.id, { title: e.target.value })}
        />
        <span className="text-[10px] text-ink-3 shrink-0">p.{pin.page}</span>
        <DisplayModeToggle pin={pin} onUpdate={onUpdate} />
        <button className="p-1 text-ink-3 hover:text-ink-1 rounded hover:bg-hover shrink-0" title="Fechar painel" onClick={onClose}>
          <X size={13} />
        </button>
      </div>

      {/* body: the note itself — blocks, slash menu, drag handles, everything */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <NoteEditor doc={note} embedded showIcon={false} />
      </div>

      {/* link tokens */}
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-t border-line shrink-0">
          {tokens.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-overlay text-ink-2">
              <Link2 size={10} />
              p.{t.page}
              <button title="Ir ao token" className="text-accent-ink hover:text-accent" onClick={() => onJumpToPin(t.id)}>
                <Crosshair size={10} />
              </button>
              <button title="Excluir token" className="text-ink-3 hover:text-danger" onClick={() => annotations.deletePin(t.id)}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* footer actions */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-t border-line shrink-0">
        <PanelAction title="Localizar no PDF" onClick={onLocate}>
          <MapPin size={13} />
        </PanelAction>
        {!isToken && (
          <PanelAction
            title="Criar token de link (clique numa página — ou arraste a anotação da árvore até o PDF)"
            onClick={() => onStartLink(pin.id)}
          >
            <Link2 size={13} />
          </PanelAction>
        )}
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <button
              className="text-[11px] text-danger px-2 py-1 rounded hover:bg-danger-soft"
              onClick={() => {
                annotations.deletePin(pin.id);
                onClose();
              }}
            >
              Confirmar exclusão
            </button>
            <button className="text-[11px] text-ink-3 px-2 py-1 rounded hover:bg-hover" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <PanelAction title="Excluir anotação (apaga a nota)" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} className="text-danger/80" />
          </PanelAction>
        )}
      </div>
    </div>
  );
}

function PanelAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="p-1.5 text-ink-3 hover:text-ink-1 rounded hover:bg-hover">
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// On-page embed card (display: 'embed') — the note's editor on the page itself
// ---------------------------------------------------------------------------

export function PinEmbed({
  pin,
  note,
  onOpenPanel,
  onUpdate,
  onPreviewMove,
  onMoveEnd,
}: {
  pin: PdfPin;
  note: DocNode;
  onOpenPanel: (pinId: string) => void;
  onUpdate: (patch: Partial<PdfPin>) => void;
  /** live fractional position during drag (no persistence) */
  onPreviewMove: (x: number, y: number) => void;
  /** final position on release — this one persists */
  onMoveEnd: (x: number, y: number) => void;
}) {
  const dragRef = useRef<{ px: number; py: number; moved: boolean; last?: { x: number; y: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const Icon = pinIcon(note.icon ?? pin.icon);

  const onGripDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, moved: false };
  };
  const onGripMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;
    if (!start.moved && Math.hypot(e.clientX - start.px, e.clientY - start.py) < 4) return;
    start.moved = true;
    setDragging(true);
    const page = (e.currentTarget as HTMLElement).closest('.pdf-page') as HTMLElement;
    if (!page) return;
    const rect = page.getBoundingClientRect();
    const next = {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
    start.last = next;
    onPreviewMove(next.x, next.y);
  };
  const onGripUp = () => {
    const start = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (start?.moved && start.last) onMoveEnd(start.last.x, start.last.y);
  };

  return (
    <div
      className={`pdf-pin-embed w-[300px] rounded-lg border bg-elevated/95 backdrop-blur shadow-xl ${dragging ? 'border-accent' : 'border-line'}`}
      onClick={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* header: drag grip + title + actions */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 border-b border-line/60"
        style={{ borderLeft: `3px solid ${pin.color}` }}
      >
        <span
          className="cursor-grab active:cursor-grabbing text-ink-3 hover:text-ink-1 touch-none"
          title="Arrastar para mover"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
        >
          <GripVertical size={12} />
        </span>
        <Icon size={12} style={{ color: pin.color }} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-ink-1">{note.title}</span>
        <button
          className="p-0.5 text-ink-3 hover:text-ink-1 rounded hover:bg-hover"
          title="Abrir no painel"
          onClick={() => onOpenPanel(pin.id)}
        >
          <Maximize2 size={11} />
        </button>
        <button
          className="p-0.5 text-ink-3 hover:text-ink-1 rounded hover:bg-hover"
          title="Recolher para pin (tooltip)"
          onClick={() => onUpdate({ display: 'tooltip' })}
        >
          <MessageSquare size={11} />
        </button>
      </div>
      <div className="h-[240px] overflow-hidden">
        <NoteEditor doc={note} embedded showIcon={false} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hover tooltip (display: 'tooltip', default)
// ---------------------------------------------------------------------------

export function PinTooltip({
  pin,
  note,
  onEmbed,
  onOpenPanel,
}: {
  pin: PdfPin;
  note: DocNode | undefined;
  onEmbed: () => void;
  onOpenPanel: (pinId: string) => void;
}) {
  const snippet = noteSnippet(note?.content ?? null);
  const Icon = pinIcon(note?.icon ?? pin.icon);
  return (
    <div
      className="pdf-pin-tooltip absolute left-1/2 top-full mt-2 -translate-x-1/2 z-30 w-[240px] rounded-lg border border-line bg-elevated/95 backdrop-blur shadow-xl p-2.5 space-y-1.5 animate-fade-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color: pin.color }} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-ink-1">{note?.title ?? '—'}</span>
        {pin.tag && <span className="text-[9.5px] text-ink-3 shrink-0">{PIN_TAG_LABELS[pin.tag]}</span>}
      </div>
      {snippet && <p className="text-[11px] text-ink-2 leading-snug line-clamp-3">{snippet}</p>}
      <div className="flex items-center gap-1 pt-0.5">
        <button
          className="text-[10.5px] text-accent-ink hover:text-accent px-1 py-0.5 rounded hover:bg-accent-soft"
          onClick={() => onOpenPanel(pin.id)}
        >
          Abrir painel
        </button>
        <button
          className="text-[10.5px] text-ink-3 hover:text-ink-1 px-1 py-0.5 rounded hover:bg-hover inline-flex items-center gap-1"
          title="Mostrar a anotação embutida na página"
          onClick={onEmbed}
        >
          <PinIcon size={10} /> Embutir
        </button>
      </div>
    </div>
  );
}
