// Editor de Ficha de Personagem (diegesis/sheet) — SheetEngine do
// @diegesis/sheet: base editável, pipeline de efeitos (apply/enable/remove),
// valores computados com audit trail ("por que CA é 14?") e roll templates
// que alimentam o histórico global ('roller:rolled'). O layout é um grid
// customizável por drag and drop com floating toolbar (modo edição) e
// modelos nomeados por reino (Personagem, Monstro/NPC, ...): a ficha herda
// o layout do modelo e pode sobrescrevê-lo individualmente.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Download, Gem, Pencil, RotateCcw, SlidersHorizontal, Sparkles, Upload } from 'lucide-react';
import {
  SheetEngine,
  createSheetBus,
  defineSystemPack,
  getPath,
  setPath,
  type ComputedSheet,
  type EffectInstance,
} from '@diegesis/sheet';
import { evaluateRoll } from '@diegesis/dice-core';
import { toFormula } from '@diegesis/dice-notation';
import type { DocNode } from '@shared/types';
import { osrPack, parseSheet, serializeSheet, stripUnknownEffects, SHEET_DOC_TYPE, type SheetDocumentWithLayout } from '@shared/sheet';
import { parseEffectDefinitions } from '@shared/sheetEffects';
import {
  blockTab,
  builtinSheetTemplates,
  clampBlock,
  defaultSheetLayout,
  newTemplateId,
  parseSheetLayout,
  parseSheetTemplate,
  sheetTabs,
  SHEET_FIXED_TABS,
  SHEET_TAB_EFEITOS,
  SHEET_TEMPLATE_PERSONAGEM,
  type SheetBlock,
  type SheetLayout,
  type SheetTemplate,
} from '@shared/sheetLayout';
import { useStore } from '../../../state/store';
import { usePluginManager } from '../../../plugins/manager';
import { SheetCanvas } from './SheetCanvas';
import { SheetBlockContent, EffectsBlock, ROLL_LABELS, type SheetBlockCtx } from './blocks';
import { FloatingToolbar, toolItem } from './FloatingToolbar';
import { BlockConfig } from './BlockConfig';
import { DockPanel, type Dock } from './DockPanel';
import { SheetTemplateMenu } from './SheetTemplateMenu';
import { SheetPageTabs } from './SheetPageTabs';
import {
  exportSheet as downloadSheet,
  exportTemplate as downloadTemplate,
  importSheetFile,
  importTemplateFile,
} from './sheetTransfer';

