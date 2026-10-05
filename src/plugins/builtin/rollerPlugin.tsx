// Rolagens — plugin único de rolagens E dados 3D: ouve 'roller:rolled' (emitido
// pelo TableEditor, bloco de tabela nas notas, fichas e pelo próprio painel),
// mantém o histórico da sessão e o expõe no painel direito. Cards com chips de
// dados (máximo/mínimo destacados, descartados
// riscados) e rolagem direta no rodapé.
// Os dados 3D (overlay em tela cheia, Dice So Nice) são uma configuração deste
// plugin: "Exibir dados em 3D" e "Esperar os dados 3D" (revelar o resultado só
// após os dados assentarem). Toda rolagem passa por `dice3dBridge.presentRoll`.
import { useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, Send, Terminal, Trash2 } from 'lucide-react';
import { MATERIALTYPES, TEXTURELIST, THEMES } from '@diegesis/dice';
import { evaluateRoll, type RollResult as DiceRollResult, type TermResult } from '@diegesis/dice-core';
import { parseFormula } from '@shared/table';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import type { SettingDeclaration } from '../api/settings';
import { dice3dBridge, ENVIRONMENTS, SHADOWS, type RollPayload } from '../../components/dice3d/bridge';
import { Badge } from '../../components/ui/Badge';
import { CommandInput } from '../../components/ui/input';
import { DiceBar } from '../../components/codex/DiceButton';
import { DieIcon } from '../../components/codex/DieIcon';
import { RollResultCard } from '../../components/codex/RollResultCard';

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
 * Rola uma fórmula e a exibe via `presentRoll` (anima em 3D e respeita a
 * setting "esperar dados 3D"). `includeTotal` acrescenta "Total: N" ao passo.
 */
function rollFormula(formula: string, label: string, includeTotal: boolean): boolean {
  const expr = parseFormula(formula);
  if (!expr) return false;
  const roll = evaluateRoll(expr);
  const payload: RollPayload = {
    tableTitle: label,
    steps: [{ title: label, formula, roll, text: includeTotal ? `Total: ${String(roll.value)}` : '' }],
  };
  dice3dBridge.presentRoll(payload, () => appendEntry(label, payload.steps));
  return true;
}

/** rolagem com rótulo próprio (hook 'roller:roll'): fichas, IA, etc. */
function rollLabeled(formula: string, label: string): boolean {
  return rollFormula(formula, label, true);
}

function rollFromPanel(src: string): boolean {
  return rollFormula(src.trim(), 'Rolagem Rápida', false);
}

/**
 * Insere um dado na fórmula da caixa de texto (não rola): incrementa a
 * contagem quando a fórmula já termina com o mesmo dado, senão acrescenta
 * " + 1dN". Ex.: "1d20" + d20 → "2d20"; "1d20" + d6 → "1d20 + 1d6".
 */
function addDieToFormula(current: string, die: string): string {
  const f = current.trim();
  if (!f) return `1${die}`;
  const m = f.match(new RegExp(`(\\d*)\\s*${die}\\s*$`));
  if (m) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    return `${f.slice(0, m.index)}${count + 1}${die}`;
  }
  return `${f} + 1${die}`;
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

/** faces únicas de um passo (ex.: [20] → chip "d20") */
function facesOf(step: RolledStep): number[] {
  const expr = parseFormula(step.formula);
  if (!expr || !step.roll) return [];
  const faces: number[] = [];
  collectDieFaces(expr, faces);
  return [...new Set(faces)];
}

/** status tático de um passo: crítico (20 natural) ou falha crítica (1 natural) */
function critStatus(step: RolledStep): 'crit' | 'fail' | null {
  if (!step.roll) return null;
  const faces: number[] = [];
  const expr = parseFormula(step.formula);
  if (expr) collectDieFaces(expr, faces);
  const terms = collectDieTerms(step.roll);
  const aligned = faces.length === terms.length;
  for (let ti = 0; ti < terms.length; ti++) {
    const sides = aligned ? faces[ti] : null;
    if (sides !== 20) continue;
    for (const d of terms[ti].dice) {
      if (!d.kept) continue;
      if (d.value === 20) return 'crit';
      if (d.value === 1) return 'fail';
    }
  }
  return null;
}

