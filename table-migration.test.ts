// Teste de comportamento da migração shared/table.ts → roll-tables/dice-core.
// Roda com `bun test table-migration.test.ts` a partir da raiz do Diegesis Codex.
import { describe, expect, test } from 'bun:test';
import {
  boundsOf,
  computeRanges,
  createEmptyRow,
  parseFormula,
  rollChain,
  rollOnTable,
  type InteractiveTable,
} from './shared/table';

function makeTable(rows: Partial<ReturnType<typeof createEmptyRow>>[], formula = ''): InteractiveTable {
  return { kind: 'diegesis-table', version: 1, formula, rows: rows.map((r) => ({ ...createEmptyRow(), ...r })) };
}

describe('rollOnTable (engine roll-tables)', () => {
  test('fórmula 1d20: total sempre dentro da faixa da linha retornada', () => {
    const t = makeTable(
      [{ text: 'a', weight: 1 }, { text: 'b', weight: 1 }, { text: 'c', weight: 2 }],
      '1d20'
    );
    for (let i = 0; i < 2000; i++) {
      const r = rollOnTable(t)!;
      expect(r).not.toBeNull();
      const total = Number(r.roll!.value);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(20);
      if (r.range) {
        expect(total).toBeGreaterThanOrEqual(r.range.min);
        expect(total).toBeLessThanOrEqual(r.range.max);
      }
    }
  });

  test('faixas derivadas cobrem o intervalo da fórmula sem sobreposição', () => {
    const rows = [{ ...createEmptyRow(), weight: 1 }, { ...createEmptyRow(), weight: 1 }, { ...createEmptyRow(), weight: 2 }];
    const ranges = computeRanges(rows, parseFormula('1d20')!);
    expect(ranges[0]).toEqual({ min: 1, max: 5 });
    expect(ranges[1]).toEqual({ min: 6, max: 10 });
    expect(ranges[2]).toEqual({ min: 11, max: 20 });
  });

  test('sem fórmula: ponderado, nunca escolhe peso 0', () => {
    const t = makeTable([{ text: 'zero', weight: 0 }, { text: 'sim', weight: 1 }]);
    for (let i = 0; i < 200; i++) {
      expect(rollOnTable(t)!.row.text).toBe('sim');
    }
  });

  test('todos os pesos 0 → null', () => {
    const t = makeTable([{ text: 'x', weight: 0 }]);
    expect(rollOnTable(t)).toBeNull();
  });

  test('linha peso 0 com fórmula: nunca sorteada por faixa; fallback ponderado só pesa >0', () => {
    const t = makeTable([{ text: 'zero', weight: 0 }, { text: 'ok', weight: 1 }], '1d6');
    for (let i = 0; i < 500; i++) {
      expect(rollOnTable(t)!.row.text).toBe('ok');
    }
  });

  test('boundsOf delega ao exprBounds', () => {
    expect(boundsOf(parseFormula('4d6kh3')!)).toEqual({ min: 3, max: 18 });
    expect(boundsOf(parseFormula('1d6!')!)).toBeNull();
  });
});

describe('rollChain', () => {
  const tableB = makeTable([{ text: 'detalhe B', weight: 1 }], '1d6');
  const tableA = makeTable([{ text: 'vai p/ B', weight: 1, docId: 'docB' }], '1d20');
  const resolver = (docId: string) =>
    docId === 'docB' ? { title: 'Tabela B', table: tableB } : docId === 'docA' ? { title: 'Tabela A', table: tableA } : null;

  test('encadeia tabela vinculada', () => {
    const steps = rollChain({ docId: 'docA', title: 'Tabela A', table: tableA }, resolver);
    expect(steps.length).toBe(2);
    expect(steps[0].title).toBe('Tabela A');
    expect(steps[1].title).toBe('Tabela B');
    expect(steps[1].result.row.text).toBe('detalhe B');
  });

  test('ciclo A→A termina (proteção por visitado)', () => {
    const cyc = makeTable([{ text: 'loop', weight: 1, docId: 'docA' }], '1d4');
    const steps = rollChain({ docId: 'docA', title: 'Tabela A', table: cyc }, resolver);
    expect(steps.length).toBe(1);
  });
});
