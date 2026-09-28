// Modelo da "Tabela Interativa" (diegesis/table): linhas com peso, fórmula de
// dado opcional, faixas derivadas cumulativamente dos pesos (estilo Foundry)
// e rolagem simples (botão rolar). TS puro — usado pelo renderer e pelo main.
// A rolagem e a notação são delegadas ao diegesis-sdk (dice-core/dice-notation).

import {
  evaluateRoll,
  type FacesSpec,
  type Modifier,
  type RollExpr,
  type RollResult as DiceRoll,
} from '@diegesis/dice-core';
import { fromFormula } from '@diegesis/dice-notation';

export interface TableRow {
  id: string;
  /** resultado da linha (texto principal) */
  text: string;
  /** peso relativo da linha (>= 0) */
  weight: number;
  /** descrição expandida / notas do resultado */
  details: string;
  /** documento do realm vinculado ao resultado */
  docId: string | null;
}

export interface InteractiveTable {
  kind: 'diegesis-table';
  version: 1;
  /** fórmula de dado em notação canônica, ex: '1d20', '2d6', '4d6kh3'; '' = sorteio ponderado puro */
  formula: string;
  rows: TableRow[];
}

export interface RowRange {
  min: number;
  max: number;
}

export interface RollResult {
  row: TableRow;
  /** rolagem completa do dice-core (null quando sorteio ponderado puro, sem fórmula) */
  roll: DiceRoll | null;
  /** faixa sorteada (null quando sorteio ponderado ou fallback) */
  range: RowRange | null;
}

/** total numérico da rolagem (null quando ponderado ou fórmula booleana) */
export function rollTotal(result: RollResult): number | null {
  return result.roll && typeof result.roll.value === 'number' ? result.roll.value : null;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createEmptyRow(): TableRow {
  return { id: generateId(), text: '', weight: 1, details: '', docId: null };
}

export function createDefaultTable(): InteractiveTable {
  return { kind: 'diegesis-table', version: 1, formula: '', rows: [createEmptyRow()] };
}

// ---------- parsing / serialização ----------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** entrada hostil (import de realm, versões futuras): valida campo a campo */
export function parseTable(content: string | null | undefined): InteractiveTable {
  const base = createDefaultTable();
  if (!content) return base;
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object' || raw.kind !== 'diegesis-table') return base;
    const rows: TableRow[] = Array.isArray(raw.rows)
      ? raw.rows
          .filter((r: TableRow) => r && isStr(r.id))
          .map((r: TableRow) => ({
            id: r.id,
            text: isStr(r.text) ? r.text : '',
            weight: isNum(r.weight) && r.weight >= 0 ? r.weight : 1,
            details: isStr(r.details) ? r.details : '',
            docId: isStr(r.docId) ? r.docId : null,
          }))
      : [];
    return {
      kind: 'diegesis-table',
      version: 1,
      formula: isStr(raw.formula) && parseFormula(raw.formula) ? raw.formula.trim() : '',
      rows,
    };
  } catch {
    return base;
  }
}

export function serializeTable(data: InteractiveTable): string {
  return JSON.stringify(data);
}

/** texto indexável (FTS/RAG): resultados, detalhes e fórmula */
export function extractTableText(content: string): string {
  const t = parseTable(content);
  const parts: string[] = [];
  if (t.formula) parts.push(t.formula);
  for (const r of t.rows) {
    if (r.text) parts.push(r.text);
    if (r.details) parts.push(r.details);
  }
  return parts.join(' ');
}

// ---------- dados ----------

/**
 * Fórmula em notação canônica ('1d20', '4d6kh3', '2d6+3', pools '{2d6,1d8}kl1'…)
 * parseada para o IR do dice-core; null se inválida/vazia.
 */
export function parseFormula(formula: string): RollExpr | null {
  const src = formula?.trim();
  if (!src) return null;
  try {
    return fromFormula(src);
  } catch {
    return null;
  }
}

export interface FormulaBounds {
  min: number;
  max: number;
}

