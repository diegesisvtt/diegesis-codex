// Renderers do conteúdo de cada tipo de bloco da ficha (modo jogo e edição).
// Extrai o JSX original do SheetEditor estático para componentes por bloco.
import { Dices, HelpCircle, Plus, Sparkles, Trash2 } from 'lucide-react';
import { getPath, type ComputedSheet, type EffectInstance } from '@diegesis/sheet';
import type { SheetBlock } from '@shared/sheetLayout';
import { osrPack } from '@shared/sheet';

export const DIE_OPTIONS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

export const ROLL_LABELS: Record<string, string> = {
  ataque: 'Ataque',
  dano: 'Dano',
  moral: 'Moral',
  save: 'Save',
};

export interface SheetBlockCtx {
  computed: ComputedSheet | null;
  nome: string;
  editing: boolean;
  auditPath: string | null;
  setAuditPath: (p: string | null) => void;
  setBaseValue: (path: string, value: unknown) => void;
  setIdentity: (key: string, value: unknown) => void;
  identityValue: (key: string) => string;
  rollTemplate: (id: string) => void;
  applyEffect: (defId: string) => void;
  setEffectEnabled: (id: string, on: boolean) => void;
  removeEffect: (id: string) => void;
  effectLabel: (fx: EffectInstance) => string;
  updateBlock: (id: string, patch: Record<string, unknown>) => void;
}

export function SheetBlockContent({ block, ctx }: { block: SheetBlock; ctx: SheetBlockCtx }) {
  switch (block.type) {
    case 'title':
      return <TitleBlock ctx={ctx} />;
    case 'section':
      return <SectionBlock block={block} ctx={ctx} />;
    case 'field':
      return <FieldBlock block={block} ctx={ctx} />;
    case 'derived':
      return <DerivedBlock block={block} ctx={ctx} />;
    case 'identity':
      return <IdentityBlock block={block} ctx={ctx} />;
    case 'rolls':
      return <RollsBlock block={block} ctx={ctx} />;
    case 'effects':
      return <EffectsBlock ctx={ctx} />;
    case 'text':
      return <TextBlock block={block} ctx={ctx} />;
  }
}

function TitleBlock({ ctx }: { ctx: SheetBlockCtx }) {
  return (
    <div className="h-full flex flex-col justify-center">
      <input
        value={ctx.nome}
        onChange={(e) => ctx.setIdentity('nome', e.target.value)}
        placeholder="Nome do personagem"
        spellCheck={false}
        className="w-full bg-transparent text-[22px] font-semibold text-ink-1 outline-none placeholder:text-ink-3"
      />
      <div className="text-[11px] text-ink-3 mt-0.5 select-none">
        {osrPack.id}@{osrPack.version}
      </div>
    </div>
  );
}

function SectionBlock({ block, ctx }: { block: SheetBlock & { type: 'section' }; ctx: SheetBlockCtx }) {
  if (ctx.editing) {
    return (
      <input
        value={block.title}
        onChange={(e) => ctx.updateBlock(block.id, { title: e.target.value })}
        placeholder="Título da seção"
        spellCheck={false}
        className="w-full h-full bg-transparent text-[11px] font-semibold uppercase tracking-wide text-ink-3 outline-none placeholder:text-ink-3/60"
      />
    );
  }
  return (
    <div className="h-full flex items-end">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 select-none">{block.title}</h2>
    </div>
  );
}

function FieldBlock({ block, ctx }: { block: SheetBlock & { type: 'field' }; ctx: SheetBlockCtx }) {
  const value = ctx.computed ? getPath(ctx.computed.values, block.path) : undefined;
  return (
    <label className="h-full rounded-lg border border-line bg-elevated/60 px-2.5 py-2 flex flex-col gap-1 overflow-hidden">
      <span className="text-[10.5px] text-ink-3 select-none truncate">{block.label}</span>
      {block.input === 'die' ? (
        <select
          value={String(value ?? 'd8')}
          onChange={(e) => ctx.setBaseValue(block.path, e.target.value)}
          className="bg-transparent text-[14px] font-mono text-ink-1 outline-none"
        >
          {DIE_OPTIONS.map((d) => (
            <option key={d} value={d} className="bg-elevated">
              {d}
            </option>
          ))}
        </select>
      ) : block.input === 'checkbox' ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => ctx.setBaseValue(block.path, e.target.checked)}
          className="w-4 h-4 accent-[var(--color-sheet)]"
        />
      ) : block.input === 'text' ? (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => ctx.setBaseValue(block.path, e.target.value)}
          spellCheck={false}
          className="bg-transparent text-[13px] text-ink-1 outline-none"
        />
      ) : (
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => ctx.setBaseValue(block.path, Number(e.target.value))}
          className="bg-transparent text-[14px] font-mono text-ink-1 outline-none [appearance:textfield]"
        />
      )}
    </label>
  );
}

