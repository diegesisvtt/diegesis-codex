import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DocNode } from '@shared/types';

/**
 * Seletor de documentos do realm (personagens, locais, facções…).
 * Multi-seleção com chips; pastas e o próprio documento da timeline
 * não são selecionáveis.
 */
export function EntityPicker({
  docs,
  selected,
  onChange,
  excludeDocId,
  placeholder = 'Vincular documento…',
}: {
  docs: DocNode[];
  selected: string[];
  onChange(ids: string[]): void;
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
      .filter((d) => d.type !== 'core/folder' && d.id !== excludeDocId && !selected.includes(d.id))
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .slice(0, 12);
  }, [docs, query, selected, excludeDocId]);

  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title || 'Sem título';

  const pick = (id: string) => {
    onChange([...selected, id]);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1 bg-overlay border border-line rounded px-1.5 py-1 focus-within:border-accent cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((id) => (
          <span
            key={id}
            className="flex items-center gap-1 bg-active text-ink-1 text-[11px] rounded px-1.5 py-0.5"
          >
            <span className="max-w-[140px] truncate">{titleOf(id)}</span>
            <button
              type="button"
              className="text-ink-3 hover:text-danger"
              onClick={(e) => {
                e.stopPropagation();
                onChange(selected.filter((s) => s !== id));
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          className="flex-1 min-w-[120px] bg-transparent text-[12.5px] text-ink-1 outline-none placeholder:text-ink-3 py-0.5"
        />
      </div>
      {open && candidates.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-elevated border border-line rounded-lg shadow-2xl py-1 max-h-48 overflow-y-auto">
          {candidates.map((d) => (
            <button
              key={d.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(d.id);
              }}
              className="w-full text-left px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 truncate"
            >
              {d.title || 'Sem título'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
