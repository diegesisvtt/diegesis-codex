import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, X } from 'lucide-react';
import type { DocNode } from '@shared/types';

/**
 * Seletor de UM documento do realm para vincular a uma linha da tabela
 * (versão single-select do EntityPicker da timeline). Pastas e o próprio
 * documento não são selecionáveis.
 */
export function DocLinkPicker({
  docs,
  selected,
  onChange,
  onOpenDoc,
  excludeDocId,
  placeholder = 'Vincular documento ao resultado…',
}: {
  docs: DocNode[];
  selected: string | null;
  onChange(id: string | null): void;
  onOpenDoc?: (id: string) => void;
  excludeDocId?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => d.type !== 'core/folder' && d.id !== excludeDocId && d.id !== selected)
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .slice(0, 10);
  }, [docs, query, selected, excludeDocId]);

  const selectedDoc = selected ? docs.find((d) => d.id === selected) : null;

  if (selectedDoc) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onOpenDoc?.(selectedDoc.id)}
          className="flex items-center gap-1.5 bg-active text-accent-ink text-[11.5px] rounded px-2 py-1 hover:bg-accent-soft max-w-[280px]"
        >
          <Link2 size={11} className="shrink-0" />
          <span className="truncate">{selectedDoc.title || 'Sem título'}</span>
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Desvincular"
          className="p-0.5 rounded text-ink-3 hover:text-danger"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        className="w-full bg-overlay border border-line rounded px-2 py-1 text-[12px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent"
      />
      {open && candidates.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-elevated border border-line rounded-lg shadow-2xl py-1 max-h-44 overflow-y-auto">
          {candidates.map((d) => (
            <button
              key={d.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(d.id);
                setQuery('');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-ink-2 hover:bg-hover hover:text-ink-1 truncate"
            >
              {d.title || 'Sem título'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
