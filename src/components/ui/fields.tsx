// Primitivas de formulário para painéis de propriedades (padrão visual do
// hexmap): Field (rótulo + controle), Section (cabeçalho), Num, Color, Check,
// TextInput, Select e inputCls. Componentes controlados: { value, onChange }.

import { useEffect, useRef, useState } from 'react';
import { Check as CheckIcon, ChevronDown } from 'lucide-react';

export const inputCls =
  'w-full min-w-0 bg-overlay border border-line rounded px-1.5 py-1 text-[12px] text-ink-1 outline-none focus:border-accent';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[12px] text-ink-2">
      <span className="shrink-0">{label}</span>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1">{title}</div>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={`${inputCls} ${mono ? 'font-mono' : ''} ${className ?? ''}`}
    />
  );
}

export function Num({
  value,
  onChange,
  min,
  max,
  step,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => {
        if (e.target.value === '') return;
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={`${inputCls} text-right ${className ?? 'w-16'}`}
    />
  );
}

export function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-8 h-6 rounded border border-line bg-overlay cursor-pointer"
    />
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#38bdf8]" />
      {label}
    </label>
  );
}

/** Dropdown custom (não-nativo): trigger + menu estilizado com estado ativo */
export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = options.find(([v]) => v === value)?.[1] ?? value;

  return (
    <div ref={ref} className={`relative ${className ?? 'w-40'}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between gap-1.5 w-full bg-overlay border border-line rounded-md px-2 py-1 text-[12px] text-ink-1 outline-none hover:border-accent/50 focus:border-accent transition-colors"
      >
        <span className="truncate text-left">{current}</span>
        <ChevronDown size={12} className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[132px] rounded-lg border border-line bg-overlay shadow-[0_10px_32px_rgba(0,0,0,0.55)] py-1 max-h-64 overflow-y-auto custom-scrollbar">
          {options.map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                v === value ? 'bg-sheet-soft text-sheet-strong' : 'text-ink-2 hover:text-ink-1 hover:bg-hover'
              }`}
            >
              <span className="w-3 shrink-0">{v === value && <CheckIcon size={12} className="text-sheet" />}</span>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
