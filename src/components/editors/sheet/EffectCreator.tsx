// Criação simples de efeitos na aba fixa "Efeitos". Se o plugin de IA está
// ativo (e configurado), o usuário descreve o efeito em linguagem natural e a
// IA gera a definição (endpoint single-shot `ai.inline`); caso contrário, um
// pequeno formulário inline (rótulo + alterações atributo/op/valor). Em ambos
// os casos o efeito vira uma definição global do reino e é aplicado à ficha.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { Change, EffectDefinition, ValueOp } from '@diegesis/sheet';
import { newEffectId } from '@shared/sheetEffects';
import { Select, TextInput } from '../../ui/fields';

const OPS: [ValueOp, string][] = [
  ['add', 'somar'],
  ['set', 'definir'],
  ['multiply', 'multiplicar'],
];
const OP_IDS = new Set<string>(OPS.map(([v]) => v));

const AI_SYSTEM = `Você gera definições de efeito para fichas de RPG OSR.
Responda APENAS com JSON válido, sem markdown nem explicações, no formato:
{"label": string, "changes": [{"path": string, "op": "add" | "set" | "multiply", "value": string}]}
Regras:
- path é o atributo afetado; prefira os existentes: ca, pv.atual, pv.max, atq, moral, save, dv, desl.quad, dadoVida.
- value é sempre string numérica ou expressão de dados (ex.: "2", "-1", "1d4").
- No máximo 3 alterações.`;

interface ParsedAiEffect {
  label: string;
  changes: { path?: unknown; op?: unknown; value?: unknown }[];
}

/** extrai o primeiro objeto JSON da resposta (tolera texto/markdown ao redor) */
function parseAiJson(text: string): ParsedAiEffect | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof raw.label !== 'string' || !raw.label.trim()) return null;
    const changes = Array.isArray(raw.changes) ? raw.changes : [];
    return { label: raw.label.trim(), changes: changes as ParsedAiEffect['changes'] };
  } catch {
    return null;
  }
}

function toChanges(list: ParsedAiEffect['changes']): Change[] {
  const out: Change[] = [];
  for (const c of list.slice(0, 4)) {
    if (!c || typeof c.path !== 'string' || !c.path.trim()) continue;
    const op = typeof c.op === 'string' && OP_IDS.has(c.op) ? (c.op as ValueOp) : 'add';
    const value = typeof c.value === 'number' ? String(c.value) : typeof c.value === 'string' ? c.value.trim() : '';
    if (!value) continue;
    out.push({ kind: 'value', path: c.path.trim(), op, value });
  }
  return out;
}

export function EffectCreator({
  aiAvailable,
  realmId,
  onCreate,
}: {
  aiAvailable: boolean;
  realmId: string | null;
  onCreate: (def: EffectDefinition) => void;
}) {
  return aiAvailable ? (
    <AiEffectForm realmId={realmId} onCreate={onCreate} />
  ) : (
    <ManualEffectForm onCreate={onCreate} />
  );
}

const boxCls = 'rounded-xl border border-dashed border-sheet/30 bg-sheet-soft/40 p-3 flex flex-col gap-2';
const headCls = 'text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sheet/90 select-none';
const submitCls =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sheet/50 bg-sheet-soft text-[12px] text-sheet-strong hover:border-sheet/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0';

// ---------- IA ----------

function AiEffectForm({ realmId, onCreate }: { realmId: string | null; onCreate: (d: EffectDefinition) => void }) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatIdRef = useRef('');
  const bufferRef = useRef('');

  useEffect(() => {
    return window.diegesis.ai.onChatChunk((chunk) => {
      if (chunk.chatId !== chatIdRef.current) return;
      if (chunk.error) {
        setError(chunk.error);
        setStreaming(false);
        return;
      }
      if (chunk.delta) bufferRef.current += chunk.delta;
      if (chunk.done) {
        setStreaming(false);
        const parsed = parseAiJson(bufferRef.current);
        const changes = parsed ? toChanges(parsed.changes) : [];
        if (!parsed || changes.length === 0) {
          setError('A IA não retornou um efeito válido. Tente descrever de outra forma.');
          return;
        }
        onCreate({ id: newEffectId(parsed.label), label: parsed.label, changes });
        setInput('');
      }
    });
  }, [onCreate]);

  const generate = () => {
    const description = input.trim();
    if (!description || streaming) return;
    const chatId = `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    chatIdRef.current = chatId;
    bufferRef.current = '';
    setError(null);
    setStreaming(true);
    window.diegesis.ai
      .inline({ chatId, realmId, system: AI_SYSTEM, messages: [{ role: 'user', content: description }], useContext: false })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStreaming(false);
      });
  };

  return (
    <div className={boxCls}>
      <div className="flex items-center gap-2">
        <Wand2 size={12} className="text-sheet" />
        <span className={headCls}>Criar efeito com IA</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') generate();
          }}
          placeholder="Descreva o efeito… ex.: Benção: +2 na CA"
          spellCheck={false}
          className="flex-1 min-w-0 bg-overlay border border-line rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-1 outline-none focus:border-sheet/60 placeholder:text-ink-3 transition-colors"
        />
        <button type="button" onClick={generate} disabled={!input.trim() || streaming} className={submitCls}>
          {streaming ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Gerar
        </button>
      </div>
      {error && <div className="text-[11.5px] text-danger">{error}</div>}
    </div>
  );
}

// ---------- formulário inline ----------

function ManualEffectForm({ onCreate }: { onCreate: (d: EffectDefinition) => void }) {
  const emptyRow = () => ({ path: 'ca', op: 'add' as ValueOp, value: '1' });
  const [label, setLabel] = useState('');
  const [rows, setRows] = useState<{ path: string; op: ValueOp; value: string }[]>([emptyRow()]);

  const valid = Boolean(label.trim()) && rows.some((r) => r.path.trim() && r.value.trim());

  const create = () => {
    if (!valid) return;
    const changes: Change[] = rows
      .filter((r) => r.path.trim() && r.value.trim())
      .map((r) => ({ kind: 'value', path: r.path.trim(), op: r.op, value: r.value.trim() }));
    if (changes.length === 0) return;
    const name = label.trim();
    onCreate({ id: newEffectId(name), label: name, changes });
    setLabel('');
    setRows([emptyRow()]);
  };

  const setRow = (i: number, patch: Partial<{ path: string; op: ValueOp; value: string }>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className={boxCls}>
      <div className="flex items-center gap-2">
        <Plus size={12} className="text-sheet" />
        <span className={headCls}>Criar efeito</span>
      </div>
      <TextInput value={label} onChange={setLabel} placeholder="Nome do efeito (ex.: Benção)" />
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <TextInput
            value={r.path}
            onChange={(v) => setRow(i, { path: v })}
            placeholder="atributo (ex.: ca)"
            mono
            className="flex-1"
          />
          <Select value={r.op} onChange={(v) => setRow(i, { op: v as ValueOp })} options={OPS} className="w-28" />
          <TextInput value={r.value} onChange={(v) => setRow(i, { value: v })} placeholder="valor" mono className="w-20" />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              title="Remover alteração"
              className="p-1 rounded text-ink-3 hover:text-danger shrink-0 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { path: '', op: 'add', value: '1' }])}
          className="flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-sheet-strong transition-colors"
        >
          <Plus size={11} /> alteração
        </button>
        <button type="button" onClick={create} disabled={!valid} className={`ml-auto ${submitCls}`}>
          <Plus size={12} /> Criar e aplicar
        </button>
      </div>
    </div>
  );
}
