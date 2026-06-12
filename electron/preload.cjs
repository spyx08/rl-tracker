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

  // ── Config StatsAPI Rocket League ──
  getStatsApiStatus: () => ipcRenderer.invoke('statsapi-status-get'),
  onStatsApiStatus:  (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('statsapi-status', handler);
    return () => ipcRenderer.removeListener('statsapi-status', handler);
  },

  // ── Sessions / Dashboard ──
  saveSession:   (record) => ipcRenderer.send('session-save', record),
  getSessions:   ()       => ipcRenderer.invoke('sessions-get'),
  openDashboard: ()       => ipcRenderer.send('open-dashboard'),
  onSessionsUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('sessions-updated', handler);
    return () => ipcRenderer.removeListener('sessions-updated', handler);
  },
  copyText: (text) => ipcRenderer.send('copy-text', text),
  copyPanelImage: (rect) => ipcRenderer.invoke('copy-panel-image', rect),
  dashWindowControl: (action) => ipcRenderer.send('dashboard-window-control', action),
});
