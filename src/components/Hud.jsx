export default function Hud({ ui, name, onMute, onPause }) {
  return (
    <div id="hud" className={ui.hud ? '' : 'hidden'}>
      <div id="left">
        <div className="pill" id="namePill">🐈 <span>{name}</span></div>
        <div className="pill"><span className="lbl">Score</span><span className="ico">⭐</span><b>{ui.score}</b></div>
        <div className="pill"><span className="lbl">Wave</span><span className="ico">🌊</span><b>{ui.wave}<small>/{ui.maxWaves}</small></b></div>
        <div className="pill" title="Rodents caught this wave"><span className="lbl">Target</span><span className="ico">🎯</span><b>{ui.caught}/{ui.target}</b></div>
      </div>
      <div id="right">
        <div className="pill" id="cheeseBar">{ui.cheeseText}</div>
        <div className="pill"><span className="lbl">Best</span><span className="ico">🏆</span><b>{ui.best}</b></div>
        {ui.canPause && (
          <button className="pill" id="pauseBtn" title="Pause (P / Esc)" onClick={onPause}>⏸</button>
        )}
        <button className="pill" id="mute" title="Sound (M)" onClick={onMute}>{ui.muted ? '🔇' : '🔊'}</button>
      </div>
    </div>
  );
}
