import { useGame } from '../context/GameContext.jsx';

export default function Header() {
  const { state } = useGame();
  const { wins, losses, currentMMR, deltaMMR, startMMR, rank, rankImg, username } = state;

  const sessionDiff = startMMR !== null ? currentMMR - startMMR : null;
  const deltaStyle = sessionDiff === null ? '' : sessionDiff > 0 ? 'text-win' : sessionDiff < 0 ? 'text-loss' : '';
  const deltaText = deltaMMR !== 0 ? `(${deltaMMR > 0 ? `+${deltaMMR}` : deltaMMR})` : '';

  return (
    <div className="overlay">
      <div className="header">
        <span className="header-left">
          {rankImg && <img className="rank-img" src={rankImg} alt="Rang" />}
          <div className="header-rank-block">
            <span className="header-rank-name">{username ? rank : 'Non configuré'}</span>
            {username && <span className="header-player-name">{username}</span>}
          </div>
        </span>
        {username && (
          <span>
            {currentMMR} MMR{' '}
            <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>{deltaText}</span>
          </span>
        )}
      </div>

      {!username && (
        <div className="setup-hint">
          Ouvrez <strong>Game en cours</strong> pendant une partie et cliquez sur votre nom
        </div>
      )}

      {username && (
        <div className="stats">
          <div className="box">
            <span className="label" style={{ textAlign: 'left' }}>Session (V - D)</span>
            <span className="val">
              <span className="text-win">{wins}</span>
              {' - '}
              <span className="text-loss">{losses}</span>
            </span>
          </div>
          <div className="box">
            <span className="label" style={{ textAlign: 'left' }}>Delta MMR</span>
            <span className={`val ${deltaStyle}`}>
              {sessionDiff === null ? '±0' : sessionDiff > 0 ? `+${sessionDiff}` : sessionDiff}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
