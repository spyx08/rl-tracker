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

export function platformFromPrimaryId(primaryId) {
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

// Sépare les noms des coéquipiers / adversaires — stockés dans le matchLog
// pour la recherche du dashboard et les insights "meilleur/pire coéquipier"
function splitTeams(players, username, myTeamNum) {
  const teammates = [];
  const opponents = [];
  if (myTeamNum == null) return { teammates, opponents };
  for (const p of players ?? []) {
    if (!p.Name || p.Name === username) continue;
    if (p.TeamNum === myTeamNum) teammates.push(p.Name);
    else opponents.push(p.Name);
  }
  return { teammates, opponents };
}

// Délai avant de déduire le mode de jeu en début de partie : les joueurs
// rejoignent progressivement, sans délai un 3v3 s'affiche d'abord en 1v1/2v2
const GAMEMODE_DETECT_DELAY_MS = 8000;

// Mode secours (Launch.log introuvable) : délai avant de conclure qu'un
// compte stocké est absent de la partie. Le
// roster se remplit progressivement : sans ce délai, un UpdateState initial
// où le joueur n'est pas encore chargé le ferait passer pour "compte changé"
// et déclencherait un reset + re-choix de compte en pleine session.
const ACCOUNT_VERIFY_DELAY_MS = 8000;

// Fenêtre pendant laquelle un même message de snackbar ne se ré-affiche pas.
// Le MMR est refetché à chaque fin de match : sans ça, une panne TRN prolongée
// ferait clignoter la même erreur toute la soirée.
const NOTICE_COOLDOWN = 5 * 60 * 1000;

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
const savedPrimaryId = localStorage.getItem("rl_primary_id") ?? null;

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
  // Premier UpdateState du match en cours — la détection du mode de jeu
  // attend GAMEMODE_DETECT_DELAY_MS après cet instant (jamais persisté)
  matchStartedAt: 0,

  // Joueur détecté (null = pas encore identifié)
  username: savedUsername,
  platform: savedPlatform,
  primaryId: savedPrimaryId,
  // Compte lu dans le Launch.log du jeu ({ name, primaryId }) — source de
  // vérité quand il est disponible ; null = sélection manuelle en secours.
  // Jamais persisté : renvoyé par le serveur à chaque connexion.
  logPlayer: null,
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
        primaryId: action.payload.primaryId ?? null,
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

    case "LOG_PLAYER":
      return { ...state, logPlayer: action.payload, usernameNotInGame: false };

    // Même compte (même PrimaryId) renommé : on suit le nouveau pseudo SANS
    // démarrer une nouvelle session
    case "RENAME_PLAYER":
      return { ...state, username: action.payload };

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
            {
              ts: now,
              mode: state.gameMode,
              result: won ? "win" : "loss",
              ...splitTeams(state.lastPlayers, state.username, state.myCurrentTeamNum),
            },
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
        matchStartedAt: 0,
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

      // Début d'un nouveau match observé (lastPlayers vidé par MATCH_RESET) :
      // démarre la fenêtre d'attente avant la détection du mode
      if (state.lastPlayers.length === 0 && players.length > 0) {
        next.matchStartedAt = Date.now();
      }

      const maxTeamSize = Math.max(
        players.filter((p) => p.TeamNum === 0).length,
        players.filter((p) => p.TeamNum === 1).length,
      );
      if (maxTeamSize > state.matchMaxPlayers) {
        next.matchMaxPlayers = maxTeamSize;
      }

      // Le mode n'est déduit qu'après GAMEMODE_DETECT_DELAY_MS : les joueurs
      // rejoignent la partie progressivement, la taille des équipes des
      // premières secondes n'est pas fiable (un 3v3 commence en "1v1")
      const startedAt = next.matchStartedAt || state.matchStartedAt;
      if (
        next.matchMaxPlayers > 0 &&
        startedAt > 0 &&
        Date.now() - startedAt >= GAMEMODE_DETECT_DELAY_MS
      ) {
        const mode =
          next.matchMaxPlayers === 1 ? "duel"
          : next.matchMaxPlayers === 2 ? "double"
          : "standard";
        if (mode !== state.gameMode) next.gameMode = mode;
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
        {
          ts: Date.now(),
          mode: state.gameMode,
          result,
          ...splitTeams(finalPlayers, state.username, state.myCurrentTeamNum),
        },
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
  const [notice, setNotice]             = useState(null);
  const [wsConnected, setWsConnected]   = useState(false);

  const announce = useCallback((type, meta = {}) => {
    setAnnouncement({ type, meta, key: Date.now() });
  }, []);

  // Notification non bloquante (snackbar). La console reçoit TOUJOURS la
  // trace, même quand l'affichage est étouffé par le cooldown : c'est elle
  // qu'on relit dans les devtools pour remonter un bug.
  const lastNoticeRef = useRef({ text: null, at: 0 });
  const notify = useCallback((type, text, detail = "") => {
    console.warn(`[${type}] ${text}${detail ? ` — ${detail}` : ""}`);
    const now = Date.now();
    const last = lastNoticeRef.current;
    // Si TRN reste down, l'overlay ne doit pas reclignoter à chaque fin de match
    if (last.text === text && now - last.at < NOTICE_COOLDOWN) return;
    lastNoticeRef.current = { text, at: now };
    setNotice({ type, text, detail, key: now });
  }, []);

  // Confirmation courte (compte détecté…) : pas de cooldown, chaque lancement
  // du jeu doit la réafficher
  const toast = useCallback((text, detail = "") => {
    setNotice({ type: "success", text, detail, key: Date.now(), duration: 2000 });
  }, []);

  // Refs pour que les hooks WS/MMR lisent toujours la valeur courante
  const usernameRef = useRef(state.username);
  const primaryIdRef = useRef(state.primaryId);
  const logPlayerRef = useRef(state.logPlayer);
  const platformRef = useRef(state.platform);
  const myTeamRef = useRef(state.myCurrentTeamNum);
  useEffect(() => {
    usernameRef.current = state.username;
  }, [state.username]);
  useEffect(() => {
    platformRef.current = state.platform;
  }, [state.platform]);
  useEffect(() => {
    primaryIdRef.current = state.primaryId;
  }, [state.primaryId]);
  useEffect(() => {
    logPlayerRef.current = state.logPlayer;
  }, [state.logPlayer]);
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

  const setPlayer = useCallback((username, platform, primaryId = null) => {
    // Changement de compte = nouvelle session : le snapshot de l'ancienne ne
    // doit pas être restauré au prochain démarrage
    clearSessionSnapshot();
    if (username) {
      localStorage.setItem("rl_username", username);
      localStorage.setItem("rl_platform", platform ?? "epic");
      if (primaryId) localStorage.setItem("rl_primary_id", primaryId);
      else localStorage.removeItem("rl_primary_id");
    } else {
      // Réinitialisation : supprime les clés pour ne pas stocker le string "null"
      localStorage.removeItem("rl_username");
      localStorage.removeItem("rl_platform");
      localStorage.removeItem("rl_primary_id");
    }
    dispatch({
      type: "SET_PLAYER",
      payload: { username: username ?? null, platform: platform ?? "epic", primaryId },
    });
  }, []);

  useRLWebSocket(
    dispatch,
    announce,
    state.lastPlayers,
    usernameRef,
    primaryIdRef,
    logPlayerRef,
    myTeamRef,
    setPlayer,
    setWsConnected,
    toast,
  );
  useMMR(dispatch, platformRef, usernameRef, state.gameMode, state.totalMatches, state.username, notify, MMR_ENABLED);

  return (
    <GameContext.Provider value={{ state, announcement, notice, setPlayer, wsConnected }}>
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
  primaryIdRef,
  logPlayerRef,
  myTeamRef,
  setPlayer,
  setWsConnected,
  toast,
) {
  const lastPlayersRef = useRef(lastPlayers);
  useEffect(() => {
    lastPlayersRef.current = lastPlayers;
  }, [lastPlayers]);

  // Mode secours (pas de Launch.log) : armé à true à chaque nouveau match pour
  // vérifier que le compte stocké est bien dans la partie
  const needsRedetectionRef = useRef(true);
  // Horodatage du 1er UpdateState où le compte stocké est introuvable : sert à
  // tolérer le remplissage progressif du roster avant de conclure "compte absent"
  const redetectStartedAtRef = useRef(0);

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
            // Compte connecté au jeu, lu par le serveur dans le Launch.log
            case "LocalPlayer": {
              const name = gameData?.Name;
              const primaryId = gameData?.PrimaryId ?? null;
              if (!name) break;
              const sameAccount = primaryId && primaryIdRef.current
                ? primaryId === primaryIdRef.current
                : name === usernameRef.current;
              if (!sameAccount) {
                console.log(`🔄 Compte connecté : ${usernameRef.current ?? "aucun"} → ${name}`);
                // Nouveau compte → nouvelle session via SET_PLAYER
                setPlayer(name, platformFromPrimaryId(primaryId), primaryId);
              } else {
                if (name !== usernameRef.current) {
                  localStorage.setItem("rl_username", name);
                  dispatch({ type: "RENAME_PLAYER", payload: name });
                }
                if (primaryId && primaryId !== primaryIdRef.current) {
                  // Compte choisi à la main avant la v2.4.2 : on complète son id
                  localStorage.setItem("rl_primary_id", primaryId);
                  primaryIdRef.current = primaryId;
                }
              }
              logPlayerRef.current = { name, primaryId };
              // Confirme au joueur que le tracker est prêt et sur quel compte
              toast(`Compte détecté : ${name}`, "La session sera enregistrée sur ce compte");
              dispatch({ type: "LOG_PLAYER", payload: { name, primaryId } });
              break;
            }

            case "MatchCreated":
            case "MatchDestroyed":
              dispatch({ type: "MATCH_RESET" });
              // Réarme la détection : le compte connecté a peut-être changé depuis la dernière partie
              needsRedetectionRef.current = true;
              redetectStartedAtRef.current = 0;
              break;

            case "UpdateState": {
              if (typeof gameData !== "object" || !gameData.Players) break;

              const players = gameData.Players;
              const teams = gameData.Game?.Teams ?? null;
              const game = gameData.Game ?? {};

              // Mode secours uniquement (Launch.log introuvable) : on vérifie
              // au début de chaque match que le compte stocké est dans la partie.
              // Tolérant au remplissage progressif du roster : on ne conclut
              // "compte absent" qu'après ACCOUNT_VERIFY_DELAY_MS.
              if (!logPlayerRef.current && needsRedetectionRef.current) {
                if (!usernameRef.current) {
                  // Aucun champ auto-détectable et pas d'username stocké → UI de sélection
                  needsRedetectionRef.current = false;
                  redetectStartedAtRef.current = 0;
                  console.log("⚠️ Compte non détecté (Launch.log introuvable) : sélection manuelle");
                } else {
                  // Username stocké, pas de bLocalPlayer : on vérifie sa présence.
                  // Le roster se remplit progressivement, donc tant que le joueur
                  // n'est pas trouvé on retente aux UpdateState suivants, et on ne
                  // le marque "absent" qu'au-delà du délai (= vrai changement).
                  const found = players.some((p) => p.Name === usernameRef.current);
                  if (found) {
                    needsRedetectionRef.current = false;
                    redetectStartedAtRef.current = 0;
                    dispatch({ type: "CHECK_PLAYER", payload: { players } });
                  } else {
                    if (redetectStartedAtRef.current === 0) {
                      redetectStartedAtRef.current = Date.now();
                    }
                    if (
                      Date.now() - redetectStartedAtRef.current >=
                      ACCOUNT_VERIFY_DELAY_MS
                    ) {
                      // Toujours absent après le délai → réellement plus dans la partie
                      needsRedetectionRef.current = false;
                      redetectStartedAtRef.current = 0;
                      dispatch({ type: "CHECK_PLAYER", payload: { players } });
                    }
                    // sinon : on garde needsRedetectionRef à true et on retente
                  }
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
  }, [dispatch, announce, setPlayer, toast]);
}

// ─── Hook: External MMR ───────────────────────────────────────────────────────

// Désactivé : Tracker Network bloque désormais tout accès automatisé
// (challenge Cloudflare). L'overlay se limite aux wins/losses et aux stats
// de match du bridge. Repasser à true si un accès officiel est obtenu.
export const MMR_ENABLED = false;

// Messages courts par code renvoyé par le proxy local. Le détail technique
// (code HTTP, compte visé, message du proxy) part dans la ligne du dessous.
const MMR_ERRORS = {
  400: "Plateforme non reconnue",
  404: "Profil Tracker Network introuvable",
  502: "Tracker Network injoignable",
};

function useMMR(dispatch, platformRef, usernameRef, gameMode, totalMatches, username, notify, enabled) {
  // Ref sur le gameMode pour toujours lire la valeur courante dans le callback async
  const gameModeRef = useRef(gameMode);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  const fetchMMR = useCallback(async () => {
    const username = usernameRef.current;
    const platform = platformRef.current;
    if (!username || !gameModeRef.current) return;
    try {
      const res = await fetch(`http://localhost:3000/api/mmr/${platform}/${username}`);

      if (!res.ok) {
        // Sur un code connu, le titre dit déjà le pourquoi : inutile de répéter
        // le message du proxy. Sur un code inattendu, on le joint tel quel.
        const known = MMR_ERRORS[res.status];
        const body = known ? null : await res.json().catch(() => null);
        notify(
          "error",
          known ?? "MMR indisponible",
          `HTTP ${res.status} · ${platform}/${username}${body?.error ? ` · ${body.error}` : ""}`,
        );
        return;
      }

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
    } catch (err) {
      // fetch ne rejette que si le proxy local ne répond pas du tout : serveur
      // pas encore démarré, ou tombé. Rien de bloquant, on joue sans MMR.
      notify("error", "Proxy local injoignable", `localhost:3000 · ${err.message}`);
    }
  }, [dispatch, platformRef, usernameRef, notify]);

  // Se déclenche au montage, après chaque match, si username change,
  // ET dès que le mode de jeu est détecté (début de partie)
  useEffect(() => {
    if (enabled) fetchMMR();
  }, [enabled, fetchMMR, totalMatches, username, gameMode]);
}
