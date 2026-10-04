// Gerenciador global de efeitos do reino (painel de propriedades): cria,
// edita e exclui definições de efeito customizadas, ao lado das embutidas do
// pack. As definições são persistidas em RealmSettings.sheetEffects e ficam
// aplicáveis em qualquer ficha.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Change, EffectDefinition, ValueOp } from '@diegesis/sheet';
import { newEffectId, summarizeChange } from '@shared/sheetEffects';
import { Field, Section, Select, TextInput } from '../../ui/fields';

const VALUE_OPS: [ValueOp, string][] = [
  ['add', 'somar'],
  ['set', 'definir'],
  ['multiply', 'multiplicar'],
  ['upgrade', 'aumentar (dado)'],
  ['downgrade', 'diminuir (dado)'],
  ['append', 'anexar'],
  ['remove', 'remover'],
];

export interface EffectsPanelProps {
  custom: EffectDefinition[];
  onSave(def: EffectDefinition): void;
  onDelete(id: string): void;
}

export function EffectsPanel({ custom, onSave, onDelete }: EffectsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(custom[0]?.id ?? null);
  const selected = custom.find((d) => d.id === selectedId) ?? null;

  const create = () => {
    const label = 'Novo efeito';
    const def: EffectDefinition = {
      id: newEffectId(label),
      label,
      changes: [{ kind: 'value', path: 'ca', op: 'add', value: '1' }],
    };
    onSave(def);
    setSelectedId(def.id);
  };

  const patch = (updates: Partial<EffectDefinition>) => {
    if (!selected) return;
    onSave({ ...selected, ...updates });
  };

  const updateChange = (idx: number, change: Change) => {
    if (!selected) return;
    patch({ changes: selected.changes.map((c, i) => (i === idx ? change : c)) });
  };

  const removeChange = (idx: number) => {
    if (!selected) return;
    patch({ changes: selected.changes.filter((_, i) => i !== idx) });
  };

  const addChange = () => {
    if (!selected) return;
    patch({ changes: [...selected.changes, { kind: 'value', path: 'ca', op: 'add', value: '1' }] });
  };

  return (
    <div className="flex flex-col gap-1">
      <Section title="Efeitos do reino">
        {custom.length === 0 && <div className="text-[12px] text-ink-3 mb-1">Nenhum efeito customizado ainda.</div>}
        {custom.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSelectedId(d.id)}
            className={`w-full text-left rounded-md px-2 py-1 text-[12px] transition-colors ${
              d.id === selectedId ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover'
            }`}
          >
            {d.label}
            <span className="block text-[10.5px] text-ink-3 font-mono truncate">{d.changes.map(summarizeChange).join(' · ')}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={create}
          className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent mt-1"
        >
          <Plus size={12} /> Novo efeito
        </button>
      </Section>

      {selected && (
        <Section title="Editar efeito">
          <Field label="Rótulo">
            <TextInput value={selected.label} onChange={(v) => patch({ label: v })} />
          </Field>

          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mt-2 mb-1">Alterações</div>
          {selected.changes.map((c, idx) => (
            <div key={idx} className="rounded-md border border-line p-2 mb-1.5 flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Select
                  value={c.kind}
                  onChange={(v) =>
                    updateChange(
                      idx,
                      v === 'roll'
                        ? { kind: 'roll', target: 'dano', transform: { bonus: '1' } }
                        : v === 'flag'
                          ? { kind: 'flag', path: 'flag', value: true }
                          : { kind: 'value', path: 'ca', op: 'add', value: '1' },
                    )
                  }
                  options={[
                    ['value', 'valor'],
                    ['roll', 'rolagem'],
                    ['flag', 'flag'],
                  ]}
                />
                <button
                  type="button"
                  title="Remover alteração"
                  onClick={() => removeChange(idx)}
                  className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {c.kind === 'value' && (
                <>
                  <Field label="path">
                    <TextInput value={c.path} mono onChange={(v) => updateChange(idx, { ...c, path: v })} />
                  </Field>
                  <Field label="op">
                    <Select value={c.op} onChange={(v) => updateChange(idx, { ...c, op: v as ValueOp })} options={VALUE_OPS} />
                  </Field>
                  <Field label="valor">
                    <TextInput value={c.value} mono onChange={(v) => updateChange(idx, { ...c, value: v })} />
                  </Field>
                </>
              )}

              {c.kind === 'roll' && (
                <>
                  <Field label="tag alvo">
                    <TextInput value={c.target} mono onChange={(v) => updateChange(idx, { ...c, target: v })} />
                  </Field>
                  <Field label="bônus">
                    <TextInput
                      value={c.transform.bonus ?? ''}
                      mono
                      onChange={(v) => updateChange(idx, { ...c, transform: { ...c.transform, bonus: v } })}
                    />
                  </Field>
                </>
              )}

              {c.kind === 'flag' && (
                <>
                  <Field label="path">
                    <TextInput value={c.path} mono onChange={(v) => updateChange(idx, { ...c, path: v })} />
                  </Field>
                  <Field label="valor">
                    <Select
                      value={String(c.value)}
                      onChange={(v) => updateChange(idx, { ...c, value: v === 'true' })}
                      options={[
                        ['true', 'ativo'],
                        ['false', 'inativo'],
                      ]}
                    />
                  </Field>
                </>
              )}
            </div>
          ))}
          <button type="button" onClick={addChange} className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent">
            <Plus size={12} /> Adicionar alteração
          </button>

          <button
            type="button"
            onClick={() => onDelete(selected.id)}
            className="mt-3 flex items-center gap-1.5 px-2 py-1 rounded-md border border-line text-[12px] text-ink-3 hover:text-danger hover:border-danger/50"
          >
            <Trash2 size={12} /> Excluir efeito
          </button>
        </Section>
      )}
    </div>
  );
}
