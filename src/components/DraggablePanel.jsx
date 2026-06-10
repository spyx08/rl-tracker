import { useRef, useState } from 'react';

function getSavedPosition(panelId, defaultPos) {
  try {
    const stored = localStorage.getItem(`panel-pos-${panelId}`);
    return stored ? JSON.parse(stored) : defaultPos;
  } catch {
    return defaultPos;
  }
}

export default function DraggablePanel({ panelId, title, defaultPos, editMode, children }) {
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
    const newPos = {
      x: dragRef.current.originX + e.clientX - dragRef.current.startX,
      y: dragRef.current.originY + e.clientY - dragRef.current.startY,
    };
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
        </div>
      )}
      <div className="draggable-panel-body">
        {children}
      </div>
    </div>
  );
}
