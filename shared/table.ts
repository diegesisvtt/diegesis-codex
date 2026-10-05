// Modelo da "Tabela Interativa" (diegesis/table): linhas com peso, fórmula de
// dado opcional, faixas derivadas cumulativamente dos pesos
// e rolagem simples (botão rolar). TS puro — usado pelo renderer e pelo main.
// A rolagem e a notação são delegadas ao diegesis-sdk (dice-core/dice-notation).

import {
  evaluateRoll,
  exprBounds,
  type RollExpr,
  type RollResult as DiceRoll,
} from '@diegesis/dice-core';
import { fromFormula } from '@diegesis/dice-notation';
import { newId } from '@diegesis/core';
import { createTable, type RandomTable } from '@diegesis/roll-tables';

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
  return newId();
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

/**
 * Limites estáticos [min,max] de uma expressão de rolagem. Retorna null quando
 * o valor não é determinável estaticamente (variáveis @, explosões, comparações).
 * Delegado ao dice-core (`exprBounds`); usado para derivar as faixas das linhas
 * e para exibição ("1d20 cobre 1–20").
 */
export const boundsOf = exprBounds;

export const formulaMin = (expr: RollExpr) => boundsOf(expr)?.min ?? null;
export const formulaMax = (expr: RollExpr) => boundsOf(expr)?.max ?? null;

/**
 * Faixas de rolagem por linha, derivadas cumulativamente dos pesos sobre o
 * intervalo da fórmula. Linhas com peso proporcionalmente
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

/**
 * Monta os motores de rolagem (roll-tables) para a tabela, no uso pretendido
 * da lib — sem dados sintéticos:
 * - `ranged`: apenas linhas roláveis (peso > 0), cada uma com sua faixa real
 *   derivada dos pesos sobre o intervalo da fórmula. Como computeRanges cobre
 *   [min..max] contiguamente, todo total possível cai numa faixa — o lookup
 *   nunca erra e nunca precisa de faixas artificiais.
 * - `weighted`: as mesmas linhas roláveis com peso puro, sem faixa (a lib dá
 *   peso pela largura da faixa quando ela existe — por isso as duas visões).
 */
function buildEngineTables(table: InteractiveTable): {
  ranged: RandomTable;
  weighted: RandomTable;
  ranges: (RowRange | null)[];
} {
  const expr = parseFormula(table.formula);
  const allRanges = expr ? computeRanges(table.rows, expr) : table.rows.map(() => null);
  const rollable = table.rows
    .map((row, i) => ({ row, range: allRanges[i] }))
    .filter((e) => e.row.weight > 0);
  const ranged = createTable({
    name: 'table',
    formula: '1', // count fixo: 1 sorteio — a fórmula do doc escolhe a FAIXA, não a quantidade
    entries: rollable
      .filter((e): e is { row: TableRow; range: RowRange } => e.range !== null)
      .map((e) => ({
        id: e.row.id,
        type: 'text' as const,
        weight: e.row.weight,
        text: e.row.text,
        range: [e.range.min, e.range.max] as [number, number],
      })),
  });
  const weighted = createTable({
    name: 'table',
    formula: '1',
    entries: rollable.map((e) => ({
      id: e.row.id,
      type: 'text' as const,
      weight: e.row.weight,
      text: e.row.text,
    })),
  });
  return { ranged, weighted, ranges: allRanges };
}

// cache por referência das linhas: editar a tabela gera um novo array
// (parseTable), invalidando naturalmente; evita reconstruir dois RandomTable
// por rolagem (schema valibot + parse de fórmula + Maps)
const engineCache = new WeakMap<
  readonly TableRow[],
  { formula: string; engines: ReturnType<typeof buildEngineTables> }
>();

function getEngineTables(table: InteractiveTable): ReturnType<typeof buildEngineTables> {
  const cached = engineCache.get(table.rows);
  if (cached && cached.formula === table.formula) return cached.engines;
  const engines = buildEngineTables(table);
  engineCache.set(table.rows, { formula: table.formula, engines });
  return engines;
}

/** lookup só falha quando o total sai do domínio das faixas (fórmulas com min < 1) */
function safeLookup(rt: RandomTable, value: number) {
  try {
    return rt.lookup(value);
  } catch {
    return undefined;
  }
}

/** sorteio ponderado via motor (fallback e tabelas sem fórmula); null quando não há linhas roláveis */
function weightedDraw(rt: RandomTable): string | null {
  try {
    return rt.draw({ count: 1 }).draws[0]?.entryId ?? null;
  } catch {
    return null; // tabela vazia / pesos zerados
  }
}

/**
 * Rola na tabela. Com fórmula válida: avalia a expressão via dice-core e
 * procura a linha cuja faixa contém o total (fallback ponderado se houver
 * lacunas, limites indeterminados ou valor booleano). Totais fora do domínio
 * das faixas (fórmulas com min < 1, ex. dados fate) caem no caminho ponderado
 * — ambos estatisticamente proporcionais aos pesos. Sem fórmula: sorteio
 * ponderado puro. Null quando não há linhas roláveis.
 */
export function rollOnTable(table: InteractiveTable): RollResult | null {
  const { ranged, weighted, ranges } = getEngineTables(table);
  const byId = new Map(table.rows.map((r) => [r.id, r]));
  const expr = parseFormula(table.formula);
  if (expr) {
    const roll = evaluateRoll(expr);
    const total = typeof roll.value === 'number' ? roll.value : null;
    if (total != null) {
      const entry = safeLookup(ranged, total);
      const row = entry && byId.get(entry.id);
      const range = ranges.find((r) => r && total >= r.min && total <= r.max) ?? null;
      if (row && range) return { row, roll, range };
    }
    const id = weightedDraw(weighted);
    const row = id ? byId.get(id) : null;
    return row ? { row, roll, range: null } : null;
  }
  const id = weightedDraw(weighted);
  const row = id ? byId.get(id) : null;
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
 * Rolagem encadeada (roll on table): rola na tabela inicial;
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
