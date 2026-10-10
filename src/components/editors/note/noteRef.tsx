// Wiki-style inline reference to another note (core/note). Typing `[[` opens a
// suggestion menu; the reference shows the target title by default, with an
// optional `label` alias (`[[Nota|Texto]]`) overriding the visible text.
// Clicking opens the note; a small edit popover lets you change the label,
// open or remove the reference.
//
// Also exports NotePickerPopover — a reusable note chooser used by the slash
// menu item and the formatting-toolbar button.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createReactInlineContentSpec } from '@blocknote/react';
import { ExternalLink, FileText, Pencil, Trash2, X } from 'lucide-react';
import { useStore } from '../../../state/store';
import type { DocNode } from '@shared/types';

/* ============================================================
   Inline content spec
   ============================================================ */

/** editable-label popover, portaled to body (mirrors InlineAiPopover) */
function NoteRefEditPopover({
  anchor,
  label,
  targetTitle,
  onSave,
  onOpen,
  onRemove,
  onClose,
}: {
  anchor: { x: number; y: number };
  label: string;
  targetTitle: string | null;
  onSave: (next: string) => void;
  onOpen: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(label);
  const inputRef = (el: HTMLInputElement | null) => el?.focus();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = Math.min(Math.max(8, anchor.x), window.innerWidth - 320 - 8);
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - 160));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-elevated shadow-[0_16px_48px_rgba(0,0,0,0.55)] overflow-hidden animate-fade-up"
        style={{ left, top }}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-sidebar">
          <FileText size={13} className="text-accent-ink shrink-0" />
          <span className="text-[12px] font-semibold text-ink-1">Referência de nota</span>
          <div className="flex-1" />
          <button onClick={onClose} title="Fechar" className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-hover">
            <X size={14} />
          </button>
        </div>
        <div className="px-3 py-2.5">
          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Texto exibido</label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSave(value);
                onClose();
              }
            }}
            placeholder={targetTitle ?? 'Texto exibido'}
            className="mt-1 w-full bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
          />
          <p className="mt-1 text-[10.5px] text-ink-3">
            Vazio = mostra o título da nota ({targetTitle ?? 'não encontrada'}).
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-line">
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-sidebar text-danger text-[11.5px] hover:bg-danger-soft hover:border-danger/40 transition-colors"
          >
            <Trash2 size={12} />
            Remover
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              onOpen();
              onClose();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-sidebar text-ink-2 text-[11.5px] hover:text-ink-1 hover:border-line-strong transition-colors"
          >
            <ExternalLink size={12} />
            Abrir
          </button>
          <button
            onClick={() => {
              onSave(value);
              onClose();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

/** inline chip rendered inside the editor (content: 'none' → atom node) */
function NoteRefView(props: {
  inlineContent: { props?: Record<string, unknown> };
  updateInlineContent: (update: { type?: string; props?: Record<string, unknown> }) => void;
  editor: any;
  node: { nodeSize: number };
  getPos: () => number | undefined;
}) {
  const { inlineContent, updateInlineContent, editor, node, getPos } = props;
  const { docs, openDocument } = useStore();
  const [editing, setEditing] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  const docId = (inlineContent.props?.docId ?? '') as string;
  const label = (inlineContent.props?.label ?? '') as string;
  const target = docs.find((d) => d.id === docId);
  const display = label || target?.title || 'Nota não encontrada';
  const missing = !target;

  const openPopover = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom + 6 });
    setEditing(true);
  };

  const saveLabel = (next: string) => {
    updateInlineContent({ type: 'noteRef', props: { docId, label: next.trim() } });
  };

  const remove = () => {
    const pos = getPos();
    if (pos != null) {
      try {
        const tr = editor._tiptapEditor.state.tr;
        tr.replaceWith(pos, pos + node.nodeSize, editor._tiptapEditor.schema.text(display));
        editor._tiptapEditor.view.dispatch(tr);
      } catch {
        /* ignore */
      }
    }
    setEditing(false);
  };

  return (
    <>
      <span
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (target) openDocument(docId);
        }}
        title={target ? `Abrir “${target.title}”` : 'Nota não encontrada'}
        className={`inline-flex items-center gap-1 align-baseline mx-0.5 px-1.5 py-[1px] rounded-md border text-[13px] leading-snug cursor-pointer select-none whitespace-nowrap transition-colors ${
          missing
            ? 'border-danger/40 bg-danger-soft text-danger'
            : 'border-accent/30 bg-accent-soft text-accent-ink hover:bg-accent/20'
        }`}
      >
        <FileText size={12} strokeWidth={1.9} className="shrink-0" />
        <span>{display}</span>
        <button
          type="button"
          title="Editar referência"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopover(e);
          }}
          className="p-0.5 -mr-0.5 rounded opacity-60 hover:opacity-100 hover:bg-accent/20"
        >
          <Pencil size={10} strokeWidth={2} />
        </button>
      </span>
      {editing && (
        <NoteRefEditPopover
          anchor={anchor}
          label={label}
          targetTitle={target?.title ?? null}
          onSave={saveLabel}
          onOpen={() => openDocument(docId)}
          onRemove={remove}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

export const NoteRefInline = () =>
  createReactInlineContentSpec(
    {
      type: 'noteRef',
      content: 'none',
      propSchema: {
        docId: { default: '' },
        label: { default: '' },
      },
    } as const,
    {
      render: NoteRefView as any,
    } as any
  );

/* ============================================================
   Note picker popover (slash menu + toolbar button)
   ============================================================ */

export function NotePickerPopover({
  anchor,
  excludeId,
  onPick,
  onClose,
}: {
  anchor: { x: number; y: number };
  excludeId?: string;
  onPick: (doc: DocNode) => void;
  onClose: () => void;
}) {
  const { docs } = useStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => d.type === 'core/note' && d.id !== excludeId)
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .slice(0, 30);
  }, [docs, query, excludeId]);

  const left = Math.min(Math.max(8, anchor.x), window.innerWidth - 320 - 8);
  const top = Math.max(8, Math.min(anchor.y, Math.max(8, window.innerHeight - 380)));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-elevated shadow-[0_16px_48px_rgba(0,0,0,0.55)] overflow-hidden animate-fade-up flex flex-col"
        style={{ left, top }}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-sidebar">
          <FileText size={13} className="text-accent-ink shrink-0" />
          <span className="text-[12px] font-semibold text-ink-1">Vincular nota</span>
          <div className="flex-1" />
          <button onClick={onClose} title="Fechar" className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-hover">
            <X size={14} />
          </button>
        </div>
        <div className="px-3 pt-2">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nota…"
            className="w-full bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="mt-1.5 border-t border-line pt-1 max-h-64 overflow-y-auto custom-scrollbar">
          {candidates.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-ink-3 text-center">Nenhuma nota encontrada.</div>
          ) : (
            candidates.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onPick(d);
                  onClose();
                }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 truncate"
              >
                <FileText size={12} className="text-note shrink-0" />
                {d.title || 'Sem título'}
              </button>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
