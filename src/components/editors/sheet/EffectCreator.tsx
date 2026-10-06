// Criação simples de efeitos na aba fixa "Efeitos". Se o plugin de IA está
// ativo (e configurado), o usuário descreve o efeito em linguagem natural e a
// IA devolve uma definição ESTRUTURADA (specialist `sheet-effect` no processo
// principal — tool call forçada, nada de parsear texto). Sem IA, um pequeno
// formulário inline (rótulo + alterações atributo/op/valor). Em ambos os casos
// o efeito vira definição global do reino e é aplicado à ficha (com rollback
// se a definição for inválida — onCreate retorna a mensagem de erro).
import { useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import type { Change, EffectDefinition, ValueOp } from '@diegesis/sheet';
import { newEffectId } from '@shared/sheetEffects';
import { Select, TextInput } from '../../ui/fields';

const OPS: [ValueOp, string][] = [
  ['add', 'somar'],
  ['set', 'definir'],
  ['multiply', 'multiplicar'],
];

export function EffectCreator({
  aiAvailable,
  attributes,
  onCreate,
}: {
  aiAvailable: boolean;
  /** caminhos de atributos conhecidos da ficha (grounding da IA) */
  attributes: string[];
  /** cria a definição e aplica à ficha; retorna mensagem de erro ou null */
  onCreate: (def: EffectDefinition) => string | null;
}) {
  return aiAvailable ? (
    <AiEffectForm attributes={attributes} onCreate={onCreate} />
  ) : (
    <ManualEffectForm onCreate={onCreate} />
  );
}

const boxCls = 'rounded-xl border border-dashed border-sheet/30 bg-sheet-soft/40 p-3 flex flex-col gap-2';
const headCls = 'text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sheet/90 select-none';
const submitCls =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sheet/50 bg-sheet-soft text-[12px] text-sheet-strong hover:border-sheet/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0';

// ---------- IA (resultado estruturado via specialist sheet-effect) ----------

function AiEffectForm({
  attributes,
  onCreate,
}: {
  attributes: string[];
  onCreate: (d: EffectDefinition) => string | null;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const description = input.trim();
    if (!description || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.diegesis.ai.generateSheetEffect({ description, attributes });
      if (!res.ok || !res.effect) {
        setError(res.error ?? 'A IA não retornou um efeito válido. Tente descrever de outra forma.');
        return;
      }
      const changes: Change[] = res.effect.changes.map((c) => ({ kind: 'value', path: c.path, op: c.op, value: c.value }));
      if (changes.length === 0) {
        setError('A IA não retornou alterações válidas.');
        return;
      }
      const err = onCreate({ id: newEffectId(res.effect.label), label: res.effect.label, changes });
      if (err) setError(err);
      else setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
        <button type="button" onClick={generate} disabled={!input.trim() || busy} className={submitCls}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Gerar
        </button>
      </div>
      {error && <div className="text-[11.5px] text-danger">{error}</div>}
    </div>
  );
}

// ---------- formulário inline ----------

function ManualEffectForm({ onCreate }: { onCreate: (d: EffectDefinition) => string | null }) {
  const emptyRow = () => ({ path: 'ca', op: 'add' as ValueOp, value: '1' });
  const [label, setLabel] = useState('');
  const [rows, setRows] = useState<{ path: string; op: ValueOp; value: string }[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);

  const valid = Boolean(label.trim()) && rows.some((r) => r.path.trim() && r.value.trim());

  const create = () => {
    if (!valid) return;
    const changes: Change[] = rows
      .filter((r) => r.path.trim() && r.value.trim())
      .map((r) => ({ kind: 'value', path: r.path.trim(), op: r.op, value: r.value.trim() }));
    if (changes.length === 0) return;
    const name = label.trim();
    const err = onCreate({ id: newEffectId(name), label: name, changes });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
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
      {error && <div className="text-[11.5px] text-danger">{error}</div>}
    </div>
  );
}
