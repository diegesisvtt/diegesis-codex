import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '@diegesis/core';
import type { CustomFont, DocNode, DocChanges, DocumentType, PdfImportResult, Realm, RealmTransferResult, UiState } from '@shared/types';
import { bootBegin, bootPlan, bootProgress, bootStep } from './boot';

const generateId = newId;

export type PanelKind = 'ai-chat' | 'settings';

/** Pending navigation into a PDF tab: jump to a pin, highlight or page once focused. */
export interface PdfFocus {
  docId: string;
  pinId?: string;
  highlightId?: string;
  page?: number;
}

interface StoreState {
  ready: boolean;
  realms: Realm[];
  activeRealmId: string | null;
  docs: DocNode[];
  uiState: UiState;
  /** draft message consumed by the AI chat panel (set by editor commands) */
  aiDraft: string | null;
  /** id of the view shown in the right-side panel ('ai-chat', 'roller:log', …), or null when closed */
  rightPanelView: string | null;
  /** pending PDF navigation (set by the Explorer, consumed by PdfReader) */
  pdfFocus: PdfFocus | null;
  /** pending Settings section to pre-select (deep-link), consumed by the SettingsPanel */
  settingsSection: string | null;
}

interface StoreActions {
  /** derived: true when the right panel shows the AI chat view */
  readonly aiChatOpen: boolean;
  setActiveRealm(id: string): Promise<void>;
  createRealm(name: string): Promise<void>;
  renameRealm(id: string, name: string): Promise<void>;
  deleteRealm(id: string): Promise<void>;
  /** opens a save dialog; result.canceled is true when dismissed */
  exportRealm(id: string): Promise<RealmTransferResult>;
  /** opens a file dialog and switches to the imported realm on success */
  importRealm(): Promise<RealmTransferResult>;

  createDocument(type: DocumentType, parentId: string | null, title?: string, content?: string | null): Promise<DocNode>;
  /** imports a PDF via native file dialog; doc is null when cancelled */
  importPdf(parentId: string | null): Promise<PdfImportResult>;
  updateDocument(id: string, changes: DocChanges): void; // optimistic + debounced persist
  /** like updateDocument but cancels any pending debounce and persists immediately */
  flushDocument(id: string, changes: DocChanges): void;
  deleteDocument(id: string): Promise<void>;
  moveDocument(id: string, parentId: string | null, position: number): Promise<void>;
  /** opens a save dialog and writes the document to disk (Markdown/PDF/JSON) */
  exportDocument(id: string): Promise<RealmTransferResult>;

  saveUiState(patch: Partial<UiState>): void;
  /** registered by the Workspace so other components can open tabs */
  openDocument(docId: string): void;
  registerOpenDocument(fn: (docId: string) => void): void;
  onDocumentDeleted(docId: string): void;
  registerOnDocumentDeleted(fn: (docId: string) => void): void;
  /** opens a singleton app panel: 'settings' as a workspace tab, 'ai-chat' as the right-side panel */
  openPanel(panel: PanelKind): void;
  registerOpenPanel(fn: (panel: PanelKind) => void): void;
  /** opens the Settings panel; `sectionId` pre-selects a section
   *  (plugin pages: `plugin:<pluginId>`) */
  openSettings(sectionId?: string): void;
  clearSettingsSection(): void;
  /** opens a plugin-contributed 'workspace-tab' view as a tab */
  openView(viewId: string): void;
  registerOpenView(fn: (viewId: string) => void): void;
  setAiChatOpen(open: boolean): void;
  toggleAiChat(): void;
  /** opens a registered 'right-panel' view; null closes the panel */
  setRightPanelView(viewId: string | null): void;
  /** toggles a right-panel view: closes it when already active, opens otherwise */
  toggleRightPanel(viewId: string): void;
  setAiDraft(draft: string | null): void;
  /** ask the open PDF tab to jump to a pin or page (consumable, one-shot) */
  focusPdf(focus: PdfFocus): void;
  clearPdfFocus(): void;
  /** fired when a document's title/content changed outside the renderer (AI tools);
   *  not fired for docs with a pending local save (user is typing) */
  subscribeExternalDocChange(fn: (doc: DocNode) => void): () => void;
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null);
export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
};

// Fallbacks for programmatic creation without an explicit title/content;
// creation UIs resolve defaults from the docTypes plugin registry instead.
function defaultContent(type: DocumentType): string | null {
  if (type === 'core/note') return JSON.stringify([{ type: 'paragraph' }]);
  if (type === 'core/whiteboard') return JSON.stringify({ nodes: [] });
  return null;
}

