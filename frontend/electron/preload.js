import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('codex', {
  start: () => ipcRenderer.invoke('codex:start'),
  sendPrompt: (prompt) => ipcRenderer.invoke('codex:sendPrompt', prompt),
  stop: () => ipcRenderer.invoke('codex:stop'),
  onEvent: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('codex:event', wrapped);
    return () => {
      ipcRenderer.removeListener('codex:event', wrapped);
    };
  },
});
