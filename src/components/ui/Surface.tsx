// CAMADA 1 — Superfícies. Determinam profundidade e hierarquia visual em todo
// o app. Tokens vêm do @theme em styles.css (--color-app/sidebar/card/elevated).

import { forwardRef, type HTMLAttributes } from 'react';

export type SurfaceVariant = 'base' | 'panel' | 'card' | 'elevated';

const VARIANT: Record<SurfaceVariant, string> = {
  // fundo geral do app (ônix profundo)
  base: 'bg-app text-ink-1',
  // barras laterais, headers e gavetas (grafite azul-aço)
  panel: 'bg-sidebar text-ink-1',
  // contêineres de dados (translúcido + blur + borda sutil)
  card: 'bg-card backdrop-blur-sm border border-cyan-500/15 text-ink-1',
  // modais, menus de contexto e popovers (sólido + sombra tática)
  elevated: 'bg-elevated border border-cyan-500/20 text-ink-1 shadow-2xl',
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
}

/** Contêiner semântico de superfície. Bordas direcionais (ex.: border-r/l) são
 *  adicionadas pelo consumidor via className. Encaminha ref. */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { variant = 'base', className = '', ...props },
  ref
) {
  return <div ref={ref} className={`${VARIANT[variant]} ${className}`} {...props} />;
});
