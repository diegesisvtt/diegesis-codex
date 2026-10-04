// Editor de Ficha de Personagem (diegesis/sheet) — SheetEngine do
// @diegesis/sheet: base editável, pipeline de efeitos (apply/enable/remove),
// valores computados com audit trail ("por que CA é 14?") e roll templates
// que alimentam o histórico global ('roller:rolled').
import { useEffect, useRef, useState } from 'react';
import { Dices, HelpCircle, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  SheetEngine,
  createSheetBus,
  getPath,
  setPath,
  type ComputedSheet,
  type EffectInstance,
} from '@diegesis/sheet';
import { evaluateRoll } from '@diegesis/dice-core';
import { toFormula } from '@diegesis/dice-notation';
import type { DocNode } from '@shared/types';
import { osrPack, parseSheet, serializeSheet } from '@shared/sheet';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';

/** campos base exibidos no grid principal (paths aninhados, alinhados ao statblock OSR) */
const BASE_FIELDS: { path: string; label: string; kind: 'number' | 'die' }[] = [
  { path: 'dv', label: 'DV', kind: 'number' },
  { path: 'dadoVida', label: 'Dado de Vida', kind: 'die' },
  { path: 'pv.atual', label: 'PV', kind: 'number' },
  { path: 'pv.max', label: 'PV Máx', kind: 'number' },
  { path: 'ca', label: 'CA', kind: 'number' },
  { path: 'atq', label: 'Atq', kind: 'number' },
  { path: 'moral', label: 'Moral', kind: 'number' },
  { path: 'desl.quad', label: 'Desl.', kind: 'number' },
  { path: 'save', label: 'Save', kind: 'number' },
];
const DIE_OPTIONS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
/** paths derivados exibidos como calculados (read-only) */
const DERIVED_FIELDS = ['pv.metade', 'desl.pes', 'desl.m'];

const ROLL_LABELS: Record<string, string> = {
  ataque: 'Ataque',
  dano: 'Dano',
  moral: 'Moral',
  save: 'Save',
};

