// Rolagens — plugin separado das tabelas: ouve 'roller:rolled' (emitido pelo
// TableEditor, pelo bloco de tabela nas notas e pela mesa de Dados 3D), mantém
// o histórico da sessão e o expõe no painel direito (mesma região do painel de
// IA), aberto pela ribbon ou pela faixa de painéis — nunca como tab.
// Inspirado no log de rolagens do Foundry VTT: cards com chips de dados
// (máximo/mínimo destacados, descartados riscados) e rolagem direta no
// rodapé do painel — animada na mesa 3D quando ela está aberta.
import { useState, useSyncExternalStore } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Dices, RotateCcw, Trash2, X } from 'lucide-react';
import { evaluateRoll, type RollResult as DiceRollResult, type TermResult } from '@diegesis/dice-core';
import { parseFormula } from '@shared/table';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { dice3dBridge } from '../../components/dice3d/bridge';

interface RolledStep {
  title: string;
  formula: string;
  /** rolagem completa do dice-core (null quando sorteio ponderado puro) */
  roll: DiceRollResult | null;
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

function appendEntry(tableTitle: string, steps: RolledStep[]) {
  entries = [{ id: ++seq, at: Date.now(), tableTitle, steps }, ...entries].slice(0, MAX_ENTRIES);
  notify();
}

function removeEntry(id: number) {
  entries = entries.filter((e) => e.id !== id);
  notify();
}

function clearLog() {
  entries = [];
  notify();
}

/**
 * Rola uma fórmula a partir do painel. Com o overlay 3D ativo, delega para ele
 * (anima em tela cheia e loga ao assentar); senão rola na hora via dice-core e
 * loga direto. Retorna false quando a fórmula é inválida.
 */
/**
 * Rola uma fórmula com rótulo próprio (hook 'roller:roll'): delega para a
 * mesa 3D / overlay quando disponíveis; senão rola na hora e loga.
 * Retorna false quando a fórmula é inválida.
 */
function rollLabeled(formula: string, label: string): boolean {
  if (!parseFormula(formula)) return false;
  if (dice3dBridge.overlayHandler) {
    dice3dBridge.overlayHandler(formula, label);
    return true;
  }
  const roll = evaluateRoll(parseFormula(formula)!);
  appendEntry(label, [{ title: label, formula, roll, text: `Total: ${String(roll.value)}` }]);
  return true;
}

function rollFromPanel(src: string): boolean {
  const formula = src.trim();
  if (!parseFormula(formula)) return false;
  if (dice3dBridge.overlayHandler) {
    dice3dBridge.overlayHandler(formula, 'Rolagem Rápida');
    return true;
  }
  const roll = evaluateRoll(parseFormula(formula)!);
  appendEntry('Rolagem Rápida', [{ title: 'Rolagem Rápida', formula, roll, text: '' }]);
  return true;
}

/** re-rola uma entrada simples (um passo com fórmula de dados) e loga o resultado */
function rerollEntry(entry: RollLogEntry) {
  if (entry.steps.length !== 1) return;
  const step = entry.steps[0];
  const expr = step.roll ? parseFormula(step.formula) : null;
  if (!expr) return;
  const roll = evaluateRoll(expr);
  appendEntry(entry.tableTitle, [{ ...step, roll, text: `Total: ${String(roll.value)}` }]);
}

function entryToText(entry: RollLogEntry): string {
  const lines = entry.steps.map((s) => {
    const total = s.roll && typeof s.roll.value === 'number' ? `${s.roll.value} (${s.formula})` : s.formula;
    return s.text ? `${total} — ${s.text}` : total;
  });
  return `${entry.tableTitle}: ${lines.join(' → ')}`;
}

/** lados de cada termo de dado da expressão, em ordem de avaliação (best-effort) */
function collectDieFaces(expr: unknown, out: number[]): void {
  if (expr == null || typeof expr === 'number' || typeof expr === 'boolean') return;
  if (Array.isArray(expr)) {
    for (const item of expr) collectDieFaces(item, out);
    return;
  }
  if (typeof expr !== 'object') return;
  const node = expr as { type?: string; faces?: { kind: string; value?: number }; entries?: unknown[] };
  if (node.type === 'die' && node.faces) {
    const f = node.faces;
    out.push(f.kind === 'number' && typeof f.value === 'number' ? f.value : f.kind === 'percentile' ? 100 : f.kind === 'coin' ? 2 : 3);
    return;
  }
  if (node.type === 'pool' && Array.isArray(node.entries)) {
    for (const e of node.entries) collectDieFaces(e, out);
    return;
  }
  for (const v of Object.values(expr)) collectDieFaces(v, out);
}

/** termos de dado do resultado, achatando pools (ordem de avaliação) */
function collectDieTerms(roll: DiceRollResult): TermResult[] {
  const terms: TermResult[] = [];
  for (const t of roll.terms) {
    if (t.type === 'die') terms.push(t);
    else if (t.children) for (const c of t.children) if (c.type === 'die') terms.push(c);
  }
  return terms;
}

/** chips de dados estilo Foundry: natural máximo em verde, mínimo em vermelho,
 *  descartados (kh/kl) riscados e apagados */
function DiceChips({ step }: { step: RolledStep }) {
  const roll = step.roll;
  if (!roll) return null;
  const faces: number[] = [];
  const expr = parseFormula(step.formula);
  if (expr) collectDieFaces(expr, faces);
  const terms = collectDieTerms(roll);
  const aligned = faces.length === terms.length;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {terms.map((term, ti) => {
        const sides = aligned ? faces[ti] : null;
        return term.dice.map((d, di) => {
          const isMax = d.kept && sides != null && sides > 2 && d.value === sides;
          const isMin = d.kept && sides != null && sides > 2 && d.value === 1;
          const cls = isMax
            ? 'border-success/60 bg-success-soft text-success'
            : isMin
              ? 'border-danger/60 bg-danger-soft text-danger'
              : 'border-line bg-overlay text-ink-2';
          return (
            <span
              key={`${ti}-${di}`}
              title={sides != null ? `d${sides}` : undefined}
              className={`min-w-[22px] px-1 py-0.5 rounded border text-center font-mono text-[11px] font-semibold select-none ${cls} ${
                d.kept ? '' : 'opacity-40 line-through'
              } ${d.exploded ? 'ring-1 ring-accent/50' : ''}`}
            >
              {d.value}
            </span>
          );
        });
      })}
    </div>
  );
}

