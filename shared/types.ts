// Types shared between main, preload and renderer.

export const APP_VERSION = '1.0.0';

export type DocumentType = 'core/note' | 'core/whiteboard' | 'core/folder' | 'core/pdf';

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
  /** Notion-style page icon (RPG icon set name); also used by PDF pins of this note */
  icon?: string | null;
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
  icon?: string | null;
  content?: string | null;
  position?: number;
}

export interface DocChanges {
  title?: string;
  icon?: string | null;
  content?: string | null;
  parentId?: string | null;
  position?: number;
}

export interface UiState {
  layout?: unknown; // serialized flexlayout model
  activeRealmId?: string;
  sidebarVisible?: boolean;
  /** width (px) of the right-side AI chat panel */
  aiPanelWidth?: number;
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
  /** web search provider; null = DuckDuckGo default (keyless) */
  search: AIProviderConfig | null;
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
  /** source page for PDF chunks; null for other doc types */
  page?: number | null;
}

export interface AIChatRequest {
  chatId: string;
  conversationId: string;
  realmId: string | null;
  messages: ChatMessage[];
  useContext: boolean;
  /** when true, the assistant may call the web_search tool (DuckDuckGo, no API key) */
  useWebSearch?: boolean;
}

export interface Conversation {
  id: string;
  realmId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  sources?: RetrievedChunk[];
  createdAt: number;
}

/** Emitted when the assistant uses a tool during a chat turn. */
export interface AIToolEvent {
  chatId: string;
  /** human-readable summary, e.g. 'Criou a nota "Arton"' */
  summary: string;
  ok: boolean;
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

export interface PdfImportResult {
  /** null when the user cancelled the file dialog */
  doc: DocNode | null;
  error?: string;
}

export interface RealmTransferResult {
  ok: boolean;
  /** true when the user dismissed the file dialog */
  canceled?: boolean;
  error?: string;
  /** import only: the newly created realm */
  realm?: Realm;
  /** export only: where the file was written */
  filePath?: string;
}

export interface MythrilApi {
  realms: {
    list(): Promise<Realm[]>;
    create(name: string): Promise<Realm>;
    rename(id: string, name: string): Promise<void>;
    delete(id: string): Promise<void>;
    /** opens a save dialog and writes the realm (docs + PDFs) to a JSON file */
    export(id: string): Promise<RealmTransferResult>;
    /** opens a file dialog and imports a previously exported realm file */
    import(): Promise<RealmTransferResult>;
  };
  docs: {
    listByRealm(realmId: string): Promise<DocNode[]>;
    create(doc: DocInput): Promise<DocNode>;
    update(id: string, changes: DocChanges): Promise<void>;
    delete(id: string): Promise<void>; // deletes subtree
    move(id: string, parentId: string | null, position: number): Promise<void>;
    search(realmId: string, query: string): Promise<SearchResult[]>;
    /** fired when documents are changed outside the renderer (e.g. AI tools) */
    onChanged(cb: (realmId: string) => void): () => void;
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
    searchProviders(): Promise<ProviderInfo[]>;
    testSearchProvider(providerId: string, config: Record<string, string>): Promise<ProviderTestResult>;
    setSearchProvider(cfg: AIProviderConfig | null): Promise<void>;
    indexStatus(): Promise<AIIndexStatus>;
    rebuildIndex(): Promise<void>;
    onIndexStatus(cb: (status: AIIndexStatus) => void): () => void;
    searchSemantic(realmId: string, query: string): Promise<SemanticSearchResult[]>;
    listConversations(realmId: string): Promise<Conversation[]>;
    createConversation(realmId: string): Promise<Conversation>;
    renameConversation(id: string, title: string): Promise<void>;
    deleteConversation(id: string): Promise<void>;
    listMessages(conversationId: string): Promise<StoredChatMessage[]>;
    chat(req: AIChatRequest): Promise<void>;
    cancelChat(chatId: string): Promise<void>;
    onChatChunk(cb: (chunk: ChatStreamChunk) => void): () => void;
    onChatSources(cb: (s: AIChatSources) => void): () => void;
    onToolEvent(cb: (e: AIToolEvent) => void): () => void;
  };
  pdf: {
    /** opens a file dialog, copies the PDF into app storage and creates the document */
    import(realmId: string, parentId: string | null): Promise<PdfImportResult>;
    /** stores extracted per-page text (index 0 = page 1) and re-indexes the doc */
    saveText(docId: string, pages: string[]): Promise<void>;
    /** page thumbnail disk cache (base64 JPEG); null when not cached */
    readThumb(docId: string, page: number): Promise<string | null>;
    writeThumb(docId: string, page: number, base64: string): Promise<void>;
  };
  app: {
    platform(): Promise<NodeJS.Platform>;
    version(): Promise<string>;
  };
}
