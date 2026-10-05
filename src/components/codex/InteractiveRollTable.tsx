// CAMADA 3 — InteractiveRollTable. Tabela inline tática (encontros, tesouros,
// reações): cabeçalho com fórmula + botão de rolagem, preview de linhas com
// faixas, barras de peso e destaque da linha sorteada. Puro — a rolagem em si
// é do host.

import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, CornerDownLeft, Dices, Table, X } from 'lucide-react';
import { rollTotal, type ChainStep, type TableRow } from '@shared/table';
import { TacticalCard } from '../ui/TacticalCard';
import { Badge } from '../ui/Badge';

const MAX_PREVIEW_ROWS = 8;

export interface InteractiveRollTableProps {
  title: string;
  formula?: string;
  rows: TableRow[];
  ranges?: ({ min: number; max: number } | null)[];
  rollable: boolean;
  steps: ChainStep[] | null;
  onRoll: () => void;
  onOpen?: () => void;
  onInsert?: () => void;
  onUnlink?: () => void;
  maxPreviewRows?: number;
}

export function InteractiveRollTable({
  title,
  formula,
  rows,
  ranges,
  rollable,
  steps,
  onRoll,
  onOpen,
  onInsert,
  onUnlink,
  maxPreviewRows = MAX_PREVIEW_ROWS,
}: InteractiveRollTableProps) {
  const [inserted, setInserted] = useState(false);
  const visibleRows = rows.slice(0, maxPreviewRows);
  const hidden = rows.length - visibleRows.length;

  const finalRowId = steps && steps.length > 0 ? steps[steps.length - 1].result.row.id : null;
  const maxWeight = useMemo(() => Math.max(1, ...rows.map((r) => r.weight)), [rows]);
  const rollableCount = rows.filter((r) => r.weight > 0).length;

  const handleInsert = () => {
    onInsert?.();
    setInserted(true);
    setTimeout(() => setInserted(false), 1200);
  };

  return (
    <TacticalCard className="my-1 w-full">
      <TacticalCard.Header className="relative flex items-center gap-2">
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-400/60 via-violet/40 to-transparent" />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Table size={14} className="text-table shrink-0" />
          <button
            type="button"
            onClick={onOpen}
            title="Abrir tabela"
            className="flex items-center gap-1 min-w-0 text-[13px] font-medium text-ink-1 hover:text-accent-ink"
          >
            <span className="truncate">{title}</span>
            {onOpen && <ArrowUpRight size={12} className="shrink-0 text-ink-3" />}
          </button>
          {formula && (
            <Badge variant="tactical" className="shrink-0">
              {formula}
            </Badge>
          )}
          {rollableCount > 0 && (
            <Badge variant="neutral" className="shrink-0">
              {rollableCount} itens
            </Badge>
          )}
        </div>
        <TacticalCard.Actions className="shrink-0">
          <button
            type="button"
            onClick={onRoll}
            disabled={!rollable}
            title="Rolar na tabela"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold text-cyan-300 bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 hover:text-neon hover:shadow-glow-cyan active:scale-90 transition-all duration-100 disabled:opacity-40 disabled:hover:bg-cyan-500/15 disabled:hover:text-cyan-300 disabled:hover:shadow-none disabled:active:scale-100"
          >
            <Dices size={12} /> Rolar
          </button>
          {onUnlink && (
            <button type="button" onClick={onUnlink} title="Desvincular tabela" className="p-1 rounded text-ink-3 hover:text-danger">
              <X size={13} />
            </button>
          )}
        </TacticalCard.Actions>
      </TacticalCard.Header>

      <TacticalCard.Body className="py-1">
        {visibleRows.length === 0 && <div className="py-2 text-[12px] text-ink-3">Tabela vazia — abra para adicionar linhas.</div>}
        {visibleRows.map((row, i) => {
          const isFinal = row.id === finalRowId;
          const pct = row.weight > 0 ? Math.max(6, (row.weight / maxWeight) * 100) : 0;
          return (
            <div
              key={row.id}
              className={`flex items-center gap-2 px-1.5 py-[3px] rounded border-l-2 transition-colors duration-150 ${
                isFinal
                  ? 'border-l-cyan-400 bg-cyan-500/15'
                  : 'border-l-transparent hover:bg-cyan-500/5'
              }`}
            >
              <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-3 select-none">
                {ranges?.[i] ? `${ranges[i]!.min}–${ranges[i]!.max}` : '—'}
              </span>
              <span className={`flex-1 truncate ${row.weight > 0 ? 'text-ink-2' : 'text-ink-3'}`}>
                {row.text || <em className="text-ink-3">(sem texto)</em>}
              </span>
              <span
                title={`Peso ${row.weight}`}
                className="relative w-12 h-1 shrink-0 rounded-full bg-white/5 overflow-hidden"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-cyan-400/50"
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
          );
        })}
        {hidden > 0 && <div className="py-0.5 px-1.5 text-[11px] text-ink-3">… +{hidden} linha(s)</div>}
      </TacticalCard.Body>

      {steps && steps.length > 0 && (
        <div className="animate-fade-up flex items-start gap-2 px-3 py-2 border-t border-white/5 bg-cyan-500/5">
          <Dices size={13} className="text-cyan-400 shrink-0 mt-1" />
          <div className="min-w-0 flex-1">
            {steps.map((step, i) => {
              const total = rollTotal(step.result);
              return (
                <div key={i} className="flex items-baseline gap-1.5 py-0.5 text-[12.5px]">
                  {i > 0 && <span className="text-ink-3 select-none">→</span>}
                  {total != null && (
                    <span className="text-[13px] font-bold font-mono text-ink-1 text-glow-cyan">{total}</span>
                  )}
                  {steps.length > 1 && <span className="text-[10.5px] text-ink-3">[{step.title}]</span>}
                  <span className="text-ink-1 truncate">{step.result.row.text || <em className="text-ink-3">(sem texto)</em>}</span>
                </div>
              );
            })}
          </div>
          {onInsert && (
            <button
              type="button"
              onClick={handleInsert}
              title="Inserir resultado na nota"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold transition-all duration-100 shrink-0 mt-0.5 active:scale-90 ${
                inserted ? 'text-success bg-success-soft' : 'text-cyan-300 hover:bg-cyan-500/15 hover:text-neon'
              }`}
            >
              {inserted ? <Check size={11} /> : <CornerDownLeft size={11} />} {inserted ? 'Inserido' : 'Inserir'}
            </button>
          )}
        </div>
      )}
    </TacticalCard>
  );
}
