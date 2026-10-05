import { contextBridge, ipcRenderer } from 'electron';
import type {
  AIChatSources,
  AIIndexStatus,
  AIProviderConfig,
  AIToolEvent,
  ChatStreamChunk,
  DocChanges,
  DocInput,
  DiegesisCodexApi,
  PlayerDiegesisCodexApi,
  PlayerViewState,
  SyncStatus,
  UiState,
} from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DiegesisCodexApi = {
  realms: {
    list: () => ipcRenderer.invoke('realms:list'),
    create: (name) => ipcRenderer.invoke('realms:create', name),
    rename: (id, name) => ipcRenderer.invoke('realms:rename', id, name),
    delete: (id) => ipcRenderer.invoke('realms:delete', id),
    export: (id) => ipcRenderer.invoke('realms:export', id),
    import: () => ipcRenderer.invoke('realms:import'),
  },
  docs: {
    listByRealm: (realmId) => ipcRenderer.invoke('docs:list', realmId),
    create: (doc) => ipcRenderer.invoke('docs:create', doc),
    update: (id: string, changes: DocChanges) => ipcRenderer.invoke('docs:update', id, changes),
    delete: (id) => ipcRenderer.invoke('docs:delete', id),
    move: (id, parentId, position) => ipcRenderer.invoke('docs:move', id, parentId, position),
    search: (realmId, query) => ipcRenderer.invoke('docs:search', realmId, query),
    onChanged: (cb) => subscribe<string>('docs:changed', cb),
  },
  ui: {
    load: () => ipcRenderer.invoke('ui:load'),
    save: (state: UiState) => ipcRenderer.invoke('ui:save', state),
  },
  ai: {
    providers: () => ipcRenderer.invoke('ai:providers:list'),
    testProvider: (providerId, config) => ipcRenderer.invoke('ai:provider:test', providerId, config),
    getSettings: () => ipcRenderer.invoke('ai:settings:get'),
    setChatProvider: (cfg: AIProviderConfig | null) => ipcRenderer.invoke('ai:settings:setChat', cfg),
    searchProviders: () => ipcRenderer.invoke('ai:providers:search'),
    testSearchProvider: (providerId, config) => ipcRenderer.invoke('ai:search:test', providerId, config),
    setSearchProvider: (cfg: AIProviderConfig | null) => ipcRenderer.invoke('ai:settings:setSearch', cfg),
    indexStatus: () => ipcRenderer.invoke('ai:index:status'),
    rebuildIndex: () => ipcRenderer.invoke('ai:index:rebuild'),
    onIndexStatus: (cb) => subscribe<AIIndexStatus>('ai:index:status', cb),
    searchSemantic: (realmId, query) => ipcRenderer.invoke('ai:search:semantic', realmId, query),
    listConversations: (realmId) => ipcRenderer.invoke('ai:conversations:list', realmId),
    createConversation: (realmId) => ipcRenderer.invoke('ai:conversations:create', realmId),
    renameConversation: (id, title) => ipcRenderer.invoke('ai:conversations:rename', id, title),
    deleteConversation: (id) => ipcRenderer.invoke('ai:conversations:delete', id),
    listMessages: (conversationId) => ipcRenderer.invoke('ai:messages:list', conversationId),
    chat: (req) => ipcRenderer.invoke('ai:chat', req),
    inline: (req) => ipcRenderer.invoke('ai:inline', req),
    cancelChat: (chatId) => ipcRenderer.invoke('ai:chat:cancel', chatId),
    extractTable: (text: string) => ipcRenderer.invoke('ai:table:extract', text),
    onChatChunk: (cb) => subscribe<ChatStreamChunk>('ai:chat:chunk', cb),
    onChatSources: (cb) => subscribe<AIChatSources>('ai:chat:sources', cb),
    onToolEvent: (cb) => subscribe<AIToolEvent>('ai:chat:tool', cb),
  },
  pdf: {
    import: (realmId: string, parentId: string | null) => ipcRenderer.invoke('pdf:import', realmId, parentId),
    saveText: (docId: string, pages: string[]) => ipcRenderer.invoke('pdf:saveText', docId, pages),
    readThumb: (docId: string, page: number) => ipcRenderer.invoke('pdf:thumb:read', docId, page),
    writeThumb: (docId: string, page: number, base64: string) => ipcRenderer.invoke('pdf:thumb:write', docId, page, base64),
  },
  audio: {
    import: () => ipcRenderer.invoke('audio:import'),
    save: (name: string, data: ArrayBuffer) => ipcRenderer.invoke('audio:save', name, data),
  },
  images: {
    import: () => ipcRenderer.invoke('images:import'),
    save: (name: string, data: ArrayBuffer) => ipcRenderer.invoke('images:save', name, data),
  },
  app: {
    platform: () => ipcRenderer.invoke('app:platform'),
    version: () => ipcRenderer.invoke('app:version'),
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    read: (dir: string) => ipcRenderer.invoke('plugins:read', dir),
    openFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  },
  playerView: {
    open: () => ipcRenderer.invoke('player-view:open'),
    close: () => ipcRenderer.invoke('player-view:close'),
    status: () => ipcRenderer.invoke('player-view:status'),
    send: (state) => ipcRenderer.invoke('player-view:send', state),
    onState: (cb) => subscribe<PlayerViewState>('player-view:state', cb),
    onStatus: (cb) => subscribe<{ open: boolean }>('player-view:status', cb),
  },
  sync: {
    providers: () => ipcRenderer.invoke('sync:providers:list'),
    getSettings: () => ipcRenderer.invoke('sync:settings:get'),
    setProvider: (cfg) => ipcRenderer.invoke('sync:settings:setProvider', cfg),
    setPrefs: (patch) => ipcRenderer.invoke('sync:settings:setPrefs', patch),
    testProvider: (providerId, config) => ipcRenderer.invoke('sync:provider:test', providerId, config),
    onedriveAuth: (clientId) => ipcRenderer.invoke('sync:onedrive:auth', clientId),
    pickFolder: () => ipcRenderer.invoke('sync:pickFolder'),
    now: (realmId) => ipcRenderer.invoke('sync:now', realmId),
    status: () => ipcRenderer.invoke('sync:status'),
    onStatus: (cb) => subscribe<SyncStatus>('sync:status', cb),
    listConflicts: () => ipcRenderer.invoke('sync:conflicts:list'),
    resolveConflict: (id, resolution) => ipcRenderer.invoke('sync:conflicts:resolve', id, resolution),
    listVersions: (realmId, docId) => ipcRenderer.invoke('sync:versions:list', realmId, docId),
    restoreVersion: (realmId, docId, timestamp) => ipcRenderer.invoke('sync:versions:restore', realmId, docId, timestamp),
    listRemoteRealms: () => ipcRenderer.invoke('sync:remote:realms'),
    restoreRealm: (realmId) => ipcRenderer.invoke('sync:remote:restore', realmId),
  },
};

// The player-facing second window (?window=player) is shown to semi-trusted
// viewers: expose only the read-only surface it needs, never the full GM API
// (doc mutation, realm deletion, AI, etc.).
const locationSearch = (globalThis as { location?: { search?: string } }).location?.search ?? '';
const isPlayerWindow = new URLSearchParams(locationSearch).get('window') === 'player';

if (isPlayerWindow) {
  const playerApi: PlayerDiegesisCodexApi = {
    docs: {
      listByRealm: api.docs.listByRealm,
      onChanged: api.docs.onChanged,
    },
    playerView: {
      status: api.playerView.status,
      onState: api.playerView.onState,
    },
  };
  contextBridge.exposeInMainWorld('diegesis', playerApi);
} else {
  contextBridge.exposeInMainWorld('diegesis', api);
}
