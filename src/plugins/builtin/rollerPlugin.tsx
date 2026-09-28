// Rolagens — plugin separado das tabelas: ouve 'roller:rolled' (emitido pelo
// TableEditor e pelo bloco de tabela nas notas), mantém o histórico da sessão
// e o expõe numa workspace tab ("Rolagens") aberta pelo botão da ribbon.
import { useSyncExternalStore } from 'react';
import { Dices, Trash2 } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

interface RolledStep {
  title: string;
  formula: string;
  total: number | null;
  dice: number[];
  text: string;
}

interface RollLogEntry {
  id: number;
  at: number;
  tableTitle: string;
  steps: RolledStep[];
}

const MAX_ENTRIES = 100;

let entries: RollLogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => entries;

function clearLog() {
  entries = [];
  notify();
}

/** histórico da sessão, mais recente primeiro */
function RollLogPanel() {
  const items = useSyncExternalStore(subscribe, getSnapshot);
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="h-full flex flex-col bg-app">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-line">
        <Dices size={14} className="text-table" />
        <span className="text-[12.5px] text-ink-2">{items.length} rolagem(ns) nesta sessão</span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearLog}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[11.5px] rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <Trash2 size={12} /> Limpar
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        {items.length === 0 && (
          <div className="py-16 text-center text-[13px] text-ink-3">
            Nenhuma rolagem ainda. Role numa Tabela Interativa (documento ou bloco em nota).
          </div>
        )}
        <div className="max-w-[680px] mx-auto flex flex-col gap-2">
          {items.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-line bg-elevated/60 px-3.5 py-2.5">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[12.5px] font-medium text-ink-1 truncate">{entry.tableTitle}</span>
                <span className="text-[10.5px] text-ink-3 select-none">{timeFmt.format(entry.at)}</span>
              </div>
              {entry.steps.map((step, i) => (
                <div key={i} className="flex items-baseline gap-2 py-0.5 text-[12.5px]">
                  {i > 0 && <span className="text-ink-3 select-none">→</span>}
                  {step.total != null && (
                    <span className="font-mono font-bold text-ink-1">
                      {step.total}
                      <span className="ml-1 font-normal text-[10.5px] text-ink-3">{step.formula}</span>
                    </span>
                  )}
                  {entry.steps.length > 1 && <span className="text-ink-3 text-[11px]">[{step.title}]</span>}
                  <span className="text-ink-1">{step.text || <em className="text-ink-3">(sem texto)</em>}</span>
                  {step.dice.length > 1 && (
                    <span className="text-[10.5px] font-mono text-ink-3 select-none">({step.dice.join(' + ')})</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const rollerPlugin: Plugin = {
  manifest: {
    id: 'diegesis/roller',
    name: 'Rolagens',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Histórico de rolagens de tabelas interativas, com rolagens encadeadas.',
    author: 'Diegesis Codex',
    permissions: ['ui'],
  },
  activate(ctx) {
    ctx.events.on('roller:rolled', (payload) => {
      entries = [{ id: ++seq, at: Date.now(), tableTitle: payload.tableTitle, steps: payload.steps }, ...entries].slice(
        0,
        MAX_ENTRIES
      );
      notify();
    });

    ctx.views.add({
      id: 'roller:log',
      title: 'Rolagens',
      location: 'workspace-tab',
      component: RollLogPanel,
    });

    ctx.commands.add({
      id: 'diegesis/roller:open',
      title: 'Abrir histórico de rolagens',
      run: () => ctx.app.openView('roller:log'),
    });

    ctx.views.addRibbonItem({
      id: 'diegesis/roller:ribbon',
      title: 'Rolagens',
      icon: Dices,
      command: 'diegesis/roller:open',
      order: 20,
    });
  },
};
