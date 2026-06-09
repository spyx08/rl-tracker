const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  shell,
  utilityProcess,
} = require("electron");
const path = require("path");
const fs   = require("fs");
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

  // ── Log file (visible dans l'app packagée) ────────────────────────────────
  const logDir  = app.getPath("logs");
  const logPath = path.join(logDir, "server.log");
  // Rotation simple : on garde les 200 dernières Ko
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 200_000)
      fs.unlinkSync(logPath);
  } catch { /* ignore */ }

  const writeLog = (line) => {
    const entry = `[${new Date().toISOString()}] ${line}`;
    process.stdout.write(entry);
    try { fs.appendFileSync(logPath, entry); } catch { /* ignore */ }
  };

  writeLog(`Starting server from: ${serverPath}\n`);
  writeLog(`Server dir exists: ${fs.existsSync(serverDir)}\n`);
  writeLog(`server.js exists:  ${fs.existsSync(serverPath)}\n`);

  // utilityProcess.fork() uses Electron's bundled Node.js — no system Node needed
  serverProcess = utilityProcess.fork(serverPath, [], {
    stdio: "pipe",
    serviceName: "RL Overlay Server",
    cwd: serverDir,
    env: { ...process.env },
  });

  serverProcess.stdout?.on("data", (d) => writeLog(d.toString()));
  serverProcess.stderr?.on("data", (d) => writeLog(`[ERR] ${d.toString()}`));
  serverProcess.on("exit", (code) => {
    writeLog(`[EXIT] server exited with code ${code}\n`);
    // Relance automatique si crash (hors fermeture volontaire)
    if (code !== 0 && serverProcess !== null) {
      writeLog("[RESTART] Restarting server in 3s...\n");
      setTimeout(startBackendServer, 3000);
    }
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

  // Permet d'apparaître par-dessus les apps fullscreen via DWM/FSO
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // ── Maintenir l'overlay au premier plan ──────────────────────────────────
  // En mode "fenêtre sans bordure" dans RL, DWM reste actif et notre fenêtre
  // TOPMOST s'affiche naturellement au-dessus. L'appel natif koffi est plus
  // fiable que l'API Electron seule, surtout après un changement de bureau/écran.
  // On ne touche QUE notre propre fenêtre — aucune interférence avec RL.
  const assertOnTop = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.setAlwaysOnTop(true, "screen-saver");
    if (!mainWindow.isVisible()) mainWindow.showInactive();
  };

  // Ré-assertion sur les événements système susceptibles de perturber le z-order
  mainWindow.on("blur", assertOnTop);
  mainWindow.on("hide", () => { mainWindow?.showInactive(); assertOnTop(); });
  mainWindow.on("minimize", () => { mainWindow?.restore(); assertOnTop(); });

  screen.on("display-metrics-changed", () => setTimeout(assertOnTop, 200));
  screen.on("display-added",           () => setTimeout(assertOnTop, 200));

  // Polling de sécurité toutes les 2 s (léger — couvre les cas résiduels
  // sans surcharger le processus principal pendant la partie)
  const topInterval = setInterval(assertOnTop, 2000);
  mainWindow.on("closed", () => clearInterval(topInterval));

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

// Ouvrir le dossier des logs dans l'explorateur Windows
ipcMain.on("open-logs", () => shell.openPath(app.getPath("logs")));

if (!app.requestSingleInstanceLock()) app.quit();
