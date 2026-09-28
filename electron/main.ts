import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import * as db from './db';
import * as pdf from './pdf';
import * as audio from './audio';
import * as plugins from './plugins';
import * as realmTransfer from './realmTransfer';
import * as secondWindow from './secondWindow';
import * as aiConfig from './ai/config';
import * as embedder from './ai/embedder';
import { docEvents } from './ai/events';
import { semanticSearch, streamChat } from './ai/rag';
import { getProvider, listProviders } from './ai/providers/registry';
import { emptyDossier, runSpecialist } from './ai/specialists/base';
import { tableExtractSpecialist } from './ai/specialists/table-extract';
import { listSearchProviders, runWebSearch } from './ai/websearch';
import type { AIChatRequest, AIProviderConfig, DocChanges, DocInput, SecondWindowState, UiState } from '../shared/types';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// Must run before app 'ready'.
pdf.registerPdfScheme();
audio.registerAudioScheme();

/** in-flight chat streams, keyed by renderer-provided chatId */
const activeChats = new Map<string, AbortController>();

/** Notifies every window that documents in a realm changed (live sync). */
function broadcastDocsChanged(realmId: string | null): void {
  if (!realmId) return;
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('docs:changed', realmId);
}

/** Deletes audio files only when no surviving document references them —
 *  the same file can be shared by pasted blocks or re-imported realms. */
function deleteUnreferencedAudio(candidates: string[]): void {
  if (candidates.length === 0) return;
  const remaining = db.listAllDocContents();
  for (const f of new Set(candidates)) {
    if (!remaining.some((c) => c?.includes(f))) audio.deleteAudioFile(f);
  }
}

