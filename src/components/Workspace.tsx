import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layout, Model, TabNode, TabSetNode, Actions, DockLocation, IJsonModel, IJsonTabNode } from 'flexlayout-react';
import { BookOpen, Columns, Download, LocateFixed, PanelLeftClose, PanelRightClose, X, XCircle } from 'lucide-react';
import { useStore, type PanelKind } from '../state/store';
import { usePluginManager, useViews, type ViewContribution } from '../plugins';
import { DocumentContainer } from './DocumentContainer';
import { ContextMenu, type CtxMenuEntry } from './ContextMenu';

const MAIN_TABSET_ID = 'main-tabset';
const WELCOME_TAB_ID = '__welcome__';

/** Duração da micro-animação de fechamento de aba (0 quando reduzido movimento). */
const TAB_CLOSE_MS =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 140;

const PANEL_TABS: Partial<Record<PanelKind, { id: string; name: string }>> = {
  settings: { id: '__settings__', name: 'Configurações' },
};

/** Left-border tabs come from plugin-contributed views marked as default. */
function defaultBorderTabs(views: ViewContribution[]): IJsonTabNode[] {
  return views
    .filter((v) => v.location === 'border-left' && v.tab?.default)
    .map(
      (v): IJsonTabNode => ({
        type: 'tab',
        id: v.tab!.id,
        name: v.tab!.name,
        component: v.id,
        enableClose: false,
        enableDrag: false,
      })
    );
}

function defaultModel(views: ViewContribution[]): IJsonModel {
  const borderTabs = defaultBorderTabs(views);
  return {
    global: {
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      splitterSize: 5,
      tabEnableFloat: false,
    },
    // no border at all when every border plugin is disabled
    borders: borderTabs.length > 0 ? [{ type: 'border', location: 'left', size: 290, children: borderTabs }] : [],
    layout: {
      type: 'row',
      children: [
        {
          type: 'tabset',
          id: MAIN_TABSET_ID,
          enableDeleteWhenEmpty: false,
          children: [],
        },
      ],
    },
  };
}

/**
 * Removes tabs that reference documents that no longer exist (or belong to
 * another realm) and tabs whose component is not a live view — e.g. legacy
 * 'ai-chat' workspace tabs or views from disabled plugins.
 */
function sanitizeModel(json: IJsonModel, validDocIds: Set<string>, views: ViewContribution[]): IJsonModel {
  const clone = JSON.parse(JSON.stringify(json)) as IJsonModel;

  // components the flexlayout factory can render: shell views + contributed
  // views that live inside the layout (right-panel views do not)
  const aliveComponents = new Set<string>([
    'document',
    'welcome',
    ...views.filter((v) => v.location !== 'right-panel').map((v) => v.id),
  ]);

  const sanitizeChildren = (children: any[]) => {
    for (const child of children) {
      if (child.type === 'tab') {
        if (child.component === 'document') child.__dead = !validDocIds.has(child.config?.docId);
        else if (!child.component || !aliveComponents.has(child.component)) child.__dead = true;
      }
      if (child.children) sanitizeChildren(child.children);
      if (child.tabs) sanitizeChildren(child.tabs);
    }
  };
  sanitizeChildren((clone as any).layout.children ?? []);
  for (const border of clone.borders ?? []) sanitizeChildren((border as any).children ?? []);

  const prune = (children: any[]): any[] => {
    return children
      .filter((c) => !c.__dead)
      .map((c) => {
        if (c.children) c.children = prune(c.children);
        if (c.tabs) c.tabs = prune(c.tabs);
        return c;
      });
  };
  (clone as any).layout.children = prune((clone as any).layout.children ?? []);
  clone.borders = (clone.borders ?? []).map((b: any) => ({ ...b, children: prune(b.children ?? []) }));

  // guarantee main tabset exists
  const hasMain = JSON.stringify(clone.layout).includes(MAIN_TABSET_ID);
  if (!hasMain) {
    (clone.layout as any).children.push({
      type: 'tabset',
      id: MAIN_TABSET_ID,
      enableDeleteWhenEmpty: false,
      children: [],
    });
  }

  // migration: layouts saved before a default border view existed (or after it
  // was pruned while disabled) get the missing tabs of REGISTERED views only
  const existingTabIds = new Set<string>();
  const collectTabIds = (children: any[]) => {
    for (const child of children) {
      if (child.type === 'tab' && child.id) existingTabIds.add(child.id);
      if (child.children) collectTabIds(child.children);
      if (child.tabs) collectTabIds(child.tabs);
    }
  };
  for (const border of clone.borders ?? []) collectTabIds((border as any).children ?? []);

  const missingDefaultTabs = defaultBorderTabs(views).filter((t) => !existingTabIds.has(t.id!));
  if (missingDefaultTabs.length > 0) {
    clone.borders = clone.borders ?? [];
    const left = (clone.borders as any[]).find((b) => b.location === 'left');
    if (left) left.children.push(...missingDefaultTabs);
    else
      (clone.borders as any[]).push({
        type: 'border',
        location: 'left',
        size: 290,
        selected: 0,
        children: missingDefaultTabs,
      });
  }
  return clone;
}

