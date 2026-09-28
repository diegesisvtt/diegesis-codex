import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Dices,
  GripVertical,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { DocNode } from '@shared/types';
import {
  computeRanges,
  createEmptyRow,
  formulaMax,
  formulaMin,
  parseFormula,
  parseTable,
  rollChain,
  rowsFromText,
  serializeTable,
  type ChainStep,
  type InteractiveTable,
  type TableRow,
} from '@shared/table';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';
import { DocLinkPicker } from './DocLinkPicker';

/**
 * Editor de Tabela Interativa (mythril/table) — linhas com peso, fórmula de
 * dado opcional (faixas derivadas dos pesos, estilo Foundry), edição fluida
 * (Enter nova linha, colar de planilha/markdown, drag-and-drop p/ reordenar)
 * e rolagem encadeada (resultado que vincula outra tabela rola nela também).
 */
export function TableEditor({ doc }: { doc: DocNode }) {
  const { docs, updateDocument, openDocument } = useStore();
  const manager = usePluginManager();
  const [data, setDataState] = useState<InteractiveTable>(() => parseTable(doc.content));
  const dataRef = useRef(data);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const [steps, setSteps] = useState<ChainStep[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** inputs de resultado por linha, p/ foco após Enter */
  const textInputs = useRef(new Map<string, HTMLInputElement>());
  /** drag-and-drop de reordenação */
  const dragId = useRef<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);

  const commit = (next: InteractiveTable) => {
    dirty.current = true;
    dataRef.current = next;
    setDataState(next);
  };

  // autosave com debounce + flush ao desmontar (mesmo padrão da timeline)
  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dirty.current = false;
      updateDocument(doc.id, { content: serializeTable(dataRef.current) });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, doc.id, updateDocument]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) {
        dirty.current = false;
        updateDocument(doc.id, { content: serializeTable(dataRef.current) });
      }
    };
  }, [doc.id, updateDocument]);

  // ---------- mutações ----------

  const updateRow = (id: string, patch: Partial<TableRow>) => {
    commit({ ...dataRef.current, rows: dataRef.current.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  };

  const addRow = (afterId?: string) => {
    const row = createEmptyRow();
    const rows = [...dataRef.current.rows];
    const idx = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
    if (idx >= 0) rows.splice(idx + 1, 0, row);
    else rows.push(row);
    commit({ ...dataRef.current, rows });
    // foco no novo input após o render
    setTimeout(() => textInputs.current.get(row.id)?.focus(), 0);
  };

  const removeRow = (id: string) => {
    commit({ ...dataRef.current, rows: dataRef.current.rows.filter((r) => r.id !== id) });
    if (expandedId === id) setExpandedId(null);
    if (steps?.some((s) => s.result.row.id === id)) setSteps(null);
  };

  const moveRowBefore = (id: string, beforeId: string | null) => {
    if (id === beforeId) return;
    const rows = [...dataRef.current.rows];
    const from = rows.findIndex((r) => r.id === id);
    if (from < 0) return;
    const [row] = rows.splice(from, 1);
    const to = beforeId ? rows.findIndex((r) => r.id === beforeId) : -1;
    rows.splice(to < 0 ? rows.length : to, 0, row);
    commit({ ...dataRef.current, rows });
  };

  // ---------- rolagem (encadeada) ----------

  const formula = useMemo(() => parseFormula(data.formula), [data.formula]);
  const ranges = useMemo(
    () => (formula ? computeRanges(data.rows, formula) : null),
    [data.rows, formula]
  );
  const rollable = data.rows.some((r) => r.weight > 0);

  /** resolve um docId vinculado para outra tabela do universo (rolagem encadeada) */
  const resolveTable = (docId: string) => {
    const d = docs.find((x) => x.id === docId);
    return d && d.type === 'mythril/table'
      ? { title: d.title || 'Sem título', table: parseTable(d.content) }
      : null;
  };

  const roll = () => {
    const rolled = rollChain({ docId: doc.id, title: doc.title || 'Tabela', table: dataRef.current }, resolveTable);
    if (rolled.length === 0) return;
    setSteps(rolled);
    setCopied(false);
    manager.events.emit('roller:rolled', {
      tableTitle: doc.title || 'Tabela',
      steps: rolled.map((s) => ({
        title: s.title,
        formula: s.formula,
        total: s.result.total,
        dice: s.result.dice,
        text: s.result.row.text,
      })),
    });
  };

  const copyResult = () => {
    if (!steps || steps.length === 0) return;
    const text = steps
      .map((s) => `${s.title}${s.result.total != null ? ` (${s.result.total})` : ''}: ${s.result.row.text}`)
      .join('\n');
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // ---------- colar dados ----------

  const handlePaste = (e: React.ClipboardEvent) => {
    // dentro de inputs, o paste nativo vence
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text?.trim()) return;
    const rows = rowsFromText(text);
    if (rows.length === 0) return;
    e.preventDefault();
    commit({ ...dataRef.current, rows: [...dataRef.current.rows.filter((r) => r.text || r.details), ...rows] });
  };

  // ---------- drag-and-drop (reordenação) ----------

  const rowDragProps = (rowId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId.current || dragId.current === rowId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropBeforeId(rowId);
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragId.current) return;
      e.preventDefault();
      moveRowBefore(dragId.current, rowId);
      dragId.current = null;
      setDropBeforeId(null);
    },
  });

  const toolBtn =
    'flex items-center gap-1 px-2 py-1 text-[12px] rounded text-ink-2 hover:bg-hover hover:text-ink-1 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-2';

  const docTitle = (id: string) => docs.find((d) => d.id === id)?.title || 'Sem título';
  const finalStep = steps && steps.length > 0 ? steps[steps.length - 1] : null;

  return (
    <div className="h-full flex flex-col bg-app" onPaste={handlePaste}>
      {/* barra de ferramentas */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-line flex-wrap">
        <div className="flex items-center gap-1.5 mr-1">
          <Dices size={13} className="text-table" />
          <input
            type="text"
            value={data.formula}
            onChange={(e) => commit({ ...dataRef.current, formula: e.target.value })}
            placeholder="1d20"
            spellCheck={false}
            title="Fórmula de dado (ex: 1d20, 2d6). Vazio = sorteio ponderado por peso."
            className={`w-20 bg-overlay border rounded px-1.5 py-1 text-[12px] font-mono text-ink-1 outline-none placeholder:text-ink-3 ${
              data.formula && !formula ? 'border-danger' : 'border-line focus:border-accent'
            }`}
          />
        </div>
        <button type="button" className={toolBtn} onClick={roll} disabled={!rollable} title="Rolar na tabela">
          <Dices size={13} /> Rolar
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-3">
          <ClipboardPaste size={11} />
          Cole de uma planilha ou markdown para adicionar linhas
        </span>
      </div>

      {/* resultado da rolagem (encadeada) */}
      {steps && finalStep && (
        <div className="mx-4 mt-3 rounded-lg border border-table/40 bg-table/10 px-4 py-3 flex items-start gap-3">
          <Dices size={18} className="text-table shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-baseline gap-2 flex-wrap py-0.5">
                {i > 0 && <span className="text-ink-3 select-none">→</span>}
                {step.result.total != null && (
                  <span className="text-[15px] font-bold text-ink-1 font-mono">
                    {step.result.total}
                    {step.result.range && (
                      <span className="ml-1.5 text-[11px] font-normal text-ink-3">
                        [{step.result.range.min}–{step.result.range.max}]
                      </span>
                    )}
                  </span>
                )}
                {steps.length > 1 && <span className="text-[11px] text-ink-3">[{step.title}]</span>}
                <span className="text-[14px] text-ink-1">
                  {step.result.row.text || <em className="text-ink-3">(sem texto)</em>}
                </span>
                {step.result.dice.length > 1 && (
                  <span className="text-[11px] text-ink-3 font-mono">
                    {step.formula}: {step.result.dice.join(' + ')}
                  </span>
                )}
              </div>
            ))}
            {finalStep.result.row.details && (
              <div className="text-[12px] text-ink-2 mt-1 whitespace-pre-wrap">{finalStep.result.row.details}</div>
            )}
            {finalStep.result.row.docId && docs.find((d) => d.id === finalStep.result.row.docId)?.type !== 'mythril/table' && (
              <button
                type="button"
                onClick={() => openDocument(finalStep.result.row.docId!)}
                className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-active text-[11px] text-accent-ink hover:bg-accent-soft"
              >
                <Link2 size={11} /> {docTitle(finalStep.result.row.docId)}
              </button>
            )}
          </div>
          <button type="button" onClick={copyResult} className={`${toolBtn} shrink-0`} title="Copiar resultado">
            <Copy size={12} /> {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      )}

      {/* grade */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        <div className="max-w-[860px] mx-auto">
          {/* cabeçalho */}
          <div className="grid grid-cols-[20px_72px_1fr_64px_28px_28px_28px] items-center gap-2 px-2 pb-1 border-b border-line-strong text-[10.5px] uppercase tracking-wide text-ink-3 select-none">
            <span />
            <span title={formula ? 'Faixa na rolagem (derivada dos pesos)' : 'Defina uma fórmula para ver as faixas'}>
              Faixa
            </span>
            <span>Resultado</span>
            <span className="text-center" title="Peso relativo na rolagem">Peso</span>
            <span />
            <span />
            <span />
          </div>

          {data.rows.length === 0 && (
            <div className="px-2 py-6 text-center text-[12.5px] text-ink-3">
              Tabela vazia. Adicione uma linha ou cole dados de uma planilha.
            </div>
          )}

          {data.rows.map((row, i) => {
            const range = ranges?.[i] ?? null;
            const expanded = expandedId === row.id;
            const linkedDoc = row.docId ? docs.find((d) => d.id === row.docId) : null;
            return (
              <div key={row.id}>
                <div
                  className={`grid grid-cols-[20px_72px_1fr_64px_28px_28px_28px] items-center gap-2 px-2 py-1 border-b border-line hover:bg-hover/40 group ${
                    dropBeforeId === row.id ? 'border-t-2 border-t-accent' : ''
                  }`}
                  {...rowDragProps(row.id)}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragId.current = row.id;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', row.text);
                    }}
                    onDragEnd={() => {
                      dragId.current = null;
                      setDropBeforeId(null);
                    }}
                    title="Arrastar para reordenar"
                    className="flex items-center justify-center cursor-grab active:cursor-grabbing text-ink-3 hover:text-ink-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <GripVertical size={12} />
                  </span>
                  <span
                    className={`text-[11.5px] font-mono select-none ${range ? 'text-ink-2' : 'text-ink-3'}`}
                    title={
                      formula
                        ? range
                          ? `Faixa ${range.min}–${range.max} em ${data.formula}`
                          : 'Sem faixa rolável (peso baixo demais)'
                        : 'Defina uma fórmula para ver as faixas'
                    }
                  >
                    {range ? `${range.min}–${range.max}` : '—'}
                  </span>
                  <input
                    ref={(el) => {
                      if (el) textInputs.current.set(row.id, el);
                      else textInputs.current.delete(row.id);
                    }}
                    type="text"
                    value={row.text}
                    onChange={(e) => updateRow(row.id, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRow(row.id);
                      }
                    }}
                    placeholder="Resultado…"
                    className="bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3 py-1 min-w-0"
                  />
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={row.weight}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      updateRow(row.id, { weight: Number.isFinite(w) && w >= 0 ? w : 0 });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRow(row.id);
                      }
                    }}
                    title="Peso relativo na rolagem"
                    className="w-full bg-transparent text-center text-[12.5px] font-mono text-ink-2 outline-none py-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                    title={expanded ? 'Recolher detalhes' : 'Detalhes e link'}
                    className={`p-1 rounded transition-colors ${expanded ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'}`}
                  >
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  <span className="flex items-center justify-center">
                    {row.docId && (
                      <button
                        type="button"
                        onClick={() => openDocument(row.docId!)}
                        title={
                          linkedDoc?.type === 'mythril/table'
                            ? `Rola na tabela "${linkedDoc.title}" (encadeado)`
                            : docTitle(row.docId)
                        }
                        className={`p-1 rounded ${linkedDoc?.type === 'mythril/table' ? 'text-table hover:bg-table/20' : 'text-accent-ink hover:bg-accent-soft'}`}
                      >
                        {linkedDoc?.type === 'mythril/table' ? <Dices size={12} /> : <Link2 size={12} />}
                      </button>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    title="Remover linha"
                    className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {expanded && (
                  <div className="ml-[100px] mr-2 my-1.5 rounded-md border border-line bg-elevated/60 p-2.5 flex flex-col gap-2">
                    <textarea
                      value={row.details}
                      onChange={(e) => updateRow(row.id, { details: e.target.value })}
                      placeholder="Detalhes do resultado (descrição, consequências…)"
                      rows={2}
                      className="w-full bg-transparent text-[12.5px] text-ink-1 outline-none placeholder:text-ink-3 resize-y"
                    />
                    <DocLinkPicker
                      docs={docs}
                      selected={row.docId}
                      excludeDocId={doc.id}
                      onChange={(id) => updateRow(row.id, { docId: id })}
                      onOpenDoc={openDocument}
                    />
                    {linkedDoc?.type === 'mythril/table' && (
                      <div className="text-[10.5px] text-table select-none">
                        Vinculada a uma tabela: ao ser sorteada, rola automaticamente em "{linkedDoc.title}".
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div
            onDragOver={(e) => {
              if (!dragId.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropBeforeId(null);
            }}
            onDrop={(e) => {
              if (!dragId.current) return;
              e.preventDefault();
              moveRowBefore(dragId.current, null);
              dragId.current = null;
            }}
          >
            <button
              type="button"
              onClick={() => addRow()}
              className="mt-2 flex items-center gap-1.5 px-2 py-1.5 text-[12.5px] text-ink-3 hover:text-ink-1 hover:bg-hover rounded transition-colors"
            >
              <Plus size={13} /> Nova linha
            </button>
          </div>

          {formula && rollable && (
            <div className="mt-3 text-[11px] text-ink-3 select-none">
              {data.formula} cobre {formulaMin(formula)}–{formulaMax(formula)} ·{' '}
              {data.rows.filter((r) => r.weight > 0).length} linha(s) rolável(is)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
