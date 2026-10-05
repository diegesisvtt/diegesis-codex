// CAMADA 1 — Badge. Pílula compacta de metadados (tipo, tag, nível, status).

import type { HTMLAttributes } from 'react';

export type BadgeVariant = 'tactical' | 'success' | 'danger' | 'arcane' | 'neutral';

const VARIANT: Record<BadgeVariant, string> = {
  tactical: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  success: 'border-success/30 bg-success-soft text-success',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  arcane: 'border-violet/30 bg-violet/10 text-violet',
  neutral: 'border-white/10 bg-overlay text-ink-2',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'neutral', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border text-[11px] font-mono uppercase tracking-wider select-none ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}
