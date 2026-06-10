const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") }); // dev (root)
require("dotenv").config({ path: path.join(__dirname, ".env") });    // packaged (resources/server/)

const express = require("express");
const cors = require("cors");
const net = require("net");
const WebSocket = require("ws");

const { fetchProfile } = require("trn-rocket-league");

const app = express();
const PORT = 3000;
const WS_PORT = 3001; // Port pour le WebSocket de l'overlay

// Autorise ton overlay local (OBS/Navigateur) à interroger ce serveur
app.use(cors());

const TRN_API_KEY = process.env.TRN_API_KEY || "";

// Système de cache basique pour éviter le rate-limit de TRN.
// Clé par joueur : un cache global renverrait les données de l'ancien compte
// pendant 60 s après un changement de compte.
const cache = new Map(); // `${platform}:${username}` -> { data, timestamp }
const CACHE_TTL = 60000; // 60 secondes

app.get("/api/mmr/:platform/:username", async (req, res) => {
  const { platform, username } = req.params;
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
    const trnUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
      username,
    )}`;

    // On simule un navigateur basique pour ne pas se faire rejeter d'office
    /*const response = await fetch(trnUrl, {
      headers: {
        "TRN-Api-Key": TRN_API_KEY,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });*/
    const response = await fetchProfile(username, platform);

    if (!response) {
      console.error(
        `[ERREUR] Impossible de recup le profile pour ${username} sur TRN`,
      );
      return res.status(500).json({
        error: "Erreur lors de la communication avec Tracker Network",
      });
    }

    // 4. Formatage du résultat final
    const result = {
      rankedStats: response.stats.ranked,
    };

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
