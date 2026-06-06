import { useState } from 'react';
import { GameProvider } from './context/GameContext.jsx';
import Header from './components/Header.jsx';
import AnimationOverlay from './components/AnimationOverlay.jsx';
import SessionPanel from './components/SessionPanel.jsx';
import LivePanel from './components/LivePanel.jsx';

export default function App() {
  const [sessionVisible, setSessionVisible] = useState(false);
  const [liveVisible, setLiveVisible] = useState(false);

  return (
    <GameProvider>
      <AnimationOverlay />
      <div className="overlay-wrapper">
        <Header />

        <div className="controls">
          <button className="toggle-btn" onClick={() => setSessionVisible((v) => !v)}>
            Stats Session {sessionVisible ? '▲' : '▼'}
          </button>
          <button className="toggle-btn" onClick={() => setLiveVisible((v) => !v)}>
            Game en cours {liveVisible ? '▲' : '▼'}
          </button>
        </div>

        <SessionPanel visible={sessionVisible} />
        <LivePanel visible={liveVisible} />
      </div>
    </GameProvider>
  );
}
