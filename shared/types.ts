// Types shared between main, preload and renderer.

export const APP_VERSION = '1.0.0';

/**
 * Plugin API compatibility version. External plugins declare the version they
 * were built against in manifest.json; the host refuses mismatched plugins.
 */
export const PLUGIN_API_VERSION = 2;

/** manifest.json of an external (community) plugin folder. */
export interface ExternalPluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  description?: string;
  author?: string;
  /** capability strings, e.g. 'ui', 'commands', 'docs:read' (see PluginPermission) */
  permissions?: string[];
  /** entry file relative to the plugin folder; defaults to 'main.js' */
  main?: string;
}

/** A plugin folder found under <userData>/plugins. */
export interface ExternalPluginInfo {
  /** folder name */
  dir: string;
  /** null when the manifest is missing/invalid (see error) */
  manifest: ExternalPluginManifest | null;
  error?: string;
}

export type DocumentType =
  | 'core/note'
  | 'core/whiteboard'
  | 'core/folder'
  | 'core/pdf'
  | 'hexcrawl/map'
  | 'diegesis/timeline'
  | 'diegesis/table'
  | 'diegesis/sheet';

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
  /** Notion-style cover banner (downscaled image data URL); shown above the note title */
  cover?: string | null;
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
  cover?: string | null;
  content?: string | null;
  position?: number;
}

export interface DocChanges {
  title?: string;
  icon?: string | null;
  cover?: string | null;
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
  /** width (px) of the hexcrawl map side panel */
  hexmapPanelWidth?: number;
  /** plugin manager persistence (enabled state + per-plugin settings) */
  plugins?: PluginUiState;
  /** audio player persistence */
  audio?: { masterVolume?: number };
  /** per-realm settings blobs, keyed by realm id */
  realmSettings?: Record<string, RealmSettings>;
}

/** a user-uploaded font (data URL) available to editors in a realm */
export interface CustomFont {
  id: string;
  /** display name, also used as the CSS font-family */
  name: string;
  /** data URL of the font file (ttf/otf/woff/woff2) */
  src: string;
}

export interface RealmSettings {
  /** custom fonts uploaded for this realm */
  fonts?: CustomFont[];
}

export interface AudioUiState {
  /** 0..1 multiplier applied to every playing instance */
  masterVolume?: number;
}

export interface PluginUiState {
  /** ids of plugins explicitly disabled by the user (all plugins default to enabled) */
  disabled?: string[];
  /** per-plugin settings blobs, keyed by plugin id */
  settings?: Record<string, Record<string, unknown>>;
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

/** Roll table extracted from a PDF region by the table-extract specialist. */
export interface ExtractedTableData {
  titulo: string;
  formula: string;
  linhas: { texto: string; peso: number }[];
}

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

/** An audio file copied into app storage (<userData>/audios). */
export interface AudioAsset {
  /** stored file name (<id>.<ext>) — also the protocol resource id */
  id: string;
  /** original file name, for display */
  name: string;
  /** diegesis-audio:// URL used by players */
  url: string;
  size: number;
}

export interface AudioImportResult {
  /** null when the user cancelled the file dialog */
  asset: AudioAsset | null;
  error?: string;
}

/** An image file copied into app storage (<userData>/images). */
export interface ImageAsset {
  /** stored file name (<id>.<ext>) — also the protocol resource id */
  id: string;
  /** original file name, for display */
  name: string;
  /** diegesis-image:// URL used by <img> tags */
  url: string;
  size: number;
}

export interface ImageImportResult {
  /** null when the user cancelled the file dialog */
  asset: ImageAsset | null;
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

// ---------- second window (player view) ----------

/** hexcrawl viewport: CENTER of the view in hex-space world coordinates +
 *  zoom. Window-size independent — each window rebuilds its own screen
 *  transform from it. */
export interface MapViewport {
  x: number;
  y: number;
  zoom: number;
}

/** what the player-facing second window should display */
export type SecondWindowState =
  | { kind: 'none' }
  | { kind: 'note'; realmId: string; docId: string }
  | { kind: 'map'; realmId: string; docId: string; viewport?: MapViewport | null };

export interface DiegesisCodexApi {
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
    /** fired when documents change in ANY window (user edits, AI tools) */
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
    /** extracts a roll table from raw text captured from a PDF region (AI) */
    extractTable(text: string): Promise<{ ok: boolean; table?: ExtractedTableData; error?: string }>;
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
  audio: {
    /** opens a file dialog and copies the chosen audio into app storage */
    import(): Promise<AudioImportResult>;
    /** stores an audio file the renderer already holds (paste/drop in editors) */
    save(name: string, data: ArrayBuffer): Promise<AudioImportResult>;
  };
  images: {
    /** opens a file dialog and copies the chosen image into app storage */
    import(): Promise<ImageImportResult>;
    /** stores an image the renderer already holds (paste/drop in editors) */
    save(name: string, data: ArrayBuffer): Promise<ImageImportResult>;
  };
  app: {
    platform(): Promise<NodeJS.Platform>;
    version(): Promise<string>;
  };
  plugins: {
    /** scans <userData>/plugins for external plugin folders */
    list(): Promise<ExternalPluginInfo[]>;
    /** reads the entry-file source code of a plugin folder */
    read(dir: string): Promise<string>;
    /** reveals the plugins folder in the OS file manager */
    openFolder(): Promise<void>;
  };
  secondWindow: {
    open(): Promise<void>;
    close(): Promise<void>;
    /** open state + last pushed content (used by the player window on load) */
    status(): Promise<{ open: boolean; state: SecondWindowState }>;
    /** pushes content to the player window (called from the GM window) */
    send(state: SecondWindowState): Promise<void>;
    /** player window: content pushed by the GM window */
    onState(cb: (state: SecondWindowState) => void): () => void;
    /** GM window: the second window was opened/closed */
    onStatus(cb: (status: { open: boolean }) => void): () => void;
  };
}

/** Reduced API surface exposed to the player-facing second window — read-only
 *  (the window is shown to semi-trusted viewers, so no doc mutation, realm
 *  management or AI capabilities). */
export interface PlayerDiegesisCodexApi {
  docs: Pick<DiegesisCodexApi['docs'], 'listByRealm' | 'onChanged'>;
  secondWindow: Pick<DiegesisCodexApi['secondWindow'], 'status' | 'onState'>;
}
