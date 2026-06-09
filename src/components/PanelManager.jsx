import { useRef, useState } from 'react';

const PANEL_LABELS = {
  hud:     { icon: '📊', label: 'HUD' },
  session: { icon: '📈', label: 'Session Stats' },
  live:    { icon: '🎮', label: 'Live Game' },
};

function getSavedPosition() {
  try {
    const stored = localStorage.getItem('panel-pos-manager');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { x: window.innerWidth - 50, y: 20 };
}

export default function PanelManager({ panels, onToggle, editMode, onToggleEdit, onReset, updateInfo }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState(getSavedPosition);
  const dragRef         = useRef(null);

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
    localStorage.setItem('panel-pos-manager', JSON.stringify(newPos));
  };

  const handleReset         = () => { onReset(); setOpen(false); };
  const handleQuit          = () => window.electronAPI?.quit();
  const handleInstallUpdate = () => window.electronAPI?.installUpdate();

  // Afficher un badge si une mise à jour est disponible ou téléchargée
  const hasUpdate = updateInfo?.status === 'available'
                 || updateInfo?.status === 'downloading'
                 || updateInfo?.status === 'downloaded';

  return (
    <div className="panel-manager" style={{ left: pos.x, top: pos.y }}>
      <div className="manager-header">
        <span
          className="manager-grip"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title="Déplacer"
        >⠿</span>
        <button
          className={`manager-gear ${open ? 'manager-gear--open' : ''}`}
          onClick={() => setOpen(v => !v)}
          title="Gérer les panneaux"
        >
          ⚙
          {hasUpdate && <span className="manager-update-badge" />}
        </button>
      </div>

      {open && (
        <div className="manager-popup">
          <div className="manager-row">
            <span className="manager-row-label">
              {editMode ? '🔓' : '🔒'} Mode édition
            </span>
            <button
              className={`manager-switch ${editMode ? 'manager-switch--on' : ''}`}
              onClick={onToggleEdit}
            />
          </div>

          <div className="manager-divider" />

          {Object.entries(PANEL_LABELS).map(([id, { icon, label }]) => (
            <div key={id} className="manager-row">
              <span className="manager-row-label">{icon} {label}</span>
              <button
                className={`manager-switch ${panels[id] ? 'manager-switch--on' : ''}`}
                onClick={() => onToggle(id)}
              />
            </div>
          ))}

          <div className="manager-divider" />

          <button className="manager-action-btn" onClick={handleReset}>
            ↺ Réinitialiser la mise en page
          </button>
          <button className="manager-action-btn manager-action-btn--danger" onClick={handleQuit}>
            ✕ Quitter l'application
          </button>

          {/* ── Section mise à jour ── */}
          {updateInfo?.status === 'available' && (
            <>
              <div className="manager-divider" />
              <div className="manager-update-info">
                ⬇ Mise à jour v{updateInfo.version} en cours de téléchargement…
              </div>
            </>
          )}
          {updateInfo?.status === 'downloading' && (
            <>
              <div className="manager-divider" />
              <div className="manager-update-info">
                ⬇ Téléchargement… {updateInfo.percent}%
                <div className="manager-update-bar">
                  <div className="manager-update-bar-fill" style={{ width: `${updateInfo.percent}%` }} />
                </div>
              </div>
            </>
          )}
          {updateInfo?.status === 'downloaded' && (
            <>
              <div className="manager-divider" />
              <div className="manager-update-info">
                ✓ Mise à jour v{updateInfo.version} prête
              </div>
              <button className="manager-action-btn manager-action-btn--update" onClick={handleInstallUpdate}>
                ↻ Installer et redémarrer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
