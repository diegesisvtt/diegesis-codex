import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import * as db from './db';
import * as aiConfig from './ai/config';
import * as embedder from './ai/embedder';
import { semanticSearch, streamChat } from './ai/rag';
import { getProvider, listProviders } from './ai/providers/registry';
import type { AIChatRequest, AIProviderConfig, DocChanges, DocInput, UiState } from '../shared/types';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function registerIpc(): void {
  ipcMain.handle('realms:list', () => db.listRealms());
  ipcMain.handle('realms:create', (_e, name: string) => db.createRealm(name));
  ipcMain.handle('realms:rename', (_e, id: string, name: string) => db.renameRealm(id, name));
  ipcMain.handle('realms:delete', (_e, id: string) => db.deleteRealm(id));

  ipcMain.handle('docs:list', (_e, realmId: string) => db.listDocs(realmId));
  ipcMain.handle('docs:create', (_e, input: DocInput) => db.createDoc(input));
  ipcMain.handle('docs:update', (_e, id: string, changes: DocChanges) => db.updateDoc(id, changes));
  ipcMain.handle('docs:delete', (_e, id: string) => db.deleteDoc(id));
  ipcMain.handle('docs:move', (_e, id: string, parentId: string | null, position: number) =>
    db.moveDoc(id, parentId, position)
  );
  ipcMain.handle('docs:search', (_e, realmId: string, query: string) => db.searchDocs(realmId, query));

  ipcMain.handle('ui:load', () => db.loadUiState());
  ipcMain.handle('ui:save', (_e, state: UiState) => db.saveUiState(state));

  // ---- AI / RAG ----
  ipcMain.handle('ai:providers:list', () => listProviders());
  ipcMain.handle('ai:provider:test', (_e, providerId: string, config: Record<string, string>) => {
    const provider = getProvider(providerId);
    if (!provider) return { ok: false, error: `Provider desconhecido: ${providerId}` };
    return provider.testConnection(aiConfig.resolveMaskedSecrets(providerId, config));
  });
  ipcMain.handle('ai:settings:get', () => aiConfig.getAISettings());
  ipcMain.handle('ai:settings:setChat', (_e, cfg: AIProviderConfig | null) => {
    aiConfig.setChatProvider(cfg);
  });
  ipcMain.handle('ai:index:status', () => embedder.currentStatus());
  ipcMain.handle('ai:index:rebuild', () => embedder.rebuildIndex());
  ipcMain.handle('ai:search:semantic', (_e, realmId: string, query: string) =>
    semanticSearch(realmId, query)
  );
  ipcMain.handle('ai:chat', (event, req: AIChatRequest) => {
    const sender = event.sender;
    const safeSend = (channel: string, payload: unknown) => {
      if (!sender.isDestroyed()) sender.send(channel, payload);
    };
    return streamChat(req, {
      onChunk: (chunk) => safeSend('ai:chat:chunk', chunk),
      onSources: (chatId, sources) => safeSend('ai:chat:sources', { chatId, sources }),
    });
  });

  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('app:version', () => app.getVersion());
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#18181b',
    title: 'Mythril',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs nothing native, but keep require of electron only
      spellcheck: true,
    },
  });

  // Open external links in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  db.initDb();
  registerIpc();
  embedder.startEmbedder();
  embedder.indexEvents.on('status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('ai:index:status', status);
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
