import { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';

// Durée par défaut ; une notice peut fournir la sienne (notice.duration).
// Le délai de snackOut est calé dessus en inline (cf. .snackbar dans index.css)
const VISIBLE_MS = 6000;
const FADE_OUT_MS = 400;

/**
 * Notification passive : jamais de bouton, jamais de pointer-events. L'overlay
 * est en click-through au-dessus du jeu — un snackbar cliquable volerait la
 * souris en pleine partie. Il s'affiche, il informe, il s'efface.
 */
export default function Snackbar() {
  const { notice } = useGame();
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!notice) return;
    setShown(notice);
    const timer = setTimeout(() => setShown(null), notice.duration ?? VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!shown) return null;

  const duration = shown.duration ?? VISIBLE_MS;

  return (
    // key : deux erreurs successives identiques doivent rejouer l'animation
    <div
      key={shown.key}
      className={`snackbar snackbar--${shown.type}`}
      style={{ animationDelay: `0ms, ${duration - FADE_OUT_MS}ms` }}
      role="status"
    >
      <span className="snackbar-icon">{shown.type === "success" ? "✓" : "!"}</span>
      <div className="snackbar-body">
        <span className="snackbar-text">{shown.text}</span>
        {shown.detail && <span className="snackbar-detail">{shown.detail}</span>}
      </div>
    </div>
  );
}