export function SheetEditor({ doc }: { doc: DocNode }) {
  const { updateDocument, flushDocument, subscribeExternalDocChange, uiState, saveUiState, activeRealmId, createDocument, openDocument } =
    useStore();
  const manager = usePluginManager();
  const engineRef = useRef<SheetEngine | null>(null);
  const [computed, setComputed] = useState<ComputedSheet | null>(null);
  const [nome, setNome] = useState('');
  const [auditPath, setAuditPath] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [armedTool, setArmedTool] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('geral');
  const dragGuardRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // ---------- painéis dockáveis (estilo VS Code) ----------
  // Apenas o painel de propriedades do bloco: efeitos globais vivem nas
  // Configurações → Fichas; a paleta de blocos é a floating toolbar.
  type PanelId = 'bloco';
  interface PanelState {
    open: boolean;
    dock: Dock;
    x?: number;
    y?: number;
  }
  const [panels, setPanels] = useState<Record<PanelId, PanelState>>({
    bloco: { open: false, dock: 'right' },
  });
  const closePanel = (id: PanelId) => setPanels((p) => ({ ...p, [id]: { ...p[id], open: false } }));
  const movePanel = (id: PanelId, dock: Dock, x?: number, y?: number) =>
    setPanels((p) => ({ ...p, [id]: { ...p[id], dock, ...(dock === 'float' ? { x, y } : {}) } }));

  // ---------- modelos (templates) ----------

  /** modelos do reino (válidos) + embutidos, com os do reino tendo precedência por id */
  const templates = useMemo(() => {
    const raw = activeRealmId ? uiState.realmSettings?.[activeRealmId]?.sheetTemplates : undefined;
    const realm: SheetTemplate[] = [];
    if (raw) for (const v of Object.values(raw)) {
      const t = parseSheetTemplate(v);
      if (t) realm.push(t);
    }
    const realmIds = new Set(realm.map((t) => t.id));
    return [...realm, ...builtinSheetTemplates().filter((t) => !realmIds.has(t.id))];
  }, [uiState.realmSettings, activeRealmId]);

  /** legado: "padrão por sistema" (sheetLayouts) — último fallback antes do embutido */
  const legacyDefault = useMemo(() => {
    const raw = activeRealmId ? uiState.realmSettings?.[activeRealmId]?.sheetLayouts?.[osrPack.id] : undefined;
    return parseSheetLayout(raw);
  }, [uiState.realmSettings, activeRealmId]);

  /** efeitos globais do reino (definições customizadas) */
  const customDefs = useMemo(
    () => parseEffectDefinitions(activeRealmId ? uiState.realmSettings?.[activeRealmId]?.sheetEffects : undefined),
    [uiState.realmSettings, activeRealmId],
  );
  const customDefsRef = useRef(customDefs);
  customDefsRef.current = customDefs;
  const effectDefs = useMemo(() => customDefs.map((d) => ({ id: d.id, label: d.label })), [customDefs]);

  /** pack OSR + definições do reino: o motor já nasce conhecendo todos os refs */
  const sheetPack = useMemo(() => defineSystemPack({ ...osrPack, definitions: customDefs }), [customDefs]);
  const sheetPackRef = useRef(sheetPack);
  sheetPackRef.current = sheetPack;
  const knownEffectRefs = () => new Set(customDefsRef.current.map((d) => d.id));

  const [templateId, setTemplateId] = useState<string | undefined>(
    () => (parseSheet(doc.content) as SheetDocumentWithLayout).templateId,
  );
  const templateRef = useRef(templateId);
  templateRef.current = templateId;
  const activeTemplate = templates.find((t) => t.id === templateId);

  // layout: override da ficha (null = herda modelo / legado / embutido)
  const [layoutOverride, setLayoutOverride] = useState<SheetLayout | null>(
    () => (parseSheet(doc.content) as SheetDocumentWithLayout).layout ?? null,
  );
  const layout = layoutOverride ?? activeTemplate?.layout ?? legacyDefault ?? defaultSheetLayout();
  const layoutRef = useRef<SheetLayout | null>(layoutOverride);
  layoutRef.current = layoutOverride;

  // ---------- abas da ficha ----------
  const tabs = useMemo(() => sheetTabs(layout), [layout]);
  const activeTabId = tabs.some((t) => t.id === activeTab) ? activeTab : (tabs[0]?.id ?? 'geral');
  const visibleLayout: SheetLayout = useMemo(
    () => ({ ...layout, blocks: layout.blocks.filter((b) => blockTab(b, tabs) === activeTabId) }),
    [layout, tabs, activeTabId],
  );

  const newTabId = () => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const addTab = () => {
    const id = newTabId();
    mutateLayout((l) => ({ ...l, tabs: [...sheetTabs(l), { id, title: 'Nova aba' }] }));
    setActiveTab(id);
  };
  const renameTab = (id: string, title: string) => {
    mutateLayout((l) => ({ ...l, tabs: sheetTabs(l).map((t) => (t.id === id ? { ...t, title } : t)) }));
  };
  const removeTab = (id: string) => {
    if (SHEET_FIXED_TABS.has(id)) return; // abas fixas (Geral/Efeitos) não são removíveis
    const cur = sheetTabs(layout);
    if (cur.length <= 1) return;
    const first = cur[0].id;
    mutateLayout((l) => ({
      ...l,
      tabs: sheetTabs(l).filter((t) => t.id !== id),
      // blocos da aba removida vão para a primeira aba
      blocks: l.blocks.map((b) => (blockTab(b, sheetTabs(l)) === id ? { ...b, tab: first } : b)),
    }));
    if (activeTabId === id) setActiveTab(first);
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const scheduleSaveRef = useRef<(() => void) | null>(null);

  // conteúdo serializado = documento do motor + templateId + layout (override)
  const buildContent = (): string => {
    const e = engineRef.current;
    const base = (e ? e.document : parseSheet(doc.content)) as SheetDocumentWithLayout;
    const next: SheetDocumentWithLayout = { ...base };
    if (templateRef.current) next.templateId = templateRef.current;
    else delete next.templateId;
    if (layoutRef.current) next.layout = layoutRef.current;
    else delete next.layout;
    return serializeSheet(next);
  };
  const buildContentRef = useRef(buildContent);
  buildContentRef.current = buildContent;

  // motor por documento: cria no mount, persiste a cada 'computed', destrói no unmount
  useEffect(() => {
    const bus = createSheetBus();
    // refs sem definição (efeitos removidos) são descartados na carga —
    // o SheetEngine explode com UnknownEffectError no primeiro compute
    const initialDoc = stripUnknownEffects(parseSheet(doc.content), knownEffectRefs());
    const engine = new SheetEngine(initialDoc, { pack: sheetPackRef.current, bus });
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
      const parsed = stripUnknownEffects(parseSheet(external.content), knownEffectRefs()) as SheetDocumentWithLayout;
      setLayoutOverride(parsed.layout ?? null);
      setTemplateId(parsed.templateId);
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

  // registra/atualiza definições customizadas no motor vivo (efeitos do reino)
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    for (const def of customDefs) e.registerDefinition(def);
    e.refresh();
  }, [customDefs]);

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

  const rollTemplate = (template: string) => {
    const e = engine();
    if (!e) return;
    try {
      const expr = e.buildRoll(template);
      const formula = toFormula(expr);
      const label = `${doc.title || 'Ficha'} — ${ROLL_LABELS[template] ?? template}`;
      // via hook do plugin de rolagens (mesa 3D/overlay quando abertos);
      // fallback: rola aqui e emite o evento para quem estiver ouvindo
      const handled = manager.hooks.call('roller:roll', { formula, label });
      if (handled === undefined) {
        const roll = evaluateRoll(expr, { scope: e.compute().scope });
        manager.events.emit('roller:rolled', {
          tableTitle: label,
          steps: [{ title: doc.title || 'Ficha', formula, roll, text: `Total: ${String(roll.value)}` }],
        });
      }
    } catch (err) {
      console.error('[sheet] roll failed', err);
    }
  };

  // ---------- mutações de layout (modo edição) ----------

  const mutateLayout = (fn: (l: SheetLayout) => SheetLayout) => {
    // fork automático: editar uma ficha herdada cria o override próprio dela
    const next = fn(layout);
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

  const onDropTool = (kind: string, x: number, y: number) => {
    const item = toolItem(kind);
    if (!item) return;
    const block = { ...item.make(x, y), tab: activeTabId };
    mutateLayout((l) => ({ ...l, blocks: [...l.blocks, clampBlock(l, block)] }));
    setSelectedId(block.id);
    setArmedTool(null);
  };

  const updateBlock = (id: string, patch: Record<string, unknown>) => {
    mutateLayout((l) => ({
      ...l,
      blocks: l.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as SheetBlock) : b)),
    }));
  };

  // ---------- modelos: aplicar / salvar / renomear / excluir ----------

  const rawRealmTemplates = (activeRealmId ? uiState.realmSettings?.[activeRealmId]?.sheetTemplates : undefined) ?? {};

  const writeRealmTemplates = (map: Record<string, SheetTemplate>) => {
    if (!activeRealmId) return;
    const realmSettings = {
      ...(uiState.realmSettings ?? {}),
      [activeRealmId]: { ...(uiState.realmSettings?.[activeRealmId] ?? {}), sheetTemplates: map },
    };
    saveUiState({ realmSettings });
  };

  /** aplica um modelo: a ficha passa a herdá-lo (override próprio é descartado) */
  const applyTemplate = (id: string) => {
    templateRef.current = id;
    setTemplateId(id);
    layoutRef.current = null;
    setLayoutOverride(null);
    setSelectedId(null);
    scheduleSaveRef.current?.();
  };

  const saveAsTemplate = (name: string) => {
    const id = newTemplateId();
    writeRealmTemplates({ ...rawRealmTemplates, [id]: { id, name, layout } });
    applyTemplate(id);
  };

  const renameTemplate = (id: string, name: string) => {
    const existing = rawRealmTemplates[id];
    if (!existing) return;
    writeRealmTemplates({ ...rawRealmTemplates, [id]: { ...existing, name } });
  };

  const deleteTemplate = (id: string) => {
    const map = { ...rawRealmTemplates };
    delete map[id];
    writeRealmTemplates(map);
    if (templateRef.current === id) applyTemplate(SHEET_TEMPLATE_PERSONAGEM);
  };

  // ---------- import/export ----------

  const handleImportTemplate = async () => {
    const t = await importTemplateFile();
    if (!t) return;
    writeRealmTemplates({ ...rawRealmTemplates, [t.id]: t });
    applyTemplate(t.id);
  };

  const handleImportSheet = async () => {
    const imported = await importSheetFile();
    if (!imported) return;
    const newDoc = await createDocument(SHEET_DOC_TYPE, null, imported.title, imported.content);
    openDocument(newDoc.id);
  };

  const handleExportSheet = () => {
    const title = String(engine()?.document.identity.nome ?? doc.title ?? 'ficha');
    downloadSheet(title, buildContent());
  };

  /** remove o override da ficha — volta a herdar o modelo */
  const resetToTemplate = () => {
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
    effectDefs,
  };

  const selectedBlock = selectedId ? layout.blocks.find((b) => b.id === selectedId) : undefined;

  const selectBlock = (id: string | null) => {
    setSelectedId(id);
    if (id && editing) setPanels((p) => ({ ...p, bloco: { ...p.bloco, open: true } }));
  };

  // abas premium — parte da ficha (sempre visíveis: Geral/Efeitos são fixas)
  const tabStrip = (
    <SheetPageTabs
      tabs={tabs}
      activeId={activeTabId}
      onSelect={setActiveTab}
      editing={editing}
      onAdd={addTab}
      onRename={renameTab}
      onRemove={removeTab}
      fixedIds={SHEET_FIXED_TABS}
    />
  );

  // estilo compartilhado dos botões do cabeçalho (ativo = dourado suave)
  const hdrBtn = (active = false) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12px] transition-all duration-150 ${
      active
        ? 'border-sheet/60 bg-sheet-soft text-sheet-strong shadow-[0_0_14px_rgba(212,175,55,0.12)]'
        : 'border-line bg-elevated/50 text-ink-2 hover:text-ink-1 hover:border-sheet/40 hover:bg-elevated'
    }`;

  const topbar = (
    <header className="rounded-2xl border border-sheet/25 bg-gradient-to-b from-elevated/90 via-elevated/70 to-app/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_28px_rgba(0,0,0,0.4)] px-4 pt-3 pb-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 select-none shrink-0" title={doc.title}>
          <Gem size={13} className="text-sheet/80" />
          <span className="font-display text-[15px] font-semibold tracking-[0.06em] text-ink-1 truncate max-w-48">
            {doc.title}
          </span>
        </span>
        <div className="h-px w-10 bg-gradient-to-r from-sheet/40 to-transparent" />
        <SheetTemplateMenu
          templates={templates}
          activeId={templateId}
          onApply={applyTemplate}
          onSaveAs={saveAsTemplate}
          onRename={renameTemplate}
          onDelete={deleteTemplate}
          onExport={downloadTemplate}
          onImport={handleImportTemplate}
        />
        <span className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleExportSheet}
          title="Exportar ficha (.diegesis-sheet.json)"
          className={hdrBtn()}
        >
          <Download size={13} />
        </button>
        <button
          type="button"
          onClick={handleImportSheet}
          title="Importar ficha (.diegesis-sheet.json)"
          className={hdrBtn()}
        >
          <Upload size={13} />
        </button>
        {editing && (
          <span className="text-[10.5px] text-ink-3 select-none px-1">
            {layoutOverride ? 'layout próprio desta ficha' : 'herdando o modelo'}
          </span>
        )}
        {editing && layoutOverride && (
          <button
            type="button"
            onClick={resetToTemplate}
            title="Descartar o layout próprio e voltar a herdar o modelo"
            className={hdrBtn()}
          >
            <RotateCcw size={13} />
            Herdar modelo
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setEditing(!editing);
            setSelectedId(null);
            setArmedTool(null);
          }}
          title={editing ? 'Concluir edição do layout' : 'Customizar layout'}
          className={hdrBtn(editing)}
        >
          {editing ? <Check size={13} /> : <Pencil size={13} />}
          {editing ? 'Concluir' : 'Customizar'}
        </button>
      </span>
    </div>
  </header>
  );

  const footer = auditPath ? (
    <section>
      <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-sheet/90 mb-2 select-none">
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
  ) : undefined;

  const PANEL_META: { id: PanelId; title: string; icon: ReactNode }[] = [
    { id: 'bloco', title: selectedBlock ? `Bloco · ${selectedBlock.type}` : 'Bloco', icon: <SlidersHorizontal size={13} /> },
  ];

  const panelContent = (id: PanelId) => {
    if (id === 'bloco') {
      return selectedBlock ? (
        <BlockConfig
          block={selectedBlock}
          onChange={(patch) => updateBlock(selectedBlock.id, patch)}
          tabOptions={tabs.filter((t) => t.id !== SHEET_TAB_EFEITOS)}
          onAssignTab={(tabId) => updateBlock(selectedBlock.id, { tab: tabId })}
        />
      ) : (
        <div className="text-[12px] text-ink-3 leading-snug">Selecione um bloco no canvas para editar suas propriedades.</div>
      );
    }
    return null;
  };

  const renderPanels = (dock: Dock) =>
    PANEL_META.filter((p) => panels[p.id].open && panels[p.id].dock === dock).map((p) => (
      <DockPanel
        key={p.id}
        title={p.title}
        icon={p.icon}
        dock={dock}
        x={panels[p.id].x}
        y={panels[p.id].y}
        containerRef={contentRef}
        onMove={(d, x, y) => movePanel(p.id, d, x, y)}
        onClose={() => closePanel(p.id)}
      >
        {panelContent(p.id)}
      </DockPanel>
    ));

  const leftPanels = renderPanels('left');
  const rightPanels = renderPanels('right');
  const leftPanel = leftPanels.length > 0 ? (
    <div className="shrink-0 w-[288px] flex flex-col min-h-0">{leftPanels}</div>
  ) : undefined;
  const sidePanel = rightPanels.length > 0 ? (
    <div className="shrink-0 w-[288px] flex flex-col min-h-0">{rightPanels}</div>
  ) : undefined;
  const floating = (
    <>
      {editing && <FloatingToolbar armedTool={armedTool} onArm={setArmedTool} dragGuardRef={dragGuardRef} />}
      {renderPanels('float')}
    </>
  );

  // aba fixa "Efeitos": página de sistema com os efeitos ativos da ficha
  const effectsBody = (
    <div className="rounded-2xl border border-sheet/20 bg-gradient-to-b from-elevated/60 to-app/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] p-4 flex flex-col gap-2 min-h-[480px]">
      <div className="flex items-center gap-2 select-none">
        <Sparkles size={13} className="text-sheet" />
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sheet/90">
          Efeitos ativos
        </span>
        <span className="ml-auto text-[10.5px] text-ink-3">definições globais em Configurações → Fichas</span>
      </div>
      <div className="flex-1 min-h-0">
        <EffectsBlock ctx={blockCtx} />
      </div>
    </div>
  );

  return (
    <SheetCanvas
      layout={visibleLayout}
      editing={editing}
      selectedId={selectedId}
      armedTool={armedTool}
      onSelect={selectBlock}
      onMoveBlock={onMoveBlock}
      onResizeBlock={onResizeBlock}
      onRemoveBlock={onRemoveBlock}
      onDropTool={onDropTool}
      onDropEffect={(id) => engine()?.applyEffect(id, { source: { kind: 'manual' } })}
      onToolDragEnd={() => {
        dragGuardRef.current = true;
      }}
      renderContent={(b) => <SheetBlockContent block={b} ctx={blockCtx} />}
      topbar={topbar}
      tabs={tabStrip}
      body={activeTabId === SHEET_TAB_EFEITOS ? effectsBody : undefined}
      footer={footer}
      floating={floating}
      contentRef={contentRef}
      leftPanel={leftPanel}
      sidePanel={sidePanel}
    />
  );
}