function DerivedBlock({ block, ctx }: { block: SheetBlock & { type: 'derived' }; ctx: SheetBlockCtx }) {
  const value = ctx.computed ? getPath(ctx.computed.values, block.path) : undefined;
  const active = ctx.auditPath === block.path;
  return (
    <button
      type="button"
      onClick={() => ctx.setAuditPath(active ? null : block.path)}
      title="Por quê este valor?"
      className={`h-full w-full rounded-lg border px-2.5 py-2 flex flex-col gap-1 items-start overflow-hidden transition-colors ${
        active ? 'border-accent bg-accent-soft' : 'border-line bg-elevated/40 hover:border-accent/40'
      }`}
    >
      <span className="text-[10.5px] text-ink-3 select-none flex items-center gap-1 truncate">
        {block.label}
        <HelpCircle size={10} />
      </span>
      <span className={`text-[14px] font-mono ${active ? 'text-accent-ink' : 'text-ink-1'}`}>{String(value ?? '—')}</span>
    </button>
  );
}

function IdentityBlock({ block, ctx }: { block: SheetBlock & { type: 'identity' }; ctx: SheetBlockCtx }) {
  const current = ctx.identityValue(block.key);
  return (
    <label className="h-full rounded-lg border border-line bg-elevated/60 px-2.5 py-2 flex flex-col gap-1 overflow-hidden">
      <span className="text-[10.5px] text-ink-3 select-none truncate">{block.label}</span>
      {block.multiline ? (
        <textarea
          value={current}
          onChange={(e) => ctx.setIdentity(block.key, e.target.value)}
          spellCheck={false}
          className="flex-1 bg-transparent text-[12.5px] text-ink-1 outline-none resize-none custom-scrollbar"
        />
      ) : (
        <input
          value={current}
          onChange={(e) => ctx.setIdentity(block.key, e.target.value)}
          spellCheck={false}
          className="bg-transparent text-[13px] text-ink-1 outline-none"
        />
      )}
    </label>
  );
}

function RollsBlock({ block, ctx }: { block: SheetBlock & { type: 'rolls' }; ctx: SheetBlockCtx }) {
  const templates = block.templates.length > 0 ? block.templates : Object.keys(osrPack.rollTemplates ?? {});
  return (
    <div className="h-full flex gap-2 flex-wrap content-start overflow-y-auto custom-scrollbar">
      {templates.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => ctx.rollTemplate(id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-elevated/60 text-[12.5px] text-ink-1 hover:border-accent/50 hover:bg-accent-soft transition-colors"
        >
          <Dices size={13} className="text-sheet" />
          {ROLL_LABELS[id] ?? id}
        </button>
      ))}
    </div>
  );
}

function EffectsBlock({ ctx }: { ctx: SheetBlockCtx }) {
  const computed = ctx.computed;
  return (
    <div className="h-full overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
      <div className="flex gap-1.5 flex-wrap">
        {(osrPack.definitions ?? []).map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => ctx.applyEffect(def.id)}
            title={def.label}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[11.5px] text-ink-2 hover:text-ink-1 hover:border-sheet/50 transition-colors"
          >
            <Plus size={11} /> {def.label}
          </button>
        ))}
      </div>
      {computed && computed.effects.length === 0 && <div className="text-[12px] text-ink-3">Nenhum efeito ativo.</div>}
      {(computed?.effects ?? []).map((fx) => (
        <div key={fx.id} className="flex items-center gap-2 rounded-lg border border-line bg-elevated/60 px-3 py-1.5">
          <Sparkles size={12} className={fx.enabled ? 'text-sheet' : 'text-ink-3'} />
          <span className={`text-[12.5px] ${fx.enabled ? 'text-ink-1' : 'text-ink-3 line-through'}`}>
            {ctx.effectLabel(fx)}
          </span>
          <button
            type="button"
            onClick={() => ctx.setEffectEnabled(fx.id, !fx.enabled)}
            className="ml-auto text-[11px] text-ink-3 hover:text-ink-1 transition-colors"
          >
            {fx.enabled ? 'desativar' : 'ativar'}
          </button>
          <button
            type="button"
            onClick={() => ctx.removeEffect(fx.id)}
            className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {(computed?.suppressed ?? []).map((s) => (
        <div key={s.instance.id} className="flex items-center gap-2 rounded-lg border border-line/50 px-3 py-1.5 opacity-60">
          <Sparkles size={12} className="text-ink-3" />
          <span className="text-[12px] text-ink-3">
            {ctx.effectLabel(s.instance)} — suprimido ({s.reason})
          </span>
        </div>
      ))}
    </div>
  );
}

function TextBlock({ block, ctx }: { block: SheetBlock & { type: 'text' }; ctx: SheetBlockCtx }) {
  if (ctx.editing) {
    return (
      <textarea
        value={block.text}
        onChange={(e) => ctx.updateBlock(block.id, { text: e.target.value })}
        placeholder="Anotação..."
        spellCheck={false}
        className="h-full w-full rounded-lg border border-line bg-elevated/40 px-2.5 py-2 text-[12.5px] text-ink-1 outline-none resize-none custom-scrollbar placeholder:text-ink-3"
      />
    );
  }
  return (
    <div className="h-full rounded-lg border border-line bg-elevated/40 px-2.5 py-2 text-[12.5px] text-ink-2 whitespace-pre-wrap overflow-y-auto custom-scrollbar">
      {block.text}
    </div>
  );
}
