// CAMADA 3 — RollResultCard. Resultado no feed de rolagens: barra de status
// lateral (crítico/falha/normal), autor + timestamp, chip de fórmula e total em
// display serif com gradiente e brilho. Tags semânticas de crítico/falha.

import type { ReactNode } from 'react';
import { Check, Copy, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { TacticalCard } from '../ui/TacticalCard';
import { Badge } from '../ui/Badge';

export interface RollResultCardProps {
  author: string;
  formula: string;
  result?: number | string;
  isCritSuccess?: boolean;
  isCritFail?: boolean;
  timestamp?: string;
  onCopy?: () => void;
  onReroll?: () => void;
  onRemove?: () => void;
  /** conteúdo extra (chips de dados, multi-passo) */
  children?: ReactNode;
}

type Status = 'crit' | 'fail' | 'normal';

const BAR: Record<Status, string> = {
  crit: 'bg-neon shadow-[0_0_10px_rgba(0,242,254,0.7)]',
  fail: 'bg-crimson shadow-[0_0_10px_rgba(244,63,94,0.7)]',
  normal: 'bg-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.35)]',
};

const DOT: Record<Status, string> = {
  crit: 'bg-neon',
  fail: 'bg-crimson',
  normal: 'bg-cyan-400',
};

const RESULT: Record<Status, string> = {
  crit: 'from-white to-neon text-glow-crit drop-shadow-[0_0_10px_rgba(0,242,254,0.45)]',
  fail: 'from-white to-crimson text-glow-fail drop-shadow-[0_0_10px_rgba(244,63,94,0.45)]',
  normal: 'from-ink-1 to-cyan-200/90',
};

export function RollResultCard({
  author,
  formula,
  result,
  isCritSuccess = false,
  isCritFail = false,
  timestamp,
  onCopy,
  onReroll,
  onRemove,
  children,
}: RollResultCardProps) {
  const [copied, setCopied] = useState(false);
  const status: Status = isCritSuccess ? 'crit' : isCritFail ? 'fail' : 'normal';

  const handleCopy = () => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <TacticalCard className="group/roll relative overflow-hidden py-2 pl-3.5 pr-2.5">
      {/* barra de status */}
      <span className={`absolute bottom-2 left-0 top-2 w-[3px] rounded-full ${BAR[status]}`} />

      {/* cabeçalho */}
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rotate-45 ${DOT[status]}`} />
        <span className="truncate text-[11.5px] font-semibold tracking-wide text-ink-1">{author}</span>
        {timestamp && <span className="shrink-0 font-mono text-[10px] text-ink-3 select-none">{timestamp}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/roll:opacity-100 focus-within:opacity-100">
          {onReroll && (
            <button
              type="button"
              title="Rolar novamente"
              onClick={onReroll}
              className="rounded-md p-1 text-ink-3 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200"
            >
              <RotateCcw size={12} />
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              title="Copiar resultado"
              onClick={handleCopy}
              className="rounded-md p-1 text-ink-3 transition-colors hover:bg-white/5 hover:text-cyan-200"
            >
              {copied ? <Check size={12} className="text-cyan-300" /> : <Copy size={12} />}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              title="Remover entrada"
              onClick={onRemove}
              className="rounded-md p-1 text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* fórmula */}
      <div className="mt-1">
        <span className="inline-flex items-center rounded-md border border-line/70 bg-overlay/50 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3 select-none">
          {formula}
        </span>
      </div>

      {children}

      {/* resultado */}
      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        {result != null && result !== '' && (
          <span className="animate-micro-shake inline-block">
            <span
              className={`bg-gradient-to-b bg-clip-text font-display text-[26px] font-bold leading-none tracking-tight text-transparent ${RESULT[status]}`}
            >
              {result}
            </span>
          </span>
        )}
        {isCritSuccess && <Badge variant="tactical">Crítico</Badge>}
        {isCritFail && <Badge variant="danger">Falha</Badge>}
      </div>
    </TacticalCard>
  );
}
