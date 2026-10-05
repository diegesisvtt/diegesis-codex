// CAMADA 3 — StatMetric. Número/atributo universal (rótulo, valor mono grande,
// mini barra de progresso opcional, rolagem opcional).

import type { MouseEventHandler } from 'react';
import { Dices } from 'lucide-react';

export interface StatMetricProps {
  label: string;
  value: string | number;
  /** quando presente, exibe uma mini barra de progresso value/max */
  max?: number;
  unit?: string;
  isRollable?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
}

export function StatMetric({ label, value, max, unit, isRollable = false, onClick }: StatMetricProps) {
  const numeric = typeof value === 'number';
  const pct = max != null && numeric ? Math.max(0, Math.min(100, (value as number) / max) * 100) : null;

  const content = (
    <>
      <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-3 select-none truncate max-w-full">
        {label}
      </span>
      <span className="font-mono text-[15px] font-semibold text-ink-1 leading-none flex items-baseline gap-0.5">
        {value}
        {unit && <span className="text-[10px] font-normal text-ink-3">{unit}</span>}
      </span>
      {pct != null && (
        <span className="w-full h-0.5 rounded-full bg-white/10 overflow-hidden">
          <span
            className="block h-full rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </>
  );

  const base =
    'h-full w-full rounded-xl border border-cyan-500/15 bg-card backdrop-blur-sm px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 overflow-hidden transition-all duration-100';

  if (isRollable) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Rolar ${label}`}
        className={`${base} cursor-pointer hover:border-cyan-400 hover:shadow-glow-cyan active:scale-95 group`}
      >
        {content}
        <Dices size={10} className="absolute top-1 right-1 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    );
  }

  return <div className={base}>{content}</div>;
}
