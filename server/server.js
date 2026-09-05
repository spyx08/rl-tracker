const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") }); // dev (root)
require("dotenv").config({ path: path.join(__dirname, ".env") });    // packaged (resources/server/)

const express = require("express");
const cors = require("cors");
const net = require("net");
const WebSocket = require("ws");
const { execFile } = require("child_process");

const app = express();
const PORT = 3000;
const WS_PORT = 3001; // Port pour le WebSocket de l'overlay

// Autorise ton overlay local (OBS/Navigateur) à interroger ce serveur
app.use(cors());

const PLATFORMS = ["epic", "psn", "steam", "xbl", "switch"];
const TRN_BASE = "https://api.tracker.gg/api/v2/rocket-league/standard/profile";

// Cloudflare protège api.tracker.gg. Deux filtres à passer :
//   1. les en-têtes : un User-Agent bidon (l'ancien "Chrome/79" de
//      trn-rocket-league) part directement en 403 + page HTML de challenge ;
//   2. l'empreinte TLS : fetch() (undici) et le module https natif se font
//      refouler en 403 QUELS QUE SOIENT les en-têtes. Le curl livré avec
//      Windows (TLS Schannel) passe, lui — d'où l'appel en sous-processus.
const CURL_BIN =
  process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\Windows", "System32", "curl.exe")
    : "curl";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Referer: "https://rocketleague.tracker.network/",
  Origin: "https://rocketleague.tracker.network",
};

// execFile (pas exec) : les arguments sont passés en tableau, donc un pseudo
// exotique ne peut pas s'échapper dans un shell. Ne rejette jamais : une
// erreur réseau doit produire un 502 propre, pas tuer le process.
function curlTrn(url) {
  return new Promise((resolve) => {
    const args = [
      "--silent",
      "--compressed",
      "--max-time",
      "10",
      "--write-out",
      "\n%{http_code}",
      "--url",
      url,
    ];
    for (const [key, value] of Object.entries(BROWSER_HEADERS)) {
      args.push("--header", `${key}: ${value}`);
    }

    execFile(
      CURL_BIN,
      args,
      { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve({ status: 0, body: "", error });
        const cut = stdout.lastIndexOf("\n");
        resolve({
          status: Number(stdout.slice(cut + 1).trim()) || 0,
          body: stdout.slice(0, cut),
        });
      },
    );
  });
}

// Noms des segments TRN -> clés de gameMode utilisées par l'overlay
const PLAYLISTS = {
  duel: "Ranked Duel 1v1",
  double: "Ranked Doubles 2v2",
  standard: "Ranked Standard 3v3",
};

// Reprend la forme exposée auparavant par PlaylistStats de trn-rocket-league,
// pour que le front-end (GameContext.useMMR) n'ait rien à changer.
function toPlaylistStats(segment) {
  const s = segment.stats ?? {};
  return {
    mmr: s.rating?.value ?? null,
    matchesPlayed: s.matchesPlayed?.value ?? 0,
    winStreak: s.winStreak?.metadata?.type === "win" ? s.winStreak.value : 0,
    loseStreak: s.winStreak?.metadata?.type === "loss" ? s.winStreak.value : 0,
    rank: {
      tier: {
        index: s.tier?.value ?? 0,
        name: s.tier?.metadata?.name ?? "Unranked",
      },
      division: {
        index: s.division?.value ?? 0,
        name: s.division?.metadata?.name ?? "",
      },
      imageURL: s.tier?.metadata?.iconUrl ?? "",
    },
  };
}

// Système de cache basique pour éviter le rate-limit de TRN.
// Clé par joueur : un cache global renverrait les données de l'ancien compte
// pendant 60 s après un changement de compte.
const cache = new Map(); // `${platform}:${username}` -> { data, timestamp }
const CACHE_TTL = 60000; // 60 secondes

