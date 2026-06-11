import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function platformFromPrimaryId(primaryId) {
  if (!primaryId) return "epic";
  const prefix = primaryId.split("|")[0].toLowerCase();
  const map = {
    epic: "epic",
    steam: "steam",
    ps4: "psn",
    ps5: "psn",
    psn: "psn",
    xbox: "xbl",
    xbl: "xbl",
    switch: "switch",
  };
  return map[prefix] ?? "epic";
}

// Tente de trouver le joueur local dans une UpdateState.
// Retourne { name, platform } ou null.
function detectLocalPlayer(gameData) {
  const players = gameData.Players ?? [];

  // 1. Champ dédié sur un joueur — plusieurs nommages possibles selon la version du plugin
  const local = players.find(
    (p) =>
      p.bLocalPlayer === true ||
      p.isLocalPlayer === true ||
      p.IsLocalPlayer === true,
  );
  if (local) {
    return {
      name: local.Name,
      platform: platformFromPrimaryId(local.PrimaryId),
    };
  }

  // 2. Pointeur root vers le joueur local (ex: { "LocalPlayer": "Spyx08" } ou { "me": "Spyx08" })
  const rootName =
    gameData.LocalPlayer ?? gameData.local_player ?? gameData.me ?? null;
  if (rootName) {
    const p = players.find(
      (pl) => pl.Name === rootName || pl.PrimaryId === rootName,
    );
    if (p)
      return { name: p.Name, platform: platformFromPrimaryId(p.PrimaryId) };
    if (typeof rootName === "string")
      return { name: rootName, platform: "epic" };
  }

  return null;
}

// ─── Session snapshot (persistance localStorage) ─────────────────────────────
// Les stats de session ne vivent que dans le reducer : sans snapshot elles sont
// perdues sur crash, mise à jour auto (quitAndInstall) ou fermeture non propre.

const SNAPSHOT_KEY = "rl_session_snapshot";
const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000; // au-delà : nouvelle session

// Uniquement les stats de session — jamais les états transitoires
// (livePlayers, liveTeams, lastPlayers, matchAlreadyCounted, myCurrentTeamNum)
const PERSISTED_KEYS = [
  "sessionId",
  "sessionStartedAt",
  "matchLog",
  "wins",
  "losses",
  "streak",
  "startMMR",
  "currentMMR",
  "deltaMMR",
  "mmrHistory",
  "mmrByMode",
  "rank",
  "rankImg",
  "gameMode",
  "totalMatches",
  "totalGoals",
  "totalAssists",
  "totalSaves",
  "totalMVPs",
  "totalDemolished",
];

// Appelé à la fin propre d'une session (bouton Quitter) ou au changement de compte
export function clearSessionSnapshot() {
  localStorage.removeItem(SNAPSHOT_KEY);
}

