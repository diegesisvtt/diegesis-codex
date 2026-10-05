// CAMADA 3 — CalloutBlock. Bloco de destaque para notas, compêndios e livros.
// Borda lateral temática de 4px + ícone semântico.

import type { ReactNode } from 'react';
import { BookOpen, Feather, Lock, Skull } from 'lucide-react';

export type CalloutVariant = 'rule' | 'lore' | 'secret' | 'quote';

const ICON: Record<CalloutVariant, typeof BookOpen> = {
  rule: BookOpen,
  lore: Feather,
  secret: Lock,
  quote: Skull,
};

const TONE: Record<CalloutVariant, string> = {
  rule: 'border-l-cyan-400 bg-cyan-500/5 text-cyan-300',
  lore: 'border-l-violet bg-violet/10 text-violet',
  secret: 'border-l-crimson bg-danger-soft/40 text-crimson',
  quote: 'border-l-white/40 bg-white/5 text-ink-2',
};

export interface CalloutBlockProps {
  variant: CalloutVariant;
  title?: string;
  children: ReactNode;
}

export function CalloutBlock({ variant, title, children }: CalloutBlockProps) {
  const Icon = ICON[variant];
  return (
    <div className={`my-1 w-full rounded-r-lg border-l-4 px-3 py-2 ${TONE[variant]}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <Icon size={13} className="shrink-0 opacity-90" />
        {title && <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>}
      </div>
      <div className="text-[13px] leading-relaxed text-ink-1">{children}</div>
    </div>
  );
}
