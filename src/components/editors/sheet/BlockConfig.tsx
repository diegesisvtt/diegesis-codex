// Propriedades do bloco selecionado, renderizadas dentro do PanelShell docked
// (mesmo padrão visual do painel do hexmap). Edita label, path, tipo de input,
// key de identidade e templates de rolagem.
import type { BlockInput, SheetBlock } from '@shared/sheetLayout';
import { Field, Section, Select, TextInput } from '../../ui/fields';

export function BlockConfig({
  block,
  onChange,
  tabOptions,
  onAssignTab,
}: {
  block: SheetBlock;
  onChange: (patch: Record<string, unknown>) => void;
  /** abas disponíveis para mover o bloco (nulo = esconder seletor) */
  tabOptions?: { id: string; title: string }[];
  onAssignTab?: (id: string) => void;
}) {
  return (
    <div>
      <Section title={`Bloco · ${block.type}`}>
        {tabOptions && onAssignTab && (
          <Field label="aba">
            <Select
              value={block.tab ?? (tabOptions[0]?.id ?? '')}
              onChange={onAssignTab}
              options={tabOptions.map((t) => [t.id, t.title])}
            />
          </Field>
        )}
        {(block.type === 'field' || block.type === 'derived' || block.type === 'identity') && (
          <Field label="label">
            <TextInput value={block.label} onChange={(v) => onChange({ label: v })} />
          </Field>
        )}
        {block.type === 'field' && (
          <>
            <Field label="path">
              <TextInput value={block.path} mono onChange={(v) => onChange({ path: v })} />
            </Field>
            <Field label="tipo">
              <Select
                value={block.input}
                onChange={(v) => onChange({ input: v as BlockInput })}
                options={[
                  ['number', 'número'],
                  ['text', 'texto'],
                  ['checkbox', 'checkbox'],
                  ['die', 'dado'],
                ]}
              />
            </Field>
          </>
        )}
        {block.type === 'derived' && (
          <Field label="path">
            <TextInput value={block.path} mono onChange={(v) => onChange({ path: v })} />
          </Field>
        )}
        {block.type === 'identity' && (
          <Field label="key">
            <TextInput value={block.key} mono onChange={(v) => onChange({ key: v })} />
          </Field>
        )}
        {block.type === 'section' && (
          <Field label="título">
            <TextInput value={block.title} onChange={(v) => onChange({ title: v })} />
          </Field>
        )}
        {block.type === 'rolls' && (
          <Field label="templates">
            <TextInput
              value={block.templates.join(', ')}
              mono
              onChange={(v) => onChange({ templates: v.split(',').map((t) => t.trim()).filter(Boolean) })}
            />
          </Field>
        )}
        {(block.type === 'title' || block.type === 'effects' || block.type === 'text') && (
          <div className="text-[11.5px] text-ink-3 leading-snug py-1">
            Sem opções — arraste, redimensione ou edite o conteúdo direto no bloco.
          </div>
        )}
      </Section>
    </div>
  );
}
