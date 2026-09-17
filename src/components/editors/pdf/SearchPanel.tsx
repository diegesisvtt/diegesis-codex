import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import type { PdfSearcher, PdfSearchHit } from './search';
import { MAX_TOTAL_HITS } from './search';

interface SearchPanelProps {
  searcher: PdfSearcher;
  onJump: (page: number, term: string) => void;
  onClose: () => void;
}

/** In-PDF search drawer: lazy index with progress, snippets, jump-to-hit. */
export function SearchPanel({ searcher, onJump, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PdfSearchHit[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    searcher.ready ? null : { done: 0, total: 0 }
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (!searcher.ready) {
      searcher
        .ensureIndex((done, total) => setProgress({ done, total }))
        .then(() => setProgress(null))
        .catch(() => setProgress(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setHits(searcher.search(query));
    }, 160);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searcher]);

  const capped = searcher.ready && progress === null && query.trim().length >= 2 && hits.length >= MAX_TOTAL_HITS;

  return (
    <div className="w-72 shrink-0 border-r border-line bg-sidebar flex flex-col h-full">
      <div className="h-9 px-3 border-b border-line flex items-center gap-2 shrink-0">
        <Search size={13} className="text-ink-3 shrink-0" />
        <input
          ref={inputRef}
          className="flex-1 min-w-0 bg-transparent text-[12.5px] text-ink-1 placeholder:text-ink-3 outline-none"
          placeholder={progress ? `Indexando ${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%…` : 'Buscar no PDF (Ctrl+F)'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) onJump(hits[0].page, query.trim());
            if (e.key === 'Escape') onClose();
          }}
        />
        <button className="p-1 text-ink-3 hover:text-ink-1 rounded hover:bg-hover" onClick={onClose} title="Fechar (Esc)">
          <X size={14} />
        </button>
      </div>
      {progress && (
        <div className="h-0.5 bg-overlay shrink-0">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
          />
        </div>
      )}
      <div className="flex-1 overflow-auto py-1 px-1">
        {progress ? (
          <div className="px-3 py-4 text-[12px] text-ink-3 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Indexando texto ({progress.done}/{progress.total})…
          </div>
        ) : query.trim().length < 2 ? (
          <div className="px-3 py-4 text-[12px] text-ink-3">Digite ao menos 2 caracteres.</div>
        ) : hits.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-ink-3">Nenhum resultado.</div>
        ) : (
          <>
            {hits.map((h, i) => (
              <button
                key={i}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-hover group"
                onClick={() => onJump(h.page, query.trim())}
              >
                <div className="text-[10px] text-accent-ink font-medium mb-0.5">p.{h.page}</div>
                <div className="text-[12px] text-ink-2 leading-snug group-hover:text-ink-1">
                  …{h.before}
                  <mark className="bg-accent-soft text-ink-1 rounded-sm px-0.5">{h.match}</mark>
                  {h.after}…
                </div>
              </button>
            ))}
            {capped && <div className="px-3 py-2 text-[11px] text-ink-3">Mostrando os primeiros {MAX_TOTAL_HITS} resultados.</div>}
          </>
        )}
      </div>
    </div>
  );
}
