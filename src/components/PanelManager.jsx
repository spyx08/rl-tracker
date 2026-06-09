import { useRef, useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { sendSessionSummary } from '../utils/discord.js';
import { version } from '../../package.json';

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
  const { wsConnected, state } = useGame();
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState(getSavedPosition);
  const dragRef         = useRef(null);

  const [discordEnabled, setDiscordEnabled] = useState(
    () => localStorage.getItem('rl_discord_enabled') !== 'false'
  );
  const [quitting, setQuitting] = useState(false);

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
  const handleInstallUpdate = () => window.electronAPI?.installUpdate();
  const handleOpenLogs      = () => window.electronAPI?.openLogs();

  const handleToggleDiscord = () => {
    const next = !discordEnabled;
    setDiscordEnabled(next);
    localStorage.setItem('rl_discord_enabled', String(next));
  };

  const handleQuit = async () => {
    setQuitting(true);
    try {
      await sendSessionSummary(state);
    } catch { /* ne pas bloquer la fermeture */ }
    window.electronAPI?.quit();
  };

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

          {/* ── Version ── */}
          <div className="manager-version">v{version}</div>

          <div className="manager-divider" />

          {/* ── Statut serveur ── */}
          <div className="manager-server-status">
            <span className={`manager-server-dot ${wsConnected ? 'manager-server-dot--on' : 'manager-server-dot--off'}`} />
            <span>{wsConnected ? 'Serveur connecté' : 'Serveur déconnecté'}</span>
          </div>

          <div className="manager-divider" />

          {/* ── Mode édition ── */}
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

          {/* ── Panneaux ── */}
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

          {/* ── Discord ── */}
          <div className="manager-row">
            <span className="manager-row-label">
              <span style={{ marginRight: 4 }}>
                <svg width="14" height="14" viewBox="0 0 71 55" fill="currentColor" style={{ verticalAlign: 'middle' }}>
                  <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.2.2 0 0 0-.2.1 40.9 40.9 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.6 37.6 0 0 0 25.4.5a.2.2 0 0 0-.2-.1A58.3 58.3 0 0 0 10.5 4.9a.2.2 0 0 0-.1.1C1.5 17.9-1 30.5.3 43a.2.2 0 0 0 .1.1 58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .2-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.7 38.7 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.8a.2.2 0 0 1 .2 0c11.5 5.3 24 5.3 35.3 0a.2.2 0 0 1 .2 0l1.1.8a.2.2 0 0 1 0 .4 36.2 36.2 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.1 47.1 0 0 0 3.6 5.9.2.2 0 0 0 .2.1 58.6 58.6 0 0 0 17.8-9 .2.2 0 0 0 .1-.1C73 28.4 69.5 15.9 60.2 5a.2.2 0 0 0-.1-.1zM23.7 35.6c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2z"/>
                </svg>
              </span>
              Publier session sur Discord
            </span>
            <button
              className={`manager-switch ${discordEnabled ? 'manager-switch--on' : ''}`}
              onClick={handleToggleDiscord}
            />
          </div>

          <div className="manager-divider" />

          <button
            className="manager-action-btn manager-action-btn--danger"
            onClick={handleQuit}
            disabled={quitting}
          >
            {quitting ? '⏳ Envoi stats…' : '✕ Quitter l\'application'}
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
