// Custom BlockNote block: embeds a reference to an Interactive Table document
// (diegesis/table) inside a note. Compact read-only preview + roll button; the
// roll result can be inserted into the note as a paragraph. Editing the table
// itself happens in the table's own document (live-reflected here via store).
import { useMemo, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { Plus, Table, X } from 'lucide-react';
import {
  computeRanges,
  parseFormula,
  parseTable,
  rollChain,
  rollTotal,
  serializeTable,
  createDefaultTable,
  type ChainStep,
} from '@shared/table';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';
import { dice3dBridge, type RollPayload } from '../../dice3d/bridge';
import { InteractiveRollTable } from '../../codex/InteractiveRollTable';

export const InteractiveTableBlock = createReactBlockSpec(
  {
    type: 'interactiveTable',
    propSchema: {
      tableId: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const { docs, openDocument, createDocument } = useStore();
      const manager = usePluginManager();
      const [query, setQuery] = useState('');
      const [steps, setSteps] = useState<ChainStep[] | null>(null);
      const [picking, setPicking] = useState(false);

      /** fresh props at call time — block.props can be stale in async handlers */
      const currentProps = () => ({ ...(editor.getBlock(block.id)?.props ?? block.props) });

      const tableDoc = docs.find((d) => d.id === block.props.tableId);
      const table = useMemo(
        () => (tableDoc ? parseTable(tableDoc.content) : null),
        [tableDoc]
      );
      const formula = table ? parseFormula(table.formula) : null;
      const ranges = useMemo(
        () => (table && formula ? computeRanges(table.rows, formula) : null),
        [table, formula]
      );

      const candidates = useMemo(() => {
        const q = query.trim().toLowerCase();
        return docs
          .filter((d) => d.type === 'diegesis/table')
          .filter((d) => !q || d.title.toLowerCase().includes(q))
          .slice(0, 10);
      }, [docs, query]);

      const pick = (id: string) => {
        setSteps(null);
        setPicking(false);
        editor.updateBlock(block, { props: { ...currentProps(), tableId: id } });
      };

      const createAndPick = async () => {
        const doc = await createDocument('diegesis/table', null, 'Nova Tabela', serializeTable(createDefaultTable()));
        pick(doc.id);
        openDocument(doc.id);
      };

      /** resolve um docId vinculado para outra tabela (rolagem encadeada) */
      const resolveTable = (docId: string) => {
        const d = docs.find((x) => x.id === docId);
        return d && d.type === 'diegesis/table'
          ? { title: d.title || 'Sem título', table: parseTable(d.content) }
          : null;
      };

      const roll = () => {
        if (!table || !tableDoc) return;
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

      const insertResult = () => {
        if (!steps || steps.length === 0) return;
        const lines = steps.map((s) => {
          const total = rollTotal(s.result);
          return `${s.title}${total != null ? ` (${total})` : ''}: ${s.result.row.text}`;
        });
        editor.insertBlocks(
          lines.map((content) => ({ type: 'paragraph', content })) as never,
          block,
          'after'
        );
      };

      /* ---------- sem tabela vinculada: picker ---------- */
      if (!tableDoc || !table) {
        return (
          <div className="w-full my-1">
            <div className="rounded-lg border border-dashed border-line-strong px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Table size={15} strokeWidth={1.75} className="text-table shrink-0" />
                {block.props.tableId && !tableDoc ? (
                  <span className="text-[12.5px] text-danger">Tabela vinculada não existe mais.</span>
                ) : (
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPicking(true);
                    }}
                    onFocus={() => setPicking(true)}
                    placeholder="Vincular uma tabela interativa…"
                    className="flex-1 bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
                  />
                )}
                {block.props.tableId && (
                  <button
                    type="button"
                    onClick={() => editor.updateBlock(block, { props: { ...currentProps(), tableId: '' } })}
                    title="Limpar vínculo"
                    className="p-1 rounded text-ink-3 hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {picking && (
                <div className="mt-2 border-t border-line pt-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                  {candidates.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => pick(d.id)}
                      className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 rounded truncate"
                    >
                      <Table size={12} className="text-table shrink-0" />
                      {d.title || 'Sem título'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void createAndPick()}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-[12.5px] text-accent-ink hover:bg-accent-soft rounded"
                  >
                    <Plus size={12} /> Criar nova tabela…
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      }

      /* ---------- tabela vinculada: card compacto ---------- */
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
          onInsert={insertResult}
          onUnlink={() => {
            setSteps(null);
            editor.updateBlock(block, { props: { ...currentProps(), tableId: '' } });
          }}
        />
      );
    },
  }
);
