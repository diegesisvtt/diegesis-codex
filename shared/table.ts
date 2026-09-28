// Modelo da "Tabela Interativa" (mythril/table): linhas com peso, fórmula de
// dado opcional, faixas derivadas cumulativamente dos pesos (estilo Foundry)
// e rolagem simples (botão rolar). TS puro — usado pelo renderer e pelo main.

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
  kind: 'mythril-table';
  version: 1;
  /** fórmula de dado, ex: '1d20', '2d6'; '' = sorteio ponderado puro */
  formula: string;
  rows: TableRow[];
}

export interface DiceFormula {
  count: number;
  sides: number;
}

export interface RowRange {
  min: number;
  max: number;
}

export interface RollResult {
  row: TableRow;
  /** soma dos dados (null quando sorteio ponderado) */
  total: number | null;
  /** dados individuais */
  dice: number[];
  /** faixa sorteada (null quando sorteio ponderado) */
  range: RowRange | null;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createEmptyRow(): TableRow {
  return { id: generateId(), text: '', weight: 1, details: '', docId: null };
}

export function createDefaultTable(): InteractiveTable {
  return { kind: 'mythril-table', version: 1, formula: '', rows: [createEmptyRow()] };
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
    if (!raw || typeof raw !== 'object' || raw.kind !== 'mythril-table') return base;
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
      kind: 'mythril-table',
      version: 1,
      formula: isStr(raw.formula) && parseFormula(raw.formula) ? raw.formula.trim().toLowerCase() : '',
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

/** 'NdM' ('d20' vira '1d20'); null se inválida */
export function parseFormula(formula: string): DiceFormula | null {
  const m = /^\s*(\d{0,3})\s*d\s*(\d{1,4})\s*$/i.exec(formula ?? '');
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
  return { count, sides };
}

export const formulaMin = (f: DiceFormula) => f.count;
export const formulaMax = (f: DiceFormula) => f.count * f.sides;

/**
 * Faixas de rolagem por linha, derivadas cumulativamente dos pesos sobre o
 * intervalo da fórmula (Foundry-style). Linhas com peso proporcionalmente
 * ínfimo podem ficar com faixa vazia (não roláveis via dado).
 * Retorna null na posição quando a linha tem peso 0 ou sem faixa.
 */
export function computeRanges(rows: TableRow[], formula: DiceFormula): (RowRange | null)[] {
  const lo = formulaMin(formula);
  const hi = formulaMax(formula);
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

const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

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
 * Rola na tabela. Com fórmula válida: rola os dados e procura a linha cuja
 * faixa contém o total (fallback ponderado se houver lacunas). Sem fórmula:
 * sorteio ponderado puro. Null quando não há linhas roláveis.
 */
export function rollOnTable(table: InteractiveTable): RollResult | null {
  const formula = parseFormula(table.formula);
  if (formula) {
    const dice = Array.from({ length: formula.count }, () => rollDie(formula.sides));
    const total = dice.reduce((a, b) => a + b, 0);
    const ranges = computeRanges(table.rows, formula);
    const idx = ranges.findIndex((r) => r && total >= r.min && total <= r.max);
    if (idx >= 0) return { row: table.rows[idx], total, dice, range: ranges[idx] };
    const row = weightedPick(table.rows);
    return row ? { row, total, dice, range: null } : null;
  }
  const row = weightedPick(table.rows);
  return row ? { row, total: null, dice: [], range: null } : null;
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