app.get("/api/mmr/:platform/:username", async (req, res) => {
  const { platform, username } = req.params;

  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `Plateforme inconnue : ${platform}` });
  }

  const cacheKey = `${platform}:${username.toLowerCase()}`;

  // 1. Vérification du cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[CACHE] Renvoi des données pour ${username}...`);
    return res.json(cached.data);
  }

  // 2. Appel à l'API TRN si le cache est expiré
  try {
    console.log(`[FETCH] Récupération des données TRN pour ${username}...`);
    const trnUrl = `${TRN_BASE}/${platform}/${encodeURIComponent(username)}`;
    const { status, body, error } = await curlTrn(trnUrl);

    if (error) {
      console.error(`[ERREUR] Appel TRN impossible : ${error.message}`);
      return res
        .status(502)
        .json({ error: "Impossible de joindre Tracker Network" });
    }

    // Jamais de JSON.parse aveugle : quand Cloudflare intercepte, TRN renvoie
    // du HTML, et l'exception faisait tomber tout le process (bridge WebSocket
    // du jeu compris).
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {
      /* réponse non-JSON */
    }

    if (!payload) {
      console.error(
        `[ERREUR] Réponse non-JSON de TRN (HTTP ${status}) — challenge Cloudflare ?`,
      );
      return res.status(502).json({
        error: "Tracker Network a renvoyé une page de challenge (Cloudflare)",
      });
    }

    if (payload.errors?.length) {
      const { code, message } = payload.errors[0];
      if (code === "CollectorResultStatus::NotFound") {
        console.warn(`[404] Aucun profil TRN pour ${platform}/${username}`);
        return res
          .status(404)
          .json({ error: `Aucun profil trouvé pour ${platform}/${username}` });
      }
      console.error(`[ERREUR] TRN a répondu ${code} : ${message}`);
      return res.status(502).json({
        error: "Erreur lors de la communication avec Tracker Network",
      });
    }

    const segments = payload.data?.segments;
    if (!Array.isArray(segments)) {
      console.error("[ERREUR] Schéma TRN inattendu : segments manquants");
      return res
        .status(502)
        .json({ error: "Schéma de réponse Tracker Network inattendu" });
    }

    // 4. Formatage du résultat final
    const ranked = {};
    for (const [mode, name] of Object.entries(PLAYLISTS)) {
      const segment = segments.find(
        (s) => s.type === "playlist" && s.metadata?.name === name,
      );
      if (segment) ranked[mode] = toPlaylistStats(segment);
    }

    const result = { rankedStats: ranked };

    // Mise en cache des nouvelles données
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    // Envoi au front-end
    res.json(result);
  } catch (error) {
    console.error("[ERREUR SERVEUR]", error);
    res.status(500).json({ error: "Erreur interne du proxy" });
  }
});
// --- 2. BRIDGE TCP (ROCKET LEAGUE) -> WEBSOCKET (OBS) ---

// On monte le serveur WebSocket que l'overlay HTML écoutera
const wss = new WebSocket.Server({ port: WS_PORT });
let obsClients = [];

wss.on("connection", (ws) => {
  console.log("📺 Overlay HTML connecté au bridge !");
  obsClients.push(ws);
  ws.on("close", () => {
    obsClients = obsClients.filter((c) => c !== ws);
  });
});

// On connecte Node au jeu via un socket TCP brut
function connectToRL() {
  const rlClient = new net.Socket();
  let buffer = "";

  rlClient.connect(49123, "127.0.0.1", () => {
    console.log("✅ Connecté au flux TCP de Rocket League !");
  });

  rlClient.on("data", (data) => {
    buffer += data.toString();

    // Séparation propre des JSON concaténés (ex: {"Event":"A"}{"Event":"B"})
    let parts = buffer.replace(/}\{/g, "}\n{").split("\n");

    // On garde le dernier morceau incomplet en buffer s'il est tronqué par le réseau
    buffer = parts.pop();

    for (const part of parts) {
      try {
        if (part.trim() !== "") {
          const json = JSON.parse(part);

          // Affiche les événements dans la console Node pour t'aider à débugger !
          if (json.Event) {
            console.log(`[JEU] Événement reçu : ${json.Event}`);
          }

          // Rediffusion instantanée à l'overlay HTML
          obsClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(json));
            }
          });
        }
      } catch (e) {
        console.error("Erreur parsing JSON du jeu :", e.message);
      }
    }
  });

  rlClient.on("error", () => {
    // Silencieux : se déclenche si le jeu n'est pas lancé
  });

  rlClient.on("close", () => {
    // Reconnexion infinie (utile entre les menus et l'entraînement)
    setTimeout(connectToRL, 5000);
  });
}

// Lancement de la boucle de connexion au jeu
connectToRL();

app.listen(PORT, () => {
  console.log(`🚀 Proxy TRN actif sur http://localhost:${PORT}`);
  console.log(`🔌 Bridge WebSocket actif sur ws://localhost:${WS_PORT}`);
});
