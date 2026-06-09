const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  utilityProcess,
} = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let serverProcess = null;

function startBackendServer() {
  // In dev: server.js lives next to this file's parent.
  // In packaged app: electron-builder copies server/ to resources/server/.
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "../server");
  const serverPath = path.join(serverDir, "server.js");

  // utilityProcess.fork() uses Electron's bundled Node.js — no system Node needed
  serverProcess = utilityProcess.fork(serverPath, [], {
    stdio: "pipe",
    serviceName: "RL Overlay Server",
    cwd: serverDir,
    env: { ...process.env },
  });

  serverProcess.stdout?.on("data", (d) => process.stdout.write(d));
  serverProcess.stderr?.on("data", (d) => process.stderr.write(d));
  serverProcess.on("exit", (code) => {
    if (code !== 0) console.warn(`[server] exited with code ${code}`);
  });
}

function createWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:3005");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ── Auto-updater ──────────────────────────────────────────────────────────
function setupAutoUpdater() {
  // Only run in packaged app — dev builds skip update checks
  if (!app.isPackaged) return;

  autoUpdater.autoDownload    = true;   // téléchargement automatique en fond
  autoUpdater.autoInstallOnAppQuit = true; // installation automatique à la fermeture

  const send = (data) => mainWindow?.webContents.send('update-status', data);

  autoUpdater.on('checking-for-update',  ()     => send({ status: 'checking' }));
  autoUpdater.on('update-not-available', ()     => send({ status: 'up-to-date' }));
  autoUpdater.on('update-available',     (info) => send({ status: 'available',   version: info.version }));
  autoUpdater.on('download-progress',    (p)    => send({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded',    (info) => send({ status: 'downloaded',  version: info.version }));
  autoUpdater.on('error',                (err)  => console.error('[updater]', err.message));

  // Vérification au démarrage (après que la fenêtre soit prête)
  autoUpdater.checkForUpdates();

  // Nouvelle vérification toutes les heures
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
}

app.whenReady().then(() => {
  startBackendServer();
  // Give the server a moment to bind its ports before the renderer connects
  setTimeout(() => {
    createWindow();
    setupAutoUpdater();
  }, 1200);
});

// ── Shutdown: kill the utility process before quitting ────────────────────
app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on("window-all-closed", () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────
ipcMain.on("set-click-through", (_, enabled) => {
  if (!mainWindow) return;
  if (enabled) mainWindow.setIgnoreMouseEvents(true, { forward: true });
  else mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on("set-edit-mode", (_, editing) => {
  if (!mainWindow) return;
  if (editing) mainWindow.setIgnoreMouseEvents(false);
  else mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on("quit", () => app.quit());

// Installer la mise à jour téléchargée et redémarrer
ipcMain.on("install-update", () => autoUpdater.quitAndInstall());

if (!app.requestSingleInstanceLock()) app.quit();