/** modificadores que tornam o máximo ilimitado (explosão, rerrolagem recursiva) */
const UNBOUNDED_OPS = new Set([
  'explode',
  'explode-once',
  'explode-compound',
  'explode-penetrating',
  'reroll-recursive',
]);
/** modificadores cujo resultado é uma contagem (0..dados mantidos) */
const COUNT_OPS = new Set([
  'count-success',
  'count-failure',
  'deduct-failure',
  'subtract-failure',
  'count-even',
  'count-odd',
]);

/** quantidade de dados mantidos após keep/drop */
function keptCount(count: number, mods: readonly Modifier[]): number {
  let kept = count;
  for (const m of mods) {
    if (m.op === 'keep-highest' || m.op === 'keep-lowest') kept = Math.min(kept, m.count ?? 1);
    else if (m.op === 'drop-highest' || m.op === 'drop-lowest') kept = Math.max(0, kept - (m.count ?? 1));
  }
  return kept;
}

function faceBounds(faces: FacesSpec): FormulaBounds | null {
  switch (faces.kind) {
    case 'number':
      return { min: 1, max: faces.value };
    case 'percentile':
      return { min: 1, max: 100 };
    case 'fate':
      return { min: -1, max: 1 };
    case 'coin':
      return { min: 0, max: 1 };
    case 'expr':
      return boundsOf(faces.value);
  }
}

/** aplica o efeito dos modificadores sobre os limites de `count` dados com faces [lo..hi] */
function applyModifierBounds(
  bounds: FormulaBounds,
  count: number,
  mods: readonly Modifier[]
): FormulaBounds | null {
  if (mods.some((m) => UNBOUNDED_OPS.has(m.op))) return null;
  const kept = keptCount(count, mods);
  let { min: lo, max: hi } = bounds;
  for (const m of mods) {
    if (m.op === 'min') lo = Math.max(lo, m.value ?? 0);
    else if (m.op === 'max') hi = Math.min(hi, m.value ?? 0);
  }
  for (const m of mods) {
    if (COUNT_OPS.has(m.op)) return { min: 0, max: kept };
    if (m.op === 'margin-success') {
      const target = m.target ?? 0;
      return { min: lo * kept - target, max: hi * kept - target };
    }
  }
  return { min: lo * kept, max: hi * kept };
}

/** limites [min,max] estáticos de um termo de dado (null quando ilimitado ou dinâmico) */
function dieBounds(term: Extract<RollExpr, { type: 'die' }>): FormulaBounds | null {
  const cb = boundsOf(term.count);
  if (!cb || cb.min !== cb.max || !Number.isInteger(cb.min) || cb.min < 0) return null;
  const fb = faceBounds(term.faces);
  if (!fb) return null;
  return applyModifierBounds(fb, cb.min, term.modifiers ?? []);
}

function poolBounds(pool: Extract<RollExpr, { type: 'pool' }>): FormulaBounds | null {
  const mods = pool.modifiers ?? [];
  if (mods.some((m) => UNBOUNDED_OPS.has(m.op))) return null;
  const entries = pool.entries.map(boundsOf);
  if (entries.some((b) => !b)) return null;
  const sum = (entries as FormulaBounds[]).reduce(
    (acc, b) => ({ min: acc.min + b.min, max: acc.max + b.max }),
    { min: 0, max: 0 }
  );
  if (mods.length === 0) return sum;
  // keep/drop em pool: aproximação — cada entrada vale como 1 "dado" na faixa [min..max] combinada
  const kept = keptCount(entries.length, mods);
  const lo = Math.min(...(entries as FormulaBounds[]).map((b) => b.min));
  const hi = Math.max(...(entries as FormulaBounds[]).map((b) => b.max));
  for (const m of mods) if (COUNT_OPS.has(m.op)) return { min: 0, max: kept };
  return { min: lo * kept, max: hi * kept };
}

/**
 * Limites estáticos [min,max] de uma expressão de rolagem. Retorna null quando
 * o valor não é determinável estaticamente (variáveis @, explosões, comparações).
 * Usado para derivar as faixas das linhas e para exibição ("1d20 cobre 1–20").
 */
