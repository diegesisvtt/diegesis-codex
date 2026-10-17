// Inline content spec: macro de tabela interativa embutida no texto (como um
// chip que "vira" o resultado). Fica no meio de uma frase — ao contrário do
// bloco `interactiveTable`, que ocupa a linha inteira. Clicar rola a tabela
// vinculada e revela o resultado inline; passar o mouse mostra título +
// descrição num popover.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createReactInlineContentSpec } from '@blocknote/react';
import { ArrowUpRight, Dices, RefreshCw, Table, X } from 'lucide-react';
import {
  parseTable,
  rollChain,
  rollTotal,
  type ChainStep,
} from '@shared/table';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';
import { dice3dBridge, type RollPayload } from '../../dice3d/bridge';

/* ============================================================
   Picker popover (escolhe a tabela a vincular) — portal p/ body
   ============================================================ */

function TableMacroPicker({
  anchor,
  onPick,
  onClose,
}: {
  anchor: { x: number; y: number };
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { docs } = useStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => d.type === 'diegesis/table')
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .slice(0, 30);
  }, [docs, query]);

  const left = Math.min(Math.max(8, anchor.x), window.innerWidth - 320 - 8);
  const top = Math.max(8, Math.min(anchor.y, window.innerHeight - 380));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-elevated shadow-[0_16px_48px_rgba(0,0,0,0.55)] overflow-hidden animate-fade-up flex flex-col"
        style={{ left, top }}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-sidebar">
          <Table size={13} className="text-table shrink-0" />
          <span className="text-[12px] font-semibold text-ink-1">Vincular tabela</span>
          <div className="flex-1" />
          <button onClick={onClose} title="Fechar" className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-hover">
            <X size={14} />
          </button>
        </div>
        <div className="px-3 pt-2">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tabela…"
            className="w-full bg-transparent text-[13px] text-ink-1 outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="mt-1.5 border-t border-line pt-1 max-h-64 overflow-y-auto custom-scrollbar">
          {candidates.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-ink-3 text-center">Nenhuma tabela encontrada.</div>
          ) : (
            candidates.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  onPick(d.id);
                  onClose();
                }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 truncate"
              >
                <Table size={12} className="text-table shrink-0" />
                {d.title || 'Sem título'}
              </button>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

/* ============================================================
   View inline (chip)
   ============================================================ */

function TableMacroView(props: {
  inlineContent: { props?: Record<string, unknown> };
  updateInlineContent: (update: { type?: string; props?: Record<string, unknown> }) => void;
  editor: any;
  node: { nodeSize: number };
  getPos: () => number | undefined;
}) {
  const { inlineContent, updateInlineContent, editor, node, getPos } = props;
  const { docs, openDocument } = useStore();
  const manager = usePluginManager();
  const tableId = (inlineContent.props?.tableId ?? '') as string;

  const [steps, setSteps] = useState<ChainStep[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [hovering, setHovering] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  const tableDoc = docs.find((d) => d.id === tableId);
  const table = useMemo(() => (tableDoc ? parseTable(tableDoc.content) : null), [tableDoc]);
  const rollableCount = table ? table.rows.filter((r) => r.weight > 0).length : 0;

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

  const pickerAnchor = useRef({ x: 0, y: 0 });
  const openPicker = () => {
    const r = chipRef.current?.getBoundingClientRect();
    if (r) pickerAnchor.current = { x: r.left, y: r.bottom + 6 };
    setPicking(true);
  };

  const enterHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovering(true), 200);
  };
  const leaveHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHovering(false);
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const remove = () => {
    const pos = getPos();
    if (pos != null) {
      try {
        const tr = editor._tiptapEditor.state.tr;
        tr.delete(pos, pos + node.nodeSize);
        editor._tiptapEditor.view.dispatch(tr);
      } catch {
        /* ignore */
      }
    }
    setHovering(false);
  };

  const result = steps && steps.length > 0 ? steps[steps.length - 1] : null;
  const total = result ? rollTotal(result.result) : null;
  const label = tableDoc ? (table?.formula || `${rollableCount} itens`) : 'Vincular tabela';

  return (
    <>
      <span
        ref={chipRef}
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (tableDoc) roll();
          else openPicker();
        }}
        onMouseEnter={enterHover}
        onMouseLeave={leaveHover}
        className={`relative inline-flex items-center gap-1 align-baseline mx-0.5 px-1.5 py-[1px] rounded-md border text-[13px] leading-snug cursor-pointer select-none whitespace-nowrap ${
          tableDoc
            ? 'border-cyan-500/25 bg-card text-ink-1 hover:border-cyan-400/60'
            : 'border-dashed border-line-strong text-ink-3 hover:text-ink-1'
        }`}
      >
        {tableDoc ? <Dices size={12} className="text-cyan-300 shrink-0" /> : <Table size={12} className="text-table shrink-0" />}
        <span className="font-mono">{label}</span>
        {result && (
          <span className="inline-flex items-baseline gap-1 border-l border-cyan-500/20 pl-1.5 text-ink-1 max-w-[260px]">
            {total != null && <b className="font-mono text-glow-cyan">{total}</b>}
            <span className="truncate">{result.result.row.text || <em className="text-ink-3">(sem texto)</em>}</span>
          </span>
        )}

        {/* popover hover: título + descrição + ações */}
        {hovering && tableDoc && (
          <span
            // impede que cliques no popover "vazem" para o chip e rolem a tabela
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full mt-1.5 z-30 block w-[260px] rounded-lg border border-line bg-elevated/95 backdrop-blur shadow-xl p-2.5 space-y-1.5 animate-fade-in"
          >
            <span className="flex items-center gap-1.5">
              <Table size={12} className="text-table shrink-0" />
              <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-ink-1">{tableDoc.title || 'Sem título'}</span>
            </span>
            {table?.description && (
              <span className="block text-[11px] text-ink-2 leading-snug whitespace-pre-wrap">{table.description}</span>
            )}
            <span className="flex items-center gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  openDocument(tableDoc.id);
                  setHovering(false);
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-accent-ink hover:bg-accent-soft"
              >
                <ArrowUpRight size={11} /> Abrir
              </button>
              <button
                type="button"
                onClick={() => {
                  openPicker();
                  setHovering(false);
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-ink-2 hover:bg-hover hover:text-ink-1"
              >
                <RefreshCw size={11} /> Trocar
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={remove}
                title="Remover"
                className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft"
              >
                <X size={12} />
              </button>
            </span>
          </span>
        )}
      </span>

      {picking && (
        <TableMacroPicker
          anchor={pickerAnchor.current}
          onPick={(id) => {
            updateInlineContent({ type: 'tableMacro', props: { tableId: id } });
            setSteps(null);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

export const TableMacroInline = () =>
  createReactInlineContentSpec(
    {
      type: 'tableMacro',
      content: 'none',
      propSchema: {
        tableId: { default: '' },
      },
    } as const,
    {
      render: TableMacroView as any,
    } as any
  );
