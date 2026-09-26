import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Layout, Model, TabNode, Actions, DockLocation, IJsonModel, IJsonTabNode } from 'flexlayout-react';
import { BookOpen } from 'lucide-react';
import { useStore, type PanelKind } from '../state/store';
import { Explorer } from './Explorer';
import { HighlightsPanel } from './HighlightsPanel';
import { DocumentContainer } from './DocumentContainer';
import { SettingsPanel } from './SettingsPanel';

const MAIN_TABSET_ID = 'main-tabset';
const WELCOME_TAB_ID = '__welcome__';
const HIGHLIGHTS_TAB: IJsonTabNode = {
  type: 'tab',
  id: '__highlights__',
  name: 'Destaques',
  component: 'highlights',
  enableClose: false,
};

const PANEL_TABS: Partial<Record<PanelKind, { id: string; name: string }>> = {
  settings: { id: '__settings__', name: 'Configurações' },
};

function defaultModel(): IJsonModel {
  return {
    global: {
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      splitterSize: 5,
      tabEnableFloat: false,
    },
    borders: [
      {
        type: 'border',
        location: 'left',
        size: 290,
        children: [
          {
            type: 'tab',
            id: 'explorer',
            name: 'Explorer',
            component: 'explorer',
            enableClose: false,
            enableDrag: false,
          },
          HIGHLIGHTS_TAB,
        ],
      },
    ],
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

/** Removes tabs that reference documents that no longer exist (or belong to another realm). */
function sanitizeModel(json: IJsonModel, validDocIds: Set<string>): IJsonModel {
  const clone = JSON.parse(JSON.stringify(json)) as IJsonModel;

  const sanitizeChildren = (children: any[]) => {
    for (const child of children) {
      if (child.type === 'tab') {
        if (child.component === 'document') child.__dead = !validDocIds.has(child.config?.docId);
        // migration: the AI chat is a right-side panel now, not a tab
        if (child.component === 'ai-chat') child.__dead = true;
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

  // migration: layouts saved before the highlights panel existed don't have it
  const hasHighlights = JSON.stringify(clone.borders ?? []).includes('__highlights__');
  if (!hasHighlights) {
    clone.borders = clone.borders ?? [];
    const left = (clone.borders as any[]).find((b) => b.location === 'left');
    if (left) left.children.push({ ...HIGHLIGHTS_TAB });
    else
      (clone.borders as any[]).push({
        type: 'border',
        location: 'left',
        size: 290,
        selected: 0,
        children: [{ ...HIGHLIGHTS_TAB }],
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
  const { docs, uiState, saveUiState, registerOpenDocument, registerOnDocumentDeleted, registerOpenPanel, setAiChatOpen } = useStore();
  const layoutRef = useRef<Layout>(null);
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const model = useMemo(() => {
    const validIds = new Set(docs.map((d) => d.id));
    if (uiState.layout) {
      try {
        return Model.fromJson(sanitizeModel(uiState.layout as IJsonModel, validIds));
      } catch {
        /* fall through to default */
      }
    }
    return Model.fromJson(defaultModel());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Keep tab titles in sync with document titles
  useEffect(() => {
    for (const doc of docs) {
      const node = model.getNodeById(doc.id) as TabNode | undefined;
      if (node && node.getName() !== (doc.title || 'Sem título')) {
        model.doAction(Actions.renameTab(doc.id, doc.title || 'Sem título'));
      }
    }
  }, [docs, model]);

  const factory = useCallback((node: TabNode) => {
    switch (node.getComponent()) {
      case 'explorer':
        return <Explorer />;
      case 'highlights':
        return <HighlightsPanel />;
      case 'document':
        return <DocumentContainer docId={node.getConfig().docId} />;
      case 'settings':
      case 'ai-settings': // legacy tab id from saved layouts
        return <SettingsPanel />;
      case 'welcome':
        return <Welcome />;
      default:
        return <div className="p-6 text-zinc-500">Componente desconhecido</div>;
    }
  }, []);

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
        realtimeResize={true}
      />
    </div>
  );
}
