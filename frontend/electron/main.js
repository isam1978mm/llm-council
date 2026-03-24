/* global process */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { createCodexBridge } from './codexBridge.js';
import { registerCodexIpc } from './ipc.js';

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173';
const codexBridge = createCodexBridge();

let mainWindow = null;
let cleanupIpc = null;

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 960,
    minHeight: 720,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.resolve(import.meta.dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  cleanupIpc = registerCodexIpc({ codexBridge });
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (cleanupIpc) {
    cleanupIpc();
    cleanupIpc = null;
  }
  await codexBridge.stop();
});
