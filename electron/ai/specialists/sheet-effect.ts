// Sheet effect generation — converts a free-form description ("escudo +2 na
// CA") into a structured sheet effect payload: label + value changes over the
// sheet's known attribute paths. Result is a forced submit_result tool call
// (validated by the schema), never free text.
import type { ProviderMessage } from '../providers/base';
import type { Specialist, SpecialistContext } from './base';
import { parseFormula } from '@diegesis/formula';

export interface SheetEffectInput {
  /** free-form description, e.g. "escudo +2" */
  descricao: string;
  /** known attribute paths of the sheet (grounding) */
  atributos: string[];
}

export type SheetEffectOp = 'add' | 'set' | 'multiply';

export interface SheetEffectChange {
  path: string;
  op: SheetEffectOp;
  /** simple arithmetic expression ("2", "-1", "3*2") — dice expressions are rejected */
  value: string;
}

export interface GeneratedSheetEffect {
  label: string;
  changes: SheetEffectChange[];
}

const OPS = new Set<string>(['add', 'set', 'multiply']);

export const SHEET_EFFECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'nome curto e evocativo do efeito, em português (ex.: "Benção", "Escudo Mágico")' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'caminho do atributo afetado — use os atributos conhecidos listados' },
          op: { type: 'string', enum: ['add', 'set', 'multiply'], description: 'add soma; set define; multiply multiplica' },
          value: { type: 'string', description: 'expressão aritmética simples (ex.: "2", "-1", "3*2") — nunca dados nem texto' },
        },
        required: ['path', 'op', 'value'],
        additionalProperties: false,
      },
    },
  },
  required: ['label', 'changes'],
  additionalProperties: false,
};

const ARITH = /^[\d\s.+\-*/()]+$/;

export function parseSheetEffect(value: unknown): GeneratedSheetEffect {
  if (!value || typeof value !== 'object') throw new Error('resultado não é um objeto');
  const v = value as Record<string, unknown>;
  if (typeof v.label !== 'string' || !v.label.trim()) throw new Error('label ausente');
  if (!Array.isArray(v.changes) || v.changes.length === 0) throw new Error('changes vazias');
  const changes: SheetEffectChange[] = [];
  for (const [i, c] of v.changes.entries()) {
    if (!c || typeof c !== 'object') throw new Error(`alteração ${i + 1} inválida`);
    const row = c as Record<string, unknown>;
    if (typeof row.path !== 'string' || !row.path.trim()) throw new Error(`alteração ${i + 1} sem path`);
    const op = typeof row.op === 'string' && OPS.has(row.op) ? (row.op as SheetEffectOp) : 'add';
    let value = typeof row.value === 'number' ? String(row.value) : typeof row.value === 'string' ? row.value.trim() : '';
    value = value.replace(/^\+/, ''); // unary '+' não é suportado pelo motor
    if (!value || !ARITH.test(value) || !/\d/.test(value)) {
      throw new Error(`alteração ${i + 1} com valor inválido ("${value}") — use expressão aritmética simples`);
    }
    try {
      parseFormula(value); // rejeita sintaxe que derrubaria o defineSystemPack
    } catch {
      throw new Error(`alteração ${i + 1} com fórmula inválida ("${value}")`);
    }
    changes.push({ path: row.path.trim(), op, value });
  }
  return { label: v.label.trim(), changes: changes.slice(0, 4) };
}

export const sheetEffectSpecialist: Specialist<SheetEffectInput, GeneratedSheetEffect> = {
  id: 'sheet-effect',
  description: 'Gera uma definição de efeito de ficha de RPG (rótulo + alterações de atributos) a partir de uma descrição.',
  temperature: 0.2,
  maxTokens: 1024,
  schema: SHEET_EFFECT_SCHEMA,

  buildPrompt(input: SheetEffectInput, _ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você gera definições de efeito para fichas de RPG OSR (Diegesis).\n\n' +
          'Regras:\n' +
          '- Interprete a descrição do usuário (ex.: "escudo +2" → ca +2; "benção: +1 ataque e moral" → atq +1, moral +1).\n' +
          '- Use preferencialmente os atributos conhecidos da ficha listados pelo usuário; só invente um path novo se nada servir.\n' +
          '- op: add soma, set define, multiply multiplica.\n' +
          '- value: expressão aritmética simples ("2", "-1", "3*2") — NUNCA expressões de dados (1d6) nem texto livre.\n' +
          '- No máximo 3 alterações. label curto e evocativo, em português.',
      },
      {
        role: 'user',
        content:
          `Atributos conhecidos da ficha: ${input.atributos.join(', ') || 'ca, pv.atual, pv.max, atq, moral, save, dv, desl.quad'}\n\n` +
          `Descrição do efeito: ${input.descricao}\n\nGere a definição chamando submit_result.`,
      },
    ];
  },

  parse: parseSheetEffect,
};
