import { useEffect, useMemo, useRef, useState } from 'react';
import { File, LayoutGrid, Search } from 'lucide-react';
import type { SearchResult } from '@shared/types';
import { useStore } from '../state/store';

/** Renders an FTS snippet ("foo <mark>bar</mark> baz") as safe React elements. */
function Snippet({ html }: { html: string }) {
  const parts = useMemo(() => {
    const out: { text: string; mark: boolean }[] = [];
    const re = /<mark>(.*?)<\/mark>/gs;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m.index > last) out.push({ text: html.slice(last, m.index), mark: false });
      out.push({ text: m[1], mark: true });
      last = m.index + m[0].length;
    }
    if (last < html.length) out.push({ text: html.slice(last), mark: false });
    return out;
  }, [html]);

  return (
    <span className="text-[12px] text-ink-3 leading-snug line-clamp-2">
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className="bg-transparent text-accent-ink font-medium">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const { activeRealmId, openDocument } = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !activeRealmId) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await window.mythril.docs.search(activeRealmId, q);
        setResults(r);
        setSelected(0);
      } catch (err) {
        console.error('search failed', err);
      } finally {
        setSearching(false);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [query, open, activeRealmId]);

  // Keep selected row visible
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const pick = (r: SearchResult) => {
    openDocument(r.docId);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selected];
      if (r) pick(r);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] px-4 bg-black/50 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-elevated border border-line rounded-xl shadow-2xl overflow-hidden animate-fade-up">
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Search size={16} className="text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar em todas as notas…"
            className="flex-1 bg-transparent py-3.5 text-[15px] text-ink-1 placeholder-ink-3 outline-none"
          />
          <kbd className="text-[10px] text-ink-3 bg-overlay rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto custom-scrollbar py-1.5">
          {query.trim() === '' ? (
            <div className="px-4 py-8 text-center text-[13px] text-ink-3">
              Digite para buscar por título ou conteúdo.
            </div>
          ) : results.length === 0 && !searching ? (
            <div className="px-4 py-8 text-center text-[13px] text-ink-3">
              Nenhum resultado para “{query.trim()}”.
            </div>
          ) : (
            results.map((r, i) => {
              const Icon = r.type === 'core/whiteboard' ? LayoutGrid : File;
              const color = r.type === 'core/whiteboard' ? 'text-board' : 'text-note';
              return (
                <button
                  key={r.docId}
                  data-index={i}
                  onClick={() => pick(r)}
                  onMouseMove={() => setSelected(i)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selected ? 'bg-hover' : ''
                  }`}
                >
                  <div className="mt-0.5 w-7 h-7 rounded-md bg-sidebar border border-line flex items-center justify-center shrink-0">
                    <Icon size={14} className={color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink-1 truncate">
                      {r.title || 'Sem título'}
                    </div>
                    {r.snippet && <Snippet html={r.snippet} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-line bg-sidebar flex items-center gap-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1">
            <kbd className="bg-overlay rounded px-1 py-px">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-overlay rounded px-1 py-px">↵</kbd> abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-overlay rounded px-1 py-px">esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}
