// Shared compact interactive-table card: title + formula header, rows preview
// with computed ranges, chained roll button and result steps. Used by the
// whiteboard table shape; the note block renders its own variant (it also
// inserts results into the note).
import { useMemo, useState } from 'react';
import { ArrowUpRight, Dices, Table, X } from 'lucide-react';
import type { DocNode } from '@shared/types';
import { computeRanges, parseFormula, parseTable, rollChain, rollTotal, type ChainStep } from '@shared/table';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';

const MAX_PREVIEW_ROWS = 8;

export function TableCard({ tableDoc, onUnlink }: { tableDoc: DocNode; onUnlink?: () => void }) {
  const { docs, openDocument } = useStore();
  const manager = usePluginManager();
  const [steps, setSteps] = useState<ChainStep[] | null>(null);

  const table = useMemo(() => parseTable(tableDoc.content), [tableDoc]);
  const formula = table ? parseFormula(table.formula) : null;
  const ranges = useMemo(
    () => (table && formula ? computeRanges(table.rows, formula) : null),
    [table, formula]
  );

  /** resolve um docId vinculado para outra tabela (rolagem encadeada) */
  const resolveTable = (docId: string) => {
    const d = docs.find((x) => x.id === docId);
    return d && d.type === 'diegesis/table'
      ? { title: d.title || 'Sem título', table: parseTable(d.content) }
      : null;
  };

  const roll = () => {
    if (!table) return;
    const rolled = rollChain({ docId: tableDoc.id, title: tableDoc.title || 'Tabela', table }, resolveTable);
    if (rolled.length === 0) return;
    setSteps(rolled);
    manager.events.emit('roller:rolled', {
      tableTitle: tableDoc.title || 'Tabela',
      steps: rolled.map((s) => ({
        title: s.title,
        formula: s.formula,
        roll: s.result.roll,
        text: s.result.row.text,
      })),
    });
  };

  if (!table) return null;
  const rollable = table.rows.some((r) => r.weight > 0);
  const visibleRows = table.rows.slice(0, MAX_PREVIEW_ROWS);
  const hidden = table.rows.length - visibleRows.length;

  return (
    <div className="rounded-lg bg-elevated/95 border border-line shadow-xl overflow-hidden">
      {/* cabeçalho do card */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <Table size={14} className="text-table shrink-0" />
        <button
          type="button"
          onClick={() => openDocument(tableDoc.id)}
          title="Abrir tabela"
          className="flex items-center gap-1 text-[13px] font-medium text-ink-1 hover:text-accent-ink truncate"
        >
          {tableDoc.title || 'Sem título'}
          <ArrowUpRight size={12} className="shrink-0 text-ink-3" />
        </button>
        {table.formula && (
          <span className="text-[11px] font-mono text-ink-3 bg-overlay rounded px-1.5 py-0.5">{table.formula}</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={roll}
            disabled={!rollable}
            title="Rolar na tabela"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11.5px] text-ink-2 hover:bg-hover hover:text-ink-1 disabled:opacity-40 transition-colors"
          >
            <Dices size={12} /> Rolar
          </button>
          {onUnlink && (
            <button
              type="button"
              onClick={() => {
                setSteps(null);
                onUnlink();
              }}
              title="Desvincular tabela"
              className="p-1 rounded text-ink-3 hover:text-danger"
            >
              <X size={13} />
            </button>
          )}
        </span>
      </div>

      {/* preview das linhas */}
      <div className="px-3 py-1.5">
        {visibleRows.length === 0 && (
          <div className="py-2 text-[12px] text-ink-3">Tabela vazia — abra para adicionar linhas.</div>
        )}
        {visibleRows.map((row, i) => (
          <div key={row.id} className="flex items-baseline gap-2 py-0.5 text-[12.5px]">
            <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-3 select-none">
              {ranges?.[i] ? `${ranges[i]!.min}–${ranges[i]!.max}` : '—'}
            </span>
            <span className="text-ink-2 truncate">{row.text || <em className="text-ink-3">(sem texto)</em>}</span>
          </div>
        ))}
        {hidden > 0 && <div className="py-0.5 text-[11px] text-ink-3">… +{hidden} linha(s)</div>}
      </div>

      {/* resultado da rolagem (encadeada) */}
      {steps && steps.length > 0 && (
        <div className="px-3 py-2 border-t border-line bg-table/10">
          {steps.map((step, i) => {
            const total = rollTotal(step.result);
            return (
            <div key={i} className="flex items-baseline gap-1.5 py-0.5 text-[12.5px]">
              {i > 0 && <span className="text-ink-3 select-none">→</span>}
              <Dices size={12} className="text-table shrink-0 self-center" />
              {total != null && (
                <span className="text-[13px] font-bold font-mono text-ink-1">{total}</span>
              )}
              {steps.length > 1 && <span className="text-[10.5px] text-ink-3">[{step.title}]</span>}
              <span className="text-ink-1 truncate">
                {step.result.row.text || <em className="text-ink-3">(sem texto)</em>}
              </span>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
