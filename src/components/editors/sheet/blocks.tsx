// Renderers do conteúdo de cada tipo de bloco da ficha (modo jogo e edição).
// Visual premium dark-fantasy: título hero com ornamentos, stat cards com
// numerais display, seções com filetes, chips de rolagem dourados.
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
  /** definições aplicáveis (pack + customizadas do reino) */
  effectDefs: { id: string; label: string }[];
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

/** filete ornamental com losango central — motivo visual recorrente da ficha */
function Ornament({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-sheet/35 to-sheet/60" />
      <div className="w-1.5 h-1.5 rotate-45 border border-sheet/70 bg-sheet/20" />
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-sheet/35 to-sheet/60" />
    </div>
  );
}

function TitleBlock({ ctx }: { ctx: SheetBlockCtx }) {
  const tipo = ctx.identityValue('tipo');
  return (
    <div className="h-full flex flex-col justify-center gap-1 select-text">
      <Ornament />
      <input
        value={ctx.nome}
        onChange={(e) => ctx.setIdentity('nome', e.target.value)}
        placeholder="Nome do personagem"
        spellCheck={false}
        className="w-full bg-transparent text-center font-display text-[30px] leading-tight font-semibold tracking-[0.06em] text-sheet-strong outline-none placeholder:text-ink-3/60 placeholder:font-display drop-shadow-[0_2px_10px_rgba(56,189,248,0.18)]"
      />
      {tipo && (
        <div className="text-center text-[10.5px] uppercase tracking-[0.28em] text-ink-3 select-none">{tipo}</div>
      )}
    </div>
  );
}

function SectionBlock({ block, ctx }: { block: SheetBlock & { type: 'section' }; ctx: SheetBlockCtx }) {
  if (ctx.editing) {
    return (
      <div className="h-full flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <input
          value={block.title}
          onChange={(e) => ctx.updateBlock(block.id, { title: e.target.value })}
          placeholder="Título da seção"
          spellCheck={false}
          className="bg-transparent text-center font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-ink-2 outline-none placeholder:text-ink-3/50"
        />
        <div className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return (
    <div className="h-full flex items-center gap-3 select-none">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-sheet/30" />
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-sheet/90">{block.title}</h2>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-sheet/30" />
    </div>
  );
}

const CARD =
  'h-full w-full rounded-xl border border-line bg-gradient-to-b from-elevated/90 to-app/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_2px_10px_rgba(0,0,0,0.35)] transition-colors';

function FieldBlock({ block, ctx }: { block: SheetBlock & { type: 'field' }; ctx: SheetBlockCtx }) {
  const value = ctx.computed ? getPath(ctx.computed.values, block.path) : undefined;
  return (
    <label
      className={`${CARD} px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 overflow-hidden cursor-text hover:border-sheet/35`}
    >
      <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-3 select-none truncate max-w-full">
        {block.label}
      </span>
      {block.input === 'die' ? (
        <select
          value={String(value ?? 'd8')}
          onChange={(e) => ctx.setBaseValue(block.path, e.target.value)}
          className="bg-transparent text-center font-display text-[19px] font-semibold text-ink-1 outline-none cursor-pointer"
        >
          {DIE_OPTIONS.map((d) => (
            <option key={d} value={d} className="bg-elevated text-[13px]">
              {d}
            </option>
          ))}
        </select>
      ) : block.input === 'checkbox' ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => ctx.setBaseValue(block.path, e.target.checked)}
          className="w-4 h-4 accent-[var(--color-sheet)] cursor-pointer"
        />
      ) : block.input === 'text' ? (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => ctx.setBaseValue(block.path, e.target.value)}
          spellCheck={false}
          className="w-full bg-transparent text-center text-[13.5px] text-ink-1 outline-none"
        />
      ) : (
        <input
          type="number"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => ctx.setBaseValue(block.path, Number(e.target.value))}
          className="w-full bg-transparent text-center font-display text-[21px] font-semibold text-ink-1 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
      className={`${CARD} px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 overflow-hidden ${
        active ? 'border-sheet/60 bg-sheet-soft' : 'hover:border-sheet/35'
      }`}
    >
      <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-3 select-none flex items-center gap-1 truncate max-w-full">
        {block.label}
        <HelpCircle size={9} className="shrink-0 opacity-70" />
      </span>
      <span className={`font-mono text-[15px] ${active ? 'text-sheet-strong' : 'text-ink-2'}`}>{String(value ?? '—')}</span>
    </button>
  );
}

function IdentityBlock({ block, ctx }: { block: SheetBlock & { type: 'identity' }; ctx: SheetBlockCtx }) {
  const current = ctx.identityValue(block.key);
  return (
    <label className={`${CARD} px-3 py-2 flex flex-col gap-1 overflow-hidden hover:border-sheet/35`}>
      <span className="text-[9.5px] uppercase tracking-[0.16em] text-ink-3 select-none truncate">{block.label}</span>
      {block.multiline ? (
        <textarea
          value={current}
          onChange={(e) => ctx.setIdentity(block.key, e.target.value)}
          spellCheck={false}
          className="flex-1 bg-transparent text-[12.5px] leading-relaxed text-ink-1 outline-none resize-none custom-scrollbar"
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
    <div className="h-full flex gap-2 flex-wrap content-start overflow-y-auto custom-scrollbar py-0.5">
      {templates.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => ctx.rollTemplate(id)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-line bg-elevated/70 text-[12px] font-medium text-ink-1 hover:border-sheet/60 hover:text-sheet-strong hover:shadow-[0_0_14px_rgba(56,189,248,0.28)] active:scale-[0.97] transition-all"
        >
          <Dices size={13} className="text-sheet" />
          {ROLL_LABELS[id] ?? id}
        </button>
      ))}
    </div>
  );
}

export function EffectsBlock({ ctx }: { ctx: SheetBlockCtx }) {
  const computed = ctx.computed;
  return (
    <div className="h-full overflow-y-auto custom-scrollbar flex flex-col gap-1.5 py-0.5">
      <div className="flex gap-1.5 flex-wrap">
        {ctx.effectDefs.length === 0 && (
          <div className="text-[12px] text-ink-3">
            Nenhum efeito definido — crie efeitos globais em Configurações → Fichas.
          </div>
        )}
        {ctx.effectDefs.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => ctx.applyEffect(def.id)}
            title={def.label}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-line text-[11px] text-ink-3 hover:text-sheet-strong hover:border-sheet/50 transition-colors"
          >
            <Plus size={10} /> {def.label}
          </button>
        ))}
      </div>
      {computed && computed.effects.length === 0 && <div className="text-[12px] text-ink-3">Nenhum efeito ativo.</div>}
      {(computed?.effects ?? []).map((fx) => (
        <div
          key={fx.id}
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
            fx.enabled ? 'border-sheet/30 bg-sheet-soft' : 'border-line bg-elevated/50'
          }`}
        >
          <Sparkles size={12} className={fx.enabled ? 'text-sheet' : 'text-ink-3'} />
          <span className={`text-[12.5px] ${fx.enabled ? 'text-sheet-strong' : 'text-ink-3 line-through'}`}>
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
        className={`${CARD} px-3 py-2 text-[12.5px] leading-relaxed text-ink-1 outline-none resize-none custom-scrollbar placeholder:text-ink-3`}
      />
    );
  }
  return (
    <div className={`${CARD} px-3 py-2 text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap overflow-y-auto custom-scrollbar`}>
      {block.text}
    </div>
  );
}
