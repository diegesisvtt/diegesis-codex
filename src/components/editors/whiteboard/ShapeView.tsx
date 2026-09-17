import React, { useEffect, useRef } from 'react';
import { BarChart3, Hash } from 'lucide-react';
import type { WBShape, WBShapeMap, TextSize, TrackerKind } from './model';
import { childrenOf } from './model';
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
    case 'text':
      return <TextShape {...props} />;
    case 'note':
      return <NoteShape {...props} />;
    case 'group':
      return <GroupShape shape={shape} shapes={props.shapes} />;
    default:
      return null;
  }
}