export function SheetEditor({ doc }: { doc: DocNode }) {
  const { updateDocument, flushDocument, subscribeExternalDocChange } = useStore();
  const manager = usePluginManager();
  const engineRef = useRef<SheetEngine | null>(null);
  const [computed, setComputed] = useState<ComputedSheet | null>(null);
  const [nome, setNome] = useState('');
  const [auditPath, setAuditPath] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // motor por documento: cria no mount, persiste a cada 'computed', destrói no unmount
  useEffect(() => {
    const bus = createSheetBus();
    const engine = new SheetEngine(parseSheet(doc.content), { pack: osrPack, bus });
    engineRef.current = engine;
    // conteúdo que este editor conhece/persistiu — para distinguir mudanças externas de ecos
    let lastKnownContent = doc.content ?? serializeSheet(engine.document);
    const persistImmediate = () => {
      dirty.current = false;
      lastKnownContent = serializeSheet(engine.document);
      flushDocument(doc.id, { content: lastKnownContent });
    };
    const detach = engine.attach();
    const off = bus.on('computed', () => {
      setComputed(engine.compute());
      setNome(String((engine.document.identity.nome as string) ?? ''));
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const docId = doc.id;
      saveTimer.current = setTimeout(() => {
        dirty.current = false;
        lastKnownContent = serializeSheet(engine.document);
        updateDocument(docId, { content: lastKnownContent });
      }, 400);
    });
    // mudança externa (IA, outra aba, sync de realm): recarrega o motor em vez
    // de deixar o próximo save debounced sobrescrever a mudança
    const offExternal = subscribeExternalDocChange((external) => {
      if (external.id !== doc.id) return;
      if ((external.content ?? '') === lastKnownContent) return; // eco do próprio save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      dirty.current = false;
      lastKnownContent = external.content ?? '';
      engine.loadDocument(parseSheet(external.content));
      engine.refresh();
    });
    setComputed(engine.compute());
    setNome(String((engine.document.identity.nome as string) ?? doc.title ?? ''));
    return () => {
      off();
      offExternal();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // flush ANTES de destruir o motor (não depender de internals de destroy())
      if (dirty.current) persistImmediate();
      detach();
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const engine = () => engineRef.current;

  const setBaseValue = (path: string, value: unknown) => {
    engine()?.updateBase((base) => {
      const next = structuredClone(base);
      setPath(next, path, value);
      return next;
    });
  };

  const setIdentity = (key: string, value: unknown) => {
    const e = engine();
    if (!e) return;
    e.loadDocument({ ...e.document, identity: { ...e.document.identity, [key]: value } });
    e.refresh();
  };

  const rollTemplate = (templateId: string) => {
    const e = engine();
    if (!e) return;
    try {
      const expr = e.buildRoll(templateId);
      const roll = evaluateRoll(expr, { scope: e.compute().scope });
      const formula = toFormula(expr);
      manager.events.emit('roller:rolled', {
        tableTitle: `${doc.title || 'Ficha'} — ${ROLL_LABELS[templateId] ?? templateId}`,
        steps: [{ title: doc.title || 'Ficha', formula, roll, text: `Total: ${String(roll.value)}` }],
      });
    } catch (err) {
      console.error('[sheet] roll failed', err);
    }
  };

  const values = computed?.values ?? {};
  const baseValue = (path: string): unknown => (computed ? getPath(computed.values, path) : undefined);
  const auditFor = auditPath ? (computed?.audit ?? []).filter((a) => a.path === auditPath) : [];
  const effectLabel = (fx: EffectInstance) =>
    fx.ref ? (engine()?.getDefinition(fx.ref)?.label ?? fx.ref) : (fx.inline?.label ?? 'Efeito');

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-app">
      <div className="max-w-[720px] mx-auto px-6 py-5 flex flex-col gap-6">
        {/* identidade */}
        <div>
          <input
            value={nome}
            onChange={(e) => setIdentity('nome', e.target.value)}
            placeholder="Nome do personagem"
            spellCheck={false}
            className="w-full bg-transparent text-[22px] font-semibold text-ink-1 outline-none placeholder:text-ink-3"
          />
          <div className="text-[11px] text-ink-3 mt-0.5 select-none">
            {osrPack.id}@{osrPack.version}
          </div>
        </div>

        {/* stats base */}
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2 select-none">Atributos</h2>
          <div className="grid grid-cols-4 gap-2">
            {BASE_FIELDS.map((f) => (
              <label key={f.path} className="rounded-lg border border-line bg-elevated/60 px-2.5 py-2 flex flex-col gap-1">
                <span className="text-[10.5px] text-ink-3 select-none">{f.label}</span>
                {f.kind === 'die' ? (
                  <select
                    value={String(baseValue(f.path) ?? 'd8')}
                    onChange={(e) => setBaseValue(f.path, e.target.value)}
                    className="bg-transparent text-[14px] font-mono text-ink-1 outline-none"
                  >
                    {DIE_OPTIONS.map((d) => (
                      <option key={d} value={d} className="bg-elevated">
                        {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={typeof baseValue(f.path) === 'number' ? (baseValue(f.path) as number) : 0}
                    onChange={(e) => setBaseValue(f.path, Number(e.target.value))}
                    className="bg-transparent text-[14px] font-mono text-ink-1 outline-none [appearance:textfield]"
                  />
                )}
              </label>
            ))}
          </div>
          {/* derivados (read-only, clicável p/ audit trail) */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {DERIVED_FIELDS.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => setAuditPath(auditPath === path ? null : path)}
                title="Por quê este valor?"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11.5px] font-mono transition-colors ${
                  auditPath === path
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-elevated/40 text-ink-2 hover:text-ink-1'
                }`}
              >
                {path} = {String(getPath(values, path) ?? '—')}
                <HelpCircle size={11} className="text-ink-3" />
              </button>
            ))}
          </div>
        </section>

        {/* rolagens */}
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2 select-none">Rolagens</h2>
          <div className="flex gap-2 flex-wrap">
            {Object.keys(osrPack.rollTemplates ?? {}).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => rollTemplate(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-elevated/60 text-[12.5px] text-ink-1 hover:border-accent/50 hover:bg-accent-soft transition-colors"
              >
                <Dices size={13} className="text-sheet" />
                {ROLL_LABELS[id] ?? id}
              </button>
            ))}
          </div>
        </section>

        {/* efeitos */}
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2 select-none">Efeitos</h2>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {(osrPack.definitions ?? []).map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => engine()?.applyEffect(def.id, { source: { kind: 'manual' } })}
                title={def.label}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[11.5px] text-ink-2 hover:text-ink-1 hover:border-sheet/50 transition-colors"
              >
                <Plus size={11} /> {def.label}
              </button>
            ))}
          </div>
          {computed && computed.effects.length === 0 && (
            <div className="text-[12px] text-ink-3">Nenhum efeito ativo.</div>
          )}
          <div className="flex flex-col gap-1">
            {(computed?.effects ?? []).map((fx) => (
              <div
                key={fx.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-elevated/60 px-3 py-1.5"
              >
                <Sparkles size={12} className={fx.enabled ? 'text-sheet' : 'text-ink-3'} />
                <span className={`text-[12.5px] ${fx.enabled ? 'text-ink-1' : 'text-ink-3 line-through'}`}>
                  {effectLabel(fx)}
                </span>
                <button
                  type="button"
                  onClick={() => engine()?.setEnabled(fx.id, !fx.enabled)}
                  className="ml-auto text-[11px] text-ink-3 hover:text-ink-1 transition-colors"
                >
                  {fx.enabled ? 'desativar' : 'ativar'}
                </button>
                <button
                  type="button"
                  onClick={() => engine()?.removeEffect(fx.id)}
                  className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(computed?.suppressed ?? []).map((s) => (
              <div
                key={s.instance.id}
                className="flex items-center gap-2 rounded-lg border border-line/50 px-3 py-1.5 opacity-60"
              >
                <Sparkles size={12} className="text-ink-3" />
                <span className="text-[12px] text-ink-3">
                  {effectLabel(s.instance)} — suprimido ({s.reason})
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* audit trail */}
        {auditPath && (
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2 select-none">
              Por que {auditPath} é {String(getPath(values, auditPath) ?? '—')}?
            </h2>
            {auditFor.length === 0 ? (
              <div className="text-[12px] text-ink-3">Valor direto da base, sem efeitos.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {auditFor.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-baseline gap-2 rounded-lg border border-line bg-elevated/60 px-3 py-1.5 text-[12px]"
                  >
                    <span className="text-ink-3 font-mono text-[10.5px] uppercase">{a.pass}</span>
                    <span className="text-ink-1">{a.effectId === 'system' ? 'sistema' : a.effectId}</span>
                    {a.op && <span className="text-ink-3 font-mono">{a.op}</span>}
                    <span className="ml-auto font-mono text-ink-2">→ {JSON.stringify(a.result)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
