const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Autorise ton overlay local (OBS/Navigateur) à interroger ce serveur
app.use(cors());

// Système de cache basique pour éviter le rate-limit de TRN
let cache = {
  data: null,
  timestamp: 0,
};
const CACHE_TTL = 60000; // 60 secondes

app.get("/api/mmr/:platform/:username", async (req, res) => {
  const { platform, username } = req.params;

  // 1. Vérification du cache
  if (Date.now() - cache.timestamp < CACHE_TTL && cache.data) {
    console.log(`[CACHE] Renvoi des données pour ${username}...`);
    return res.json(cache.data);
  }

  // 2. Appel à l'API TRN si le cache est expiré
  try {
    console.log(`[FETCH] Récupération des données TRN pour ${username}...`);
    const trnUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(
      username
    )}`;

    // On simule un navigateur basique pour ne pas se faire rejeter d'office
    const response = await fetch(trnUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `[ERREUR] TRN a répondu avec le statut : ${response.status}`
      );
      return res.status(response.status).json({
        error: "Erreur lors de la communication avec Tracker Network",
      });
    }

    const json = await response.json();

    // 3. Extraction de la donnée 2v2
    const doublesStats = json.data.segments.find(
      (s) => s.metadata.name === "Ranked Doubles 2v2"
    );

    if (!doublesStats) {
      return res
        .status(404)
        .json({ error: "Statistiques 2v2 introuvables pour ce joueur" });
    }

    // 4. Formatage du résultat final
    const result = {
      mmr: doublesStats.stats.rating.value,
      rank: `${doublesStats.stats.tier.metadata.name} - ${doublesStats.stats.division.metadata.name}`,
    };

    // Mise en cache des nouvelles données
    cache.data = result;
    cache.timestamp = Date.now();

    // Envoi au front-end
    res.json(result);
  } catch (error) {
    console.error("[ERREUR SERVEUR]", error);
    res.status(500).json({ error: "Erreur interne du proxy" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy TRN actif ! Écoute sur http://localhost:${PORT}`);
  console.log(
    `Exemple de test : http://localhost:${PORT}/api/mmr/epic/TonPseudo`
  );
});
