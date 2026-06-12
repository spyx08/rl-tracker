import { useRef, useState } from 'react';

// Marge minimale du panneau qui doit rester visible à l'écran : sans clamp,
// un panneau déplacé hors écran (ou sauvegardé sur un second moniteur
// débranché) devient impossible à récupérer
const MIN_VISIBLE = 80;

function clampToScreen(pos) {
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(0, window.innerWidth - MIN_VISIBLE)),
    y: Math.min(Math.max(pos.y, 0), Math.max(0, window.innerHeight - MIN_VISIBLE)),
  };
}

function getSavedPosition(panelId, defaultPos) {
  try {
    const stored = localStorage.getItem(`panel-pos-${panelId}`);
    return stored ? clampToScreen(JSON.parse(stored)) : defaultPos;
  } catch {
    return defaultPos;
  }
}

export default function DraggablePanel({ panelId, title, defaultPos, editMode, onHide, children }) {
  const [pos, setPos]  = useState(() => getSavedPosition(panelId, defaultPos));
  const dragRef        = useRef(null); // { startX, startY, originX, originY }

  /* ── Drag via Pointer Events + setPointerCapture ──────────────────────────
     setPointerCapture routes ALL subsequent pointer events to this element,
     even when the pointer leaves its bounds — which is exactly what was
     breaking react-draggable (mouseup was swallowed by the game). */
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.originX + e.clientX - dragRef.current.startX,
      y: dragRef.current.originY + e.clientY - dragRef.current.startY,
    });
  };

  const onPointerUp = (e) => {
    if (!dragRef.current) return;
    const newPos = clampToScreen({
      x: dragRef.current.originX + e.clientX - dragRef.current.startX,
      y: dragRef.current.originY + e.clientY - dragRef.current.startY,
    });
    dragRef.current = null;
    setPos(newPos);
    localStorage.setItem(`panel-pos-${panelId}`, JSON.stringify(newPos));
  };

  return (
    <div
      className={`draggable-panel ${editMode ? 'draggable-panel--edit' : ''}`}
      style={{ left: pos.x, top: pos.y }}
    >
      {editMode && (
        <div
          className="drag-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="drag-grip">⠿</span>
          <span className="drag-title">{title}</span>
          {onHide && (
            <button
              className="drag-hide-btn"
              title="Masquer ce panneau (réactivable depuis le menu ⚙)"
              // stopPropagation : le clic ne doit pas démarrer un drag
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onHide}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}
      <div className="draggable-panel-body">
        {children}
      </div>
    </div>
  );
}
