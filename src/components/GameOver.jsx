export default function GameOver({ ui, onAgain, onCustomise }) {
  return (
    <div id="over" className="overlay">
      <div className="card">
        <h2>{ui.won ? '🎉 CONGRATULATIONS!' : '🐀 BANDICOOTS WON!'}</h2>
        <p>{ui.overMsg}</p>
        <div className="big">{ui.finalScore}</div>
        <p className="muted">{ui.finalInfo}</p>
        <div className="row">
          <button className="btn" onClick={onAgain}>PLAY AGAIN</button>
          <button className="btn ghost" onClick={onCustomise}>CAT &amp; SCENE</button>
        </div>
      </div>
    </div>
  );
}