function loadSessionSnapshot(username) {
  if (!username) return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (snap.username !== username) return null;
    if (Date.now() - (snap.savedAt ?? 0) > SNAPSHOT_MAX_AGE_MS) {
      clearSessionSnapshot();
      return null;
    }
    const restored = {};
    for (const k of PERSISTED_KEYS) {
      if (snap[k] !== undefined) restored[k] = snap[k];
    }
    // gameMode null (snapshot pris après un MATCH_RESET) : on garde le défaut
    if (restored.gameMode == null) delete restored.gameMode;
    return restored;
  } catch {
    return null;
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

const savedUsername = localStorage.getItem("rl_username") ?? null;
const savedPlatform = localStorage.getItem("rl_platform") ?? "epic";

function newSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const initialState = {
  // Identité de la session courante (persiste dans le snapshot, donc survit
  // aux crashs : la même session continue d'être upsertée dans le stockage)
  sessionId: null,
  sessionStartedAt: null,
  // Journal des matchs de la session : { ts, mode, result: 'win'|'loss'|null }
  matchLog: [],
  // Timestamp du dernier match comptabilisé (MatchEnded ou forfait) —
  // sert d'anti double-comptage, jamais persisté
  lastCountedAt: 0,

  // Joueur détecté (null = pas encore identifié)
  username: savedUsername,
  platform: savedPlatform,
  usernameNotInGame: false, // true si le username stocké n'est pas trouvé dans la partie en cours

  wins: 0,
  losses: 0,
  streak: 0,        // >0 = win streak, <0 = loss streak
  startMMR: null,
  currentMMR: 0,
  deltaMMR: 0,
  mmrHistory: [],   // historique du mode actif (miroir de mmrByMode[gameMode])
  mmrByMode: {},    // { [mode]: { start, history: [] } } — chaque playlist a son propre ladder
  rank: savedUsername ? "Chargement..." : "Non configuré",
  rankImg: "",
  matchAlreadyCounted: false,
  myCurrentTeamNum: null,
  matchMaxPlayers: 0,
  gameMode: "double",
  totalMatches: 0,
  totalGoals: 0,
  totalAssists: 0,
  totalSaves: 0,
  totalMVPs: 0,
  totalDemolished: 0,
  lastPlayers: [],
  livePlayers: [],
  liveTeams: [],
};

// Restaure la session précédente (même compte, moins de ~2h) — survit aux crashs
// et aux redémarrages d'electron-updater
Object.assign(initialState, loadSessionSnapshot(savedUsername));

// Pas de session restaurée : on en démarre une nouvelle
if (!initialState.sessionId) {
  initialState.sessionId = newSessionId();
  initialState.sessionStartedAt = Date.now();
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function gameReducer(state, action) {
  switch (action.type) {
    case "CHECK_PLAYER": {
      // Le jeu n'expose pas bLocalPlayer : on vérifie au moins que le username stocké est dans la partie
      const found = action.payload.players.some((p) => p.Name === state.username);
      return { ...state, usernameNotInGame: !found };
    }

    case "SET_PLAYER":
      return {
        ...state,
        // Changement de compte = nouvelle session dans l'historique
        sessionId: newSessionId(),
        sessionStartedAt: Date.now(),
        matchLog: [],
        username: action.payload.username,
        platform: action.payload.platform,
        usernameNotInGame: false,
        rank: "Chargement...",
        rankImg: "",
        wins: 0,
        losses: 0,
        streak: 0,
        startMMR: null,
        currentMMR: 0,
        deltaMMR: 0,
        mmrHistory: [],
        mmrByMode: {},
        totalMatches: 0,
        totalGoals: 0,
        totalAssists: 0,
        totalSaves: 0,
        totalMVPs: 0,
        totalDemolished: 0,
      };

    // Même compte re-confirmé avec une plateforme différente : on met à jour
    // la plateforme SANS toucher aux stats de session
    case "SET_PLATFORM":
      return { ...state, platform: action.payload };

    case "MATCH_RESET": {
      // Partie quittée avant l'event MatchEnded (ex: forfait puis quit immédiat) :
      // on comptabilise le match en cours avant de tout réinitialiser.
      // Le score courant tranche si possible ; sinon un abandon = défaite
      // (c'est la règle du jeu pour un forfait/quit en ranked).
      let counted = {};
      const now = Date.now();
      const wasInGame =
        !state.matchAlreadyCounted &&
        state.username &&
        state.myCurrentTeamNum != null &&
        state.lastPlayers.some((p) => p.Name === state.username) &&
        // Vrai match uniquement : les DEUX équipes ont des joueurs.
        // Exclut freeplay/entraînement (un seul joueur, pas d'adversaire)
        state.lastPlayers.some((p) => p.TeamNum === 0) &&
        state.lastPlayers.some((p) => p.TeamNum === 1) &&
        // Anti double-comptage : un UpdateState retardataire du match terminé
        // (podium/replay) peut repeupler lastPlayers après le reset — si un
        // match vient d'être compté, ce MatchDestroyed concerne le même match
        now - state.lastCountedAt > 30_000;

      if (wasInGame) {
        const myTeam = state.liveTeams.find((t) => t.TeamNum === state.myCurrentTeamNum);
        const oppTeam = state.liveTeams.find((t) => t.TeamNum !== state.myCurrentTeamNum);
        const won = !!(myTeam && oppTeam && myTeam.Score > oppTeam.Score);
        counted = {
          totalMatches: state.totalMatches + 1,
          lastCountedAt: now,
          matchLog: [
            ...state.matchLog,
            { ts: now, mode: state.gameMode, result: won ? "win" : "loss" },
          ],
          ...(won
            ? { wins: state.wins + 1, streak: state.streak > 0 ? state.streak + 1 : 1 }
            : { losses: state.losses + 1, streak: state.streak < 0 ? state.streak - 1 : -1 }),
        };
      }

      return {
        ...state,
        ...counted,
        matchAlreadyCounted: false,
        lastPlayers: [],
        matchMaxPlayers: 0,
        gameMode: null,   // reset pour que la détection du prochain mode triggere bien l'effet MMR
        livePlayers: [],
        liveTeams: [],
        usernameNotInGame: false,
      };
    }

    case "UPDATE_STATE": {
      const { players, teams, game } = action.payload;
      let next = {
        ...state,
        livePlayers: players,
        liveTeams: teams ?? state.liveTeams,
      };

      if (!state.username) return next; // pas encore identifié

      const me = players.find((p) => p.Name === state.username);
      const prevMe = state.lastPlayers.find((p) => p.Name === state.username);

      if (me?.TeamNum !== undefined) next.myCurrentTeamNum = me.TeamNum;

      if (me && prevMe) {
        const dGoals = me.Goals - prevMe.Goals;
        if (dGoals > 0) next.totalGoals = state.totalGoals + dGoals;

        const dAssists = me.Assists - prevMe.Assists;
        if (dAssists > 0) next.totalAssists = state.totalAssists + dAssists;

        const dSaves = me.Saves - prevMe.Saves;
        if (dSaves > 0) next.totalSaves = state.totalSaves + dSaves;

        if (
          !prevMe.bDemolished &&
          me.bDemolished &&
          !game.bReplay &&
          !game.bHasWinner
        ) {
          next.totalDemolished = state.totalDemolished + 1;
        }
      }

      const maxTeamSize = Math.max(
        players.filter((p) => p.TeamNum === 0).length,
        players.filter((p) => p.TeamNum === 1).length,
      );
      if (maxTeamSize > state.matchMaxPlayers) {
        next.matchMaxPlayers = maxTeamSize;
        if (maxTeamSize === 1) next.gameMode = "duel";
        else if (maxTeamSize === 2) next.gameMode = "double";
        else next.gameMode = "standard";
      }

      next.lastPlayers = players;
      return next;
    }

    case "MATCH_ENDED": {
      if (state.matchAlreadyCounted || !state.username) return state;

      const { players, winnerTeamNum } = action.payload;
      const finalPlayers = players?.length > 0 ? players : state.lastPlayers;
      const me = finalPlayers.find((p) => p.Name === state.username);
      if (!me) return state;

      const logMatch = (result) => [
        ...state.matchLog,
        { ts: Date.now(), mode: state.gameMode, result },
      ];

      let next = {
        ...state,
        matchAlreadyCounted: true,
        totalMatches: state.totalMatches + 1,
        lastCountedAt: Date.now(),
        matchLog: logMatch(null),
      };

      // Vainqueur ou équipe inconnus : on compte le match (les stats individuelles
      // sont déjà accumulées) mais ni win ni loss — sinon null === null comptait un faux win
      if (winnerTeamNum == null || state.myCurrentTeamNum == null) return next;

      if (state.myCurrentTeamNum === winnerTeamNum) {
        next.matchLog = logMatch("win");
        next.wins = state.wins + 1;
        next.streak = state.streak > 0 ? state.streak + 1 : 1;
        const myTeam = finalPlayers.filter(
          (p) => p.TeamNum === state.myCurrentTeamNum,
        );
        const topScore = Math.max(...myTeam.map((p) => p.Score || 0));
        if (me.Score >= topScore && me.Score > 0)
          next.totalMVPs = state.totalMVPs + 1;
      } else {
        next.matchLog = logMatch("loss");
        next.losses = state.losses + 1;
        next.streak = state.streak < 0 ? state.streak - 1 : -1;
      }

      return next;
    }

    case "MMR_UPDATED": {
      const { mode, mmr, rank, rankImg } = action.payload;
      // Chaque playlist (duel/double/standard) a son propre ladder : on isole
      // l'historique par mode pour ne jamais mélanger des MMR incomparables
      // (sinon un passage 2v2 → 1v1 fausse le graphique et le delta de session)
      const entry   = state.mmrByMode[mode] ?? { start: mmr, history: [] };
      const lastMmr = entry.history[entry.history.length - 1];
      // N'ajoute à l'historique que si la valeur est différente de la dernière
      const history = lastMmr !== mmr ? [...entry.history, mmr] : entry.history;
      const deltaMMR = lastMmr !== undefined ? mmr - lastMmr : 0;
      return {
        ...state,
        mmrByMode: { ...state.mmrByMode, [mode]: { start: entry.start, history } },
        currentMMR: mmr,
        deltaMMR,
        rank,
        rankImg,
        startMMR: entry.start,
        mmrHistory: history,
      };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch]       = useReducer(gameReducer, initialState);
  const [announcement, setAnnouncement] = useState(null);
  const [wsConnected, setWsConnected]   = useState(false);

  const announce = useCallback((type, meta = {}) => {
    setAnnouncement({ type, meta, key: Date.now() });
  }, []);

  // Refs pour que les hooks WS/MMR lisent toujours la valeur courante
  const usernameRef = useRef(state.username);
  const platformRef = useRef(state.platform);
  const myTeamRef = useRef(state.myCurrentTeamNum);
  useEffect(() => {
    usernameRef.current = state.username;
  }, [state.username]);
  useEffect(() => {
    platformRef.current = state.platform;
  }, [state.platform]);
  useEffect(() => {
    myTeamRef.current = state.myCurrentTeamNum;
  }, [state.myCurrentTeamNum]);

  // Persiste le snapshot de session. Les deps sont les valeurs de stats
  // elles-mêmes : les UPDATE_STATE à ~10 Hz qui ne changent que
  // livePlayers/liveTeams ne déclenchent donc aucune écriture.
  useEffect(() => {
    if (!state.username) return;
    const snap = { username: state.username, savedAt: Date.now() };
    for (const k of PERSISTED_KEYS) snap[k] = state[k];
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      /* quota plein ou storage indisponible : tant pis pour ce snapshot */
    }

    // Historique persistant (fichier via Electron) : on n'enregistre que les
    // sessions avec au moins un match joué. Upsert par sessionId — le même
    // enregistrement est mis à jour après chaque match.
    if (state.totalMatches > 0 && state.sessionId) {
      window.electronAPI?.saveSession({
        id: state.sessionId,
        username: state.username,
        startedAt: state.sessionStartedAt,
        endedAt: Date.now(),
        wins: state.wins,
        losses: state.losses,
        totalMatches: state.totalMatches,
        totalGoals: state.totalGoals,
        totalAssists: state.totalAssists,
        totalSaves: state.totalSaves,
        totalMVPs: state.totalMVPs,
        totalDemolished: state.totalDemolished,
        mmrByMode: state.mmrByMode,
        matchLog: state.matchLog,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.username,
    state.wins,
    state.losses,
    state.streak,
    state.startMMR,
    state.currentMMR,
    state.deltaMMR,
    state.mmrHistory,
    state.mmrByMode,
    state.rank,
    state.rankImg,
    state.gameMode,
    state.totalMatches,
    state.totalGoals,
    state.totalAssists,
    state.totalSaves,
    state.totalMVPs,
    state.totalDemolished,
  ]);

  const setPlayer = useCallback((username, platform) => {
    // Changement de compte = nouvelle session : le snapshot de l'ancienne ne
    // doit pas être restauré au prochain démarrage
    clearSessionSnapshot();
    if (username) {
      localStorage.setItem("rl_username", username);
      localStorage.setItem("rl_platform", platform ?? "epic");
    } else {
      // Réinitialisation : supprime les clés pour ne pas stocker le string "null"
      localStorage.removeItem("rl_username");
      localStorage.removeItem("rl_platform");
    }
    dispatch({ type: "SET_PLAYER", payload: { username: username ?? null, platform: platform ?? "epic" } });
  }, []);

  useRLWebSocket(
    dispatch,
    announce,
    state.lastPlayers,
    usernameRef,
    platformRef,
    myTeamRef,
    setPlayer,
    setWsConnected,
  );
  useMMR(dispatch, platformRef, usernameRef, state.gameMode, state.totalMatches, state.username);

  return (
    <GameContext.Provider value={{ state, announcement, setPlayer, wsConnected }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}

// ─── Hook: WebSocket bridge ────────────────────────────────────────────────────

function useRLWebSocket(
  dispatch,
  announce,
  lastPlayers,
  usernameRef,
  platformRef,
  myTeamRef,
  setPlayer,
  setWsConnected,
) {
  const lastPlayersRef = useRef(lastPlayers);
  useEffect(() => {
    lastPlayersRef.current = lastPlayers;
  }, [lastPlayers]);

  // Armé à true à chaque nouveau match pour relancer la détection même si un username est déjà stocké
  const needsRedetectionRef = useRef(true);

  // setPlayer est stable (useCallback) — pas besoin de ref
  useEffect(() => {
    let ws;
    let dead = false;

    function connect() {
      if (dead) return;
      ws = new WebSocket("ws://localhost:3001");

      ws.onopen = () => {
        console.log("✅ Connecté à l'API Native de Rocket League");
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          let gameData = payload.Data;
          while (typeof gameData === "string") {
            try {
              gameData = JSON.parse(gameData);
            } catch {
              break;
            }
          }

          switch (payload.Event) {
            case "MatchCreated":
            case "MatchDestroyed":
              dispatch({ type: "MATCH_RESET" });
              // Réarme la détection : le compte connecté a peut-être changé depuis la dernière partie
              needsRedetectionRef.current = true;
              break;

            case "UpdateState": {
              if (typeof gameData !== "object" || !gameData.Players) break;

              const players = gameData.Players;
              const teams = gameData.Game?.Teams ?? null;
              const game = gameData.Game ?? {};

              // Relance la détection au début de chaque nouveau match (pas seulement si username est vide)
              if (needsRedetectionRef.current) {
                needsRedetectionRef.current = false; // ne tenter qu'une fois par match
                const detected = detectLocalPlayer(gameData);

                if (detected) {
                  // Champ explicite trouvé dans l'event — source fiable
                  if (detected.name !== usernameRef.current) {
                    console.log(
                      `🔄 Changement de compte détecté : ${usernameRef.current} → ${detected.name} (${detected.platform})`,
                    );
                    // Nouveau compte → reset complet de la session via SET_PLAYER
                    setPlayer(detected.name, detected.platform);
                  } else {
                    console.log(
                      `🎮 Joueur local confirmé : ${detected.name} (${detected.platform})`,
                    );
                    // Même compte : surtout NE PAS repasser par SET_PLAYER, qui
                    // remettrait toutes les stats de session à zéro à chaque match
                    if (detected.platform !== platformRef.current) {
                      localStorage.setItem("rl_platform", detected.platform);
                      dispatch({ type: "SET_PLATFORM", payload: detected.platform });
                    }
                  }
                } else if (!usernameRef.current) {
                  // Aucun champ auto-détectable et pas d'username stocké → UI de sélection
                  console.log("⚠️ Impossible de détecter le joueur local automatiquement");
                }
                // Si detected === null mais usernameRef.current existe :
                // le jeu n'expose pas bLocalPlayer → on garde l'username stocké
                // mais on dispatche CHECK_PLAYER pour vérifier qu'il est bien dans la partie
                if (!detected && usernameRef.current) {
                  dispatch({ type: "CHECK_PLAYER", payload: { players } });
                }
              }

              // Animations de but
              players.forEach((cur) => {
                const prev = lastPlayersRef.current.find(
                  (p) => p.Name === cur.Name,
                );
                if (prev && cur.Goals > prev.Goals) {
                  announce("goal", {
                    scorer: cur.Name,
                    scorerTeam: cur.TeamNum,
                    isMyTeam: cur.TeamNum === myTeamRef.current,
                  });
                }
              });

              dispatch({
                type: "UPDATE_STATE",
                payload: { players, teams, game },
              });
              break;
            }

            case "MatchEnded": {
              const players = gameData?.Players ?? [];
              const winnerTeamNum =
                gameData?.WinnerTeamNum ??
                gameData?.Game?.WinnerTeamNum ??
                null;
              dispatch({
                type: "MATCH_ENDED",
                payload: { players, winnerTeamNum },
              });
              if (
                myTeamRef.current !== null &&
                myTeamRef.current === winnerTeamNum
              ) {
                announce("win", {});
              }
              break;
            }
          }
        } catch (e) {
          console.error("Erreur WS:", e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!dead) setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      dead = true;
      ws?.close();
    };
  }, [dispatch, announce, setPlayer]);
}

// ─── Hook: External MMR ───────────────────────────────────────────────────────

function useMMR(dispatch, platformRef, usernameRef, gameMode, totalMatches, username) {
  // Ref sur le gameMode pour toujours lire la valeur courante dans le callback async
  const gameModeRef = useRef(gameMode);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  const fetchMMR = useCallback(async () => {
    const username = usernameRef.current;
    const platform = platformRef.current;
    if (!username || !gameModeRef.current) return;
    try {
      const res = await fetch(`http://localhost:3000/api/mmr/${platform}/${username}`);
      if (!res.ok) throw new Error("Erreur proxy Node");
      const data = await res.json();

      // Utilise le mode de jeu détecté en cours de session pour lire les bons stats.
      // Capturé en local : le mode lu et celui du dispatch doivent être identiques
      const mode = gameModeRef.current;
      const modeStats = data.rankedStats?.[mode];
      if (!modeStats?.mmr) return;

      dispatch({
        type: "MMR_UPDATED",
        payload: {
          mode,
          mmr: modeStats.mmr,
          rank: `${modeStats.rank?.tier?.name} - (Div ${(modeStats.rank?.division?.index ?? 0) + 1})`,
          rankImg: modeStats.rank?.imageURL ?? "",
        },
      });
    } catch {
      /* proxy peut ne pas être actif */
    }
  }, [dispatch, platformRef, usernameRef]);

  // Se déclenche au montage, après chaque match, si username change,
  // ET dès que le mode de jeu est détecté (début de partie)
  useEffect(() => {
    fetchMMR();
  }, [fetchMMR, totalMatches, username, gameMode]);
}
