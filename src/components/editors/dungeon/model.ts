// Modelo editor-side do Mapa de Dungeon: reexporta o modelo compartilhado
// (shared/dungeon.ts) e define constantes visuais do editor.

export * from '../../../../shared/dungeon';

/** paleta de cores de sala (preenchimento do chão) */
export const ROOM_COLORS = [
  '#3d4457',
  '#4a3b52',
  '#3b5247',
  '#52483b',
  '#3b4a5c',
  '#573b3b',
  '#46523b',
  '#4f3b5c',
] as const;

/** cor padrão do chão de corredor (ligeiramente mais escura que salas) */
export const CORRIDOR_COLOR = '#2e3442';

/** cor das paredes derivadas */
export const WALL_COLOR = '#8f94a8';

/** cores das portas por tipo */
export const DOOR_COLORS: Record<string, string> = {
  normal: '#c8b088',
  secret: '#7f6fd4',
  locked: '#d47f6f',
  portcullis: '#9aa2b8',
};

/** overlay de fog por célula não revelada (GM vê translúcido) */
export const FOG_GM_ALPHA = 0.55;
export const FOG_COLOR = '#090c12';

/** contorno da sala selecionada (highlight no canvas) */
export const SELECTION_COLOR = '#e8c45f';

/** opções de fonte dos rótulos (mesma lista do hexmap) — fonts do realm
 *  entram dinamicamente via useRealmFonts */
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'inherit', label: 'UI (padrão)' },
  { value: 'Georgia, serif', label: 'Serifada' },
  { value: 'ui-monospace, monospace', label: 'Monoespaçada' },
  { value: "'Palatino Linotype', 'Book Antiqua', serif", label: 'Fantasia' },
];

/** resolve 'inherit' para a fonte real da UI (Pixi não entende 'inherit') */
export function resolveFont(font: string | undefined): string {
  return !font || font === 'inherit' ? 'Plus Jakarta Sans, sans-serif' : font;
}