const DEFAULT_TITLES: Partial<Record<DocumentType, string>> = {
  'core/note': 'Nova Nota',
  'core/whiteboard': 'Novo Quadro',
  'core/folder': 'Nova Pasta',
  'core/pdf': 'Novo PDF',
  'diegesis/sheet': 'Nova Ficha',
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>({
    ready: false,
    realms: [],
    activeRealmId: null,
    docs: [],
    uiState: {},
    aiDraft: null,
    rightPanelView: null,
    pdfFocus: null,
    settingsSection: null,
  });

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const openDocRef = useRef<((docId: string) => void) | null>(null);
  const docDeletedRef = useRef<((docId: string) => void) | null>(null);
  const openPanelRef = useRef<((panel: PanelKind) => void) | null>(null);
  const openViewRef = useRef<((viewId: string) => void) | null>(null);
  const externalDocListeners = useRef(new Set<(doc: DocNode) => void>());

  // ---- bootstrap ----
  useEffect(() => {
    (async () => {
      bootBegin();
      bootPlan(2);
      bootProgress({ phase: 'database', label: 'Abrindo o Codex', detail: 'Lendo universos e preferências' });
      const [realms, ui] = await Promise.all([window.diegesis.realms.list(), window.diegesis.ui.load()]);
      bootStep();
      const activeRealmId =
        ui?.activeRealmId && realms.some((r) => r.id === ui.activeRealmId)
          ? ui.activeRealmId
          : realms[0]?.id ?? null;
      const activeRealm = realms.find((r) => r.id === activeRealmId);
      bootProgress({ label: 'Carregando documentos', detail: activeRealm?.name ?? 'Preparando workspace' });
      const docs = activeRealmId ? await window.diegesis.docs.listByRealm(activeRealmId) : [];
      bootStep();
      setState({ ready: true, realms, activeRealmId, docs, uiState: ui ?? {}, aiDraft: null, rightPanelView: null, pdfFocus: null, settingsSection: null });
    })();
  }, []);

  // Refresh the doc tree when documents change outside the renderer (AI tools)
  useEffect(() => {
    return window.diegesis.docs.onChanged((realmId) => {
      window.diegesis.docs.listByRealm(realmId).then((fresh) =>
        setState((cur) => {
          if (cur.activeRealmId !== realmId) return cur;
          // notify open editors about externally-changed docs (skip docs the
          // user is currently editing — a local save is already in flight)
          const prevById = new Map(cur.docs.map((d) => [d.id, d]));
          for (const doc of fresh) {
            const prev = prevById.get(doc.id);
            if (prev && (prev.content !== doc.content || prev.title !== doc.title) && !saveTimers.current.has(doc.id)) {
              externalDocListeners.current.forEach((fn) => fn(doc));
            }
          }
          return { ...cur, docs: fresh };
        })
      );
    });
  }, []);

  const setActiveRealm = useCallback(async (id: string) => {
    const docs = await window.diegesis.docs.listByRealm(id);
    setState((s) => ({ ...s, activeRealmId: id, docs }));
    window.diegesis.ui.load().then((ui) =>
      window.diegesis.ui.save({ ...(ui ?? {}), activeRealmId: id })
    );
  }, []);

  // ---- realms ----
  const createRealm = useCallback(async (name: string) => {
    const realm = await window.diegesis.realms.create(name);
    setState((s) => ({ ...s, realms: [...s.realms, realm], activeRealmId: realm.id, docs: [] }));
    window.diegesis.ui.load().then((ui) =>
      window.diegesis.ui.save({ ...(ui ?? {}), activeRealmId: realm.id })
    );
  }, []);

  const renameRealm = useCallback(async (id: string, name: string) => {
    await window.diegesis.realms.rename(id, name);
    setState((s) => ({ ...s, realms: s.realms.map((r) => (r.id === id ? { ...r, name } : r)) }));
  }, []);

  const deleteRealm = useCallback(async (id: string) => {
    await window.diegesis.realms.delete(id);
    setState((s) => {
      const realms = s.realms.filter((r) => r.id !== id);
      const nextActive = s.activeRealmId === id ? realms[0]?.id ?? null : s.activeRealmId;
      if (s.activeRealmId === id) {
        // load the next realm's docs and persist the switch
        if (nextActive) {
          window.diegesis.docs.listByRealm(nextActive).then((docs) =>
            setState((cur) => (cur.activeRealmId === nextActive ? { ...cur, docs } : cur))
          );
        }
        window.diegesis.ui.load().then((ui) =>
          window.diegesis.ui.save({ ...(ui ?? {}), activeRealmId: nextActive ?? undefined })
        );
      }
      return { ...s, realms, activeRealmId: nextActive, docs: s.activeRealmId === id ? [] : s.docs };
    });
  }, []);

  const exportRealm = useCallback((id: string) => window.diegesis.realms.export(id), []);

  const importRealm = useCallback(async (): Promise<RealmTransferResult> => {
    const res = await window.diegesis.realms.import();
    if (res.ok && res.realm) {
      const realm = res.realm;
      const docs = await window.diegesis.docs.listByRealm(realm.id);
      setState((s) => ({ ...s, realms: [...s.realms, realm], activeRealmId: realm.id, docs }));
      window.diegesis.ui.load().then((ui) =>
        window.diegesis.ui.save({ ...(ui ?? {}), activeRealmId: realm.id })
      );
    }
    return res;
  }, []);

  // ---- documents ----
  const createDocument = useCallback(
    async (type: DocumentType, parentId: string | null, title?: string, content?: string | null): Promise<DocNode> => {
      const realmId = state.activeRealmId;
      if (!realmId) throw new Error('No active realm');
      const doc = await window.diegesis.docs.create({
        id: generateId(),
        realmId,
        parentId,
        type,
        title: title ?? DEFAULT_TITLES[type] ?? 'Novo Documento',
        content: content === undefined ? defaultContent(type) : content,
      });
      setState((s) => ({ ...s, docs: [...s.docs, doc] }));
      return doc;
    },
    [state.activeRealmId]
  );

  const importPdf = useCallback(
    async (parentId: string | null): Promise<PdfImportResult> => {
      const realmId = state.activeRealmId;
      if (!realmId) throw new Error('No active realm');
      const result = await window.diegesis.pdf.import(realmId, parentId);
      if (result.doc) setState((s) => ({ ...s, docs: [...s.docs, result.doc!] }));
      return result;
    },
    [state.activeRealmId]
  );

  const updateDocument = useCallback((id: string, changes: DocChanges) => {
    // Optimistic local update
    setState((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.id === id ? { ...d, ...changes, updatedAt: Date.now() } : d)),
    }));
    // Debounced persistence (content typing shouldn't hit SQLite every keystroke)
    const key = id;
    const prev = saveTimers.current.get(key);
    if (prev) clearTimeout(prev);
    saveTimers.current.set(
      key,
      setTimeout(() => {
        saveTimers.current.delete(key);
        window.diegesis.docs.update(id, changes).catch(console.error);
      }, changes.title !== undefined && changes.content === undefined ? 250 : 600)
    );
  }, []);

  const flushDocument = useCallback((id: string, changes: DocChanges) => {
    setState((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.id === id ? { ...d, ...changes, updatedAt: Date.now() } : d)),
    }));
    const prev = saveTimers.current.get(id);
    if (prev) {
      clearTimeout(prev);
      saveTimers.current.delete(id);
    }
    window.diegesis.docs.update(id, changes).catch(console.error);
  }, []);

  const deleteDocument = useCallback(
    async (id: string) => {
      await window.diegesis.docs.delete(id);
      setState((s) => {
        // remove subtree locally
        const removed = new Set<string>([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const d of s.docs) {
            if (d.parentId && removed.has(d.parentId) && !removed.has(d.id)) {
              removed.add(d.id);
              grew = true;
            }
          }
        }
        removed.forEach((docId) => docDeletedRef.current?.(docId));
        return { ...s, docs: s.docs.filter((d) => !removed.has(d.id)) };
      });
    },
    []
  );

  const exportDocument = useCallback((id: string) => window.diegesis.docs.export(id), []);

  const moveDocument = useCallback(async (id: string, parentId: string | null, position: number) => {
    await window.diegesis.docs.move(id, parentId, position);
    setState((s) => {
      if (!s.activeRealmId) return s;
      // authoritative re-sync keeps ordering consistent with the DB
      window.diegesis.docs.listByRealm(s.activeRealmId).then((docs) =>
        setState((cur) => (cur.activeRealmId === s.activeRealmId ? { ...cur, docs } : cur))
      );
      return { ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, parentId, position } : d)) };
    });
  }, []);

  // ---- ui state ----
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveUiState = useCallback((patch: Partial<UiState>) => {
    setState((s) => {
      const uiState = { ...s.uiState, ...patch };
      if (uiTimer.current) clearTimeout(uiTimer.current);
      uiTimer.current = setTimeout(() => window.diegesis.ui.save(uiState).catch(console.error), 500);
      return { ...s, uiState };
    });
  }, []);

  const registerOpenDocument = useCallback((fn: (docId: string) => void) => {
    openDocRef.current = fn;
  }, []);
  const registerOnDocumentDeleted = useCallback((fn: (docId: string) => void) => {
    docDeletedRef.current = fn;
  }, []);
  const registerOpenPanel = useCallback((fn: (panel: PanelKind) => void) => {
    openPanelRef.current = fn;
  }, []);
  const openSettings = useCallback((sectionId?: string) => {
    setState((s) => ({ ...s, settingsSection: sectionId ?? null }));
    openPanelRef.current?.('settings');
  }, []);
  const clearSettingsSection = useCallback(() => {
    setState((s) => (s.settingsSection ? { ...s, settingsSection: null } : s));
  }, []);
  const registerOpenView = useCallback((fn: (viewId: string) => void) => {
    openViewRef.current = fn;
  }, []);
  const setAiDraft = useCallback((draft: string | null) => {
    setState((s) => ({ ...s, aiDraft: draft }));
  }, []);
  const setRightPanelView = useCallback((viewId: string | null) => {
    setState((s) => ({ ...s, rightPanelView: viewId }));
  }, []);
  const toggleRightPanel = useCallback((viewId: string) => {
    setState((s) => ({ ...s, rightPanelView: s.rightPanelView === viewId ? null : viewId }));
  }, []);
  const setAiChatOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, rightPanelView: open ? 'ai-chat' : s.rightPanelView === 'ai-chat' ? null : s.rightPanelView }));
  }, []);
  const toggleAiChat = useCallback(() => {
    setState((s) => ({ ...s, rightPanelView: s.rightPanelView === 'ai-chat' ? null : 'ai-chat' }));
  }, []);
  const focusPdf = useCallback((focus: PdfFocus) => {
    setState((s) => ({ ...s, pdfFocus: focus }));
  }, []);
  const clearPdfFocus = useCallback(() => {
    setState((s) => (s.pdfFocus ? { ...s, pdfFocus: null } : s));
  }, []);
  const subscribeExternalDocChange = useCallback((fn: (doc: DocNode) => void) => {
    externalDocListeners.current.add(fn);
    return () => externalDocListeners.current.delete(fn);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      aiChatOpen: state.rightPanelView === 'ai-chat',
      setActiveRealm,
      createRealm,
      renameRealm,
      deleteRealm,
      exportRealm,
      importRealm,
      createDocument,
      importPdf,
      updateDocument,
      flushDocument,
      deleteDocument,
      moveDocument,
      exportDocument,
      saveUiState,
      openDocument: (docId: string) => openDocRef.current?.(docId),
      registerOpenDocument,
      onDocumentDeleted: (docId: string) => docDeletedRef.current?.(docId),
      registerOnDocumentDeleted,
      openPanel: (panel: PanelKind) => openPanelRef.current?.(panel),
      registerOpenPanel,
      openSettings,
      clearSettingsSection,
      openView: (viewId: string) => openViewRef.current?.(viewId),
      registerOpenView,
      setAiDraft,
      setAiChatOpen,
      toggleAiChat,
      setRightPanelView,
      toggleRightPanel,
      focusPdf,
      clearPdfFocus,
      subscribeExternalDocChange,
    }),
    [
      state,
      setActiveRealm,
      createRealm,
      renameRealm,
      deleteRealm,
      exportRealm,
      importRealm,
      createDocument,
      importPdf,
      updateDocument,
      flushDocument,
      deleteDocument,
      moveDocument,
      exportDocument,
      saveUiState,
      registerOpenDocument,
      registerOnDocumentDeleted,
      registerOpenPanel,
      openSettings,
      clearSettingsSection,
      registerOpenView,
      setAiDraft,
      setAiChatOpen,
      toggleAiChat,
      setRightPanelView,
      toggleRightPanel,
      focusPdf,
      clearPdfFocus,
      subscribeExternalDocChange,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/* ---------- realm-level custom fonts ---------- */

/** fonts uploaded in the active realm's settings (available to editors) */
export function useRealmFonts(): CustomFont[] {
  const { uiState, activeRealmId } = useStore();
  return (activeRealmId ? uiState.realmSettings?.[activeRealmId]?.fonts : undefined) ?? [];
}

/** injects @font-face rules for the active realm's custom fonts */
export function RealmFontsStyle() {
  const fonts = useRealmFonts();
  if (fonts.length === 0) return null;
  const css = fonts
    .map((f) => `@font-face { font-family: ${JSON.stringify(f.name)}; src: url(${JSON.stringify(f.src)}); font-display: swap; }`)
    .join('\n');
  return <style data-realm-fonts="">{css}</style>;
}
