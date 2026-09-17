import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import * as db from './db';
import * as pdf from './pdf';
import * as realmTransfer from './realmTransfer';
import * as aiConfig from './ai/config';
import * as embedder from './ai/embedder';
import { docEvents } from './ai/events';
import { semanticSearch, streamChat } from './ai/rag';
import { getProvider, listProviders } from './ai/providers/registry';
import type { AIChatRequest, AIProviderConfig, DocChanges, DocInput, UiState } from '../shared/types';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Must run before app 'ready'.
pdf.registerPdfScheme();

/** in-flight chat streams, keyed by renderer-provided chatId */
const activeChats = new Map<string, AbortController>();

function registerIpc(): void {
  ipcMain.handle('realms:list', () => db.listRealms());
  ipcMain.handle('realms:create', (_e, name: string) => db.createRealm(name));
  ipcMain.handle('realms:rename', (_e, id: string, name: string) => db.renameRealm(id, name));
  ipcMain.handle('realms:delete', (_e, id: string) => {
    const pdfIds = db.listRealmDocTypes(id).filter((d) => d.type === 'core/pdf');
    db.deleteRealm(id);
    for (const p of pdfIds) pdf.deletePdfFile(p.id);
  });
  ipcMain.handle('realms:export', (_e, id: string) => realmTransfer.exportRealm(id));
  ipcMain.handle('realms:import', () => realmTransfer.importRealm());

  ipcMain.handle('docs:list', (_e, realmId: string) => db.listDocs(realmId));
  ipcMain.handle('docs:create', (_e, input: DocInput) => db.createDoc(input));
  ipcMain.handle('docs:update', (_e, id: string, changes: DocChanges) => db.updateDoc(id, changes));
  ipcMain.handle('docs:delete', (_e, id: string) => {
    const pdfIds = db.listSubtreeDocs(id).filter((d) => d.type === 'core/pdf');
    db.deleteDoc(id);
    for (const p of pdfIds) pdf.deletePdfFile(p.id);
  });
  ipcMain.handle('docs:move', (_e, id: string, parentId: string | null, position: number) =>
    db.moveDoc(id, parentId, position)
  );
  ipcMain.handle('docs:search', (_e, realmId: string, query: string) => db.searchDocs(realmId, query));

  ipcMain.handle('pdf:import', (_e, realmId: string, parentId: string | null) => pdf.importPdf(realmId, parentId));
  ipcMain.handle('pdf:saveText', (_e, docId: string, pages: string[]) => db.savePdfPages(docId, pages));
  ipcMain.handle('pdf:thumb:read', (_e, docId: string, page: number) => pdf.readThumb(docId, page));
  ipcMain.handle('pdf:thumb:write', (_e, docId: string, page: number, base64: string) => pdf.writeThumb(docId, page, base64));

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
  ipcMain.handle('ai:conversations:list', (_e, realmId: string) => db.listConversations(realmId));
  ipcMain.handle('ai:conversations:create', (_e, realmId: string) => db.createConversation(realmId));
  ipcMain.handle('ai:conversations:rename', (_e, id: string, title: string) => db.renameConversation(id, title));
  ipcMain.handle('ai:conversations:delete', (_e, id: string) => db.deleteConversation(id));
  ipcMain.handle('ai:messages:list', (_e, conversationId: string) => db.listChatMessages(conversationId));
  ipcMain.handle('ai:chat', (event, req: AIChatRequest) => {
    const sender = event.sender;
    const safeSend = (channel: string, payload: unknown) => {
      if (!sender.isDestroyed()) sender.send(channel, payload);
    };
    const controller = new AbortController();
    activeChats.set(req.chatId, controller);
    return streamChat(
      req,
      {
        onChunk: (chunk) => safeSend('ai:chat:chunk', chunk),
        onSources: (chatId, sources) => safeSend('ai:chat:sources', { chatId, sources }),
        onTool: (chatId, summary, ok) => safeSend('ai:chat:tool', { chatId, summary, ok }),
      },
      controller.signal
    ).finally(() => activeChats.delete(req.chatId));
  });
  ipcMain.handle('ai:chat:cancel', (_e, chatId: string) => {
    activeChats.get(chatId)?.abort();
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

  // Open external links in the system browser, never in-app. Only safe schemes:
  // PDF link annotations are attacker-controlled (file:/smb:/javascript: etc.).
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const proto = new URL(url).protocol;
      if (proto === 'https:' || proto === 'http:' || proto === 'mailto:') shell.openExternal(url);
    } catch {
      /* ignore malformed URLs */
    }
    return { action: 'deny' };
  });
  // defense-in-depth: never let anything navigate the main window
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  pdf.registerPdfProtocol();
  db.initDb();
  registerIpc();
  embedder.startEmbedder();
  embedder.indexEvents.on('status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('ai:index:status', status);
  });
  docEvents.on('changed', (realmId) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('docs:changed', realmId);
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
