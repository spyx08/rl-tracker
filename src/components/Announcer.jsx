import { useRef, useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';

export default function Announcer() {
  const { announcement } = useGame();
  const ref = useRef(null);

  useEffect(() => {
    if (!announcement || !ref.current) return;
    const el = ref.current;
    el.textContent = announcement.text;
    el.className = 'announcer';
    // Force reflow so the animation restarts even for the same type
    void el.offsetWidth;
    el.classList.add(announcement.type);
  }, [announcement]);

  return <div ref={ref} className="announcer" />;
}
