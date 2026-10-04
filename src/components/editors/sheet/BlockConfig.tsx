// Painel de configuração do bloco selecionado (modo edição): edita label,
// path, tipo de input, key de identidade e templates de rolagem.
import type { BlockInput, SheetBlock } from '@shared/sheetLayout';

export function BlockConfig({
  block,
  onChange,
}: {
  block: SheetBlock;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap items-center rounded-lg border border-line bg-elevated/80 px-3 py-2">
      <span className="text-[10.5px] uppercase tracking-wide text-ink-3 select-none">Bloco:</span>
      {(block.type === 'field' || block.type === 'derived' || block.type === 'identity') && (
        <ConfigInput label="label" value={block.label} onChange={(v) => onChange({ label: v })} />
      )}
      {block.type === 'field' && (
        <>
          <ConfigInput label="path" value={block.path} mono onChange={(v) => onChange({ path: v })} />
          <label className="flex items-center gap-1 text-[11px] text-ink-3">
            tipo
            <select
              value={block.input}
              onChange={(e) => onChange({ input: e.target.value as BlockInput })}
              className="bg-transparent text-[11.5px] text-ink-1 outline-none border border-line rounded px-1 py-0.5"
            >
              <option value="number" className="bg-elevated">número</option>
              <option value="text" className="bg-elevated">texto</option>
              <option value="checkbox" className="bg-elevated">checkbox</option>
              <option value="die" className="bg-elevated">dado</option>
            </select>
          </label>
        </>
      )}
      {block.type === 'derived' && (
        <ConfigInput label="path" value={block.path} mono onChange={(v) => onChange({ path: v })} />
      )}
      {block.type === 'identity' && (
        <ConfigInput label="key" value={block.key} mono onChange={(v) => onChange({ key: v })} />
      )}
      {block.type === 'rolls' && (
        <ConfigInput
          label="templates (vírgula, vazio = todos)"
          value={block.templates.join(', ')}
          mono
          wide
          onChange={(v) =>
            onChange({ templates: v.split(',').map((t) => t.trim()).filter(Boolean) })
          }
        />
      )}
      {block.type === 'section' && (
        <ConfigInput label="título" value={block.title} onChange={(v) => onChange({ title: v })} />
      )}
      {(block.type === 'title' || block.type === 'effects' || block.type === 'text') && (
        <span className="text-[11.5px] text-ink-3">Sem opções — arraste, redimensione ou edite o conteúdo direto no bloco.</span>
      )}
    </div>
  );
}

function ConfigInput({
  label,
  value,
  onChange,
  mono,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-ink-3">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={`bg-transparent text-[11.5px] text-ink-1 outline-none border border-line rounded px-1.5 py-0.5 ${mono ? 'font-mono' : ''} ${wide ? 'w-56' : 'w-28'}`}
      />
    </label>
  );
}
