const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  shell,
  utilityProcess,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let dashboardWindow = null;
let serverProcess = null;

// ── Stockage local des sessions ───────────────────────────────────────────
// Fichier JSON dans userData : { sessions: [ { id, username, startedAt, ... } ] }
const MAX_SESSIONS = 1000;

function sessionsFilePath() {
  return path.join(app.getPath("userData"), "sessions.json");
}

function readSessions() {
  try {
    const raw = fs.readFileSync(sessionsFilePath(), "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions) {
  try {
    fs.writeFileSync(
      sessionsFilePath(),
      JSON.stringify({ sessions }, null, 2),
    );
  } catch (e) {
    console.error("[sessions] write failed:", e.message);
  }
}

// Upsert par id — la session en cours est ré-écrite après chaque match
function saveSession(record) {
  if (!record?.id) return;
  let sessions = readSessions();
  const idx = sessions.findIndex((s) => s.id === record.id);
  if (idx >= 0) sessions[idx] = record;
  else sessions.push(record);
  if (sessions.length > MAX_SESSIONS)
    sessions = sessions.slice(sessions.length - MAX_SESSIONS);
  writeSessions(sessions);
  // Le dashboard (s'il est ouvert) se rafraîchit en direct
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send("sessions-updated");
  }
}

function startBackendServer() {
  // In dev: server.js lives next to this file's parent.
  // In packaged app: electron-builder copies server/ to resources/server/.
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "../server");
  const serverPath = path.join(serverDir, "server.js");

  // ── Log file (visible dans l'app packagée) ────────────────────────────────
  const logDir = app.getPath("logs");
  const logPath = path.join(logDir, "server.log");
  // Rotation simple : on garde les 200 dernières Ko
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 200_000)
      fs.unlinkSync(logPath);
  } catch {
    /* ignore */
  }

  const writeLog = (line) => {
    const entry = `[${new Date().toISOString()}] ${line}`;
    process.stdout.write(entry);
    try {
      fs.appendFileSync(logPath, entry);
    } catch {
      /* ignore */
    }
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

// ── Config StatsAPI de Rocket League ──────────────────────────────────────
// L'overlay a besoin de PacketSendRate=2 dans TAGame\Config\DefaultStatsAPI.ini
// (la valeur par défaut 0 rend l'API muette). Vérifié à chaque lancement car
// une mise à jour du jeu peut réinitialiser le fichier. On scanne les
// installations Steam ET Epic Games, et on corrige toutes celles trouvées.

let statsApiStatus = { status: "checking", count: 0 };

function broadcastStatsApiStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("statsapi-status", statsApiStatus);
  }
}

// Tous les DefaultStatsAPI.ini existants (Steam + Epic)
function findStatsApiFiles() {
  const installDirs = new Set();

  // ── Steam : bibliothèque principale + bibliothèques secondaires ──
  const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const steamRoots = [path.join(pf86, "Steam")];
  try {
    const vdf = fs.readFileSync(
      path.join(pf86, "Steam", "steamapps", "libraryfolders.vdf"),
      "utf-8",
    );
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      steamRoots.push(m[1].replace(/\\\\/g, "\\"));
    }
  } catch {
    /* Steam absent ou vdf illisible */
  }
  for (const root of steamRoots) {
    installDirs.add(path.join(root, "steamapps", "common", "rocketleague"));
  }

  // ── Epic Games : manifests du launcher (source fiable du chemin réel) ──
  const manifestsDir = path.join(
    process.env.ProgramData ?? "C:\\ProgramData",
    "Epic", "EpicGamesLauncher", "Data", "Manifests",
  );
  try {
    for (const f of fs.readdirSync(manifestsDir)) {
      if (!f.endsWith(".item")) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), "utf-8"));
        if (/rocket\s*league/i.test(m.DisplayName ?? "") && m.InstallLocation) {
          installDirs.add(m.InstallLocation);
        }
      } catch {
        /* manifest corrompu : ignorer */
      }
    }
  } catch {
    /* Epic absent */
  }
  // Chemin Epic par défaut, au cas où les manifests seraient absents
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  installDirs.add(path.join(pf, "Epic Games", "rocketleague"));

  return [...installDirs]
    .map((dir) => path.join(dir, "TAGame", "Config", "DefaultStatsAPI.ini"))
    .filter((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
}

function statsApiFileOk(ini) {
  try {
    return /^\s*PacketSendRate\s*=\s*2\s*$/m.test(fs.readFileSync(ini, "utf-8"));
  } catch {
    return false;
  }
}

// Réécriture élevée (UAC) pour les fichiers protégés par Program Files
function elevateStatsApiFix(files) {
  const ps1 = path.join(app.getPath("temp"), "rl-overlay-statsapi-fix.ps1");
  const script = files
    .map((f) => {
      const q = f.replace(/'/g, "''");
      return [
        `$c = Get-Content -LiteralPath '${q}'`,
        `$c = $c -replace '^\\s*PacketSendRate\\s*=.*$', 'PacketSendRate=2'`,
        `if (-not ($c -match 'PacketSendRate')) { $c += 'PacketSendRate=2' }`,
        `Set-Content -LiteralPath '${q}' -Value $c`,
      ].join("\n");
    })
    .join("\n");
  fs.writeFileSync(ps1, script, "utf-8");

  spawn(
    "powershell.exe",
    [
      "-NoProfile", "-Command",
      `Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${ps1}'`,
    ],
    { windowsHide: true },
  ).on("error", () => {
    /* PowerShell indisponible : le statut restera "denied" après le re-check */
  });

  // L'élévation est asynchrone (et l'utilisateur peut refuser l'UAC) :
  // on re-vérifie le résultat pendant ~30 s puis on fige le statut
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const remaining = files.filter((f) => !statsApiFileOk(f));
    if (remaining.length === 0 || tries >= 15) {
      clearInterval(timer);
      statsApiStatus =
        remaining.length === 0
          ? { status: "fixed", count: files.length }
          : { status: "denied", count: remaining.length };
      broadcastStatsApiStatus();
    }
  }, 2000);
}

