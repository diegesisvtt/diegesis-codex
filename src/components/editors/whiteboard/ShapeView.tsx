import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Hash,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  X,
  ArrowDownWideNarrow,
  ListOrdered,
} from 'lucide-react';
import type { WBShape, WBShapeMap, TextSize, TrackerKind, InitiativeEntry, InitiativeMode } from './model';
import { childrenOf, generateId } from './model';
import { RichTextEditor } from '../shared/RichTextEditor';
import { MathInput } from './MathInput';

/* ============================================================
   Shared props passed to every shape renderer
   ============================================================ */

export interface ShapeViewProps {
  shape: WBShape;
  /** false inside groups: render a static preview (no editors / inputs) */
  interactive: boolean;
  /** this shape is in edit mode (text caret / tiptap mounted) */
  autoFocus?: boolean;
  updateProps(patch: Record<string, any>): void;
  /** leave edit mode (Escape) */
  onExitEdit?(): void;
}

/* ============================================================
   Progress clock (SVG wedges)
   ============================================================ */

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

/* ============================================================
   Tracker shape — kinds: 'bar' (value/max + progress) | 'value' (single)
   ============================================================ */

const KIND_META: { kind: TrackerKind; label: string; icon: typeof Hash }[] = [
  { kind: 'bar', label: 'Barra (valor/máx)', icon: BarChart3 },
  { kind: 'value', label: 'Valor único', icon: Hash },
];