function CopyButton({ entry }: { entry: RollLogEntry }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copiar resultado"
      onClick={() => {
        navigator.clipboard.writeText(entryToText(entry)).catch(console.error);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-elevated transition-colors"
    >
      {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
    </button>
  );
}

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

/** rodapé estilo chat do Foundry: dados rápidos + input de fórmula */
function RollInput() {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const doRoll = (src: string) => {
    if (rollFromPanel(src)) {
      setValue('');
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="border-t border-line px-2.5 py-2 shrink-0">
      <div className="flex items-center gap-0.5 mb-1.5 flex-wrap">
        {QUICK_DICE.map((f) => (
          <button
            key={f}
            type="button"
            title={`Rolar 1d${f}`}
            onClick={() => doRoll(`1d${f}`)}
            className="px-1.5 py-0.5 rounded text-[10.5px] font-mono text-ink-2 hover:text-ink-1 hover:bg-elevated transition-colors"
          >
            d{f}
          </button>
        ))}
        <button
          type="button"
          title="Vantagem: 2d20, mantém o maior"
          onClick={() => doRoll('2d20kh1')}
          className="p-1 rounded text-ink-3 hover:text-success hover:bg-success-soft transition-colors"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          title="Desvantagem: 2d20, mantém o menor"
          onClick={() => doRoll('2d20kl1')}
          className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
        >
          <ArrowDown size={12} />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) doRoll(value);
          }}
          spellCheck={false}
          placeholder="1d20 + 5, 4d6kh3, 2d20kl1…"
          className={`flex-1 min-w-0 px-2 py-1.5 rounded bg-elevated/60 border text-[12px] font-mono text-ink-1 outline-none transition-colors ${
            invalid ? 'border-danger' : 'border-line focus:border-accent'
          }`}
        />
        <button
          type="button"
          title="Rolar"
          disabled={!value.trim()}
          onClick={() => doRoll(value)}
          className="p-1.5 rounded bg-accent-soft text-accent-ink hover:bg-accent/30 disabled:opacity-40 transition-colors"
        >
          <Dices size={14} />
        </button>
      </div>
    </div>
  );
}

