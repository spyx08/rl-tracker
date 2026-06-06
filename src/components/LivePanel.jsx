import { useGame } from '../context/GameContext.jsx';

export default function LivePanel({ visible }) {
  const { state } = useGame();
  const { livePlayers, liveTeams, myCurrentTeamNum, username } = state;

  const hasData = livePlayers.length > 0 && liveTeams.length > 0;
  const sortedTeams = [...liveTeams].sort((a, b) => a.TeamNum - b.TeamNum);
  const needsSetup = !username && hasData;

  return (
    <div className={`panel live-game-panel ${visible ? '' : 'hidden'}`}>
      {!hasData ? (
        <div className="live-waiting">En attente de joueurs...</div>
      ) : (
        <>
          {needsSetup && <SetupBanner />}
          <ScoreHeader teams={sortedTeams} myTeamNum={myCurrentTeamNum} username={username} />
          <div className="live-columns">
            {sortedTeams.map((team) => {
              const color = `#${team.ColorPrimary || '888888'}`;
              const players = livePlayers
                .filter((p) => p.TeamNum === team.TeamNum)
                .sort((a, b) => b.Score - a.Score);
              return (
                <TeamColumn
                  key={team.TeamNum}
                  team={team}
                  color={color}
                  players={players}
                  myTeamNum={myCurrentTeamNum}
                  username={username}
                  setupMode={needsSetup}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SetupBanner() {
  return (
    <div className="setup-banner">
      <span className="setup-banner-icon">👤</span>
      <span>Cliquez sur votre nom dans le scoreboard</span>
    </div>
  );
}

function ScoreHeader({ teams, myTeamNum, username }) {
  const { setPlayer, state } = useGame();
  const [t0, t1] = teams;
  if (!t0 || !t1) return null;

  const c0 = `#${t0.ColorPrimary || '3b82f6'}`;
  const c1 = `#${t1.ColorPrimary || 'f97316'}`;
  const isMy0 = t0.TeamNum === myTeamNum;
  const isMy1 = t1.TeamNum === myTeamNum;

  return (
    <div className="score-header">
      <div className={`score-team score-team--left ${isMy0 ? 'score-team--mine' : ''}`} style={{ '--team-color': c0 }}>
        <span className="score-team-name">{t0.Name || 'TEAM 0'}</span>
        {isMy0 && <span className="score-mine-badge">MON ÉQUIPE</span>}
      </div>
      <div className="score-center">
        <span className="score-digit" style={{ color: c0 }}>{t0.Score}</span>
        <span className="score-sep">–</span>
        <span className="score-digit" style={{ color: c1 }}>{t1.Score}</span>
      </div>
      <div className={`score-team score-team--right ${isMy1 ? 'score-team--mine' : ''}`} style={{ '--team-color': c1 }}>
        {isMy1 && <span className="score-mine-badge">MON ÉQUIPE</span>}
        <span className="score-team-name">{t1.Name || 'TEAM 1'}</span>
        {username && (
          <button
            className="reset-player-btn"
            title="Changer de joueur"
            onClick={() => setPlayer(null, state.platform)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function TeamColumn({ team, color, players, myTeamNum, username, setupMode }) {
  return (
    <div className="live-team-col" style={{ '--team-color': color }}>
      <div className="live-team-header" style={{ color }}>
        <span className="live-team-dot" style={{ background: color }} />
        {team.Name || 'ÉQUIPE'}
      </div>
      {players.map((p) => (
        <PlayerCard
          key={p.Name}
          player={p}
          teamColor={color}
          isMyTeam={team.TeamNum === myTeamNum}
          username={username}
          setupMode={setupMode}
        />
      ))}
    </div>
  );
}

function PlayerCard({ player, teamColor, username, setupMode }) {
  const { setPlayer } = useGame();
  const isMe = player.Name === username;

  const platformFromPrimaryId = (primaryId) => {
    if (!primaryId) return 'epic';
    const prefix = primaryId.split('|')[0].toLowerCase();
    const map = { epic: 'epic', steam: 'steam', ps4: 'psn', ps5: 'psn', psn: 'psn', xbox: 'xbl', xbl: 'xbl', switch: 'switch' };
    return map[prefix] ?? 'epic';
  };

  const handleIdentify = () => {
    if (!setupMode) return;
    const platform = platformFromPrimaryId(player.PrimaryId);
    setPlayer(player.Name, platform);
    console.log(`👤 Joueur sélectionné manuellement : ${player.Name} (${platform})`);
  };

  return (
    <div
      className={`player-card ${isMe ? 'player-card--me' : ''} ${setupMode ? 'player-card--selectable' : ''}`}
      style={isMe ? { '--glow-color': teamColor } : {}}
      onClick={setupMode ? handleIdentify : undefined}
      title={setupMode ? `Cliquez pour vous identifier comme ${player.Name}` : undefined}
    >
      <div className="player-card-top">
        <div className="player-card-left">
          {isMe && <span className="player-star">★</span>}
          {setupMode && !isMe && <span className="setup-pick-icon">👤</span>}
          <span className={`player-name ${isMe ? 'player-name--me' : ''}`}>{player.Name}</span>
        </div>
        <span className={`player-score ${isMe ? 'player-score--me' : ''}`}>{player.Score}</span>
      </div>
      <div className="player-card-stats">
        <Stat label="B" value={player.Goals} highlight={isMe && player.Goals > 0} />
        <span className="stat-sep">·</span>
        <Stat label="P" value={player.Assists} highlight={isMe && player.Assists > 0} />
        <span className="stat-sep">·</span>
        <Stat label="A" value={player.Saves} highlight={isMe && player.Saves > 0} />
        {player.Boost !== undefined && (
          <>
            <span className="stat-sep">·</span>
            <span className="stat-boost">
              <span className="stat-boost-icon">⚡</span>{player.Boost}
            </span>
          </>
        )}
      </div>
      {isMe && <div className="player-card-bar" style={{ background: teamColor }} />}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <span className={`player-stat ${highlight ? 'player-stat--highlight' : ''}`}>
      {value}<span className="stat-label">{label}</span>
    </span>
  );
}
