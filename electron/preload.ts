import { contextBridge, ipcRenderer } from 'electron';
import type { DocChanges, DocInput, MythrilApi, UiState } from '../shared/types';

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
  app: {
    platform: () => ipcRenderer.invoke('app:platform'),
    version: () => ipcRenderer.invoke('app:version'),
  },
};

contextBridge.exposeInMainWorld('mythril', api);
