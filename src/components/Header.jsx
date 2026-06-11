import { useGame } from "../context/GameContext.jsx";
import { getRankProgress, TIER_LABEL_COLORS } from "../utils/rankBands.js";

export default function Header() {
  const { state } = useGame();
  const { wins, losses, streak, currentMMR, startMMR, rankImg, username } = state;

  const sessionDiff = startMMR !== null ? currentMMR - startMMR : null;
  const deltaSign   = sessionDiff === null ? "" : sessionDiff >= 0 ? "+" : "";
  const deltaClass  = sessionDiff === null ? "" : sessionDiff > 0 ? "hud-pos" : sessionDiff < 0 ? "hud-neg" : "";

  const prog = username ? getRankProgress(currentMMR) : null;

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
        {prog && <RankProgress prog={prog} startMMR={startMMR} />}
      </div>

      <div className="hud-sep" />

      <div className="hud-block">
        <span className="hud-label">STREAK</span>
        <StreakValue streak={streak || 0} />
      </div>
    </div>
  );
}

// Barre de progression dans la division courante, avec un repère (tick) sur la
// position de début de session quand elle se trouve dans la même division
function RankProgress({ prog, startMMR }) {
  const color = TIER_LABEL_COLORS[prog.band.tier] ?? "#60a5fa";
  const startPos = startMMR !== null ? prog.positionInDivision(startMMR) : null;

  return (
    <div
      className="hud-rank-progress"
      title={`${prog.band.name} — Division ${prog.division}`}
    >
      <div className="hud-rank-bar">
        <div
          className="hud-rank-fill"
          style={{ width: `${Math.round(prog.progress * 100)}%`, background: color }}
        />
        {startPos !== null && (
          <span className="hud-rank-start" style={{ left: `${startPos * 100}%` }} />
        )}
      </div>
      <span className="hud-rank-caption">
        <span style={{ color }}>{prog.band.short} · Div {prog.division}</span>
        {prog.nextLabel && (
          <span className="hud-rank-next"> · {prog.pointsToNext} pts → {prog.nextLabel}</span>
        )}
      </span>
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
