import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DocNode, DocChanges, DocumentType, Realm, UiState } from '@shared/types';

const generateId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

interface StoreState {
  ready: boolean;
  realms: Realm[];
  activeRealmId: string | null;
  docs: DocNode[];
  uiState: UiState;
}

interface StoreActions {
  setActiveRealm(id: string): Promise<void>;
  createRealm(name: string): Promise<void>;
  renameRealm(id: string, name: string): Promise<void>;
  deleteRealm(id: string): Promise<void>;

  createDocument(type: DocumentType, parentId: string | null, title?: string): Promise<DocNode>;
  updateDocument(id: string, changes: DocChanges): void; // optimistic + debounced persist
  deleteDocument(id: string): Promise<void>;
  moveDocument(id: string, parentId: string | null, position: number): Promise<void>;

  saveUiState(patch: Partial<UiState>): void;
  /** registered by the Workspace so other components can open tabs */
  openDocument(docId: string): void;
  registerOpenDocument(fn: (docId: string) => void): void;
  onDocumentDeleted(docId: string): void;
  registerOnDocumentDeleted(fn: (docId: string) => void): void;
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null);
export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
};

function defaultContent(type: DocumentType): string | null {
  if (type === 'core/note') return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
  if (type === 'core/whiteboard') return JSON.stringify({ nodes: [] });
  return null;
}

const DEFAULT_TITLES: Record<DocumentType, string> = {
  'core/note': 'Nova Nota',
  'core/whiteboard': 'Novo Quadro',
  'core/folder': 'Nova Pasta',
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoreState>({
    ready: false,
    realms: [],
    activeRealmId: null,
    docs: [],
    uiState: {},
  });

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const openDocRef = useRef<((docId: string) => void) | null>(null);
  const docDeletedRef = useRef<((docId: string) => void) | null>(null);

  // ---- bootstrap ----
  useEffect(() => {
    (async () => {
      const [realms, ui] = await Promise.all([window.mythril.realms.list(), window.mythril.ui.load()]);
      const activeRealmId =
        ui?.activeRealmId && realms.some((r) => r.id === ui.activeRealmId)
          ? ui.activeRealmId
          : realms[0]?.id ?? null;
      const docs = activeRealmId ? await window.mythril.docs.listByRealm(activeRealmId) : [];
      setState({ ready: true, realms, activeRealmId, docs, uiState: ui ?? {} });
    })();
  }, []);

  const setActiveRealm = useCallback(async (id: string) => {
    const docs = await window.mythril.docs.listByRealm(id);
    setState((s) => ({ ...s, activeRealmId: id, docs }));
    window.mythril.ui.load().then((ui) =>
      window.mythril.ui.save({ ...(ui ?? {}), activeRealmId: id })
    );
  }, []);

  // ---- realms ----
  const createRealm = useCallback(async (name: string) => {
    const realm = await window.mythril.realms.create(name);
    setState((s) => ({ ...s, realms: [...s.realms, realm], activeRealmId: realm.id, docs: [] }));
  }, []);

  const renameRealm = useCallback(async (id: string, name: string) => {
    await window.mythril.realms.rename(id, name);
    setState((s) => ({ ...s, realms: s.realms.map((r) => (r.id === id ? { ...r, name } : r)) }));
  }, []);

  const deleteRealm = useCallback(async (id: string) => {
    await window.mythril.realms.delete(id);
    setState((s) => {
      const realms = s.realms.filter((r) => r.id !== id);
      const nextActive = s.activeRealmId === id ? realms[0]?.id ?? null : s.activeRealmId;
      return { ...s, realms, activeRealmId: nextActive, docs: s.activeRealmId === id ? [] : s.docs };
    });
  }, []);

  // ---- documents ----
  const createDocument = useCallback(
    async (type: DocumentType, parentId: string | null, title?: string): Promise<DocNode> => {
      const realmId = state.activeRealmId;
      if (!realmId) throw new Error('No active realm');
      const doc = await window.mythril.docs.create({
        id: generateId(),
        realmId,
        parentId,
        type,
        title: title ?? DEFAULT_TITLES[type],
        content: defaultContent(type),
      });
      setState((s) => ({ ...s, docs: [...s.docs, doc] }));
      return doc;
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
        window.mythril.docs.update(id, changes).catch(console.error);
      }, changes.title !== undefined && changes.content === undefined ? 250 : 600)
    );
  }, []);

  const deleteDocument = useCallback(
    async (id: string) => {
      await window.mythril.docs.delete(id);
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

  const moveDocument = useCallback(async (id: string, parentId: string | null, position: number) => {
    await window.mythril.docs.move(id, parentId, position);
    setState((s) => {
      if (!s.activeRealmId) return s;
      // authoritative re-sync keeps ordering consistent with the DB
      window.mythril.docs.listByRealm(s.activeRealmId).then((docs) =>
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
      uiTimer.current = setTimeout(() => window.mythril.ui.save(uiState).catch(console.error), 500);
      return { ...s, uiState };
    });
  }, []);

  const registerOpenDocument = useCallback((fn: (docId: string) => void) => {
    openDocRef.current = fn;
  }, []);
  const registerOnDocumentDeleted = useCallback((fn: (docId: string) => void) => {
    docDeletedRef.current = fn;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      setActiveRealm,
      createRealm,
      renameRealm,
      deleteRealm,
      createDocument,
      updateDocument,
      deleteDocument,
      moveDocument,
      saveUiState,
      openDocument: (docId: string) => openDocRef.current?.(docId),
      registerOpenDocument,
      onDocumentDeleted: (docId: string) => docDeletedRef.current?.(docId),
      registerOnDocumentDeleted,
    }),
    [
      state,
      setActiveRealm,
      createRealm,
      renameRealm,
      deleteRealm,
      createDocument,
      updateDocument,
      deleteDocument,
      moveDocument,
      saveUiState,
      registerOpenDocument,
      registerOnDocumentDeleted,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
