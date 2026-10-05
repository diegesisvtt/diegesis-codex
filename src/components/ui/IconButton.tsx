// CAMADA 2 — IconButton. Botão de ícone padronizado (tático/ativo).

import type { ButtonHTMLAttributes, ComponentType } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  active?: boolean;
}

export function IconButton({ icon: Icon, active = false, className = '', ...props }: IconButtonProps) {
  return (
    <button
      className={`p-1.5 rounded-md transition-all duration-100 active:scale-90 flex items-center justify-center ${
        active
          ? 'text-accent-ink bg-accent-soft border border-cyan-500/40'
          : 'text-ink-3 hover:text-ink-1 hover:bg-hover border border-transparent'
      } ${className}`}
      {...props}
    >
      <Icon size={17} strokeWidth={1.75} />
    </button>
  );
}
