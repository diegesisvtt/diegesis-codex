// Types shared between main, preload and renderer.

export const APP_VERSION = '1.0.0';

export type DocumentType = 'core/note' | 'core/whiteboard' | 'core/folder';

export interface Realm {
  id: string;
  name: string;
  createdAt: number;
}

export interface DocNode {
  id: string;
  realmId: string;
  parentId: string | null;
  type: DocumentType;
  title: string;
  /** JSON string: tiptap doc for notes, { nodes: [...] } for whiteboards, null for folders */
  content: string | null;
  position: number;
  updatedAt: number;
}

export interface DocInput {
  id: string;
  realmId: string;
  parentId: string | null;
  type: DocumentType;
  title: string;
  content?: string | null;
  position?: number;
}

export interface DocChanges {
  title?: string;
  content?: string | null;
  parentId?: string | null;
  position?: number;
}

export interface UiState {
  layout?: unknown; // serialized flexlayout model
  activeRealmId?: string;
  sidebarVisible?: boolean;
}

export interface SearchResult {
  docId: string;
  title: string;
  type: DocumentType;
  /** HTML snippet with <mark> tags around matches */
  snippet: string;
}

export interface MythrilApi {
  realms: {
    list(): Promise<Realm[]>;
    create(name: string): Promise<Realm>;
    rename(id: string, name: string): Promise<void>;
    delete(id: string): Promise<void>;
  };
  docs: {
    listByRealm(realmId: string): Promise<DocNode[]>;
    create(doc: DocInput): Promise<DocNode>;
    update(id: string, changes: DocChanges): Promise<void>;
    delete(id: string): Promise<void>; // deletes subtree
    move(id: string, parentId: string | null, position: number): Promise<void>;
    search(realmId: string, query: string): Promise<SearchResult[]>;
  };
  ui: {
    load(): Promise<UiState | null>;
    save(state: UiState): Promise<void>;
  };
  app: {
    platform(): Promise<NodeJS.Platform>;
    version(): Promise<string>;
  };
}
