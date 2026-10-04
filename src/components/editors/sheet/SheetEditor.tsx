// Editor de Ficha de Personagem (diegesis/sheet) — SheetEngine do
// @diegesis/sheet: base editável, pipeline de efeitos (apply/enable/remove),
// valores computados com audit trail ("por que CA é 14?") e roll templates
// que alimentam o histórico global ('roller:rolled'). O layout é um grid
// customizável por drag and drop (modo edição), persistido no JSON da ficha
// com herança do padrão por sistema (RealmSettings.sheetLayouts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, RotateCcw, Save } from 'lucide-react';
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
import { osrPack, parseSheet, serializeSheet, type SheetDocumentWithLayout } from '@shared/sheet';
import {
  clampBlock,
  defaultSheetLayout,
  parseSheetLayout,
  type SheetBlock,
  type SheetLayout,
} from '@shared/sheetLayout';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';
import { SheetCanvas } from './SheetCanvas';
import { SheetBlockContent, ROLL_LABELS, type SheetBlockCtx } from './blocks';
import { SheetPalette, paletteItem } from './SheetPalette';
import { BlockConfig } from './BlockConfig';

export function SheetEditor({ doc }: { doc: DocNode }) {
  const { updateDocument, flushDocument, subscribeExternalDocChange, uiState, saveUiState, activeRealmId } = useStore();
  const manager = usePluginManager();
  const engineRef = useRef<SheetEngine | null>(null);
  const [computed, setComputed] = useState<ComputedSheet | null>(null);
  const [nome, setNome] = useState('');
  const [auditPath, setAuditPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // layout: override da ficha (null = herda padrão do sistema ou embutido)
  const realmDefault = useMemo(() => {
    const raw = activeRealmId ? uiState.realmSettings?.[activeRealmId]?.sheetLayouts?.[osrPack.id] : undefined;
    return parseSheetLayout(raw);
  }, [uiState.realmSettings, activeRealmId]);
  const [layoutOverride, setLayoutOverride] = useState<SheetLayout | null>(
    () => (parseSheet(doc.content) as SheetDocumentWithLayout).layout ?? null,
  );
  const layout = layoutOverride ?? realmDefault ?? defaultSheetLayout();
  const layoutRef = useRef<SheetLayout | null>(layoutOverride);
  layoutRef.current = layoutOverride;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const scheduleSaveRef = useRef<(() => void) | null>(null);

  // conteúdo serializado = documento do motor + layout (override) da ficha
  const buildContent = (): string => {
    const e = engineRef.current;
    const base = (e ? e.document : parseSheet(doc.content)) as SheetDocumentWithLayout;
    const next: SheetDocumentWithLayout = { ...base };
    if (layoutRef.current) next.layout = layoutRef.current;
    else delete next.layout;
    return serializeSheet(next);
  };
  const buildContentRef = useRef(buildContent);
  buildContentRef.current = buildContent;

  // motor por documento: cria no mount, persiste a cada 'computed', destrói no unmount
  useEffect(() => {
    const bus = createSheetBus();
    const engine = new SheetEngine(parseSheet(doc.content), { pack: osrPack, bus });
    engineRef.current = engine;
    // conteúdo que este editor conhece/persistiu — para distinguir mudanças externas de ecos
    let lastKnownContent = doc.content ?? buildContentRef.current();
    const scheduleSave = () => {
      dirty.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const docId = doc.id;
      saveTimer.current = setTimeout(() => {
        dirty.current = false;
        lastKnownContent = buildContentRef.current();
        updateDocument(docId, { content: lastKnownContent });
      }, 400);
    };
    scheduleSaveRef.current = scheduleSave;
    const persistImmediate = () => {
      dirty.current = false;
      lastKnownContent = buildContentRef.current();
      flushDocument(doc.id, { content: lastKnownContent });
    };
    const detach = engine.attach();
    const off = bus.on('computed', () => {
      setComputed(engine.compute());
      setNome(String((engine.document.identity.nome as string) ?? ''));
      scheduleSave();
    });
    // mudança externa (IA, outra aba, sync de realm): recarrega o motor em vez
    // de deixar o próximo save debounced sobrescrever a mudança
    const offExternal = subscribeExternalDocChange((external) => {
      if (external.id !== doc.id) return;
      if ((external.content ?? '') === lastKnownContent) return; // eco do próprio save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      dirty.current = false;
      lastKnownContent = external.content ?? '';
      const parsed = parseSheet(external.content) as SheetDocumentWithLayout;
      setLayoutOverride(parsed.layout ?? null);
      engine.loadDocument(parsed);
      engine.refresh();
    });
    setComputed(engine.compute());
    setNome(String((engine.document.identity.nome as string) ?? doc.title ?? ''));
    return () => {
      off();
      offExternal();
      scheduleSaveRef.current = null;
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

  // ---------- mutações de layout (modo edição) ----------

  const mutateLayout = (fn: (l: SheetLayout) => SheetLayout) => {
    // fork automático: editar uma ficha herdada cria o override próprio dela
    const next = fn(layoutRef.current ?? realmDefault ?? defaultSheetLayout());
    layoutRef.current = next;
    setLayoutOverride(next);
    scheduleSaveRef.current?.();
  };

  const onMoveBlock = (id: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    mutateLayout((l) => ({
      ...l,
      blocks: l.blocks.map((b) => (b.id === id ? clampBlock(l, { ...b, x: b.x + dx, y: b.y + dy }) : b)),
    }));
  };

  const onResizeBlock = (id: string, w: number, h: number) => {
    mutateLayout((l) => ({
      ...l,
      blocks: l.blocks.map((b) => (b.id === id ? clampBlock(l, { ...b, w, h }) : b)),
    }));
  };

  const onRemoveBlock = (id: string) => {
    setSelectedId((sel) => (sel === id ? null : sel));
    mutateLayout((l) => ({ ...l, blocks: l.blocks.filter((b) => b.id !== id) }));
  };

  const onDropPalette = (kind: string, x: number, y: number) => {
    const item = paletteItem(kind);
    if (!item) return;
    const block = item.make(x, y);
    mutateLayout((l) => ({ ...l, blocks: [...l.blocks, clampBlock(l, block)] }));
    setSelectedId(block.id);
  };

  const updateBlock = (id: string, patch: Record<string, unknown>) => {
    mutateLayout((l) => ({
      ...l,
      blocks: l.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as SheetBlock) : b)),
    }));
  };

  /** grava o layout atual como padrão do sistema (realm) — novas fichas herdam */
  const saveAsSystemDefault = () => {
    if (!activeRealmId) return;
    const realmSettings = {
      ...(uiState.realmSettings ?? {}),
      [activeRealmId]: {
        ...(uiState.realmSettings?.[activeRealmId] ?? {}),
        sheetLayouts: {
          ...(uiState.realmSettings?.[activeRealmId]?.sheetLayouts ?? {}),
          [osrPack.id]: layout,
        },
      },
    };
    saveUiState({ realmSettings });
  };

  /** remove o override da ficha — volta a herdar o padrão do sistema/embutido */
  const resetToDefault = () => {
    layoutRef.current = null;
    setLayoutOverride(null);
    setSelectedId(null);
    scheduleSaveRef.current?.();
  };

  const values = computed?.values ?? {};
  const auditFor = auditPath ? (computed?.audit ?? []).filter((a) => a.path === auditPath) : [];
  const effectLabel = (fx: EffectInstance) =>
    fx.ref ? (engine()?.getDefinition(fx.ref)?.label ?? fx.ref) : (fx.inline?.label ?? 'Efeito');

  const blockCtx: SheetBlockCtx = {
    computed,
    nome,
    editing,
    auditPath,
    setAuditPath,
    setBaseValue,
    setIdentity,
    identityValue: (key) => String(engine()?.document.identity[key] ?? ''),
    rollTemplate,
    applyEffect: (defId) => engine()?.applyEffect(defId, { source: { kind: 'manual' } }),
    setEffectEnabled: (id, on) => engine()?.setEnabled(id, on),
    removeEffect: (id) => engine()?.removeEffect(id),
    effectLabel,
    updateBlock,
  };

  const selectedBlock = selectedId ? layout.blocks.find((b) => b.id === selectedId) : undefined;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-app" onClick={() => setSelectedId(null)}>
      <div className="max-w-[860px] mx-auto px-6 py-5 flex flex-col gap-3">
        {/* toolbar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(!editing);
              setSelectedId(null);
            }}
            title={editing ? 'Concluir edição do layout' : 'Customizar layout'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] transition-colors ${
              editing
                ? 'border-accent bg-accent-soft text-accent-ink'
                : 'border-line bg-elevated/60 text-ink-2 hover:text-ink-1 hover:border-accent/40'
            }`}
          >
            {editing ? <Check size={13} /> : <Pencil size={13} />}
            {editing ? 'Concluir' : 'Customizar'}
          </button>
          {editing && (
            <>
              <button
                type="button"
                onClick={saveAsSystemDefault}
                title="Usar este layout como padrão de todas as fichas do sistema"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-elevated/60 text-[12px] text-ink-2 hover:text-ink-1 hover:border-accent/40 transition-colors"
              >
                <Save size={13} />
                Salvar como padrão do sistema
              </button>
              {layoutOverride && (
                <button
                  type="button"
                  onClick={resetToDefault}
                  title="Remover layout próprio e voltar a herdar o padrão"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-elevated/60 text-[12px] text-ink-2 hover:text-ink-1 hover:border-accent/40 transition-colors"
                >
                  <RotateCcw size={13} />
                  Restaurar padrão
                </button>
              )}
              <span className="ml-auto text-[11px] text-ink-3 select-none">
                {layoutOverride ? 'layout próprio desta ficha' : 'herdando padrão do sistema'}
              </span>
            </>
          )}
        </div>

        <SheetCanvas
          layout={layout}
          editing={editing}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMoveBlock={onMoveBlock}
          onResizeBlock={onResizeBlock}
          onRemoveBlock={onRemoveBlock}
          onDropPalette={onDropPalette}
          renderContent={(b) => <SheetBlockContent block={b} ctx={blockCtx} />}
          header={
            editing ? (
              <div className="flex flex-col gap-2 mb-3">
                <SheetPalette />
                {selectedBlock && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <BlockConfig block={selectedBlock} onChange={(patch) => updateBlock(selectedBlock.id, patch)} />
                  </div>
                )}
              </div>
            ) : undefined
          }
        />

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