function Welcome() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center select-none">
      <div className="w-16 h-16 rounded-2xl bg-elevated border border-line flex items-center justify-center mb-6 shadow-xl">
        <BookOpen size={28} strokeWidth={1.5} className="text-ink-3" />
      </div>
      <h2 className="text-xl font-semibold text-ink-1 mb-2 tracking-tight">Comece a escrever</h2>
      <p className="max-w-sm text-ink-3 text-[13px] leading-relaxed mb-6">
        Crie uma nota no Explorer, arraste abas para dividir a janela e organize seus mundos.
      </p>
      <div className="flex flex-col gap-2 text-[12px] text-ink-3">
        <span className="flex items-center gap-2 justify-center">
          <kbd className="bg-elevated border border-line rounded px-1.5 py-0.5">Ctrl K</kbd> buscar em tudo
        </span>
        <span className="flex items-center gap-2 justify-center">
          <kbd className="bg-elevated border border-line rounded px-1.5 py-0.5">/</kbd> comandos de bloco no editor
        </span>
      </div>
    </div>
  );
}

export function Workspace() {
  const { docs, uiState, saveUiState, registerOpenDocument, registerOnDocumentDeleted, registerOpenPanel, registerOpenView, setAiChatOpen, exportDocument, revealDocument } = useStore();
  const manager = usePluginManager();
  const views = useViews();
  const layoutRef = useRef<Layout>(null);
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const [tabMenu, setTabMenu] = useState<{ node: TabNode | TabSetNode; x: number; y: number } | null>(null);

  const model = useMemo(() => {
    const validIds = new Set(docs.map((d) => d.id));
    if (uiState.layout) {
      try {
        return Model.fromJson(sanitizeModel(uiState.layout as IJsonModel, validIds, views));
      } catch {
        /* fall through to default */
      }
    }
    return Model.fromJson(defaultModel(views));
    // Model is intentionally built once per realm mount; doc updates flow through effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureWelcomeTab = useCallback((m: Model) => {
    const tabset = m.getNodeById(MAIN_TABSET_ID) as any;
    if (!tabset) return;
    const docTabs = (tabset.getChildren?.() ?? []).filter(
      (t: any) => t.getComponent?.() === 'document'
    );
    const hasWelcome = !!m.getNodeById(WELCOME_TAB_ID);
    const totalTabs = (tabset.getChildren?.() ?? []).length;
    if (totalTabs === 0 && !hasWelcome) {
      m.doAction(
        Actions.addNode(
          {
            type: 'tab',
            id: WELCOME_TAB_ID,
            name: 'Bem-vindo',
            component: 'welcome',
            enableClose: false,
          } as IJsonTabNode,
          MAIN_TABSET_ID,
          DockLocation.CENTER,
          -1,
          true
        )
      );
    } else if (docTabs.length > 0 && hasWelcome) {
      m.doAction(Actions.deleteTab(WELCOME_TAB_ID));
    }
  }, []);

  // Initial welcome tab + open/close plumbing
  useEffect(() => {
    ensureWelcomeTab(model);

    registerOpenDocument((docId: string) => {
      const doc = docsRef.current.find((d) => d.id === docId);
      if (!doc) return;
      if (model.getNodeById(docId)) {
        model.doAction(Actions.selectTab(docId));
        return;
      }
      model.doAction(
        Actions.addNode(
          {
            type: 'tab',
            id: docId,
            name: doc.title || 'Sem título',
            component: 'document',
            config: { docId },
          } as IJsonTabNode,
          MAIN_TABSET_ID,
          DockLocation.CENTER,
          -1,
          true
        )
      );
      if (model.getNodeById(WELCOME_TAB_ID)) model.doAction(Actions.deleteTab(WELCOME_TAB_ID));
    });

    registerOnDocumentDeleted((docId: string) => {
      if (model.getNodeById(docId)) model.doAction(Actions.deleteTab(docId));
    });

    registerOpenPanel((panel: PanelKind) => {
      // the AI chat lives in the right-side panel, not in a tab
      if (panel === 'ai-chat') {
        setAiChatOpen(true);
        return;
      }
      const tab = PANEL_TABS[panel];
      if (!tab) return;
      if (model.getNodeById(tab.id)) {
        model.doAction(Actions.selectTab(tab.id));
        return;
      }
      model.doAction(
        Actions.addNode(
          { type: 'tab', id: tab.id, name: tab.name, component: panel } as IJsonTabNode,
          MAIN_TABSET_ID,
          DockLocation.CENTER,
          -1,
          true
        )
      );
      if (model.getNodeById(WELCOME_TAB_ID)) model.doAction(Actions.deleteTab(WELCOME_TAB_ID));
    });

    // plugin-contributed workspace-tab views (tab id namespaced to avoid doc id clashes)
    registerOpenView((viewId: string) => {
      const view = manager.views.getView(viewId);
      if (!view || view.location !== 'workspace-tab') return;
      const tabId = `view:${viewId}`;
      if (model.getNodeById(tabId)) {
        model.doAction(Actions.selectTab(tabId));
        return;
      }
      model.doAction(
        Actions.addNode(
          { type: 'tab', id: tabId, name: view.title, component: view.id } as IJsonTabNode,
          MAIN_TABSET_ID,
          DockLocation.CENTER,
          -1,
          true
        )
      );
      if (model.getNodeById(WELCOME_TAB_ID)) model.doAction(Actions.deleteTab(WELCOME_TAB_ID));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Tabs only exist because a plugin registered their view through the API.
  // When a view is unregistered (plugin disabled) its tabs are parked and
  // removed; when it is registered again (re-enabled) they are restored —
  // workspace tabs from the parked snapshot, border tabs from the view's
  // default tab descriptor.
  const parkedTabs = useRef(new Map<string, { json: IJsonTabNode; parentId?: string }>());

  useEffect(() => {
    const parked = parkedTabs.current;

    const leftBorderId = () =>
      model
        .getBorderSet()
        .getBorders()
        .find((b) => b.getLocation().getName() === 'left')
        ?.getId();

    const syncTabsWithRegistry = () => {
      // 1) park + remove tabs whose view is no longer registered
      const dead: TabNode[] = [];
      model.visitNodes((node) => {
        if (node.getType() === 'tab') {
          const component = (node as TabNode).getComponent();
          if (component && component !== 'document' && component !== 'welcome' && !manager.views.getView(component)) {
            dead.push(node as TabNode);
          }
        }
      });
      for (const tab of dead) {
        parked.set(tab.getComponent()!, { json: tab.toJson(), parentId: tab.getParent()?.getId() });
        model.doAction(Actions.deleteTab(tab.getId()));
      }

      // 2) restore parked workspace tabs whose view is registered again
      for (const [component, entry] of parked) {
        const view = manager.views.getView(component);
        if (!view) continue;
        parked.delete(component);
        if (view.location !== 'workspace-tab') continue; // border tabs são cobertos pelo passo 3
        if (entry.json.id && model.getNodeById(entry.json.id)) continue;
        const parentAlive = entry.parentId ? model.getNodeById(entry.parentId) : undefined;
        model.doAction(
          Actions.addNode(entry.json, parentAlive?.getId() ?? MAIN_TABSET_ID, DockLocation.CENTER, -1, false)
        );
      }

      // 3) re-add missing default border tabs of registered views
      const borderId = leftBorderId();
      if (borderId) {
        for (const view of manager.views.listViews('border-left')) {
          if (!view.tab?.default || model.getNodeById(view.tab.id)) continue;
          model.doAction(
            Actions.addNode(
              {
                type: 'tab',
                id: view.tab.id,
                name: view.tab.name,
                component: view.id,
                enableClose: false,
                enableDrag: false,
              } as IJsonTabNode,
              borderId,
              DockLocation.CENTER,
              -1,
              false
            )
          );
        }
      }
    };

    syncTabsWithRegistry();
    const d = manager.views.subscribe(syncTabsWithRegistry);
    return () => {
      d.dispose();
      parked.clear(); // parked snapshots are realm-scoped, like the model
    };
  }, [model, manager]);

  // Keep tab titles in sync with document titles
  useEffect(() => {
    for (const doc of docs) {
      const node = model.getNodeById(doc.id) as TabNode | undefined;
      if (node && node.getName() !== (doc.title || 'Sem título')) {
        model.doAction(Actions.renameTab(doc.id, doc.title || 'Sem título'));
      }
    }
  }, [docs, model]);

  // Tab components are resolved through the plugin view registry; 'document'
  // and 'welcome' remain shell-provided. Tabs whose view is unregistered are
  // pruned reactively above, so there is no "unknown component" fallback.
  const factory = useCallback(
    (node: TabNode) => {
      const component = node.getComponent();
      if (component === 'document') return <DocumentContainer docId={node.getConfig().docId} />;
      if (component === 'welcome') return <Welcome />;
      const view = component ? manager.views.getView(component) : undefined;
      if (view) {
        const View = view.component;
        return <View node={node} />;
      }
      console.warn(`[workspace] aba sem view registrada: '${component}'`);
      return null;
    },
    [manager]
  );

  // Fecha uma aba com micro-animação: marca a aba com a classe `tab-closing`
  // (que dispara o keyframe no CSS) e só então a remove do modelo.
  const animateClose = useCallback(
    (id: string) => {
      if (TAB_CLOSE_MS <= 0 || !model.getNodeById(id)) {
        model.doAction(Actions.deleteTab(id));
        return;
      }
      model.doAction(Actions.updateNodeAttributes(id, { className: 'tab-closing' }));
      window.setTimeout(() => {
        if (model.getNodeById(id)) model.doAction(Actions.deleteTab(id));
      }, TAB_CLOSE_MS);
    },
    [model]
  );

  // Right-click context menu for document tabs (and the empty tab strip).
  // Close actions are scoped to the tab's own tabset; "à esquerda/direita"
  // follow the tab order within that strip. Non-closable tabs (welcome) are
  // skipped so bulk close never touches them.
  const tabMenuEntries = useMemo<CtxMenuEntry[]>(() => {
    if (!tabMenu) return [];
    const { node } = tabMenu;
    const closeIds = (ids: string[]) => {
      for (const id of ids) animateClose(id);
    };

    if (node.getType() === TabSetNode.TYPE) {
      const tabset = node as TabSetNode;
      const closable = (tabset.getChildren() as TabNode[]).filter((t) => t.isEnableClose());
      return [
        {
          icon: Columns,
          label: 'Fechar todas as abas',
          disabled: closable.length === 0,
          onClick: () => closeIds(closable.map((t) => t.getId())),
        },
      ];
    }

    const tab = node as TabNode;
    const parent = tab.getParent() as TabSetNode | undefined;
    const siblings = (parent?.getChildren() ?? []) as TabNode[];
    const idx = siblings.findIndex((t) => t.getId() === tab.getId());
    const closable = (t: TabNode) => t.isEnableClose();
    const left = siblings.slice(0, idx).filter(closable);
    const right = siblings.slice(idx + 1).filter(closable);
    const others = siblings.filter((t) => t.getId() !== tab.getId() && t.isEnableClose());
    const all = siblings.filter(closable);
    const isDoc = tab.getComponent() === 'document';
    const docId = isDoc ? (tab.getConfig()?.docId as string | undefined) : undefined;

    const entries: CtxMenuEntry[] = [
      { icon: X, label: 'Fechar', disabled: !tab.isEnableClose(), onClick: () => closeIds([tab.getId()]) },
      'divider',
      { icon: XCircle, label: 'Fechar outras abas', disabled: others.length === 0, onClick: () => closeIds(others.map((t) => t.getId())) },
      { icon: PanelLeftClose, label: 'Fechar abas à esquerda', disabled: left.length === 0, onClick: () => closeIds(left.map((t) => t.getId())) },
      { icon: PanelRightClose, label: 'Fechar abas à direita', disabled: right.length === 0, onClick: () => closeIds(right.map((t) => t.getId())) },
      'divider',
      { icon: Columns, label: 'Fechar tudo', disabled: all.length === 0, onClick: () => closeIds(all.map((t) => t.getId())) },
    ];

    if (isDoc && docId) {
      entries.push(
        'divider',
        { icon: LocateFixed, label: 'Revelar no Explorer', onClick: () => revealDocument(docId) },
        {
          icon: Download,
          label: 'Exportar documento',
          onClick: async () => {
            const res = await exportDocument(docId);
            if (!res.ok && !res.canceled) window.alert(res.error ?? 'Falha ao exportar o documento.');
          },
        }
      );
    }

    return entries;
  }, [tabMenu, animateClose, revealDocument, exportDocument]);

  return (
    <div className="relative flex-1 h-full min-w-0">
      <Layout
        ref={layoutRef}
        model={model}
        factory={factory}
        onModelChange={(m) => {
          ensureWelcomeTab(m);
          saveUiState({ layout: m.toJson() });
        }}
        onContextMenu={(node, event) => {
          event.preventDefault();
          // The tab button's own contextmenu bubbles up to the tab strip, which
          // also fires onContextMenu (with the TabSetNode). Stop it here so a
          // right-click on a tab doesn't get overwritten by the strip handler.
          event.stopPropagation();
          const type = node.getType();
          if (type === TabNode.TYPE) {
            // ignore border tabs (their parent is a BorderNode, not a TabSetNode)
            if (node.getParent()?.getType() !== TabSetNode.TYPE) return;
            setTabMenu({ node: node as TabNode, x: event.clientX, y: event.clientY });
          } else if (type === TabSetNode.TYPE) {
            setTabMenu({ node: node as TabSetNode, x: event.clientX, y: event.clientY });
          }
        }}
        onAction={(action) => {
          // Animate the built-in close button (X) on each tab: cancel the
          // immediate delete and route it through the animated close instead.
          if (action.type === Actions.DELETE_TAB) {
            animateClose(action.data.node);
            return undefined;
          }
          return action;
        }}
        realtimeResize={true}
      />
      {tabMenu &&
        createPortal(
          <ContextMenu x={tabMenu.x} y={tabMenu.y} entries={tabMenuEntries} onClose={() => setTabMenu(null)} />,
          document.body
        )}
    </div>
  );
}
