const COAT = { brown: 'brown', grey: 'grey', black: 'black', white: 'white', piebald: 'black & white' };
const EVIL = ['', '😈 They have glowing red eyes now!', '😈 Devil fangs! They are tougher and nastier.', '👹 Horned devil rats! The final waves.'];

// Shown after each cleared wave: the player decides when the next, harder wave starts.
export default function WaveDone({ info, onContinue, onMenu }) {
  const coats = info.colours.map((c) => COAT[c] || c).join(', ');
  return (
    <div id="wavedone" className="overlay">
      <div className="card">
        <h2>WAVE {info.cleared} CLEARED!</h2>
        <div className="big">{info.score}</div>
        <p>
          Next up: <b>wave {info.next} of {info.total}</b>. Catch <b>{info.target}</b> {info.rats ? 'rats' : 'mice'} ({coats}).
        </p>
        <p>They are after your <b>{info.foodEmoji} {info.food}</b> now{info.scene ? <> · Scene: <b>{info.scene}</b></> : null}.</p>
        {info.evil > 0 && <p className="evil">{EVIL[info.evil]}</p>}
        <div className="row col">
          <button className="btn" onClick={onContinue} autoFocus>CONTINUE ▶</button>
          <button className="btn ghost" onClick={onMenu}>CAT &amp; SCENE</button>
        </div>
      </div>
    </div>
  );
}
