// Primitivas de formulário para painéis de propriedades (padrão visual do
// hexmap): Field (rótulo + controle), Section (cabeçalho), Num, Color, Check,
// TextInput, Select e inputCls. Componentes controlados: { value, onChange }.

export const inputCls =
  'w-full min-w-0 bg-overlay border border-line rounded px-1.5 py-1 text-[12px] text-ink-1 outline-none focus:border-accent';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-[12px] text-ink-2">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
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
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#2383e2]" />
      {label}
    </label>
  );
}

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
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className ?? ''}`}>
      {options.map(([v, l]) => (
        <option key={v} value={v} className="bg-elevated">
          {l}
        </option>
      ))}
    </select>
  );
}
