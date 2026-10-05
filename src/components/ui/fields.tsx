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

/** Dropdown custom (não-nativo): trigger com gradiente + anel dourado, menu com blur e item ativo */
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find(([v]) => v === value)?.[1] ?? value;

  return (
    <div ref={ref} className={`relative ${className ?? 'w-40'}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-between gap-2 w-full rounded-lg border px-2.5 py-1.5 text-[12px] text-ink-1 outline-none transition-all duration-150 bg-gradient-to-b from-elevated/90 to-overlay shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
          open
            ? 'border-sheet/60 shadow-[0_0_0_2px_rgba(212,175,55,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]'
            : 'border-line hover:border-sheet/40 hover:bg-elevated'
        }`}
      >
        <span className="truncate text-left">{current}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-all duration-150 ${open ? 'rotate-180 text-sheet' : 'text-ink-3 group-hover:text-ink-2'}`}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[140px] rounded-xl border border-sheet/25 bg-overlay/95 backdrop-blur-md shadow-[0_14px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] py-1 max-h-64 overflow-y-auto custom-scrollbar">
          {options.map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                v === value ? 'bg-sheet-soft text-sheet-strong' : 'text-ink-2 hover:text-ink-1 hover:bg-hover'
              }`}
            >
              <span className="w-3.5 shrink-0 flex items-center">
                {v === value && <CheckIcon size={12} className="text-sheet" />}
              </span>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
