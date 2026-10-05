// Ícone poligonal facetado por tipo de dado (d4…d100). Silhueta preenchida em
// currentColor (baixa opacidade) + arestas em traço — herda a cor do botão e
// brilha no hover. Sem dependências.
import type { DieType } from './DiceButton';

interface Glyph {
  /** silhueta externa (preenchida) */
  fill: string;
  /** arestas internas (traço) */
  lines: string[];
}

const GLYPHS: Record<DieType, Glyph> = {
  d4: {
    fill: 'M12 3.2 21.3 19.4 2.7 19.4Z',
    lines: ['M12 3.2 12 14.2', 'M2.7 19.4 12 14.2', 'M21.3 19.4 12 14.2'],
  },
  d6: {
    fill: 'M12 2.4 20.6 7.3 20.6 16.7 12 21.6 3.4 16.7 3.4 7.3Z',
    lines: ['M12 2.4 12 11.9', 'M3.4 16.7 12 11.9', 'M20.6 16.7 12 11.9'],
  },
  d8: {
    fill: 'M12 2.4 20.6 12 12 21.6 3.4 12Z',
    lines: ['M12 2.4 12 21.6', 'M3.4 12 20.6 12'],
  },
  d10: {
    fill: 'M12 2.4 20.7 9.2 12 21.6 3.3 9.2Z',
    lines: ['M3.3 9.2 20.7 9.2', 'M3.3 9.2 12 21.6', 'M20.7 9.2 12 21.6'],
  },
  d12: {
    fill: 'M12 2.4 21.2 9.2 17.7 20.3 6.3 20.3 2.8 9.2Z',
    lines: ['M12 12.1 12 2.4', 'M12 12.1 21.2 9.2', 'M12 12.1 17.7 20.3', 'M12 12.1 6.3 20.3', 'M12 12.1 2.8 9.2'],
  },
  d20: {
    fill: 'M12 2.4 20.6 7 20.6 17 12 21.6 3.4 17 3.4 7Z',
    lines: ['M12 5.3 17.9 15.6 6.1 15.6Z', 'M12 5.3 12 2.4', 'M17.9 15.6 20.6 17', 'M6.1 15.6 3.4 17'],
  },
  d100: {
    fill: 'M12 2.6 17.4 4.5 20.9 9.6 20.9 14.4 17.4 19.5 12 21.4 6.6 19.5 3.1 14.4 3.1 9.6 6.6 4.5Z',
    lines: ['M12 2.6 12 21.4', 'M3.1 12 20.9 12'],
  },
};

export interface DieIconProps {
  type: DieType;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function DieIcon({ type, size = 15, className = '', strokeWidth = 1.4 }: DieIconProps) {
  const g = GLYPHS[type];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      <path d={g.fill} fill="currentColor" fillOpacity={0.14} stroke="none" />
      <path d={g.fill} />
      {g.lines.map((d, i) => (
        <path key={i} d={d} opacity={0.8} />
      ))}
    </svg>
  );
}
