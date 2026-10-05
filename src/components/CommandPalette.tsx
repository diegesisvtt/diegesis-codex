import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Terminal } from 'lucide-react';
import { useCommands, usePluginManager, type Command } from '../plugins';
import { Surface } from './ui/Surface';

/**
 * Subsequence match scoring: higher is better, -1 means no match.
 * Rewards consecutive runs and matches at word boundaries.
 */
function score(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  let total = 0;
  let run = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return -1;
    run = idx === ti ? run + 1 : 0;
    total += 1 + run * 2;
    if (idx === 0 || t[idx - 1] === ' ' || t[idx - 1] === '/' || t[idx - 1] === ':') total += 3;
    ti = idx + 1;
  }
  return total - t.length * 0.01;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const commands = useCommands();
  const manager = usePluginManager();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands
      .map((c) => ({ c, s: score(c.title, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  // Keep selected row visible
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const run = (command: Command) => {
    onClose();
    // defer so the palette closes before the command's side effects (e.g.
    // opening another palette) run
    setTimeout(() => manager.commands.run(command.id), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[selected];
      if (c) run(c);
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
      <Surface variant="elevated" className="w-full max-w-xl rounded-xl overflow-hidden animate-fade-up">
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Terminal size={16} className="text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Digite um comando…"
            className="flex-1 bg-transparent py-3.5 text-[15px] text-ink-1 placeholder-ink-3 outline-none"
          />
          <kbd className="text-[10px] text-ink-3 bg-overlay rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto custom-scrollbar py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-ink-3">
              Nenhum comando para “{query.trim()}”.
            </div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                data-index={i}
                onClick={() => run(c)}
                onMouseMove={() => setSelected(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected ? 'bg-hover' : ''
                }`}
              >
                <ChevronRight size={13} className={`shrink-0 ${i === selected ? 'text-accent-ink' : 'text-ink-3'}`} />
                <span className="flex-1 min-w-0 text-[13px] text-ink-1 truncate">{c.title}</span>
                {c.shortcut && (
                  <kbd className="shrink-0 text-[10px] text-ink-3 bg-overlay rounded px-1.5 py-0.5 font-sans">
                    {c.shortcut.replace('Mod', 'Ctrl').replace('+', ' + ')}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-line bg-sidebar flex items-center gap-4 text-[11px] text-ink-3">
          <span className="flex items-center gap-1">
            <kbd className="bg-overlay rounded px-1 py-px">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-overlay rounded px-1 py-px">↵</kbd> executar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="bg-overlay rounded px-1 py-px">esc</kbd> fechar
          </span>
        </div>
      </Surface>
    </div>
  );
}
