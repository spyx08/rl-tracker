import { useEffect, useRef, useState } from 'react';
import { GameProvider } from './context/GameContext.jsx';
import Header from './components/Header.jsx';
import AnimationOverlay from './components/AnimationOverlay.jsx';
import SessionPanel from './components/SessionPanel.jsx';
import LivePanel from './components/LivePanel.jsx';
import DraggablePanel from './components/DraggablePanel.jsx';
import PanelManager from './components/PanelManager.jsx';

const DEFAULT_PANELS = { hud: true, session: true, live: true };
const POS_KEYS = ['hud', 'session', 'live', 'manager'];

function loadPanelConfig() {
  try {
    const stored = localStorage.getItem('panel-config');
    return stored ? { ...DEFAULT_PANELS, ...JSON.parse(stored) } : DEFAULT_PANELS;
  } catch {
    return DEFAULT_PANELS;
  }
}

export default function App() {
  const [panels, setPanels]         = useState(loadPanelConfig);
  const [editMode, setEditMode]     = useState(false);
  const [layoutKey, setLayoutKey]   = useState(0);
  const [updateInfo, setUpdateInfo] = useState(null);

  // ── Écouter les événements de mise à jour depuis le main process ──────────
  useEffect(() => {
    const cleanup = window.electronAPI?.onUpdateStatus((data) => setUpdateInfo(data));
    return () => cleanup?.();
  }, []);

  // ── Edit mode: tell the main process to fully disable click-through ──────
  // This ensures mousedown/mouseup reach the renderer during drag, with no
  // race conditions. The game loses mouse input while editing layout — acceptable.
  useEffect(() => {
    window.electronAPI?.setEditMode(editMode);
  }, [editMode]);

  // ── Normal mode: toggle click-through based on whether mouse is over a panel
  // (only active when NOT in edit mode)
  const clickThroughRef = useRef(true);

  useEffect(() => {
    if (editMode) return; // main process handles it via setEditMode

    const apply = (enabled) => {
      if (enabled === clickThroughRef.current) return;
      clickThroughRef.current = enabled;
      window.electronAPI?.setClickThrough(enabled);
    };

    const onMove = (e) => {
      apply(!e.target.closest('.draggable-panel, .panel-manager'));
    };

    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [editMode]);

  // ── Panel visibility ──────────────────────────────────────────────────────
  const togglePanel = (id) => {
    setPanels((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem('panel-config', JSON.stringify(next));
      return next;
    });
  };

  // ── Reset layout ──────────────────────────────────────────────────────────
  const resetLayout = () => {
    POS_KEYS.forEach(id => localStorage.removeItem(`panel-pos-${id}`));
    localStorage.removeItem('panel-config');
    setPanels(DEFAULT_PANELS);
    setLayoutKey(k => k + 1);
  };

  return (
    <GameProvider>
      <AnimationOverlay />

      {panels.hud && (
        <DraggablePanel key={`hud-${layoutKey}`} panelId="hud" title="HUD"
          defaultPos={{ x: 20, y: 20 }} editMode={editMode}>
          <Header />
        </DraggablePanel>
      )}

      {panels.session && (
        <DraggablePanel key={`session-${layoutKey}`} panelId="session" title="Session Stats"
          defaultPos={{ x: 20, y: 95 }} editMode={editMode}>
          <SessionPanel />
        </DraggablePanel>
      )}

      {panels.live && (
        <DraggablePanel key={`live-${layoutKey}`} panelId="live" title="Live Game"
          defaultPos={{ x: 20, y: 250 }} editMode={editMode}>
          <LivePanel />
        </DraggablePanel>
      )}

      <PanelManager
        key={`manager-${layoutKey}`}
        panels={panels}
        onToggle={togglePanel}
        editMode={editMode}
        onToggleEdit={() => setEditMode(v => !v)}
        onReset={resetLayout}
        updateInfo={updateInfo}
      />
    </GameProvider>
  );
}
