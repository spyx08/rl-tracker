const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setClickThrough: (enabled)   => ipcRenderer.send('set-click-through', enabled),
  setEditMode:     (editing)   => ipcRenderer.send('set-edit-mode', editing),
  quit:            ()          => ipcRenderer.send('quit'),
  installUpdate:   ()          => ipcRenderer.send('install-update'),
  onUpdateStatus:  (callback)  => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    // Retourne une fonction de nettoyage pour le useEffect React
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  openLogs: () => ipcRenderer.send('open-logs'),
});
