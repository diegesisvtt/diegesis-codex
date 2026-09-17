import { useEffect, useState } from 'react';
import type { NavHistoryEntry } from './model';

interface HistorySpineProps {
  entries: NavHistoryEntry[];
  /** pointer to the current position within entries */
  index: number;
  onGo: (index: number) => void;
}

/** Left-edge trail of recent reading positions ("ribbon spine"). */
export function HistorySpine({ entries, index, onGo }: HistorySpineProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [index, entries.length]);

  if (entries.length < 2) return null;

  // window of up to 5 entries around the pointer
  let start = Math.max(0, Math.min(index - 2, entries.length - 5));
  const slice = entries.slice(start, start + 5);

  return (
    <div
      className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-30'
      } hover:opacity-100`}
      aria-label="Histórico de navegação"
      onMouseEnter={() => setVisible(true)}
    >
      {slice.map((e, i) => {
        const idx = start + i;
        const isHere = idx === index;
        const label = e.label ? `Página ${e.page} (${e.label})` : `Página ${e.page}`;
        return (
          <button
            key={idx}
            onClick={() => onGo(idx)}
            title={isHere ? 'Posição atual' : `${idx < index ? 'Voltar para' : 'Avançar para'} ${label}`}
            className={`h-10 rounded-r-md border border-l-0 border-line text-[10px] font-mono transition-all
              ${isHere ? 'w-9 bg-accent-soft text-accent-ink border-accent/40' : 'w-6 bg-sidebar text-ink-3 grayscale hover:w-9 hover:grayscale-0 hover:text-ink-1'}`}
          >
            {e.page}
          </button>
        );
      })}
    </div>
  );
}
