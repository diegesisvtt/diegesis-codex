// Custom BlockNote block: embeds a reference to an Interactive Table document
// (diegesis/table) inside a note. Compact read-only preview + roll button; the
// roll result can be inserted into the note as a paragraph. Editing the table
// itself happens in the table's own document (live-reflected here via store).
import { useMemo, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { ArrowUpRight, CornerDownLeft, Dices, Plus, Table, X } from 'lucide-react';
import {
  computeRanges,
  parseFormula,
  parseTable,
  rollChain,
  serializeTable,
  createDefaultTable,
  type ChainStep,
} from '@shared/table';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';

const MAX_PREVIEW_ROWS = 8;

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
        setSteps(rolled);
        manager.events.emit('roller:rolled', {
          tableTitle: tableDoc.title || 'Tabela',
          steps: rolled.map((s) => ({
            title: s.title,
            formula: s.formula,
            total: s.result.total,
            dice: s.result.dice,
            text: s.result.row.text,
          })),
        });
      };

      const insertResult = () => {
        if (!steps || steps.length === 0) return;
        const lines = steps.map(
          (s) => `${s.title}${s.result.total != null ? ` (${s.result.total})` : ''}: ${s.result.row.text}`
        );
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
      const visibleRows = table.rows.slice(0, MAX_PREVIEW_ROWS);
      const hidden = table.rows.length - visibleRows.length;

      return (
        <div className="w-full my-1">
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
                <span className="text-[11px] font-mono text-ink-3 bg-overlay rounded px-1.5 py-0.5">
                  {table.formula}
                </span>
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
                <button
                  type="button"
                  onClick={() => {
                    setSteps(null);
                    editor.updateBlock(block, { props: { ...currentProps(), tableId: '' } });
                  }}
                  title="Desvincular tabela"
                  className="p-1 rounded text-ink-3 hover:text-danger"
                >
                  <X size={13} />
                </button>
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
              <div className="flex items-start gap-2 px-3 py-2 border-t border-line bg-table/10">
                <Dices size={13} className="text-table shrink-0 mt-1" />
                <div className="min-w-0 flex-1">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-baseline gap-1.5 py-0.5 text-[12.5px]">
                      {i > 0 && <span className="text-ink-3 select-none">→</span>}
                      {step.result.total != null && (
                        <span className="text-[13px] font-bold font-mono text-ink-1">{step.result.total}</span>
                      )}
                      {steps.length > 1 && <span className="text-[10.5px] text-ink-3">[{step.title}]</span>}
                      <span className="text-ink-1 truncate">
                        {step.result.row.text || <em className="text-ink-3">(sem texto)</em>}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={insertResult}
                  title="Inserir resultado na nota"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-accent-ink hover:bg-accent-soft shrink-0 mt-0.5"
                >
                  <CornerDownLeft size={11} /> Inserir
                </button>
              </div>
            )}
          </div>
        </div>
      );
    },
  }
);
