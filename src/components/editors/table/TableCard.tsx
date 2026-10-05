// Shared compact interactive-table card: delegates rendering to the tactical
// InteractiveRollTable primitive. Used by the whiteboard table shape; the note
// block renders its own variant (it also inserts results into the note).
import { useMemo, useState } from 'react';
import type { DocNode } from '@shared/types';
import { computeRanges, parseFormula, parseTable, rollChain, type ChainStep } from '@shared/table';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';
import { dice3dBridge, type RollPayload } from '../../dice3d/bridge';
import { InteractiveRollTable } from '../../codex/InteractiveRollTable';

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
    const payload: RollPayload = {
      tableTitle: tableDoc.title || 'Tabela',
      steps: rolled.map((s) => ({
        title: s.title,
        formula: s.formula,
        roll: s.result.roll,
        text: s.result.row.text,
      })),
    };
    dice3dBridge.presentRoll(payload, () => {
      setSteps(rolled);
      manager.events.emit('roller:rolled', payload);
    });
  };

  if (!table) return null;
  const rollable = table.rows.some((r) => r.weight > 0);

  return (
    <InteractiveRollTable
      title={tableDoc.title || 'Sem título'}
      formula={table.formula || undefined}
      rows={table.rows}
      ranges={ranges ?? undefined}
      rollable={rollable}
      steps={steps}
      onRoll={roll}
      onOpen={() => openDocument(tableDoc.id)}
      onUnlink={
        onUnlink
          ? () => {
              setSteps(null);
              onUnlink();
            }
          : undefined
      }
    />
  );
}
