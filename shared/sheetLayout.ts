// Layout customizável da ficha (diegesis/sheet): grid livre de blocos
// posicionados por {x, y, w, h} em unidades de grid. TS puro — usado pelo
// renderer (canvas) e pelo main (parse tolerante). O SheetEngine ignora o
// campo `layout`; ele viaja no JSON serializado do documento.

export interface SheetGrid {
  cols: number;
  rowHeight: number;
  gap: number;
}

/** aba/página da ficha (blocos são distribuídos entre abas) */
export interface SheetTab {
  id: string;
  title: string;
}

export interface SheetLayout {
  version: 1;
  grid: SheetGrid;
  blocks: SheetBlock[];
  /** páginas da ficha; ausente = uma única aba implícita "Geral" */
  tabs?: SheetTab[];
}

export type BlockInput = 'number' | 'die' | 'text' | 'checkbox';

interface BlockBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** id da aba à qual o bloco pertence (padrão: primeira aba) */
  tab?: string;
}

export type SheetBlock =
  | (BlockBase & { type: 'title' })
  | (BlockBase & { type: 'field'; path: string; label: string; input: BlockInput })
  | (BlockBase & { type: 'derived'; path: string; label: string })
  | (BlockBase & { type: 'identity'; key: string; label: string; multiline?: boolean })
  | (BlockBase & { type: 'rolls'; templates: string[] })
  | (BlockBase & { type: 'effects' })
  | (BlockBase & { type: 'text'; text: string })
  | (BlockBase & { type: 'section'; title: string });

export const SHEET_GRID: SheetGrid = { cols: 12, rowHeight: 44, gap: 8 };

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `blk-${Date.now().toString(36)}-${counter}`;
}

/** layout padrão reproduzindo a ficha OSR atual (nome, atributos, derivados, rolagens, efeitos) */
export function defaultSheetLayout(): SheetLayout {
  const g = SHEET_GRID;
  const field = (path: string, label: string, input: BlockInput, x: number, y: number, w = 3, tab = 'geral'): SheetBlock => ({
    id: newBlockId(), type: 'field', path, label, input, x, y, w, h: 2, tab,
  });
  const section = (title: string, x: number, y: number, tab = 'geral'): SheetBlock => ({
    id: newBlockId(), type: 'section', title, x, y, w: 12, h: 1, tab,
  });
  return {
    version: 1,
    grid: g,
    tabs: [
      { id: 'geral', title: 'Geral' },
      { id: 'combate', title: 'Combate' },
      { id: 'efeitos', title: 'Efeitos' },
    ],
    blocks: [
      { id: newBlockId(), type: 'title', x: 0, y: 0, w: 12, h: 2, tab: 'geral' },
      section('Atributos', 0, 2),
      field('dv', 'DV', 'number', 0, 3),
      field('dadoVida', 'Dado de Vida', 'die', 3, 3),
      field('pv.atual', 'PV', 'number', 6, 3),
      field('pv.max', 'PV Máx', 'number', 9, 3),
      field('ca', 'CA', 'number', 0, 5),
      field('atq', 'Atq', 'number', 3, 5),
      field('moral', 'Moral', 'number', 6, 5),
      field('desl.quad', 'Desl.', 'number', 9, 5),
      field('save', 'Save', 'number', 0, 7),
      { id: newBlockId(), type: 'derived', path: 'pv.metade', label: 'pv.metade', x: 3, y: 7, w: 3, h: 2, tab: 'geral' },
      { id: newBlockId(), type: 'derived', path: 'desl.pes', label: 'desl.pes', x: 6, y: 7, w: 3, h: 2, tab: 'geral' },
      { id: newBlockId(), type: 'derived', path: 'desl.m', label: 'desl.m', x: 9, y: 7, w: 3, h: 2, tab: 'geral' },
      section('Rolagens', 0, 9, 'combate'),
      { id: newBlockId(), type: 'rolls', templates: ['ataque', 'dano', 'moral', 'save'], x: 0, y: 10, w: 12, h: 2, tab: 'combate' },
      section('Efeitos', 0, 12, 'efeitos'),
      { id: newBlockId(), type: 'effects', x: 0, y: 13, w: 12, h: 4, tab: 'efeitos' },
    ],
  };
}

