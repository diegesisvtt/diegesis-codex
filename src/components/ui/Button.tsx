// CAMADA 2 — Button. Consolida as variantes de botão do app numa única API.
// `primary` e `secondary` são aliases legados para migração incremental.

import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'tactical' | 'ghost' | 'outline' | 'danger' | 'primary' | 'secondary';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium select-none ' +
  'active:scale-95 transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none';

const VARIANT: Record<ButtonVariant, string> = {
  // ação primária tática: azul-aço + borda ciano + micro-glow no hover
  tactical:
    'bg-overlay border border-cyan-500/40 text-cyan-100 hover:text-neon hover:border-cyan-400 hover:shadow-glow-cyan',
  ghost: 'text-ink-2 hover:text-ink-1 hover:bg-hover',
  outline: 'bg-transparent border border-line text-ink-1 hover:border-cyan-500/40 hover:bg-hover',
  danger: 'bg-danger-soft text-danger border border-danger/30 hover:bg-[rgba(244,63,94,0.22)]',
  // aliases legados (ui.tsx antigo)
  primary: 'bg-accent hover:bg-accent-hover text-white',
  secondary: 'bg-elevated hover:bg-overlay text-ink-1 border border-line',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-[12px]',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'tactical', size = 'md', className = '', ...props }: ButtonProps) {
  return <button className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...props} />;
}