function registerIpc(): void {
  ipcMain.handle('realms:list', () => db.listRealms());
  ipcMain.handle('realms:create', (_e, name: string) => db.createRealm(name));
  ipcMain.handle('realms:rename', (_e, id: string, name: string) => db.renameRealm(id, name));
  ipcMain.handle('realms:delete', (_e, id: string) => {
    const docs = db.listRealmDocTypes(id);
    const pdfIds = docs.filter((d) => d.type === 'core/pdf');
    const audioFiles = docs.flatMap((d) => audio.extractAudioRefs(d.content));
    db.deleteRealm(id);
    for (const p of pdfIds) pdf.deletePdfFile(p.id);
    deleteUnreferencedAudio(audioFiles);
  });
  ipcMain.handle('realms:export', (_e, id: string) => realmTransfer.exportRealm(id));
  ipcMain.handle('realms:import', () => realmTransfer.importRealm());

  ipcMain.handle('docs:list', (_e, realmId: string) => db.listDocs(realmId));
  ipcMain.handle('docs:create', (_e, input: DocInput) => {
    const doc = db.createDoc(input);
    broadcastDocsChanged(doc.realmId);
    return doc;
  });
  ipcMain.handle('docs:update', (_e, id: string, changes: DocChanges) => {
    db.updateDoc(id, changes);
    broadcastDocsChanged(db.getDocRealmId(id));
  });
  ipcMain.handle('docs:delete', (_e, id: string) => {
    const realmId = db.getDocRealmId(id);
    const docs = db.listSubtreeDocs(id);
    const pdfIds = docs.filter((d) => d.type === 'core/pdf');
    const audioFiles = docs.flatMap((d) => audio.extractAudioRefs(d.content));
    db.deleteDoc(id);
    for (const p of pdfIds) pdf.deletePdfFile(p.id);
    deleteUnreferencedAudio(audioFiles);
    broadcastDocsChanged(realmId);
  });
  ipcMain.handle('docs:move', (_e, id: string, parentId: string | null, position: number) => {
    db.moveDoc(id, parentId, position);
    broadcastDocsChanged(db.getDocRealmId(id));
  });
  ipcMain.handle('docs:search', (_e, realmId: string, query: string) => db.searchDocs(realmId, query));

  ipcMain.handle('pdf:import', (_e, realmId: string, parentId: string | null) => pdf.importPdf(realmId, parentId));
  ipcMain.handle('pdf:saveText', (_e, docId: string, pages: string[]) => db.savePdfPages(docId, pages));
  ipcMain.handle('pdf:thumb:read', (_e, docId: string, page: number) => pdf.readThumb(docId, page));
  ipcMain.handle('pdf:thumb:write', (_e, docId: string, page: number, base64: string) => pdf.writeThumb(docId, page, base64));

  ipcMain.handle('audio:import', () => audio.importAudio());
  ipcMain.handle('audio:save', (_e, name: string, data: Uint8Array) => audio.saveAudio(name, data));

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
  ipcMain.handle('ai:providers:search', () => listSearchProviders());
  ipcMain.handle('ai:search:test', async (_e, providerId: string, config: Record<string, string>) => {
    try {
      await runWebSearch('mythril test', { providerId, config: aiConfig.resolveMaskedSearchSecrets(providerId, config) });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('ai:settings:setSearch', (_e, cfg: AIProviderConfig | null) => {
    aiConfig.setSearchProvider(cfg);
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

  // PDF region capture → table-extract specialist → structured table
  ipcMain.handle('ai:table:extract', async (_e, text: string) => {
    try {
      if (!text?.trim()) return { ok: false, error: 'Nenhum texto encontrado na região selecionada.' };
      const cfg = aiConfig.getResolvedChatConfig();
      if (!cfg) return { ok: false, error: 'Configure um provider de chat nas configurações de IA.' };
      const provider = getProvider(cfg.providerId);
      if (!provider) return { ok: false, error: `Provider desconhecido: ${cfg.providerId}` };
      const table = await runSpecialist(
        tableExtractSpecialist,
        { texto: text },
        { realmId: '', canon: [], dossier: emptyDossier() },
        { provider, config: cfg.config }
      );
      return { ok: true, table };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('app:version', () => app.getVersion());

  // ---- external plugins ----
  ipcMain.handle('plugins:list', () => plugins.listPlugins());
  ipcMain.handle('plugins:read', (_e, dir: string) => plugins.readPluginCode(dir));
  ipcMain.handle('plugins:openFolder', () => plugins.openPluginsFolder());

  // ---- second window (player view) ----
  ipcMain.handle('second-window:open', () => secondWindow.openSecondWindow());
  ipcMain.handle('second-window:close', () => secondWindow.closeSecondWindow());
  ipcMain.handle('second-window:status', () => ({
    open: secondWindow.isSecondWindowOpen(),
    state: secondWindow.getSecondWindowState(),
  }));
  ipcMain.handle('second-window:send', (_e, state: SecondWindowState) => {
    if (!isValidSecondWindowState(state)) {
      console.warn('[second-window] estado inválido rejeitado:', state);
      return;
    }
    secondWindow.sendToSecondWindow(state);
  });
}

/** Structural validation at the IPC boundary — any window can invoke
 *  'second-window:send', so a malformed state must not reach the player. */
function isValidSecondWindowState(s: unknown): s is SecondWindowState {
  if (!s || typeof s !== 'object') return false;
  const state = s as Record<string, unknown>;
  if (state.kind === 'none') return true;
  if (state.kind !== 'note' && state.kind !== 'map') return false;
  if (typeof state.realmId !== 'string' || typeof state.docId !== 'string') return false;
  if (state.kind === 'map' && state.viewport != null) {
    const v = state.viewport as Record<string, unknown>;
    if (!v || typeof v !== 'object') return false;
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.zoom)) return false;
    if ((v.zoom as number) < 0.05 || (v.zoom as number) > 10) return false;
  }
  return true;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#18181b',
    title: 'Mythril',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs nothing native, but keep require of electron only
      spellcheck: true,
    },
  });

  // the application menu is removed (see whenReady), so restore the shortcuts
  // it used to provide in dev
  if (isDev) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F12') win.webContents.toggleDevTools();
      if (input.key.toLowerCase() === 'r' && (input.control || input.meta) && input.shift) win.webContents.reload();
    });
  }

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

  // the player window makes no sense without the GM window
  win.on('closed', () => secondWindow.closeSecondWindow());

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // No native menu: Mythril has its own title bar, and with autoHideMenuBar
  // pressing Alt would reveal/focus the hidden menu bar — stealing focus and
  // breaking Alt as the snap-bypass modifier in the canvas editors.
  // (On macOS the menu is kept: the edit roles power Cmd+C/V in text fields.)
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  pdf.registerPdfProtocol();
  audio.registerAudioProtocol();
  db.initDb();
  // reclaim audio files orphaned by removed blocks/shapes/highlight attachments
  audio.gcAudioFiles(db.listAllDocContents());
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
