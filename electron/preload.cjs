const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setClickThrough: (enabled) => ipcRenderer.send('set-click-through', enabled),
  setEditMode:     (editing)  => ipcRenderer.send('set-edit-mode', editing),
  quit:            ()         => ipcRenderer.send('quit'),
});
