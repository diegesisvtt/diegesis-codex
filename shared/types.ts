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

// ---------- AI / RAG ----------

export interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  placeholder?: string;
  required?: boolean;
  /** secret fields are encrypted at rest and masked when read back */
  secret?: boolean;
  default?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  fields: ProviderField[];
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AIProviderConfig {
  providerId: string;
  config: Record<string, string>;
}

export interface AISettings {
  chat: AIProviderConfig | null;
}

/** sentinel returned in place of stored secret values */
export const SECRET_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

export type EmbedModelState = 'idle' | 'downloading' | 'ready' | 'error';

export interface AIIndexStatus {
  /** local embedding model lifecycle (one-time download, then offline) */
  modelState: EmbedModelState;
  /** 0..100 download progress */
  modelProgress: number;
  pendingJobs: number;
  processing: boolean;
  chunkCount: number;
  embeddedCount: number;
  /** last embedding pipeline error, if any */
  lastError: string | null;
}

export interface SemanticSearchResult {
  docId: string;
  title: string;
  type: DocumentType;
  snippet: string;
  /** 0..1 similarity score */
  score: number;
}

export interface RetrievedChunk {
  docId: string;
  title: string;
  type: DocumentType;
  text: string;
  score: number;
}

export interface AIChatRequest {
  chatId: string;
  realmId: string | null;
  messages: ChatMessage[];
  useContext: boolean;
}

export interface ChatStreamChunk {
  chatId: string;
  delta: string;
  done: boolean;
  error?: string;
}

export interface AIChatSources {
  chatId: string;
  sources: RetrievedChunk[];
}

export interface ProviderTestResult {
  ok: boolean;
  error?: string;
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
  ai: {
    providers(): Promise<ProviderInfo[]>;
    testProvider(providerId: string, config: Record<string, string>): Promise<ProviderTestResult>;
    getSettings(): Promise<AISettings>;
    setChatProvider(cfg: AIProviderConfig | null): Promise<void>;
    indexStatus(): Promise<AIIndexStatus>;
    rebuildIndex(): Promise<void>;
    onIndexStatus(cb: (status: AIIndexStatus) => void): () => void;
    searchSemantic(realmId: string, query: string): Promise<SemanticSearchResult[]>;
    chat(req: AIChatRequest): Promise<void>;
    onChatChunk(cb: (chunk: ChatStreamChunk) => void): () => void;
    onChatSources(cb: (s: AIChatSources) => void): () => void;
  };
  app: {
    platform(): Promise<NodeJS.Platform>;
    version(): Promise<string>;
  };
}
