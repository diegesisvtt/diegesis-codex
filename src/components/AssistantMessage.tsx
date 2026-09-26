// Read-only BlockNote renderer for assistant chat messages (markdown in, blocks out).
// RAG citations like [1] become inline highlighted links with a rich tooltip.
// (https scheme so the links survive any URL sanitization in the markdown pipeline)
import { useEffect, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/ariakit';
import { pt } from '@blocknote/core/locales';
import { BookOpen, FileText, Presentation } from 'lucide-react';
import type { RetrievedChunk } from '@shared/types';

const SOURCE_URL = 'https://mythril.source/';
const SOURCE_LINK = `a[href^="${SOURCE_URL}"]`;

/** Rewrites `[n]` citation markers as links so BlockNote renders them inline. */
function citeMarkdown(md: string, count: number): string {
  if (count === 0) return md;
  const linked = md.replace(/(?<!!)\[(\d{1,2})\](?!\()/g, (match, g) => {
    const n = Number(g);
    return n >= 1 && n <= count ? `[${n}](${SOURCE_URL}${n})` : match;
  });
  // the model didn't cite inline — list the chunks that fed the answer,
  // framed honestly as "consulted" rather than implied citations
  if (!linked.includes(SOURCE_URL)) {
    const refs = Array.from({ length: count }, (_, i) => `[${i + 1}](${SOURCE_URL}${i + 1})`).join(' ');
    return `${linked}\n\n**Fontes consultadas:** ${refs}`;
  }
  return linked;
}

interface TipState {
  n: number;
  x: number;
  y: number;
}

export function AssistantMessage({
  markdown,
  sources,
  onOpenSource,
}: {
  markdown: string;
  sources?: RetrievedChunk[];
  onOpenSource?: (source: RetrievedChunk) => void;
}) {
  const editor = useCreateBlockNote({ dictionary: pt });
  const [tip, setTip] = useState<TipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = sources?.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(citeMarkdown(markdown || ' ', count));
        if (!cancelled) editor.replaceBlocks(editor.document, blocks);
      } catch {
        /* partial markdown mid-stream — keep the previous render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, markdown, count]);

  const anchorFrom = (target: EventTarget | null): HTMLAnchorElement | null =>
    target instanceof HTMLElement ? target.closest<HTMLAnchorElement>(SOURCE_LINK) : null;

  const sourceIndex = (a: HTMLAnchorElement): number =>
    Number((a.getAttribute('href') ?? '').slice(SOURCE_URL.length).replace(/\/+$/, ''));

  const openSource = (n: number) => {
    const s = sources?.[n - 1];
    if (s) {
      setTip(null);
      onOpenSource?.(s);
    }
  };

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setTip(null), 120);
  };

  const tipSource = tip && sources ? sources[tip.n - 1] : null;

  return (
    <div
      className="relative"
      onClickCapture={(e) => {
        const a = anchorFrom(e.target);
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        openSource(sourceIndex(a));
      }}
      onAuxClickCapture={(e) => {
        // middle-click / BlockNote link default — never navigate the window
        if (anchorFrom(e.target)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onMouseOver={(e) => {
        const a = anchorFrom(e.target);
        if (!a) return;
        if (hideTimer.current) clearTimeout(hideTimer.current);
        const r = a.getBoundingClientRect();
        setTip({ n: sourceIndex(a), x: r.left + r.width / 2, y: r.top });
      }}
      onMouseOut={(e) => {
        if (!anchorFrom(e.target)) return;
        const to = e.relatedTarget;
        if (to instanceof HTMLElement && (anchorFrom(to) || to.closest('.bn-source-tip'))) return;
        scheduleHide();
      }}
    >
      <BlockNoteView
        editor={editor}
        editable={false}
        theme="dark"
        sideMenu={false}
        formattingToolbar={false}
        slashMenu={false}
        className="mythril-bn chat"
      />

      {tip && tipSource && (
        <div
          className="bn-source-tip fixed z-50 w-64 rounded-lg border border-line bg-sidebar shadow-xl p-3 cursor-pointer hover:border-accent/50 transition-colors"
          style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 6px))' }}
          onMouseEnter={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
          }}
          onMouseLeave={scheduleHide}
          onClick={() => openSource(tip.n)}
        >
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-1 mb-2">
            {tipSource.type === 'core/pdf' ? (
              <FileText size={12} className="shrink-0 text-pdf" />
            ) : tipSource.type === 'core/whiteboard' ? (
              <Presentation size={12} className="shrink-0 text-board" />
            ) : (
              <BookOpen size={12} className="shrink-0 text-note" />
            )}
            <span className="truncate">[{tip.n}] {tipSource.title || 'Sem título'}</span>
          </div>
          <dl className="flex flex-col gap-1 text-[11px]">
            <div className="flex items-center justify-between">
              <dt className="text-ink-3">Tipo</dt>
              <dd className="text-ink-2">
                {tipSource.type === 'core/pdf' ? 'PDF' : tipSource.type === 'core/whiteboard' ? 'Quadro branco' : 'Nota'}
              </dd>
            </div>
            {tipSource.type === 'core/pdf' && tipSource.page != null && (
              <div className="flex items-center justify-between">
                <dt className="text-ink-3">Página</dt>
                <dd className="text-ink-2 font-medium">{tipSource.page}</dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-ink-3">Relevância</dt>
              <dd className="text-ink-2">{(tipSource.score * 100).toFixed(0)}%</dd>
            </div>
          </dl>
          <div className="mt-2.5 flex justify-end">
            <span className="px-2 py-0.5 rounded bg-accent-soft text-accent-ink text-[10.5px] font-medium">
              Abrir{tipSource.type === 'core/pdf' && tipSource.page != null ? ` na p. ${tipSource.page}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
