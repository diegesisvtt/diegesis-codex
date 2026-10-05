// CAMADA 1 — TacticalCard. Card tático com cabeçalho, corpo e ações opcionais.

import type { HTMLAttributes } from 'react';

export type TacticalCardState = 'default' | 'interactive' | 'selected';

const BASE =
  'rounded-lg bg-card backdrop-blur-md border text-ink-1 overflow-hidden';

const STATE: Record<TacticalCardState, string> = {
  default: 'border-cyan-500/15',
  interactive:
    'border-cyan-500/15 hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-glow-cyan transition-all duration-100',
  selected: 'border-cyan-400/50 bg-cyan-500/10',
};

export interface TacticalCardProps extends HTMLAttributes<HTMLDivElement> {
  state?: TacticalCardState;
}

function Header({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-3 py-2 border-b border-white/5 ${className}`} {...props} />;
}

function Body({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-3 py-1.5 ${className}`} {...props} />;
}

function Actions({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex items-center gap-1 ${className}`} {...props} />;
}

export function TacticalCard({ state = 'default', className = '', ...props }: TacticalCardProps) {
  return <div className={`${BASE} ${STATE[state]} ${className}`} {...props} />;
}

TacticalCard.Header = Header;
TacticalCard.Body = Body;
TacticalCard.Actions = Actions;
