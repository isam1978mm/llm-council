import { ipcMain, webContents } from 'electron';

const SEND_CHANNEL = 'codex:event';

export function registerCodexIpc({ codexBridge }) {
  const forwardEvent = (event) => {
    for (const contents of webContents.getAllWebContents()) {
      if (!contents.isDestroyed()) {
        contents.send(SEND_CHANNEL, event);
      }
    }
  };

  codexBridge.on('event', forwardEvent);

  ipcMain.handle('codex:start', async () => {
    try {
      return await codexBridge.start();
    } catch (error) {
      console.error('[codex:start]', error);
      throw error;
    }
  });

  ipcMain.handle('codex:sendPrompt', async (_event, prompt) => {
    try {
      await codexBridge.sendPrompt(prompt);
      return { ok: true };
    } catch (error) {
      console.error('[codex:sendPrompt]', error);
      throw error;
    }
  });

  ipcMain.handle('codex:stop', async () => {
    try {
      await codexBridge.stop();
      return { ok: true };
    } catch (error) {
      console.error('[codex:stop]', error);
      throw error;
    }
  });

  return () => {
    codexBridge.off('event', forwardEvent);
    ipcMain.removeHandler('codex:start');
    ipcMain.removeHandler('codex:sendPrompt');
    ipcMain.removeHandler('codex:stop');
  };
}
