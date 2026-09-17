import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, X, ListTree } from 'lucide-react';
import type { PDFDocumentProxy } from './pdfjs';
import { loadOutline, type OutlineNode } from './outline';

function OutlineItem({ node, depth, onJump }: { node: OutlineNode; depth: number; onJump: (page: number) => void }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <div>
      <button
        className={`w-full flex items-center gap-1 px-2 py-1 rounded text-left text-[12.5px] transition-colors
          ${node.page ? 'text-ink-2 hover:bg-hover hover:text-ink-1' : 'text-ink-3 cursor-default'}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        disabled={!node.page}
        onClick={() => node.page && onJump(node.page)}
        title={node.page ? `Ir para página ${node.page}` : undefined}
      >
        {node.children.length > 0 ? (
          <span
            className="text-ink-3 shrink-0 p-0.5 -ml-1 rounded hover:bg-active"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-[16px] shrink-0" />
        )}
        <span className="truncate flex-1">{node.title}</span>
        {node.page && <span className="text-[10px] text-ink-3 shrink-0">{node.page}</span>}
      </button>
      {open && node.children.map((c, i) => <OutlineItem key={i} node={c} depth={depth + 1} onJump={onJump} />)}
    </div>
  );
}

export function OutlinePanel({ pdf, onJump, onClose }: { pdf: PDFDocumentProxy; onJump: (page: number) => void; onClose: () => void }) {
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOutline(pdf)
      .then((o) => !cancelled && setOutline(o))
      .catch(() => !cancelled && setOutline([]));
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return (
    <div className="w-64 shrink-0 border-r border-line bg-sidebar flex flex-col h-full">
      <div className="h-9 px-3 border-b border-line flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">Sumário</span>
        <button className="p-1 text-ink-3 hover:text-ink-1 rounded hover:bg-hover" onClick={onClose} title="Fechar">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1.5 px-1">
        {outline === null ? (
          <div className="px-3 py-4 text-[12px] text-ink-3">Carregando sumário…</div>
        ) : outline.length === 0 ? (
          <div className="px-3 py-6 text-[12px] text-ink-3 leading-relaxed flex flex-col items-center gap-2 text-center">
            <ListTree size={20} className="opacity-50" />
            Este PDF não tem um sumário interno.
          </div>
        ) : (
          outline.map((n, i) => <OutlineItem key={i} node={n} depth={0} onJump={onJump} />)
        )}
      </div>
    </div>
  );
}
