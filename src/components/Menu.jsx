import { useState } from 'react';
import { BREEDS, COLORS, EYES, HATS, OUTFITS, GLASSES, COLLARS, LEVELS, VIEWS, THEMES } from '../game/data.js';

const colourSwatch = (d) =>
  d.calico ? 'conic-gradient(#e88a3a 0 33%,#2a2420 0 60%,#f6f2ea 0)' : `radial-gradient(circle at 35% 35%,${d.light},${d.dark})`;
const eyeSwatch = (d) =>
  d.c2 ? `linear-gradient(90deg,${d.c[1]} 50%,${d.c2[1]} 50%)` : `radial-gradient(circle,${d.c[0]},${d.c[1]})`;
const collarSwatch = (d) => d.c || 'repeating-linear-gradient(45deg,#ccc 0 3px,#fff 3px 6px)';

function Chips({ defs, value, onPick, swatch, variant = '' }) {
  return (
    <div className="chips">
      {Object.entries(defs).map(([id, d]) => (
        <button
          key={id}
          type="button"
          className={`chip${variant}${value === id ? ' on' : ''}`}
          onClick={() => onPick(id)}
        >
          {swatch && <span className="sw" style={{ background: swatch(d, id) }} />}
          {d.label}
        </button>
      ))}
    </div>
  );
}

function NameInput({ initial, onChange }) {
  const [name, setName] = useState(initial);
  return (
    <input
      id="catName"
      maxLength={14}
      autoComplete="off"
      spellCheck={false}
      value={name}
      onChange={(e) => { setName(e.target.value); onChange(e.target.value); }}
    />
  );
}

export default function Menu({ hidden, game, settings, previewRef }) {
  const pick = (key) => (id) => game.choose(key, id);
  const ready = game && settings;

  return (
    <div id="menu" className={`overlay${hidden ? ' hidden' : ''}`}>
      <div className="card wide">
        <h1>PURR PATROL<small>CHEESE DEFENCE SQUAD</small></h1>
        <p>Rats are sneaking in to steal your cheese. Dress up your cat, pick a scene, then hunt!</p>
        <div className="pvwrap">
          <canvas id="preview" ref={previewRef} />
          <span className="pvhint">⟲ drag to spin 360°</span>
        </div>

        {ready && (
          <>
            <div className="opt"><label htmlFor="catName">Name</label><NameInput initial={settings.name} onChange={game.setName} /></div>
            <div className="opt"><label>Breed</label><Chips defs={BREEDS} value={settings.breed} onPick={pick('breed')} variant=" plain" /></div>
            <div className="opt"><label>Colour</label><Chips defs={COLORS} value={settings.colour} onPick={pick('colour')} swatch={colourSwatch} /></div>
            <div className="opt"><label>Eyes</label><Chips defs={EYES} value={settings.eyes} onPick={pick('eyes')} swatch={eyeSwatch} /></div>
            <div className="opt"><label>Hat</label><Chips defs={HATS} value={settings.hat} onPick={pick('hat')} variant=" plain" /></div>
            <div className="opt"><label>Outfit</label><Chips defs={OUTFITS} value={settings.outfit} onPick={pick('outfit')} variant=" plain" /></div>
            <div className="opt"><label>Glasses</label><Chips defs={GLASSES} value={settings.glasses} onPick={pick('glasses')} variant=" plain" /></div>
            <div className="opt"><label>Collar</label><Chips defs={COLLARS} value={settings.collar} onPick={pick('collar')} swatch={collarSwatch} /></div>
            <div className="opt"><label>Difficulty</label><Chips defs={LEVELS} value={settings.level} onPick={pick('level')} variant=" plain" /></div>
            <div className="opt"><label>Camera</label><Chips defs={VIEWS} value={settings.view} onPick={pick('view')} variant=" plain" /></div>
            <div className="opt">
              <label>Scene</label>
              <Chips
                defs={THEMES}
                value={settings.theme}
                onPick={pick('theme')}
                swatch={(d, id) => `url(${game.thumbs[id]}) center/cover`}
                variant=" scene"
              />
            </div>
          </>
        )}

        <details className="opt">
          <summary>How to play ▾</summary>
          <ul>
            <li>🐈 The cat <b>follows your pointer</b>. Run into a rat to catch it</li>
            <li>🖱️ <b>Click / tap / Space</b> to pounce from a distance</li>
            <li>🎥 <b>Right-drag</b> (or two fingers) to turn the camera 360°, <b>wheel / pinch</b> to zoom, <b>Q / E</b> to rotate</li>
            <li>🐾 <b>Big Paw Touch</b> (B): a big friendly lion slams the ground and crushes the rats near him</li>
            <li>🦅 <b>Grip Claw</b> (G): an eagle circles once over the rat nearest the cheese, then swoops down and snatches it</li>
            <li>Each power works once per wave, then recharges for the next wave</li>
            <li>🍗 After every wave your owner and his dog bring a treat · <b>M</b> mutes · <b>P</b> / <b>Esc</b> pauses</li>
          </ul>
        </details>
        <button className="btn" onClick={() => game && game.startGame()}>PLAY</button>
      </div>
    </div>
  );
}
