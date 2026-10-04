import { useEffect, useRef } from 'react';
import { Music } from 'lucide-react';
import { HIGHLIGHT_COLORS, REDACTION_COLOR, type PdfHighlight } from './model';

export interface HighlightPopoverState {
  page: number;
  rects: PdfHighlight['rects'];
  text: string;
  /** screen coords */
  x: number;
  y: number;
}

/** Floating picker shown after selecting text: named colors + redaction + statblock. */
export function HighlightPopover({
  state,
  labels,
  onPickColor,
  onStatblock,
  onImportSheet,
  onClose,
}: {
  state: HighlightPopoverState;
  labels: Record<string, string>;
  onPickColor: (color: string) => void;
  onStatblock: () => void;
  /** cria um documento 'diegesis/sheet' a partir do statblock selecionado */
  onImportSheet?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-1 bg-elevated border border-line rounded-full px-2 py-1.5 shadow-xl animate-fade-up"
      style={{ left: Math.min(state.x, window.innerWidth - 260), top: Math.max(8, state.y - 48) }}
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
          style={{ background: c }}
          title={labels[c] ?? (c === REDACTION_COLOR ? 'Redação' : 'Destacar')}
          onClick={() => onPickColor(c)}
        />
      ))}
      <span className="w-px h-4 bg-line mx-0.5" />
      <button
        className="text-[11px] text-ink-2 hover:text-ink-1 px-1.5 py-0.5 rounded hover:bg-hover"
        title="Extrair ficha (statblock) do texto selecionado"
        onClick={onStatblock}
      >
        + Ficha
      </button>
      {onImportSheet && (
        <button
          className="text-[11px] text-ink-2 hover:text-ink-1 px-1.5 py-0.5 rounded hover:bg-hover"
          title="Criar documento de Ficha de Personagem a partir do texto selecionado"
          onClick={onImportSheet}
        >
          + Personagem
        </button>
      )}
    </div>
  );
}

interface HighlightLayerProps {
  highlights: PdfHighlight[];
  onClick?: (hl: PdfHighlight) => void;
}

/** Renders saved highlights over a page (redactions render opaque). */
export function HighlightLayer({ highlights, onClick }: HighlightLayerProps) {
  return (
    <>
      {highlights.map((hl) =>
        hl.rects.map((r, i) => {
          const redaction = hl.color === REDACTION_COLOR;
          return (
            <div
              key={`${hl.id}-${i}`}
              className="absolute z-[4] rounded-[2px] cursor-pointer"
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: hl.color,
                opacity: redaction ? 1 : 0.4,
                mixBlendMode: redaction ? 'normal' : 'multiply',
              }}
              title={redaction ? 'Redação' : hl.text.slice(0, 120)}
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(hl);
              }}
            >
              {/* audio attachment badge on the first rect */}
              {i === 0 && hl.audioUrl && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-elevated border border-line flex items-center justify-center pointer-events-none"
                  style={{ mixBlendMode: 'normal', opacity: 1 }}
                >
                  <Music size={9} className="text-accent-ink" />
                </span>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

/** Converts the current window selection within a page into fractional rects. */
export function selectionToRects(pageEl: HTMLElement): { rects: PdfHighlight['rects']; text: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!pageEl.contains(range.commonAncestorContainer)) return null;
  const pageRect = pageEl.getBoundingClientRect();
  const rects: PdfHighlight['rects'] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    // slight vertical shrink so adjacent lines don't merge visually
    const y = (r.top - pageRect.top + r.height * 0.15) / pageRect.height;
    const h = (r.height * 0.72) / pageRect.height;
    rects.push({
      x: (r.left - pageRect.left) / pageRect.width,
      y,
      w: r.width / pageRect.width,
      h,
    });
  }
  if (rects.length === 0) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!text) return null;
  return { rects, text };
}