const BLOCK_TYPES = new Set(['title', 'field', 'derived', 'identity', 'rolls', 'effects', 'text', 'section']);

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** valida entrada hostil (realm import, versões futuras); retorna null se irreconhecível */
export function parseSheetLayout(raw: unknown): SheetLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const grid = (r.grid && typeof r.grid === 'object' ? r.grid : {}) as Record<string, unknown>;
  const g: SheetGrid = {
    cols: isNum(grid.cols) && grid.cols > 0 ? grid.cols : SHEET_GRID.cols,
    rowHeight: isNum(grid.rowHeight) && grid.rowHeight > 0 ? grid.rowHeight : SHEET_GRID.rowHeight,
    gap: isNum(grid.gap) && grid.gap >= 0 ? grid.gap : SHEET_GRID.gap,
  };
  if (!Array.isArray(r.blocks)) return null;
  const blocks: SheetBlock[] = [];
  for (const b of r.blocks) {
    if (!b || typeof b !== 'object') continue;
    const blk = b as Record<string, unknown>;
    if (typeof blk.id !== 'string' || typeof blk.type !== 'string' || !BLOCK_TYPES.has(blk.type)) continue;
    if (![blk.x, blk.y, blk.w, blk.h].every(isNum)) continue;
    blocks.push({
      ...blk,
      tab: typeof blk.tab === 'string' ? blk.tab : undefined,
      x: Math.max(0, Math.round(blk.x as number)),
      y: Math.max(0, Math.round(blk.y as number)),
      w: Math.max(1, Math.round(blk.w as number)),
      h: Math.max(1, Math.round(blk.h as number)),
    } as unknown as SheetBlock);
  }
  const tabs = Array.isArray(r.tabs)
    ? (r.tabs as unknown[]).filter((t) => t && typeof t === 'object' && typeof (t as Record<string, unknown>).id === 'string' && typeof (t as Record<string, unknown>).title === 'string')
        .map((t) => ({ id: (t as Record<string, unknown>).id as string, title: (t as Record<string, unknown>).title as string }))
    : undefined;
  return { version: 1, grid: g, blocks, ...(tabs && tabs.length > 0 ? { tabs } : {}) };
}

/** abas efetivas (ausência = uma única "Geral" implícita) */
export function sheetTabs(layout: SheetLayout): SheetTab[] {
  return layout.tabs && layout.tabs.length > 0 ? layout.tabs : [{ id: 'geral', title: 'Geral' }];
}

/** aba à qual um bloco pertence (default: primeira aba) */
export function blockTab(block: SheetBlock, tabs: SheetTab[]): string {
  return block.tab && tabs.some((t) => t.id === block.tab) ? block.tab : (tabs[0]?.id ?? 'geral');
}

/** altura total do canvas em unidades de grid (última linha ocupada + margem) */
export function layoutRows(layout: SheetLayout): number {
  return layout.blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0) + 1;
}

/** clamp de posição/tamanho dentro das colunas do grid */
export function clampBlock(layout: SheetLayout, b: SheetBlock): SheetBlock {
  const cols = layout.grid.cols;
  const w = Math.min(Math.max(1, b.w), cols);
  const x = Math.min(Math.max(0, b.x), cols - w);
  return { ...b, x, w, y: Math.max(0, b.y), h: Math.max(1, b.h) };
}

// ---------- modelos de ficha ----------

/**
 * Modelo nomeado de ficha. Um mesmo jogo/mundo pode ter vários tipos de ficha
 * (Personagem, Monstro, NPC, Facção...). Fichas referenciam um modelo por
 * `templateId` e podem sobrescrever o layout individualmente.
 */
export interface SheetTemplate {
  id: string;
  name: string;
  layout: SheetLayout;
  /** true para modelos embutidos (não podem ser renomeados/excluídos) */
  builtin?: boolean;
}

/** valida modelo vindo do realm settings (entrada hostil); null se inválido */
export function parseSheetTemplate(raw: unknown): SheetTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name) return null;
  const layout = parseSheetLayout(r.layout);
  if (!layout) return null;
  return { id: r.id, name: r.name, layout };
}

/** layout compacto para criaturas e NPCs: stats em duas linhas + notas */
export function monsterSheetLayout(): SheetLayout {
  const g = SHEET_GRID;
  const field = (path: string, label: string, input: BlockInput, x: number, y: number, w = 3): SheetBlock => ({
    id: newBlockId(), type: 'field', path, label, input, x, y, w, h: 2,
  });
  return {
    version: 1,
    grid: g,
    blocks: [
      { id: newBlockId(), type: 'title', x: 0, y: 0, w: 12, h: 2 },
      field('dv', 'DV', 'number', 0, 2),
      field('dadoVida', 'Dado de Vida', 'die', 3, 2),
      field('pv.atual', 'PV', 'number', 6, 2),
      field('pv.max', 'PV Máx', 'number', 9, 2),
      field('ca', 'CA', 'number', 0, 4),
      field('atq', 'Atq', 'number', 3, 4),
      field('moral', 'Moral', 'number', 6, 4),
      field('save', 'Save', 'number', 9, 4),
      { id: newBlockId(), type: 'rolls', templates: ['ataque', 'dano', 'moral', 'save'], x: 0, y: 6, w: 12, h: 2 },
      { id: newBlockId(), type: 'section', title: 'Notas', x: 0, y: 8, w: 12, h: 1 },
      { id: newBlockId(), type: 'identity', key: 'notas', label: 'Notas', multiline: true, x: 0, y: 9, w: 12, h: 3 },
      { id: newBlockId(), type: 'section', title: 'Efeitos', x: 0, y: 12, w: 12, h: 1 },
      { id: newBlockId(), type: 'effects', x: 0, y: 13, w: 12, h: 3 },
    ],
  };
}

export const SHEET_TEMPLATE_PERSONAGEM = 'personagem';
export const SHEET_TEMPLATE_MONSTRO = 'monstro';

/** modelos embutidos — novas fichas começam de um deles */
export function builtinSheetTemplates(): SheetTemplate[] {
  return [
    { id: SHEET_TEMPLATE_PERSONAGEM, name: 'Personagem', layout: defaultSheetLayout(), builtin: true },
    { id: SHEET_TEMPLATE_MONSTRO, name: 'Monstro / NPC', layout: monsterSheetLayout(), builtin: true },
  ];
}

export function newTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
