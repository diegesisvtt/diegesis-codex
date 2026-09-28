// Table extraction — converts raw text captured from a PDF region (reading
// order, columns possibly jumbled) into a structured interactive table
// (diegesis/table): inferred dice formula + rows with weights.

import { parseFormula } from '../../../shared/table';
import type { ProviderMessage } from '../providers/base';
import type { Specialist, SpecialistContext } from './base';

export interface TableExtractInput {
  /** raw text lines from the captured PDF region */
  texto: string;
}

export interface ExtractedTable {
  titulo: string;
  /** inferred dice formula, e.g. '1d20', '2d6'; '' when none applies */
  formula: string;
  linhas: { texto: string; peso: number }[];
}

export const TABLE_EXTRACT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'título curto da tabela (inferido do contexto ou genérico)' },
    formula: {
      type: 'string',
      description: "fórmula de dado inferida das faixas numéricas (ex: '1d20', '2d6', '1d100'); '' se não houver",
    },
    linhas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'o resultado da linha, sem o número/faixa' },
          peso: { type: 'number', description: 'tamanho da faixa dessa linha (ex: faixa 1-5 → peso 5); 1 se uniforme' },
        },
        required: ['texto', 'peso'],
        additionalProperties: false,
      },
    },
  },
  required: ['titulo', 'formula', 'linhas'],
  additionalProperties: false,
};

export function parseExtractedTable(value: unknown): ExtractedTable {
  if (!value || typeof value !== 'object') throw new Error('resultado não é um objeto');
  const v = value as Record<string, unknown>;
  if (typeof v.titulo !== 'string' || !v.titulo.trim()) throw new Error('titulo ausente');
  if (typeof v.formula !== 'string') throw new Error('formula ausente');
  if (!Array.isArray(v.linhas) || v.linhas.length === 0) throw new Error('linhas vazias');
  const linhas = v.linhas.map((l, i) => {
    if (!l || typeof l !== 'object') throw new Error(`linha ${i + 1} inválida`);
    const row = l as Record<string, unknown>;
    if (typeof row.texto !== 'string' || !row.texto.trim()) throw new Error(`linha ${i + 1} sem texto`);
    const peso = typeof row.peso === 'number' && Number.isFinite(row.peso) && row.peso > 0 ? row.peso : 1;
    return { texto: row.texto.trim(), peso };
  });
  const normalized = v.formula.trim().replace(/\s+/g, '');
  const formula = parseFormula(normalized) ? normalized : '';
  return { titulo: v.titulo.trim(), formula, linhas };
}

export const tableExtractSpecialist: Specialist<TableExtractInput, ExtractedTable> = {
  id: 'table-extract',
  description: 'Extrai uma tabela rolável (roll table) de um trecho de texto capturado de um PDF.',
  temperature: 0.2,
  maxTokens: 2048,
  schema: TABLE_EXTRACT_SCHEMA,

  buildPrompt(input: TableExtractInput, _ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você extrai tabelas roláveis (roll tables) de livros de RPG a partir de texto bruto capturado de uma região de PDF.\n\n' +
          'Regras:\n' +
          '- O texto vem em ordem de leitura aproximada e pode ter colunas misturadas, quebras de linha no meio ' +
          'de uma entrada e números de faixa separados do texto. Reconstrua as entradas.\n' +
          '- Entradas numeradas por faixa (ex: "1-5", "6–9", "10") definem o PESO: peso = tamanho da faixa ' +
          '(1-5 → 5; 10 → 1). Sem faixas visíveis, peso 1 para todas.\n' +
          '- Infera a FÓRMULA do maior valor de faixa e da progressão (faixas até 20 → 1d20; até 6 → 1d6; ' +
          'até 100 → 1d100; 2d6 quando as faixas vão de 2 a 12). Sem números, formula vazia.\n' +
          '- NÃO invente entradas: use apenas o que está no texto. Preserve o idioma original das entradas.\n' +
          '- Remova os números/faixas do texto das entradas.\n' +
          '- Se o trecho não contiver uma tabela, produza a melhor lista de itens possível a partir do texto.\n' +
          '- titulo: use o título da tabela se estiver no trecho; senão, um título curto e descritivo.',
      },
      {
        role: 'user',
        content: `Texto capturado da região do PDF:\n\n${input.texto}\n\nExtraia a tabela chamando submit_result.`,
      },
    ];
  },

  parse: parseExtractedTable,
};