export function boundsOf(expr: RollExpr): FormulaBounds | null {
  if (typeof expr === 'number') return { min: expr, max: expr };
  if (!expr || typeof expr !== 'object') return null;
  if ('type' in expr && expr.type === 'die') return dieBounds(expr);
  if ('type' in expr && expr.type === 'pool') return poolBounds(expr);
  if ('var' in expr) return null;

  const entry = Object.entries(expr)[0];
  if (!entry) return null;
  const [op, args] = entry as [string, readonly RollExpr[]];
  const bs = args.map(boundsOf);
  if (bs.some((b) => b === null)) return null;
  const nb = bs as FormulaBounds[];

  switch (op) {
    case '+':
      return { min: nb[0].min + nb[1].min, max: nb[0].max + nb[1].max };
    case '-':
      return nb.length === 1
        ? { min: -nb[0].max, max: -nb[0].min }
        : { min: nb[0].min - nb[1].max, max: nb[0].max - nb[1].min };
    case '*': {
      const products = [nb[0].min * nb[1].min, nb[0].min * nb[1].max, nb[0].max * nb[1].min, nb[0].max * nb[1].max];
      return { min: Math.min(...products), max: Math.max(...products) };
    }
    case '/': {
      if (nb[1].min <= 0 && nb[1].max >= 0) return null; // divisor pode ser zero
      const quotients = [nb[0].min / nb[1].min, nb[0].min / nb[1].max, nb[0].max / nb[1].min, nb[0].max / nb[1].max];
      return { min: Math.min(...quotients), max: Math.max(...quotients) };
    }
    case 'floor':
      return { min: Math.floor(nb[0].min), max: Math.floor(nb[0].max) };
    case 'ceil':
      return { min: Math.ceil(nb[0].min), max: Math.ceil(nb[0].max) };
    case 'round':
      return { min: Math.round(nb[0].min), max: Math.round(nb[0].max) };
    case 'abs':
      return nb[0].min < 0 && nb[0].max > 0
        ? { min: 0, max: Math.max(-nb[0].min, nb[0].max) }
        : { min: Math.min(Math.abs(nb[0].min), Math.abs(nb[0].max)), max: Math.max(Math.abs(nb[0].min), Math.abs(nb[0].max)) };
    case 'min':
      return { min: Math.min(...nb.map((b) => b.min)), max: Math.min(...nb.map((b) => b.max)) };
    case 'max':
      return { min: Math.max(...nb.map((b) => b.min)), max: Math.max(...nb.map((b) => b.max)) };
    default:
      // comparações, and/or/if/!, '%', clamp dinâmico… — sem limite estático útil
      return null;
  }
}

export const formulaMin = (expr: RollExpr) => boundsOf(expr)?.min ?? null;
export const formulaMax = (expr: RollExpr) => boundsOf(expr)?.max ?? null;

/**
 * Faixas de rolagem por linha, derivadas cumulativamente dos pesos sobre o
 * intervalo da fórmula (Foundry-style). Linhas com peso proporcionalmente
 * ínfimo podem ficar com faixa vazia (não roláveis via dado).
 * Retorna null na posição quando a linha tem peso 0 ou sem faixa, e todas null
 * quando a fórmula não tem limites estáticos.
 */
export function computeRanges(rows: TableRow[], formula: RollExpr): (RowRange | null)[] {
  const bounds = boundsOf(formula);
  if (!bounds) return rows.map(() => null);
  const lo = bounds.min;
  const hi = bounds.max;
  const span = hi - lo + 1;
  const totalWeight = rows.reduce((s, r) => s + Math.max(0, r.weight), 0);
  const result: (RowRange | null)[] = [];
  let cum = 0;
  for (let i = 0; i < rows.length; i++) {
    const w = Math.max(0, rows[i].weight);
    if (totalWeight <= 0 || w <= 0) {
      result.push(null);
      continue;
    }
    const start = lo + Math.floor((cum / totalWeight) * span);
    cum += w;
    const end = i === rows.length - 1 ? hi : lo + Math.floor((cum / totalWeight) * span) - 1;
    result.push(end >= start ? { min: start, max: end } : null);
  }
  return result;
}

// ---------- rolagem ----------

