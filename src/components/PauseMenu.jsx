export default function PauseMenu({ onResume, onRestart, onMenu }) {
  return (
    <div id="pause" className="overlay">
      <div className="card">
        <h2 className="paused-title">PAUSED</h2>
        <p className="muted">Press <b>P</b> or <b>Esc</b> to resume</p>
        <div className="row col">
          <button className="btn" onClick={onResume}>▶ RESUME</button>
          <button className="btn ghost" onClick={onRestart}>↻ RESTART</button>
          <button className="btn ghost" onClick={onMenu}>CAT &amp; SCENE</button>
        </div>
      </div>
    </div>
  );
}