/** histórico da sessão, mais recente primeiro — painel lateral direito */
function RollLogPanel() {
  const items = useSyncExternalStore(subscribe, getSnapshot);
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="h-full flex flex-col bg-app">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line">
        <Dices size={13} className="text-table" />
        <span className="text-[11.5px] text-ink-3 select-none">{items.length} rolagem(ns)</span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearLog}
            title="Limpar histórico"
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <Trash2 size={11} /> Limpar
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-2">
        {items.length === 0 && (
          <div className="py-14 px-4 text-center text-[12.5px] text-ink-3 leading-relaxed">
            Nenhuma rolagem ainda.
            <br />
            Role abaixo, numa Tabela Interativa ou na mesa de Dados 3D.
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {items.map((entry) => {
            const rerollable = entry.steps.length === 1 && entry.steps[0].roll != null && !!parseFormula(entry.steps[0].formula);
            return (
              <div key={entry.id} className="group rounded-md border border-line bg-elevated/60 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11.5px] font-medium text-ink-2 truncate">{entry.tableTitle}</span>
                  <span className="text-[10px] text-ink-3 select-none shrink-0">{timeFmt.format(entry.at)}</span>
                  <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {rerollable && (
                      <button
                        type="button"
                        title="Rolar novamente"
                        onClick={() => rerollEntry(entry)}
                        className="p-1 rounded text-ink-3 hover:text-accent-ink hover:bg-accent-soft transition-colors"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    <CopyButton entry={entry} />
                    <button
                      type="button"
                      title="Remover entrada"
                      onClick={() => removeEntry(entry.id)}
                      className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {entry.steps.map((step, i) => {
                  const total = step.roll && typeof step.roll.value === 'number' ? step.roll.value : null;
                  const hasChips = (step.roll?.rolls.length ?? 0) > 0;
                  return (
                    <div key={i} className={i > 0 ? 'mt-1.5 pt-1.5 border-t border-line/50' : ''}>
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        {i > 0 && <span className="text-ink-3 select-none text-[11px]">→</span>}
                        <span className="text-[10.5px] font-mono text-ink-3 truncate select-none">{step.formula}</span>
                        {entry.steps.length > 1 && <span className="text-ink-3 text-[10.5px] shrink-0">[{step.title}]</span>}
                      </div>
                      {hasChips && (
                        <div className="mt-1">
                          <DiceChips step={step} />
                        </div>
                      )}
                      <div className="mt-1 flex items-baseline gap-2 min-w-0">
                        {total != null && (
                          <span className="font-mono font-bold text-[16px] text-ink-1 leading-none select-none">{total}</span>
                        )}
                        {step.text && <span className="text-[12px] text-ink-1 break-words min-w-0">{step.text}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <RollInput />
    </div>
  );
}

export const rollerPlugin: Plugin = {
  manifest: {
    id: 'diegesis/roller',
    name: 'Rolagens',
    version: '1.2.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Histórico de rolagens estilo Foundry no painel lateral direito, com rolagem direta.',
    author: 'Diegesis Codex',
    permissions: ['ui'],
  },
  activate(ctx) {
    ctx.events.on('roller:rolled', (payload) => {
      appendEntry(payload.tableTitle, payload.steps);
    });

    // serviço de rolagem para outros plugins/host (fichas, IA, etc.): mesa 3D
    // ou overlay quando abertos, log garantido caso contrário
    ctx.hooks.register('roller:roll', ({ formula, label }) => rollLabeled(formula, label));

    ctx.views.add({
      id: 'roller:log',
      title: 'Rolagens',
      location: 'right-panel',
      component: RollLogPanel,
      icon: Dices,
      order: 2,
    });

    ctx.commands.add({
      id: 'diegesis/roller:toggle',
      title: 'Alternar painel de rolagens',
      run: () => ctx.app.setRightPanelView(ctx.app.rightPanelView === 'roller:log' ? null : 'roller:log'),
    });

    ctx.views.addRibbonItem({
      id: 'diegesis/roller:ribbon',
      title: 'Rolagens',
      icon: Dices,
      command: 'diegesis/roller:toggle',
      isActive: () => ctx.app.rightPanelView === 'roller:log',
      order: 20,
    });
  },
};
