import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import * as db from './db';
import type { DocChanges, DocInput, UiState } from '../shared/types';

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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
