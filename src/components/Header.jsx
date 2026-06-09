import { useGame } from "../context/GameContext.jsx";

export default function Header() {
  const { state } = useGame();
  const { wins, losses, streak, currentMMR, startMMR, rankImg, username } = state;

  const sessionDiff = startMMR !== null ? currentMMR - startMMR : null;
  const deltaSign   = sessionDiff === null ? "" : sessionDiff >= 0 ? "+" : "";
  const deltaClass  = sessionDiff === null ? "" : sessionDiff > 0 ? "hud-pos" : sessionDiff < 0 ? "hud-neg" : "";

  return (
    <div className="hud">
      <div className="hud-block">
        <span className="hud-label">WINS</span>
        <span className="hud-value hud-pos">
          {wins}<span className="hud-icon">🏆</span>
        </span>
      </div>

      <div className="hud-sep" />

      <div className="hud-block">
        <span className="hud-label">LOSSES</span>
        <span className="hud-value hud-neg">
          {losses}<span className="hud-icon hud-icon--text">✕</span>
        </span>
      </div>

      <div className="hud-sep" />

      <div className="hud-block hud-block--wide">
        <span className="hud-label">MMR</span>
        <span className="hud-value hud-mmr-row">
          {rankImg && <img src={rankImg} className="hud-rank-img" alt="" />}
          <span>{username ? currentMMR || "—" : "—"}</span>
          {sessionDiff !== null && (
            <span className={`hud-delta ${deltaClass}`}>{deltaSign}{sessionDiff}</span>
          )}
        </span>
      </div>

      <div className="hud-sep" />

      <div className="hud-block">
        <span className="hud-label">STREAK</span>
        <StreakValue streak={streak || 0} />
      </div>
    </div>
  );
}

function StreakValue({ streak }) {
  if (streak === 0) return <span className="hud-value hud-muted">—</span>;
  const isWin = streak > 0;
  return (
    <span className={`hud-value ${isWin ? "hud-pos" : "hud-neg"}`}>
      {isWin ? `+${streak}` : `${streak}`}
      <span className="hud-icon">{isWin ? "🔥" : "❄️"}</span>
    </span>
  );
}
