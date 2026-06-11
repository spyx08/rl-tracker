import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';

// Palettes de confetti par thème
const CONFETTI_COLORS = {
  neon:  ['#fbbf24', '#10b981', '#3b82f6', '#f472b6', '#a78bfa', '#fb923c', '#ffffff'],
  retro: ['#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#ff77a8'],
};

function makeConfetti(theme, count = 80) {
  const colors = CONFETTI_COLORS[theme] ?? CONFETTI_COLORS.neon;
  // Rétro : gros pixels carrés, rotation par paliers — rendu 8-bit
  const isRetro = theme === 'retro';
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.8,
    duration: 2.5 + Math.random() * 2,
    width: isRetro ? 10 : 7 + Math.random() * 9,
    height: isRetro ? 10 : 4 + Math.random() * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    isCircle: !isRetro && Math.random() > 0.6,
    rotStart: Math.floor(Math.random() * 360),
    drift: Math.floor((Math.random() - 0.5) * 180),
  }));
}

export default function AnimationOverlay({ theme = 'neon' }) {
  const { announcement } = useGame();
  const [anim, setAnim] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!announcement || theme === 'off') return;
    clearTimeout(timerRef.current);

    const isWin = announcement.type === 'win';
    // Minimal : pas de confetti — sobriété assumée
    const confetti = isWin && theme !== 'minimal' ? makeConfetti(theme) : null;
    setAnim({ ...announcement, confetti });

    timerRef.current = setTimeout(() => setAnim(null), isWin ? 6500 : 4000);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcement]);

  if (!anim || theme === 'off') return null;

  const isWin    = anim.type === 'win';
  const isMyGoal = anim.type === 'goal' && anim.meta?.isMyTeam;

  return (
    <div
      key={anim.key}
      className={[
        'anim-overlay',
        `anim-theme-${theme}`,
        isWin ? 'anim-win' : isMyGoal ? 'anim-my-goal' : 'anim-goal',
      ].join(' ')}
    >
      {/* Backdrop solide — reveal via clip-path, zéro opacité */}
      <div className="anim-backdrop" />

      {/* Rétro : scanlines CRT par-dessus le backdrop */}
      {theme === 'retro' && <div className="anim-scanlines" aria-hidden="true" />}

      {/* Confetti — couleurs solides, pas de fondu */}
      {anim.confetti?.map((c) => (
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

      {/* Contenu */}
      <div className="anim-content">
        {isWin
          ? <WinContent theme={theme} />
          : <GoalContent meta={anim.meta} isMyGoal={isMyGoal} theme={theme} />
        }
      </div>
    </div>
  );
}

function GoalContent({ meta, isMyGoal, theme }) {
  return (
    <>
      {isMyGoal && theme === 'neon' && <div className="anim-sparks" aria-hidden="true" />}
      <div className={`anim-label ${isMyGoal ? 'anim-label--mine' : 'anim-label--neutral'}`}>
        BUT
      </div>
      <div className="anim-bar" />
      <div className="anim-scorer">{meta?.scorer ?? ''}</div>
    </>
  );
}

function WinContent({ theme }) {
  return (
    <>
      <div className="anim-trophy">{theme === 'retro' ? '👾' : '🏆'}</div>
      <div className="anim-label anim-label--win">VICTOIRE</div>
      <div className="anim-bar anim-bar--gold" />
      <div className="anim-scorer anim-scorer--win">GG WP</div>
    </>
  );
}