/** sorteio ponderado simples entre linhas com peso > 0 */
function weightedPick(rows: TableRow[]): TableRow | null {
  const eligible = rows.filter((r) => r.weight > 0);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, r) => s + r.weight, 0);
  let pick = Math.random() * total;
  for (const r of eligible) {
    pick -= r.weight;
    if (pick <= 0) return r;
  }
  return eligible[eligible.length - 1];
}

/**
 * Rola na tabela. Com fórmula válida: avalia a expressão via dice-core e
 * procura a linha cuja faixa contém o total (fallback ponderado se houver
 * lacunas, limites indeterminados ou valor booleano). Sem fórmula: sorteio
 * ponderado puro. Null quando não há linhas roláveis.
 */
export function rollOnTable(table: InteractiveTable): RollResult | null {
  const expr = parseFormula(table.formula);
  if (expr) {
    const roll = evaluateRoll(expr);
    const total = typeof roll.value === 'number' ? roll.value : null;
    if (total != null) {
      const ranges = computeRanges(table.rows, expr);
      const idx = ranges.findIndex((r) => r && total >= r.min && total <= r.max);
      if (idx >= 0) return { row: table.rows[idx], roll, range: ranges[idx] };
    }
    const row = weightedPick(table.rows);
    return row ? { row, roll, range: null } : null;
  }
  const row = weightedPick(table.rows);
  return row ? { row, roll: null, range: null } : null;
}

// ---------- rolagem encadeada ----------

export interface ChainStep {
  /** título da tabela rolada neste passo */
  title: string;
  formula: string;
  result: RollResult;
}

export interface ChainStart {
  docId?: string | null;
  title: string;
  table: InteractiveTable;
}

/**
 * Rolagem encadeada (estilo Foundry "roll on table"): rola na tabela inicial;
 * se a linha sorteada vincula um documento que resolve para outra tabela,
 * rola nela também, recursivamente. Proteção contra ciclos por docId
 * visitado + limite de profundidade.
 */
export function rollChain(
  start: ChainStart,
  resolveTable: (docId: string) => { title: string; table: InteractiveTable } | null,
  maxDepth = 5
): ChainStep[] {
  const steps: ChainStep[] = [];
  const visited = new Set<string>();
  if (start.docId) visited.add(start.docId);
  let current: ChainStart | null = start;
  while (current && steps.length < maxDepth) {
    const result = rollOnTable(current.table);
    if (!result) break;
    steps.push({ title: current.title, formula: current.table.formula, result });
    const nextId = result.row.docId;
    if (!nextId || visited.has(nextId)) break;
    visited.add(nextId);
    const next = resolveTable(nextId);
    if (!next) break;
    current = { docId: nextId, ...next };
  }
  return steps;
}

// ---------- importação de texto (colar de planilha / markdown) ----------

/**
 * Converte texto colado em linhas. Aceita TSV/CSV (primeira coluna = resultado,
 * segunda numérica opcional = peso) e tabelas markdown (| resultado | peso |).
 * Linhas vazias e separadores markdown (|---|) são ignorados.
 */
export function rowsFromText(text: string): TableRow[] {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const isSeparator = (l: string) => /^\|?[\s:|-]+\|?$/.test(l);
  /** tabela markdown tem cabeçalho + separador — pula a linha de cabeçalho */
  const hasMarkdownHeader = rawLines.some(isSeparator);
  const lines = rawLines.filter((l) => !isSeparator(l));
  const rows: TableRow[] = [];
  for (const line of hasMarkdownHeader ? lines.slice(1) : lines) {
    let cells: string[];
    if (line.includes('|')) {
      cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
    } else if (line.includes('\t')) {
      cells = line.split('\t').map((c) => c.trim());
    } else if (line.includes(';')) {
      cells = line.split(';').map((c) => c.trim());
    } else if (line.includes(',')) {
      cells = line.split(',').map((c) => c.trim());
    } else {
      cells = [line];
    }
    const rowText = cells[0] ?? '';
    if (!rowText) continue;
    const weight = cells.length > 1 ? Number(cells[1]) : NaN;
    rows.push({
      ...createEmptyRow(),
      text: rowText,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
    });
  }
  return rows;
}
