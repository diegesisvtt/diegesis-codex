import { contextBridge, ipcRenderer } from 'electron';
import type {
  AIChatSources,
  AIIndexStatus,
  AIProviderConfig,
  ChatStreamChunk,
  DocChanges,
  DocInput,
  MythrilApi,
  UiState,
} from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: MythrilApi = {
  realms: {
    list: () => ipcRenderer.invoke('realms:list'),
    create: (name) => ipcRenderer.invoke('realms:create', name),
    rename: (id, name) => ipcRenderer.invoke('realms:rename', id, name),
    delete: (id) => ipcRenderer.invoke('realms:delete', id),
  },
  docs: {
    listByRealm: (realmId) => ipcRenderer.invoke('docs:list', realmId),
    create: (doc) => ipcRenderer.invoke('docs:create', doc),
    update: (id: string, changes: DocChanges) => ipcRenderer.invoke('docs:update', id, changes),
    delete: (id) => ipcRenderer.invoke('docs:delete', id),
    move: (id, parentId, position) => ipcRenderer.invoke('docs:move', id, parentId, position),
    search: (realmId, query) => ipcRenderer.invoke('docs:search', realmId, query),
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
    indexStatus: () => ipcRenderer.invoke('ai:index:status'),
    rebuildIndex: () => ipcRenderer.invoke('ai:index:rebuild'),
    onIndexStatus: (cb) => subscribe<AIIndexStatus>('ai:index:status', cb),
    searchSemantic: (realmId, query) => ipcRenderer.invoke('ai:search:semantic', realmId, query),
    chat: (req) => ipcRenderer.invoke('ai:chat', req),
    onChatChunk: (cb) => subscribe<ChatStreamChunk>('ai:chat:chunk', cb),
    onChatSources: (cb) => subscribe<AIChatSources>('ai:chat:sources', cb),
  },
  app: {
    platform: () => ipcRenderer.invoke('app:platform'),
    version: () => ipcRenderer.invoke('app:version'),
  },
};

contextBridge.exposeInMainWorld('mythril', api);