function TrackerShape({ shape, interactive, updateProps }: ShapeViewProps) {
  const { name, value, max } = shape.props;
  const kind: TrackerKind = shape.props.kind ?? 'bar';

  const wellInput =
    'w-full bg-sidebar border border-line rounded-lg px-6 py-2 text-center text-xl font-bold text-ink-1 outline-none focus:border-accent transition-colors';

  return (
    <div
      className="bg-elevated/95 backdrop-blur border border-line rounded-xl shadow-xl p-4 group/tracker"
      style={{ width: shape.props.w ?? 256 }}
    >
      {/* header: name + kind switcher (revealed on hover) */}
      <div className="relative mb-3">
        <input
          className="bg-transparent text-ink-1 font-semibold w-full border-none outline-none p-0 pr-10 text-[15px] placeholder-ink-3"
          value={name}
          readOnly={!interactive}
          onChange={(e) => updateProps({ name: e.target.value })}
        />
        {interactive && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover/tracker:opacity-100 transition-opacity duration-150">
            {KIND_META.map(({ kind: k, label, icon: Icon }) => (
              <button
                key={k}
                title={label}
                onClick={() => updateProps({ kind: k })}
                className={`p-1 rounded-md transition-colors ${
                  kind === k ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
                }`}
              >
                <Icon size={13} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        )}
      </div>

      {kind === 'value' ? (
        <div className="py-1">
          <MathInput
            value={value}
            readOnly={!interactive}
            onCommit={(next) => updateProps({ value: next })}
            inputClassName="w-full bg-transparent border-none outline-none px-7 py-1 text-center text-[34px] leading-none font-bold text-ink-1 rounded-lg focus:bg-sidebar/60 transition-colors"
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[10px] text-ink-3 uppercase font-semibold tracking-widest mb-1">Atual</div>
              <MathInput
                value={value}
                readOnly={!interactive}
                onCommit={(next) => updateProps({ value: next })}
                inputClassName={wellInput}
              />
            </div>
            <div className="text-ink-3 font-light text-2xl pt-4">/</div>
            <div className="flex-1">
              <div className="text-[10px] text-ink-3 uppercase font-semibold tracking-widest mb-1">Max</div>
              <MathInput
                value={max}
                readOnly={!interactive}
                showSteppers={false}
                onCommit={(next) => updateProps({ max: next })}
                inputClassName={`${wellInput} !bg-sidebar/60 text-ink-2`}
              />
            </div>
          </div>
          <div className="h-1 w-full bg-sidebar rounded-full mt-4 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, (value / (max || 1)) * 100))}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Clock shape (progress clock card)
   ============================================================ */

function ClockShape({ shape, interactive, updateProps }: ShapeViewProps) {
  const { name, filled } = shape.props;
  // clamp in case of hand-edited / corrupted props
  const segments = Math.max(2, Math.min(12, shape.props.segments | 0 || 4));
  return (
    <div
      className="bg-elevated/95 backdrop-blur border border-line rounded-lg shadow-xl p-5 flex flex-col items-center"
      style={{ width: shape.props.w ?? 192 }}
    >
      <input
        className="bg-transparent text-ink-1 font-semibold mb-4 w-full text-center border-none outline-none p-0 text-[15px]"
        value={name}
        readOnly={!interactive}
        onChange={(e) => updateProps({ name: e.target.value })}
      />
      <ProgressClock
        segments={segments}
        filled={filled}
        onSegmentClick={interactive ? (next) => updateProps({ filled: next }) : undefined}
      />
      {interactive && (
        <div className="flex items-center gap-2 mt-4 text-[13px] text-ink-2">
          <button
            onClick={() => updateProps({ segments: Math.max(2, segments - 2) })}
            className="hover:text-ink-1 px-2 py-0.5 bg-sidebar border border-line rounded-md transition-colors"
          >
            -
          </button>
          <span>{segments} seg</span>
          <button
            onClick={() => updateProps({ segments: Math.min(12, segments + 2) })}
            className="hover:text-ink-1 px-2 py-0.5 bg-sidebar border border-line rounded-md transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Initiative shape — turn order manager with manual values,
   or a fixed step sequence (OSE combat, dungeon turns, …)
   ============================================================ */

const INITIATIVE_MODES: { mode: InitiativeMode; label: string; icon: typeof Hash }[] = [
  { mode: 'initiative', label: 'Iniciativa (ordenada por valor)', icon: ArrowDownWideNarrow },
  { mode: 'sequence', label: 'Sequência (ordem fixa de etapas)', icon: ListOrdered },
];

function InitiativeShape({ shape, interactive, updateProps }: ShapeViewProps) {
  const entries: InitiativeEntry[] = shape.props.entries ?? [];
  const current: string | null = shape.props.current ?? null;
  const round: number = shape.props.round ?? 1;
  const mode: InitiativeMode = shape.props.mode ?? 'initiative';
  const cycleLabel: string = shape.props.cycleLabel ?? 'Rodada';

  // initiative sorts by value desc (stable: ties keep entry order); sequence keeps fixed order
  const ordered = mode === 'initiative' ? [...entries].sort((a, b) => b.value - a.value) : entries;

  const updateEntry = (id: string, patch: Partial<InitiativeEntry>) =>
    updateProps({ entries: entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const addEntry = () => {
    const entry = {
      id: generateId(),
      name: mode === 'sequence' ? `Etapa ${entries.length + 1}` : `Participante ${entries.length + 1}`,
      value: 0,
    };
    updateProps({ entries: [...entries, entry], current: current ?? entry.id });
  };

  const removeEntry = (id: string) =>
    updateProps({
      entries: entries.filter((e) => e.id !== id),
      ...(current === id ? { current: null } : {}),
    });

  /** drag-and-drop reorder: insert the dragged entry at the target's position */
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // rows only become draggable while their grip handle is held, so text selection in inputs still works
  const [gripHeldId, setGripHeldId] = useState<string | null>(null);

  const reorderEntry = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = entries.findIndex((e) => e.id === fromId);
    const to = entries.findIndex((e) => e.id === toId);
    if (from === -1 || to === -1) return;
    const next = [...entries];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateProps({ entries: next });
  };

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
    setGripHeldId(null);
  };

  const stepTurn = (dir: 1 | -1) => {
    if (ordered.length === 0) return;
    const idx = ordered.findIndex((e) => e.id === current);
    if (idx === -1) {
      updateProps({ current: ordered[dir === 1 ? 0 : ordered.length - 1].id });
      return;
    }
    const nextIdx = idx + dir;
    if (nextIdx >= ordered.length) {
      updateProps({ current: ordered[0].id, round: round + 1 });
    } else if (nextIdx < 0) {
      updateProps({ current: ordered[ordered.length - 1].id, round: Math.max(1, round - 1) });
    } else {
      updateProps({ current: ordered[nextIdx].id });
    }
  };

  return (
    <div
      className="bg-elevated/95 backdrop-blur border border-line rounded-xl shadow-xl p-4 group/init"
      style={{ width: shape.props.w ?? 300 }}
    >
      {/* header: title + mode switcher (revealed on hover) */}
      <div className="relative mb-3">
        <input
          className="bg-transparent text-ink-1 font-semibold w-full border-none outline-none p-0 pr-12 text-[15px] placeholder-ink-3"
          value={shape.props.title ?? ''}
          placeholder={mode === 'sequence' ? 'Sequência' : 'Iniciativa'}
          readOnly={!interactive}
          onChange={(e) => updateProps({ title: e.target.value })}
        />
        {interactive && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover/init:opacity-100 transition-opacity duration-150">
            {INITIATIVE_MODES.map(({ mode: m, label, icon: Icon }) => (
              <button
                key={m}
                title={label}
                onClick={() => updateProps({ mode: m })}
                className={`p-1 rounded-md transition-colors ${
                  mode === m ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
                }`}
              >
                <Icon size={13} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="text-ink-3 text-[13px] text-center py-4">
          {mode === 'sequence' ? 'Sem etapas' : 'Sem participantes'}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5" onDragLeave={(e) => {
          // only clear when the pointer actually leaves the list (not when entering a child row)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverId(null);
        }}>
          {ordered.map((entry, i) => {
            const isCurrent = entry.id === current;
            return (
              <div
                key={entry.id}
                draggable={interactive && gripHeldId === entry.id}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', entry.id);
                  setDragId(entry.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === entry.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overId !== entry.id) setOverId(entry.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragId) reorderEntry(dragId, entry.id);
                  endDrag();
                }}
                onDragEnd={endDrag}
                onClick={() => interactive && updateProps({ current: entry.id })}
                className={`group/row relative flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                  isCurrent ? 'bg-accent-soft' : interactive ? 'hover:bg-hover cursor-pointer' : ''
                } ${dragId === entry.id ? 'opacity-40' : ''}`}
              >
                {/* insertion indicator while dragging over this row */}
                {overId === entry.id && dragId !== entry.id && (
                  <div className="absolute -top-0.5 left-1 right-1 h-0.5 bg-accent rounded-full pointer-events-none" />
                )}

                {/* drag handle (hover) */}
                {interactive && (
                  <span
                    title="Arrastar para reordenar"
                    onMouseDown={() => setGripHeldId(entry.id)}
                    onMouseUp={() => setGripHeldId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 -ml-1.5 text-ink-3 hover:text-ink-1 cursor-grab active:cursor-grabbing opacity-0 group-hover/row:opacity-100 transition-opacity"
                  >
                    <GripVertical size={12} />
                  </span>
                )}
                {/* turn indicator: chevron (initiative) or step number (sequence) */}
                {mode === 'sequence' ? (
                  <span
                    className={`w-5 shrink-0 text-right text-[12px] tabular-nums ${
                      isCurrent ? 'text-accent-ink font-bold' : 'text-ink-3'
                    }`}
                  >
                    {i + 1}.
                  </span>
                ) : (
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {isCurrent && <ChevronRight size={13} strokeWidth={2.5} className="text-accent-ink" />}
                  </span>
                )}

                {mode === 'sequence' ? (
                  <div className="flex-1 min-w-0">
                    <input
                      className={`w-full bg-transparent border-none outline-none p-0 text-[13px] placeholder-ink-3 ${
                        isCurrent ? 'text-ink-1 font-semibold' : 'text-ink-1'
                      }`}
                      value={entry.name}
                      placeholder="Etapa"
                      readOnly={!interactive}
                      onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
                    />
                    {(interactive || entry.note) && (
                      <input
                        className="w-full bg-transparent border-none outline-none p-0 text-[11px] text-ink-3 placeholder-ink-3/60"
                        value={entry.note ?? ''}
                        placeholder="Detalhe…"
                        readOnly={!interactive}
                        onChange={(e) => updateEntry(entry.id, { note: e.target.value })}
                      />
                    )}
                  </div>
                ) : (
                  <input
                    className={`flex-1 min-w-0 bg-transparent border-none outline-none p-0 text-[13px] placeholder-ink-3 ${
                      isCurrent ? 'text-ink-1 font-semibold' : 'text-ink-2'
                    }`}
                    value={entry.name}
                    placeholder="Nome"
                    readOnly={!interactive}
                    onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
                  />
                )}

                {mode === 'initiative' && (
                  <MathInput
                    value={entry.value}
                    readOnly={!interactive}
                    showSteppers={false}
                    onCommit={(next) => updateEntry(entry.id, { value: next })}
                    inputClassName={`w-14 bg-sidebar border rounded-md px-1 py-1 text-center text-[13px] font-semibold outline-none transition-colors ${
                      isCurrent ? 'border-accent/50 text-ink-1' : 'border-line text-ink-2'
                    } focus:border-accent`}
                  />
                )}

                {interactive && (
                  <button
                    title="Remover"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeEntry(entry.id);
                    }}
                    className="shrink-0 p-0.5 rounded text-ink-3 hover:text-danger opacity-0 group-hover/row:opacity-100 transition-all"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {interactive && (
        <button
          onClick={addEntry}
          className="w-full mt-2 flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-line-strong text-ink-3 hover:text-ink-1 hover:border-line-strong hover:bg-hover text-[12px] transition-colors"
        >
          <Plus size={13} /> {mode === 'sequence' ? 'Adicionar etapa' : 'Adicionar participante'}
        </button>
      )}

      {/* footer: editable cycle label + counter + turn navigation */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line">
        <span className="flex items-baseline text-[10px] text-ink-3 uppercase font-semibold tracking-widest">
          {interactive ? (
            <input
              className="bg-transparent border-none outline-none p-0 uppercase text-[10px] text-ink-3 font-semibold tracking-widest focus:text-ink-2"
              style={{ width: `${Math.max(4, cycleLabel.length)}ch` }}
              value={cycleLabel}
              onChange={(e) => updateProps({ cycleLabel: e.target.value })}
            />
          ) : (
            cycleLabel
          )}
          <span className="ml-1 tabular-nums">{round}</span>
        </span>
        {interactive && (
          <div className="flex gap-0.5">
            <button
              title="Anterior"
              onClick={() => stepTurn(-1)}
              className="p-1 rounded-md text-ink-2 hover:text-ink-1 hover:bg-hover transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              title="Próximo"
              onClick={() => stepTurn(1)}
              className="p-1 rounded-md text-ink-2 hover:text-ink-1 hover:bg-hover transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Text shape — standalone text with a style variant (tldraw-like)
   size: 'text' | 'h1' | 'h2' | 'h3'
   ============================================================ */

const TEXT_STYLES: Record<TextSize, string> = {
  text: 'text-[15px] leading-relaxed',
  h1: 'text-[30px] font-bold leading-tight',
  h2: 'text-[24px] font-semibold leading-tight',
  h3: 'text-[19px] font-semibold leading-snug',
};

const TEXT_PLACEHOLDER: Record<TextSize, string> = {
  text: 'Digite algo…',
  h1: 'Título 1',
  h2: 'Título 2',
  h3: 'Título 3',
};

function useAutosizeTextarea(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

function TextShape({ shape, interactive, autoFocus, updateProps, onExitEdit }: ShapeViewProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text: string = shape.props.text ?? '';
  const size: TextSize = shape.props.size ?? 'text';
  const editing = interactive && !!autoFocus;
  useAutosizeTextarea(ref, text);

  // focus the textarea when entering edit mode
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const typography = TEXT_STYLES[size] ?? TEXT_STYLES.text;

  if (!interactive) {
    return (
      <div
        className={`text-ink-1 whitespace-pre-wrap break-words ${typography} ${!text ? 'opacity-40' : ''}`}
        style={{ width: shape.props.w }}
      >
        {text || TEXT_PLACEHOLDER[size]}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={text}
      rows={1}
      readOnly={!editing}
      tabIndex={editing ? undefined : -1}
      placeholder={TEXT_PLACEHOLDER[size]}
      onChange={(e) => updateProps({ text: e.target.value })}
      onPointerDown={(e) => {
        if (editing) e.stopPropagation(); // caret placement, no drag
        else e.preventDefault(); // no focus steal — the frame handles select/drag
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.target as HTMLElement).blur();
          onExitEdit?.();
        }
      }}
      className={`block bg-transparent border-none outline-none resize-none overflow-hidden text-ink-1 placeholder-ink-3 p-0 ${typography} ${
        editing ? 'cursor-text' : 'cursor-default'
      }`}
      style={{ width: shape.props.w }}
    />
  );
}

/* ============================================================
   Note shape — embedded tiptap rich text block
   ============================================================ */

function NoteEditorView({
  shape,
  autoFocus,
  updateProps,
  onExitEdit,
}: {
  shape: WBShape;
  autoFocus: boolean;
  updateProps(p: Record<string, any>): void;
  onExitEdit?(): void;
}) {
  return (
    <RichTextEditor
      content={shape.props.doc ?? null}
      externalContent={shape.props.doc}
      className="wb-note-editor"
      autofocus={autoFocus ? 'end' : false}
      onEscape={onExitEdit}
      onChange={(json, html) => updateProps({ doc: json, html })}
    />
  );
}

function NoteShape({ shape, interactive, autoFocus, updateProps, onExitEdit }: ShapeViewProps) {
  // tiptap instances are expensive: mount the live editor only while the note
  // is being edited; otherwise render the cached html preview
  const editing = interactive && autoFocus;
  return (
    <div
      className="bg-elevated/95 backdrop-blur border border-line rounded-lg shadow-xl px-4 py-3"
      style={{ width: shape.props.w }}
    >
      {editing ? (
        <NoteEditorView shape={shape} autoFocus updateProps={updateProps} onExitEdit={onExitEdit} />
      ) : (
        /* html is generated locally by this client only — trusted local content */
        <div
          className="wb-note-editor"
          dangerouslySetInnerHTML={{ __html: shape.props.html || '<p class="opacity-40">Nota vazia</p>' }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Image shape
   ============================================================ */

function ImageShape({ shape }: ShapeViewProps) {
  return (
    <img
      src={shape.props.src}
      alt={shape.props.name ?? ''}
      draggable={false}
      className="block rounded-lg border border-line shadow-xl"
      style={{ width: shape.props.w ?? 320, height: shape.props.h ?? 240 }}
    />
  );
}

/* ============================================================
   Group shape — renders children as static previews
   ============================================================ */

function GroupShape({ shape, shapes }: { shape: WBShape; shapes: WBShapeMap }) {
  return (
    <div
      className="relative rounded-lg border border-dashed border-line-strong/60"
      style={{ width: shape.props.w, height: shape.props.h }}
    >
      {childrenOf(shapes, shape.id).map((child) => (
        <div key={child.id} className="absolute pointer-events-none" style={{ transform: `translate(${child.x}px, ${child.y}px)` }}>
          <ShapeView shape={child} shapes={shapes} interactive={false} updateProps={() => {}} />
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Shape renderer registry (dispatch by shape.type)
   ============================================================ */

export function ShapeView(props: ShapeViewProps & { shapes: WBShapeMap }) {
  const { shape } = props;
  switch (shape.type) {
    case 'tracker':
      return <TrackerShape {...props} />;
    case 'clock':
      return <ClockShape {...props} />;
    case 'initiative':
      return <InitiativeShape {...props} />;
    case 'text':
      return <TextShape {...props} />;
    case 'note':
      return <NoteShape {...props} />;
    case 'image':
      return <ImageShape {...props} />;
    case 'group':
      return <GroupShape shape={shape} shapes={props.shapes} />;
    default:
      return null;
  }
}
