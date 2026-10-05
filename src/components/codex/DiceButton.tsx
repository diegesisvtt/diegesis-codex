// CAMADA 3 — DiceButton / DiceBar. Botão de dado premium: ícone poligonal
// facetado, gradiente, glow ciano no hover, giro do dado e varredura de luz no
// clique. DiceBar agrupa os dados numa bandeja tática; `size` controla o porte.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { DieIcon } from './DieIcon';

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

export const DEFAULT_DICE: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export type DiceSize = 'md' | 'lg';

const SIZE: Record<DiceSize, { pad: string; text: string; icon: number; gap: string; round: string }> = {
  md: { pad: 'px-2 py-1', text: 'text-[11px]', icon: 14, gap: 'gap-1.5', round: 'rounded-lg' },
  lg: { pad: 'px-2.5 py-1.5', text: 'text-[12.5px]', icon: 18, gap: 'gap-2', round: 'rounded-xl' },
};

export interface DiceButtonProps {
  dieType: DieType;
  count?: number;
  onRoll?: (formula: string) => void;
  size?: DiceSize;
  className?: string;
}

export function DiceButton({ dieType, count = 1, onRoll, size = 'md', className = '' }: DiceButtonProps) {
  const [spinKey, setSpinKey] = useState(0);
  const s = SIZE[size];
  const formula = `${count}${dieType}`;
  const label = `${count > 1 ? count : ''}${dieType}`;
  return (
    <motion.button
      type="button"
      title={`Adicionar ${formula} à fórmula`}
      whileTap={{ scale: 0.9 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      onClick={() => {
        setSpinKey((k) => k + 1);
        onRoll?.(formula);
      }}
      className={`group relative inline-flex items-center overflow-hidden border border-cyan-500/25 bg-gradient-to-b from-white/[0.09] to-white/[0.015] font-mono font-semibold text-ink-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_5px_rgba(0,0,0,0.35)] transition-colors duration-150 hover:border-cyan-400/70 hover:text-cyan-100 hover:shadow-[0_0_18px_rgba(56,189,248,0.4),inset_0_1px_0_rgba(255,255,255,0.12)] active:text-neon focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 ${s.gap} ${s.round} ${s.pad} ${s.text} ${className}`}
    >
      {/* brilho radial no hover */}
      <span
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: 'radial-gradient(130% 100% at 50% -35%, rgba(56,189,248,0.32), transparent 62%)' }}
      />
      {/* varredura de luz no clique */}
      <span
        key={`sheen-${spinKey}`}
        className={`pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/25 blur-[6px] ${
          spinKey > 0 ? 'animate-sheen' : 'opacity-0'
        }`}
      />
      <span key={spinKey} className="animate-dice-spin relative inline-flex text-current">
        <DieIcon type={dieType} size={s.icon} />
      </span>
      <span className="relative tabular-nums">{label}</span>
    </motion.button>
  );
}

export interface DiceBarProps {
  dice?: DieType[];
  onRoll: (formula: string) => void;
  size?: DiceSize;
  className?: string;
}

export function DiceBar({ dice = DEFAULT_DICE, onRoll, size = 'lg', className = '' }: DiceBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-white/[0.045] to-transparent p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${className}`}
    >
      {dice.map((d) => (
        <DiceButton key={d} dieType={d} onRoll={onRoll} size={size} />
      ))}
    </div>
  );
}