/** chips de dados: natural máximo em verde, mínimo em vermelho,
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
    <div className="flex flex-wrap items-center gap-1">
      {terms.map((term, ti) => {
        const sides = aligned ? faces[ti] : null;
        return term.dice.map((d, di) => {
          const isMax = d.kept && sides != null && sides > 2 && d.value === sides;
          const isMin = d.kept && sides != null && sides > 2 && d.value === 1;
          const cls = isMax
            ? 'border-success/60 bg-gradient-to-b from-success/35 to-success/5 text-success shadow-[0_0_12px_rgba(52,211,153,0.35)]'
            : isMin
              ? 'border-danger/60 bg-gradient-to-b from-danger/35 to-danger/5 text-danger shadow-[0_0_12px_rgba(244,63,94,0.35)]'
              : 'border-cyan-500/25 bg-gradient-to-b from-white/[0.09] to-white/[0.01] text-ink-1';
          return (
            <span
              key={`${ti}-${di}`}
              title={sides != null ? `d${sides}` : undefined}
              className={`relative inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-md border px-1 font-mono text-[12px] font-bold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] select-none ${cls} ${
                d.kept ? '' : 'opacity-35 line-through grayscale'
              } ${d.exploded ? 'ring-1 ring-cyan-400/60' : ''}`}
            >
              {d.value}
              {d.exploded && (
                <span className="absolute -right-0.5 -top-0.5 h-1 w-1 rounded-full bg-cyan-300 shadow-[0_0_6px_rgba(0,242,254,0.9)]" />
              )}
            </span>
          );
        });
      })}
    </div>
  );
}

/** rodapé de chat: dados rápidos (que montam a fórmula) + input */
function RollInput() {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const config = useSyncExternalStore(dice3dBridge.subscribe, () => dice3dBridge.config);

  const doRoll = (src: string) => {
    if (rollFromPanel(src)) {
      setValue('');
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  // clique num dado: adiciona à fórmula da caixa de texto (não rola)
  const addDie = (formula: string) => {
    const die = formula.replace(/^\d+/, '');
    setValue((cur) => addDieToFormula(cur, die));
    setInvalid(false);
    inputRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-cyan-500/15 bg-gradient-to-b from-white/[0.025] to-transparent px-2.5 py-2.5">
      <DiceBar dice={config.quickDice} onRoll={addDie} size="lg" className="mb-2 w-full" />
      <CommandInput
        inputRef={inputRef}
        prompt={<Terminal size={12} className="shrink-0" />}
        invalid={invalid}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) doRoll(value);
        }}
        placeholder="1d20 + 5, 4d6kh3, 2d20kl1…"
        action={
          <button
            type="button"
            title="Rolar"
            disabled={!value.trim()}
            onClick={() => doRoll(value)}
            className="p-1 rounded text-cyan-300 hover:text-neon hover:bg-cyan-500/10 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={13} />
          </button>
        }
      />
    </div>
  );
}

