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

// ─── State ────────────────────────────────────────────────────────────────────

const savedUsername = localStorage.getItem("rl_username") ?? null;
const savedPlatform = localStorage.getItem("rl_platform") ?? "epic";

const initialState = {
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
        username: action.payload.username,
        platform: action.payload.platform,
        usernameNotInGame: false,
        rank: "Chargement...",
        wins: 0,
        losses: 0,
        streak: 0,
        startMMR: null,
        currentMMR: 0,
        deltaMMR: 0,
        totalMatches: 0,
        totalGoals: 0,
        totalAssists: 0,
        totalSaves: 0,
        totalMVPs: 0,
        totalDemolished: 0,
      };

    case "MATCH_RESET":
      return {
        ...state,
        matchAlreadyCounted: false,
        lastPlayers: [],
        matchMaxPlayers: 0,
        gameMode: null,   // reset pour que la détection du prochain mode triggere bien l'effet MMR
        livePlayers: [],
        liveTeams: [],
        usernameNotInGame: false,
      };

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

      let next = {
        ...state,
        matchAlreadyCounted: true,
        totalMatches: state.totalMatches + 1,
      };

      if (state.myCurrentTeamNum === winnerTeamNum) {
        next.wins = state.wins + 1;
        next.streak = state.streak > 0 ? state.streak + 1 : 1;
        const myTeam = finalPlayers.filter(
          (p) => p.TeamNum === state.myCurrentTeamNum,
        );
        const topScore = Math.max(...myTeam.map((p) => p.Score || 0));
        if (me.Score >= topScore && me.Score > 0)
          next.totalMVPs = state.totalMVPs + 1;
      } else {
        next.losses = state.losses + 1;
        next.streak = state.streak < 0 ? state.streak - 1 : -1;
      }

      return next;
    }

    case "MMR_UPDATED": {
      const { mmr, rank, rankImg } = action.payload;
      const deltaMMR = state.currentMMR > 0 ? mmr - state.currentMMR : 0;
      return {
        ...state,
        currentMMR: mmr,
        deltaMMR,
        rank,
        rankImg,
        startMMR: state.startMMR === null ? mmr : state.startMMR,
      };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [announcement, setAnnouncement] = useState(null);

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

  const setPlayer = useCallback((username, platform) => {
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
    myTeamRef,
    setPlayer,
  );
  useMMR(dispatch, platformRef, usernameRef, state.gameMode, state.totalMatches, state.username);

  return (
    <GameContext.Provider value={{ state, announcement, setPlayer }}>
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
  myTeamRef,
  setPlayer,
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

      ws.onopen = () =>
        console.log("✅ Connecté à l'API Native de Rocket League");

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
                  } else {
                    console.log(
                      `🎮 Joueur local confirmé : ${detected.name} (${detected.platform})`,
                    );
                  }
                  setPlayer(detected.name, detected.platform);
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

      // Utilise le mode de jeu détecté en cours de session pour lire les bons stats
      const modeStats = data.rankedStats?.[gameModeRef.current];
      if (!modeStats?.mmr) return;

      dispatch({
        type: "MMR_UPDATED",
        payload: {
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