function ensureStatsApiConfig() {
  const files = findStatsApiFiles();
  console.log(`[statsapi] fichiers trouvés: ${files.join(" | ") || "aucun"}`);

  if (files.length === 0) {
    statsApiStatus = { status: "not-found", count: 0 };
    broadcastStatsApiStatus();
    return;
  }

  const denied = [];
  let fixed = 0;
  for (const ini of files) {
    try {
      const txt = fs.readFileSync(ini, "utf-8");
      if (/^\s*PacketSendRate\s*=\s*2\s*$/m.test(txt)) continue; // déjà bon
      let updated;
      if (/^\s*PacketSendRate\s*=/m.test(txt)) {
        updated = txt.replace(
          /^(\s*PacketSendRate\s*=).*$/m,
          (_, prefix) => `${prefix}2`,
        );
      } else {
        // Variable absente : on l'ajoute en fin de fichier
        updated = txt + (txt.endsWith("\n") ? "" : "\r\n") + "PacketSendRate=2\r\n";
      }
      fs.writeFileSync(ini, updated, "utf-8");
      fixed++;
      console.log(`[statsapi] corrigé: ${ini}`);
    } catch (e) {
      if (e.code === "EPERM" || e.code === "EACCES") {
        denied.push(ini);
      } else {
        console.error(`[statsapi] erreur sur ${ini}:`, e.message);
      }
    }
  }

  if (denied.length > 0) {
    console.log(`[statsapi] écriture refusée, élévation UAC: ${denied.join(" | ")}`);
    statsApiStatus = { status: "elevating", count: denied.length };
    broadcastStatsApiStatus();
    elevateStatsApiFix(denied);
  } else {
    statsApiStatus = { status: fixed > 0 ? "fixed" : "ok", count: files.length };
    broadcastStatsApiStatus();
  }
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
  mainWindow.on("hide", () => {
    mainWindow?.showInactive();
    assertOnTop();
  });
  mainWindow.on("minimize", () => {
    mainWindow?.restore();
    assertOnTop();
  });

  screen.on("display-metrics-changed", () => setTimeout(assertOnTop, 200));
  screen.on("display-added", () => setTimeout(assertOnTop, 200));

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

// ── Fenêtre Dashboard (fenêtre normale, pas un overlay) ──────────────────
function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    title: "RL Overlay — Dashboard",
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    dashboardWindow.loadURL("http://localhost:3005/#dashboard");
  } else {
    dashboardWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      hash: "dashboard",
    });
  }

  dashboardWindow.on("closed", () => {
    dashboardWindow = null;
  });
}

// ── Auto-updater ──────────────────────────────────────────────────────────
function setupAutoUpdater() {
  // Only run in packaged app — dev builds skip update checks
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Repo public : pas de token requis. GH_TOKEN peut être défini si le repo
  // redevient privé un jour.
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "spyx08",
    repo: "rl-tracker",
    ...(process.env.GH_TOKEN ? { token: process.env.GH_TOKEN } : {}),
  });

  const send = (data) => mainWindow?.webContents.send("update-status", data);

  autoUpdater.on("checking-for-update", () => send({ status: "checking" }));
  autoUpdater.on("update-not-available", () => send({ status: "up-to-date" }));
  autoUpdater.on("update-available", (info) =>
    send({ status: "available", version: info.version }),
  );
  autoUpdater.on("download-progress", (p) =>
    send({ status: "downloading", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    send({ status: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", (err) => {
    console.error("[updater]", err.message);
    send({ status: "error", message: err.message });
  });

  // Vérification au démarrage (après que la fenêtre soit prête)
  autoUpdater.checkForUpdates();

  // Nouvelle vérification toutes les heures
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
}

app.whenReady().then(() => {
  ensureStatsApiConfig();
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

// Statut de la config StatsAPI (le renderer le demande au montage,
// puis reçoit les mises à jour via le channel "statsapi-status")
ipcMain.handle("statsapi-status-get", () => statsApiStatus);

// ── Sessions : stockage local + dashboard ─────────────────────────────────
ipcMain.on("session-save", (_, record) => saveSession(record));
ipcMain.handle("sessions-get", () => readSessions());
ipcMain.on("open-dashboard", () => createDashboardWindow());

if (!app.requestSingleInstanceLock()) app.quit();