/** histórico da sessão, mais recente primeiro — painel lateral direito */
function RollLogPanel() {
  const items = useSyncExternalStore(subscribe, getSnapshot);
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="codex-veil flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-cyan-500/15 bg-gradient-to-b from-white/[0.035] to-transparent px-3 py-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-cyan-500/25 bg-gradient-to-b from-white/[0.09] to-transparent text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Dices size={13} />
        </span>
        <span className="select-none font-display text-[11.5px] uppercase tracking-[0.16em] text-ink-1">Histórico</span>
        {items.length > 0 && <Badge variant="tactical">{items.length}</Badge>}
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearLog}
            title="Limpar histórico"
            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 size={11} /> Limpar
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-2">
        {items.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-white/[0.06] to-transparent text-cyan-300/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <DieIcon type="d20" size={30} />
            </div>
            <div className="font-display text-[13px] tracking-wide text-ink-2">Nenhuma rolagem</div>
            <p className="mt-1 max-w-[230px] text-[11.5px] leading-relaxed text-ink-3">
              Role abaixo, numa tabela interativa ou na ficha.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {items.map((entry) => {
              const rerollable = entry.steps.length === 1 && entry.steps[0].roll != null && !!parseFormula(entry.steps[0].formula);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="flex flex-col gap-1"
                >
                  {entry.steps.map((step, i) => {
                    const total = step.roll && typeof step.roll.value === 'number' ? step.roll.value : undefined;
                    const hasChips = (step.roll?.rolls.length ?? 0) > 0;
                    const status = critStatus(step);
                    const faces = facesOf(step);
                    return (
                      <RollResultCard
                        key={i}
                        author={entry.steps.length > 1 ? step.title : entry.tableTitle}
                        formula={step.formula}
                        result={total}
                        isCritSuccess={status === 'crit'}
                        isCritFail={status === 'fail'}
                        timestamp={i === 0 ? timeFmt.format(entry.at) : undefined}
                        onCopy={i === 0 ? () => navigator.clipboard.writeText(entryToText(entry)).catch(console.error) : undefined}
                        onReroll={i === 0 && rerollable ? () => rerollEntry(entry) : undefined}
                        onRemove={i === 0 ? () => removeEntry(entry.id) : undefined}
                      >
                        {faces.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {faces.map((f) => (
                              <Badge key={f} variant="tactical">d{f}</Badge>
                            ))}
                          </div>
                        )}
                        {hasChips && (
                          <div className="mt-1">
                            <DiceChips step={step} />
                          </div>
                        )}
                        {step.text && <div className="mt-1 text-[12px] text-ink-2 break-words min-w-0">{step.text}</div>}
                      </RollResultCard>
                    );
                  })}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      <RollInput />
    </div>
  );
}

// ---------- settings do plugin (inclui os dados 3D) ----------

const THEME_CHOICES = Object.entries(THEMES).map(([value, theme]) => ({ value, label: theme.name }));
const MATERIAL_CHOICES = [
  { value: '', label: 'Padrão do tema' },
  ...Object.entries(MATERIALTYPES).map(([value, material]) => ({ value, label: material.name })),
];
const TEXTURE_CHOICES = [
  { value: '', label: 'Padrão do tema' },
  ...Object.entries(TEXTURELIST).map(([value, texture]) => ({ value, label: texture.name })),
];

const DECLARATIONS: SettingDeclaration[] = [
  {
    key: 'show3d',
    type: 'boolean',
    label: 'Exibir dados em 3D',
    description: 'Rola os dados em tela cheia (estilo Dice So Nice) em vez de só mostrar o resultado.',
    default: true,
  },
  {
    key: 'wait3d',
    type: 'boolean',
    label: 'Esperar os dados 3D',
    description:
      'Revela o resultado (histórico, tabela, ficha) só depois que os dados 3D assentam. Desligado, o resultado aparece na hora e os dados animam em paralelo.',
    default: true,
  },
  {
    key: 'quickDice',
    type: 'text',
    label: 'Dados rápidos',
    description:
      'Botões exibidos no rodapé do histórico, separados por vírgula (d4, d6, d8, d10, d12, d20, d100). Clicar num dado o adiciona à fórmula — não rola direto.',
    default: 'd4, d6, d8, d10, d12, d20, d100',
  },
  { key: 'theme', type: 'select', label: 'Tema dos dados', default: 'default', choices: THEME_CHOICES },
  { key: 'material', type: 'select', label: 'Material', default: '', choices: MATERIAL_CHOICES },
  { key: 'texture', type: 'select', label: 'Textura', default: '', choices: TEXTURE_CHOICES },
  {
    key: 'environment',
    type: 'select',
    label: 'Ambiente',
    default: 'none',
    choices: ENVIRONMENTS.map((e) => ({ value: e.id, label: e.label })),
  },
  {
    key: 'shadows',
    type: 'select',
    label: 'Sombras',
    default: 'medium',
    choices: SHADOWS.map((s) => ({ value: s.id, label: s.label })),
  },
  { key: 'bloom', type: 'boolean', label: 'Bloom', default: false },
  { key: 'outline', type: 'boolean', label: 'Contorno dos dados', default: false },
  { key: 'strength', type: 'number', label: 'Força do arremesso', default: 1, min: 0.5, max: 2, step: 0.1 },
  { key: 'sounds', type: 'boolean', label: 'Sons de impacto', default: false },
  { key: 'volume', type: 'number', label: 'Volume', default: 80, min: 0, max: 100, step: 5 },
];

export const rollerPlugin: Plugin = {
  manifest: {
    id: 'diegesis/roller',
    name: 'Rolagens',
    version: '2.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Histórico de rolagens no painel lateral direito, com rolagem direta e dados 3D em tela cheia configuráveis.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'events', 'settings'],
  },
  activate(ctx) {
    // dados 3D (overlay) são uma configuração deste plugin
    dice3dBridge.setSettings(ctx.settings);
    ctx.settings.subscribe(() => dice3dBridge.refreshConfig());
    ctx.settings.registerAll(DECLARATIONS);
    ctx.settingsPages.add({ id: 'diegesis/roller:settings', title: 'Rolagens', icon: Dices, order: 30 });
    ctx.register({
      dispose: () => {
        dice3dBridge.setSettings(null);
      },
    });

    // observa as rolagens emitidas por tabelas/notas/fichas para alimentar o log
    ctx.events.on('roller:rolled', (payload) => {
      appendEntry(payload.tableTitle, payload.steps);
    });

    // serviço de rolagem para outros plugins/host (fichas, IA, etc.): 3D/overlay
    // quando ativos, log garantido caso contrário
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

  },
};
