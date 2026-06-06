import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';

const CONFETTI_COLORS = ['#fbbf24', '#10b981', '#3b82f6', '#f472b6', '#a78bfa', '#fb923c', '#ffffff'];

function makeConfetti(count = 80) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.8,
    duration: 2.2 + Math.random() * 2,
    width: 7 + Math.random() * 9,
    height: 4 + Math.random() * 10,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    isCircle: Math.random() > 0.6,
    rotStart: Math.floor(Math.random() * 360),
    drift: Math.floor((Math.random() - 0.5) * 180),
  }));
}

export default function AnimationOverlay() {
  const { announcement } = useGame();
  const [anim, setAnim] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!announcement) return;
    clearTimeout(timerRef.current);

    const isWin = announcement.type === 'win';
    setAnim({
      ...announcement,
      confetti: isWin ? makeConfetti() : null,
    });

    timerRef.current = setTimeout(() => setAnim(null), isWin ? 6500 : 4000);
    return () => clearTimeout(timerRef.current);
  }, [announcement]);

  if (!anim) return null;

  const isWin = anim.type === 'win';
  const isMyTeamGoal = anim.type === 'goal' && anim.meta?.isMyTeam;

  return (
    <div
      key={anim.key}
      className={`anim-overlay ${isWin ? 'anim-win' : isMyTeamGoal ? 'anim-my-goal' : 'anim-goal'}`}
    >
      {/* Flash backdrop */}
      <div className="anim-flash" />

      {/* Confetti (victoire uniquement) */}
      {isWin && anim.confetti.map((c) => (
        <div
          key={c.id}
          className="confetti-piece"
          style={{
            left: `${c.left}%`,
            width: c.width,
            height: c.height,
            background: c.color,
            borderRadius: c.isCircle ? '50%' : '2px',
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            '--rot-start': `${c.rotStart}deg`,
            '--drift': `${c.drift}px`,
          }}
        />
      ))}

      {/* Contenu central */}
      <div className="anim-content">
        {isWin ? <WinContent /> : <GoalContent meta={anim.meta} isMyTeam={isMyTeamGoal} />}
      </div>
    </div>
  );
}

function GoalContent({ meta, isMyTeam }) {
  return (
    <>
      {isMyTeam && <div className="anim-sparks" aria-hidden="true" />}
      <div className={`anim-label ${isMyTeam ? 'anim-label--mine' : 'anim-label--neutral'}`}>
        BUT
      </div>
      <div className="anim-bar" />
      <div className="anim-scorer">{meta?.scorer ?? ''}</div>
    </>
  );
}

function WinContent() {
  return (
    <>
      <div className="anim-trophy" aria-hidden="true">🏆</div>
      <div className="anim-label anim-label--win">VICTOIRE</div>
      <div className="anim-bar anim-bar--gold" />
      <div className="anim-scorer anim-scorer--win">GG WP</div>
    </>
  );
}
