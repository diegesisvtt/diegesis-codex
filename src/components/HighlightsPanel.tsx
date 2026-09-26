// Global highlights panel: every highlight of every PDF in the active realm,
// grouped by document. Lives in the workspace's left border as a movable
// flexlayout tab. Drag a highlight onto another PDF to move it there.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import { BookOpen, ChevronRight, ChevronDown, Highlighter, Trash2 } from 'lucide-react';
import { REF_DRAG_MIME } from '@shared/dragDrop';
import { useStore } from '../state/store';
import {
  collectHighlights,
  highlightVirtualId,
  moveHighlights,
  parseHighlightVirtualId,
  removeHighlight,
} from './pdfTree';

interface HLTreeData {
  id: string;
  name: string;
  kind: 'pdf' | 'hl';
  pdfDocId: string;
  /** hl rows */
  highlightId?: string;
  page?: number;
  color?: string;
  /** pdf rows */
  count?: number;
  children?: HLTreeData[];
}

function Node({ node, style, dragHandle }: NodeRendererProps<HLTreeData>) {
  const { docs, updateDocument, openDocument, focusPdf } = useStore();
  const data = node.data;

  const openAtLocation = () => {
    if (data.kind !== 'hl' || !data.highlightId || data.page == null) return;
    openDocument(data.pdfDocId);
    focusPdf({ docId: data.pdfDocId, highlightId: data.highlightId });
  };

  const deleteHl = () => {
    if (data.kind !== 'hl' || !data.highlightId) return;
    const pdfDoc = docs.find((d) => d.id === data.pdfDocId);
    if (pdfDoc) updateDocument(pdfDoc.id, { content: removeHighlight(pdfDoc.content, data.highlightId) });
  };

  return (
    <div
      style={style}
      ref={dragHandle}
      // highlights can be dragged onto a whiteboard to create a quote card
      // (capture phase: react-dnd stops propagation in its own native handler)
      onDragStartCapture={(e) => {
        if (data.kind !== 'hl' || !data.highlightId) return;
        e.dataTransfer.setData(
          REF_DRAG_MIME,
          JSON.stringify({
            kind: 'highlight',
            pdfDocId: data.pdfDocId,
            highlightId: data.highlightId,
            text: data.name,
            page: data.page,
            color: data.color,
          })
        );
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => (data.kind === 'pdf' ? node.toggle() : (node.select(), openAtLocation()))}
      onDoubleClick={() => {
        if (data.kind === 'pdf') openDocument(data.pdfDocId);
      }}
      className={`group flex items-center gap-1.5 pr-1.5 h-full cursor-pointer select-none text-[13px] rounded-md mx-1 transition-colors
        ${node.isSelected ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover hover:text-ink-1'}`}
    >
      {node.isInternal ? (
        <span className="text-ink-3 shrink-0 -ml-0.5">
          {node.isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      ) : (
        <span className="w-[13px] shrink-0" />
      )}
      {data.kind === 'pdf' ? (
        <BookOpen size={15} strokeWidth={1.75} className="text-pdf shrink-0" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: data.color }} />
      )}
      <span className="truncate flex-1">
        {data.name}
        {data.kind === 'hl' && <span className="ml-1.5 text-[10px] text-ink-3">p.{data.page}</span>}
      </span>
      {data.kind === 'pdf' && <span className="text-[10px] text-ink-3 shrink-0">{data.count}</span>}
      {data.kind === 'hl' && (
        <button
          title="Excluir destaque"
          onClick={(e) => {
            e.stopPropagation();
            deleteHl();
          }}
          className="p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-active rounded shrink-0 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

export function HighlightsPanel() {
  const { docs, updateDocument } = useStore();
  const treeRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo<HLTreeData[]>(() => {
    const q = query.trim().toLowerCase();
    return collectHighlights(docs)
      .map((g) => {
        const rows = g.highlights
          .filter((h) => {
            if (!q) return true;
            const label = (g.labels[h.color] ?? '').toLowerCase();
            return h.text.toLowerCase().includes(q) || label.includes(q) || (g.pdfDoc.title ?? '').toLowerCase().includes(q);
          })
          .map<HLTreeData>((h) => ({
            id: highlightVirtualId(g.pdfDoc.id, h.id),
            name: h.text || 'Destaque',
            kind: 'hl',
            pdfDocId: g.pdfDoc.id,
            highlightId: h.id,
            page: h.page,
            color: h.color,
          }));
        return {
          id: g.pdfDoc.id,
          name: g.pdfDoc.title || 'Sem título',
          kind: 'pdf' as const,
          pdfDocId: g.pdfDoc.id,
          count: rows.length,
          children: rows,
        };
      })
      .filter((g) => (q ? g.count! > 0 : true));
  }, [docs, query]);

  return (
    <div className="h-full w-full flex flex-col bg-sidebar">
      <div className="px-3 h-9 border-b border-line flex items-center gap-1.5 shrink-0">
        <Highlighter size={12} className="text-ink-3 shrink-0" />
        <input
          className="flex-1 min-w-0 bg-transparent text-[12px] text-ink-1 placeholder:text-ink-3 outline-none"
          placeholder="Buscar destaques em todos os PDFs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden py-1.5 mythril-tree">
        {data.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-ink-3 leading-relaxed">
            {query
              ? 'Nenhum destaque corresponde à busca.'
              : 'Nenhum destaque ainda. Selecione texto num PDF para criar um.'}
          </div>
        ) : (
          <Tree<HLTreeData>
            ref={treeRef}
            data={data}
            width="100%"
            height={height}
            rowHeight={28}
            indent={15}
            paddingTop={2}
            openByDefault={true}
            disableDrag={(d: HLTreeData) => d.kind !== 'hl'}
            onActivate={(node) => {
              if (node.data.kind === 'hl') {
                // same behavior as the row click
                node.select();
              }
            }}
            onMove={({ dragIds, parentId }) => {
              // drop target must be a PDF group (root drops are ignored)
              if (!parentId || parentId.startsWith('hl:')) return;
              const targetPdf = docs.find((d) => d.id === parentId);
              if (!targetPdf) return;
              // group dragged highlights by source PDF and move each group
              const bySource = new Map<string, string[]>();
              for (const id of dragIds) {
                const parsed = parseHighlightVirtualId(id);
                if (!parsed || parsed.pdfDocId === parentId) continue; // same-doc reorder is meaningless
                const list = bySource.get(parsed.pdfDocId) ?? [];
                list.push(parsed.highlightId);
                bySource.set(parsed.pdfDocId, list);
              }
              for (const [srcId, hlIds] of bySource) {
                const srcPdf = docs.find((d) => d.id === srcId);
                if (!srcPdf) continue;
                const { source, target } = moveHighlights(srcPdf.content, targetPdf.content, hlIds);
                updateDocument(srcId, { content: source });
                updateDocument(targetPdf.id, { content: target });
              }
            }}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  );
}
