import { useGame } from "../context/GameContext.jsx";

export default function Header({
  sessionVisible,
  liveVisible,
  onToggleSession,
  onToggleLive,
}) {
  const { state } = useGame();
  const {
    wins,
    losses,
    streak,
    currentMMR,
    startMMR,
    rank,
    rankImg,
    username,
  } = state;

  const sessionDiff = startMMR !== null ? currentMMR - startMMR : null;
  const deltaSign = sessionDiff === null ? "" : sessionDiff >= 0 ? "+" : "";
  const deltaClass =
    sessionDiff === null
      ? ""
      : sessionDiff > 0
        ? "hud-pos"
        : sessionDiff < 0
          ? "hud-neg"
          : "";

  return (
    <div className="hud">
      {/* WINS */}
      <div className="hud-block">
        <span className="hud-label">WINS</span>
        <span className="hud-value hud-pos">
          {wins}
          <span className="hud-icon">🏆</span>
        </span>
      </div>

      <div className="hud-sep" />

      {/* LOSSES */}
      <div className="hud-block">
        <span className="hud-label">LOSSES</span>
        <span className="hud-value hud-neg">
          {losses}
          <span className="hud-icon hud-icon--text">✕</span>
        </span>
      </div>

      <div className="hud-sep" />

      {/* MMR */}
      <div className="hud-block hud-block--wide">
        <span className="hud-label">MMR</span>
        <span className="hud-value hud-mmr-row">
          {rankImg && <img src={rankImg} className="hud-rank-img" alt="" />}
          <span>{username ? currentMMR || "—" : "—"}</span>
          {sessionDiff !== null && (
            <span className={`hud-delta ${deltaClass}`}>
              {deltaSign}
              {sessionDiff}
            </span>
          )}
        </span>
      </div>

      <div className="hud-sep" />

      {/* STREAK */}
      <div className="hud-block">
        <span className="hud-label">STREAK</span>
        <StreakValue streak={streak || 0} />
      </div>

      <div className="hud-spacer" />

      {/* Panel toggles */}
      <div className="hud-toggles">
        <button
          className={`hud-toggle-btn ${sessionVisible ? "hud-toggle-btn--active" : ""}`}
          onClick={onToggleSession}
          title="Stats de session"
        >
          ≡
        </button>
        <button
          className={`hud-toggle-btn ${liveVisible ? "hud-toggle-btn--active" : ""}`}
          onClick={onToggleLive}
          title="Game en cours"
        >
          ◉
        </button>
      </div>
    </div>
  );
}

function StreakValue({ streak }) {
  if (streak === 0) {
    return <span className="hud-value hud-muted">—</span>;
  }
  const isWin = streak > 0;
  const icon = isWin ? "🔥" : "❄️";
  const label = isWin ? `+${streak}` : `${streak}`;
  return (
    <span className={`hud-value ${isWin ? "hud-pos" : "hud-neg"}`}>
      {label}
      <span className="hud-icon">{icon}</span>
    </span>
  );
}
