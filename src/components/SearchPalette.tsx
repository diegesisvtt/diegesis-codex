import { useEffect, useMemo, useRef, useState } from 'react';
import { File, LayoutGrid, Search, Sparkles, BookOpen, Map, History, Table } from 'lucide-react';
import type { SearchResult, SemanticSearchResult } from '@shared/types';
import { useStore } from '../state/store';

type Mode = 'fts' | 'semantic';

interface UnifiedResult {
  docId: string;
  title: string;
  type: SearchResult['type'];
  snippet: string;
  score?: number;
}

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
  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<Mode>('fts');
  const [semanticAvailable, setSemanticAvailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setMode('fts');
      setTimeout(() => inputRef.current?.focus(), 30);
      window.diegesis.ai
        .indexStatus()
        .then((s) => setSemanticAvailable(s.embeddedCount > 0))
        .catch(() => setSemanticAvailable(false));
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
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      try {
        if (mode === 'semantic') {
          const r: SemanticSearchResult[] = await window.diegesis.ai.searchSemantic(activeRealmId, q);
          if (seq === seqRef.current) setResults(r);
        } else {
          const r: SearchResult[] = await window.diegesis.docs.search(activeRealmId, q);
          if (seq === seqRef.current) setResults(r);
        }
        if (seq === seqRef.current) setSelected(0);
      } catch (err) {
        console.error('search failed', err);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, mode === 'semantic' ? 350 : 140);
    return () => clearTimeout(t);
  }, [query, open, activeRealmId, mode]);

  // Keep selected row visible
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const pick = (r: UnifiedResult) => {
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
            placeholder={
              mode === 'semantic' ? 'Descreva o que você procura…' : 'Buscar em todas as notas…'
            }
            className="flex-1 bg-transparent py-3.5 text-[15px] text-ink-1 placeholder-ink-3 outline-none"
          />
          {semanticAvailable && (
            <div className="flex items-center bg-sidebar border border-line rounded-md p-0.5 shrink-0">
              <button
                onClick={() => setMode('fts')}
                className={`px-2 py-1 rounded text-[11px] transition-colors ${
                  mode === 'fts' ? 'bg-overlay text-ink-1' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                Texto
              </button>
              <button
                onClick={() => setMode('semantic')}
                className={`px-2 py-1 rounded text-[11px] transition-colors flex items-center gap-1 ${
                  mode === 'semantic' ? 'bg-overlay text-accent-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                <Sparkles size={11} />
                Semântica
              </button>
            </div>
          )}
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
              const Icon =
                r.type === 'core/whiteboard'
                  ? LayoutGrid
                  : r.type === 'core/pdf'
                    ? BookOpen
                    : r.type === 'hexcrawl/map'
                      ? Map
                      : r.type === 'diegesis/timeline'
                        ? History
                        : r.type === 'diegesis/table'
                          ? Table
                          : File;
              const color =
                r.type === 'core/whiteboard'
                  ? 'text-board'
                  : r.type === 'core/pdf'
                    ? 'text-pdf'
                    : r.type === 'hexcrawl/map'
                      ? 'text-map'
                      : r.type === 'diegesis/timeline'
                        ? 'text-timeline'
                        : r.type === 'diegesis/table'
                          ? 'text-table'
                          : 'text-note';
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
                    <div className="text-[13px] font-medium text-ink-1 truncate flex items-center gap-2">
                      <span className="truncate">{r.title || 'Sem título'}</span>
                      {r.score !== undefined && (
                        <span className="shrink-0 text-[10px] px-1.5 py-px rounded-full bg-accent-soft text-accent-ink">
                          {Math.round(r.score * 100)}%
                        </span>
                      )}
                    </div>
                    {r.snippet &&
                      (mode === 'fts' ? (
                        <Snippet html={r.snippet} />
                      ) : (
                        <span className="text-[12px] text-ink-3 leading-snug line-clamp-2">{r.snippet}</span>
                      ))}
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
