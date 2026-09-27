import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import type { SecondWindowState } from '../shared/types';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

let playerWindow: BrowserWindow | null = null;
let lastState: SecondWindowState = { kind: 'none' };

export function isSecondWindowOpen(): boolean {
  return playerWindow !== null && !playerWindow.isDestroyed();
}

export function getSecondWindowState(): SecondWindowState {
  return lastState;
}

/** Broadcasts the open/closed status to every window (GM UI reacts to it). */
function broadcastStatus(): void {
  const open = isSecondWindowOpen();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('second-window:status', { open });
  }
}

export function openSecondWindow(): void {
  if (isSecondWindowOpen()) {
    playerWindow!.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0c0a09',
    title: 'Mythril — Visão do Jogador',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  // application menu is removed in main.ts; restore its dev shortcuts here
  if (process.env.VITE_DEV_SERVER_URL) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F12') win.webContents.toggleDevTools();
      if (input.key.toLowerCase() === 'r' && (input.control || input.meta) && input.shift) win.webContents.reload();
    });
  }

  // same hardening as the main window: no navigation; safe links (e.g. from
  // parchment notes) open in the system browser, everything else is denied
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const proto = new URL(url).protocol;
      if (proto === 'https:' || proto === 'http:' || proto === 'mailto:') shell.openExternal(url);
    } catch {
      /* ignore malformed URLs */
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('closed', () => {
    playerWindow = null;
    broadcastStatus();
  });

  playerWindow = win;

  if (isDev) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL!);
    url.searchParams.set('window', 'player');
    win.loadURL(url.toString());
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { window: 'player' } });
  }

  win.webContents.once('did-finish-load', broadcastStatus);
}

export function closeSecondWindow(): void {
  if (isSecondWindowOpen()) playerWindow!.close();
}

/** Caches the state (restored when the window reopens) and pushes it live. */
export function sendToSecondWindow(state: SecondWindowState): void {
  lastState = state;
  if (isSecondWindowOpen()) {
    playerWindow!.webContents.send('second-window:state', state);
  }
}
