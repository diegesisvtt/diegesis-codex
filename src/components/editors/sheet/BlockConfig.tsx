// Painel flutuante de configuração do bloco selecionado (modo edição),
// no espírito do style panel do tldraw: vidro, vertical, à direita do canvas.
import type { BlockInput, SheetBlock } from '@shared/sheetLayout';

export function BlockConfig({
  block,
  onChange,
}: {
  block: SheetBlock;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="w-56 rounded-xl border border-line-strong bg-overlay/95 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.55)] p-3 flex flex-col gap-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-3 select-none">Bloco · {block.type}</div>
      {(block.type === 'field' || block.type === 'derived' || block.type === 'identity') && (
        <ConfigInput label="label" value={block.label} onChange={(v) => onChange({ label: v })} />
      )}
      {block.type === 'field' && (
        <>
          <ConfigInput label="path" value={block.path} mono onChange={(v) => onChange({ path: v })} />
          <ConfigSelect
            label="tipo"
            value={block.input}
            options={[
              ['number', 'número'],
              ['text', 'texto'],
              ['checkbox', 'checkbox'],
              ['die', 'dado'],
            ]}
            onChange={(v) => onChange({ input: v as BlockInput })}
          />
        </>
      )}
      {block.type === 'derived' && <ConfigInput label="path" value={block.path} mono onChange={(v) => onChange({ path: v })} />}
      {block.type === 'identity' && <ConfigInput label="key" value={block.key} mono onChange={(v) => onChange({ key: v })} />}
      {block.type === 'rolls' && (
        <ConfigInput
          label="templates (vírgula — vazio = todos)"
          value={block.templates.join(', ')}
          mono
          onChange={(v) => onChange({ templates: v.split(',').map((t) => t.trim()).filter(Boolean) })}
        />
      )}
      {block.type === 'section' && <ConfigInput label="título" value={block.title} onChange={(v) => onChange({ title: v })} />}
      {(block.type === 'title' || block.type === 'effects' || block.type === 'text') && (
        <span className="text-[11.5px] text-ink-3 leading-snug">Sem opções — arraste, redimensione ou edite o conteúdo no bloco.</span>
      )}
    </div>
  );
}

function ConfigInput({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] text-ink-3">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={`w-full bg-app/60 text-[12px] text-ink-1 outline-none border border-line rounded-md px-2 py-1 focus:border-sheet/50 ${mono ? 'font-mono' : ''}`}
      />
    </label>
  );
}

function ConfigSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10.5px] text-ink-3">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-app/60 text-[12px] text-ink-1 outline-none border border-line rounded-md px-2 py-1 focus:border-sheet/50"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-elevated">
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
