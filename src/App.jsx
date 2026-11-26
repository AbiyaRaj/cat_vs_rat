import { useEffect, useRef, useState } from 'react';
import { createGame } from './game/engine.js';
import Hud from './components/Hud.jsx';
import Controls from './components/Controls.jsx';
import Powers from './components/Powers.jsx';
import Toast from './components/Toast.jsx';
import Menu from './components/Menu.jsx';
import GameOver from './components/GameOver.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import WaveDone from './components/WaveDone.jsx';

export default function App() {
  const glRef = useRef(null);
  const overlayRef = useRef(null);
  const previewRef = useRef(null);
  const [game, setGame] = useState(null);
  const [ui, setUi] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let g;
    try {
      g = createGame({ gl: glRef.current, overlay: overlayRef.current, preview: previewRef.current, onUI: setUi });
      setGame(g);
    } catch (e) {
      setError(e.message || String(e));
    }
    return () => g && g.destroy();
  }, []);

  const ready = game && ui;

  return (
    <>
      <canvas id="gl" ref={glRef} />
      <div id="vig" />
      <canvas id="ov" ref={overlayRef} />

      {ready && (
        <>
          <Hud ui={ui} name={ui.settings.name} onMute={game.toggleMute} onPause={game.togglePause} />
          <div id="combo" style={{ opacity: ui.comboOn ? 1 : 0 }}>{ui.comboText}</div>
          <Toast toast={ui.toast} />
          {ui.controls && <Controls game={game} settings={ui.settings} />}
          {ui.powers && <Powers ui={ui} game={game} />}
          {ui.paused && <PauseMenu onResume={() => game.setPaused(false)} onRestart={game.startGame} onMenu={game.quitToMenu} />}
          {ui.waveDone && !ui.paused && <WaveDone info={ui.waveDone} onContinue={game.continueWave} onMenu={game.quitToMenu} />}
          {ui.over && <GameOver ui={ui} onAgain={game.startGame} onCustomise={game.showMenu} />}
        </>
      )}

      {/* The menu stays mounted so its preview canvas exists before the engine starts. */}
      <Menu hidden={ready ? !ui.menu : false} game={game} settings={ui?.settings} previewRef={previewRef} />

      {error && <div id="err">{error}</div>}
    </>
  );
}
