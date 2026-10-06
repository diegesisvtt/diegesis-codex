// TagInput — tags livres com autocomplete: chips removíveis + input que
// sugere tags já existentes (suggestions) e cria novas com Enter/vírgula.

import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

export interface TagInputProps {
  value: string[];
  onChange(tags: string[]): void;
  /** tags já existentes no contexto (autocomplete); filtradas pelo texto digitado */
  suggestions?: string[];
  placeholder?: string;
}

const normalize = (t: string) => t.trim().toLowerCase();

export function TagInput({ value, onChange, suggestions = [], placeholder = 'Adicionar tag…' }: TagInputProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const taken = new Set(value.map(normalize));
  const needle = normalize(text);
  const matches = suggestions
    .filter((s) => !taken.has(normalize(s)) && (!needle || normalize(s).includes(needle)))
    .slice(0, 8);
  const exact = suggestions.some((s) => normalize(s) === needle) || taken.has(needle);
  const canCreate = needle.length > 0 && !exact;
  const items: { label: string; create: boolean }[] = [...matches.map((label) => ({ label, create: false })), ...(canCreate ? [{ label: text.trim(), create: true }] : [])];

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || taken.has(normalize(t))) return;
    onChange([...value, t]);
    setText('');
    setHighlight(0);
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && items[highlight]) add(items[highlight].label);
      else if (text.trim()) add(text);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap items-center gap-1 rounded border border-line bg-overlay px-1.5 py-1 focus-within:border-accent cursor-text"
        onClick={(e) => {
          if (e.currentTarget === e.target || (e.target as HTMLElement).tagName === 'DIV') e.currentTarget.querySelector('input')?.focus();
        }}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded bg-accent-soft text-accent-ink text-[11px] px-1.5 py-0.5">
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-accent-ink/60 hover:text-accent-ink"
              title={`Remover tag "${tag}"`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          spellCheck={false}
          className="flex-1 min-w-[70px] bg-transparent border-none outline-none text-[12px] text-ink-1 py-0.5"
        />
      </div>
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-line bg-overlay/95 backdrop-blur-md shadow-lg py-1 max-h-48 overflow-y-auto custom-scrollbar">
          {items.map((item, i) => (
            <button
              key={`${item.create ? '+' : ''}${item.label}`}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                add(item.label);
                setOpen(true);
              }}
              className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-[12px] ${
                i === highlight ? 'bg-accent-soft text-accent-ink' : 'text-ink-2'
              }`}
            >
              {item.create && <Plus size={11} className="shrink-0" />}
              <span className="truncate">{item.create ? `Criar "${item.label}"` : item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
