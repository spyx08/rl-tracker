import { useEffect, useRef, useState } from 'react';
import { useGame, platformFromPrimaryId } from '../context/GameContext.jsx';

// Fenêtre de sélection de compte : apparaît quelques secondes en début de
// partie si aucun compte n'est choisi et que le panneau Live Game est masqué
// (sinon les matchs ne sont pas comptés dans l'historique). Elle se cache
// toute seule pour ne pas gêner, et réapparaît à l'ouverture du menu ⚙
// tant qu'aucun compte n'est sélectionné.
const AUTO_HIDE_MS = 10_000;

export default function AccountPicker({ livePanelVisible, reopenSignal }) {
  const { state, setPlayer } = useGame();
  const [visible, setVisible] = useState(false);
  const [showCount, setShowCount] = useState(0); // re-déclenche la barre de progression
  const autoShownRef = useRef(false); // déjà auto-affichée pour cette partie
  const timerRef = useRef(null);

  const inGame = state.livePlayers.length > 0;
  const needsAccount = !state.username && inGame;

  const show = () => {
    setVisible(true);
    setShowCount((c) => c + 1);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  };

  // Auto-affichage en début de partie — une seule fois par partie, et
  // uniquement si le LivePanel (qui permet déjà la sélection) est masqué
  useEffect(() => {
    if (!needsAccount) {
      autoShownRef.current = false;
      clearTimeout(timerRef.current);
      setVisible(false);
      return;
    }
    if (livePanelVisible || autoShownRef.current) return;
    autoShownRef.current = true;
    show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAccount, livePanelVisible]);

  // Ré-affichage à l'ouverture du menu ⚙ si toujours aucun compte
  useEffect(() => {
    if (reopenSignal && needsAccount) show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenSignal]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!visible || !needsAccount) return null;

  // Groupes par équipe à partir des joueurs (liveTeams peut ne pas être
  // encore peuplé sur les premiers UpdateState)
  const teamNums = [...new Set(state.livePlayers.map((p) => p.TeamNum))].sort();
  const teams = teamNums.map((num) => {
    const meta = state.liveTeams.find((t) => t.TeamNum === num);
    return {
      TeamNum: num,
      ColorPrimary: meta?.ColorPrimary || (num === 0 ? '1873FF' : 'C26418'),
    };
  });

  const pick = (p) => {
    setPlayer(p.Name, platformFromPrimaryId(p.PrimaryId));
    setVisible(false);
  };

  return (
    <div className="account-picker">
      <button
        className="account-picker-close"
        title="Fermer"
        onClick={() => setVisible(false)}
      >
        ✕
      </button>
      <div className="account-picker-title">👤 Qui es-tu ?</div>
      <div className="account-picker-sub">
        Choisis ton compte pour que la session soit enregistrée
      </div>
      <div className="account-picker-teams">
        {teams.map((team) => {
          const color = `#${team.ColorPrimary || '888888'}`;
          const players = state.livePlayers
            .filter((p) => p.TeamNum === team.TeamNum)
            .sort((a, b) => (a.Name > b.Name ? 1 : -1));
          if (players.length === 0) return null;
          return (
            <div key={team.TeamNum} className="account-picker-team" style={{ '--team-color': color }}>
              {players.map((p) => (
                <button key={p.Name} className="account-picker-player" onClick={() => pick(p)}>
                  {p.Name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {/* Barre de temps restant avant masquage automatique */}
      <div
        key={showCount}
        className="account-picker-progress"
        style={{ animationDuration: `${AUTO_HIDE_MS}ms` }}
      />
    </div>
  );
}
