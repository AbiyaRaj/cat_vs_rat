import { useState } from 'react';
import { BREEDS, COLORS, EYES, HATS, OUTFITS, GLASSES, COLLARS, LEVELS, VIEWS, ACC_COLOURS } from '../game/data.js';

const colourSwatch = (d) =>
  d.calico ? 'conic-gradient(#e88a3a 0 33%,#2a2420 0 60%,#f6f2ea 0)' : `radial-gradient(circle at 35% 35%,${d.light},${d.dark})`;
const eyeSwatch = (d) =>
  d.c2 ? `linear-gradient(90deg,${d.c[1]} 50%,${d.c2[1]} 50%)` : `radial-gradient(circle,${d.c[0]},${d.c[1]})`;
const collarSwatch = (d) => d.c || 'repeating-linear-gradient(45deg,#ccc 0 3px,#fff 3px 6px)';

function Chips({ defs, value, onPick, swatch, variant = '', progress = 99, unlockAll = false }) {
  return (
    <div className="chips">
      {Object.entries(defs).map(([id, d]) => {
        // accessories: wave-locked items show the wave that opens them, premium items show their price
        const wave = d.tier === 'wave' && !unlockAll && progress < d.wave, prem = d.tier === 'premium' && !unlockAll;
        return (
          <button
            key={id}
            type="button"
            className={`chip${variant}${value === id ? ' on' : ''}${wave || prem ? ' locked' : ''}${prem ? ' prem' : ''}`}
            onClick={() => onPick(id)}
            title={wave ? `Unlocks at wave ${d.wave}` : prem ? `Premium · ₹${d.price}` : undefined}
          >
            {swatch && <span className="sw" style={{ background: swatch(d, id) }} />}
            {d.label}
            {wave && <span className="tag">🔒 W{d.wave}</span>}
            {prem && <span className="tag gold">₹{d.price}</span>}
          </button>
        );
      })}
    </div>
  );
}

// colour choices for the selected hat / outfit / glasses
function ColourRow({ value, fallback, onPick }) {
  const cur = value || fallback;
  return (
    <div className="chips swatches">
      {ACC_COLOURS.map((c) => (
        <button key={c} type="button" className={`swatch${cur === c ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => onPick(c)} />
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

export default function Menu({ hidden, game, settings, previewRef, progress = 1, unlockAll = false }) {
  const pick = (key) => (id) => game.choose(key, id);
  const ready = game && settings;

  return (
    <div id="menu" className={`overlay${hidden ? ' hidden' : ''}`}>
      <div className="card wide">
        <h1>PURR PATROL<small>FARM DEFENCE SQUAD</small></h1>
        <p>Mice and rats are sneaking in to steal the food. Dress up your cat, pick a scene, then hunt!</p>
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
            {[['Hat', 'hat', HATS], ['Outfit', 'outfit', OUTFITS], ['Glasses', 'glasses', GLASSES]].map(([label, key, defs]) => (
              <div className="opt" key={key}>
                <label>{label} <small className="muted">· 4 free · more unlock from wave 5 · 💎 premium</small></label>
                <Chips defs={defs} value={settings[key]} onPick={pick(key)} variant=" plain" progress={progress} unlockAll={unlockAll} />
                {settings[key] !== 'none' && <ColourRow value={settings[key + 'Col']} fallback={defs[settings[key]]?.col} onPick={pick(key + 'Col')} />}
              </div>
            ))}
            <div className="opt"><label>Collar</label><Chips defs={COLLARS} value={settings.collar} onPick={pick('collar')} swatch={collarSwatch} /></div>
            <div className="opt"><label>Difficulty</label><Chips defs={LEVELS} value={settings.level} onPick={pick('level')} variant=" plain" /></div>
            <div className="opt"><label>Camera</label><Chips defs={VIEWS} value={settings.view} onPick={pick('view')} variant=" plain" /></div>
          </>
        )}

        <details className="opt">
          <summary>How to play ▾</summary>
          <ul>
            <li>🐈 The cat <b>follows your pointer</b>. Run into a mouse or rat to catch it. Catch 15 to clear a wave; survive all 20 waves to win. Mice and rats that reach the food sit and nibble it until you chase them off or catch them</li>
            <li>🖱️ <b>Click / tap / Space</b> to pounce from a distance</li>
            <li>🎥 <b>Right-drag</b> (or two fingers) to turn the camera 360°, <b>wheel / pinch</b> to zoom, <b>Q / E</b> to rotate</li>
            <li>🐾 <b>Big Paw Touch</b> (B): a big friendly lion slams the ground and crushes the rats near it</li>
            <li>🦅 <b>Grip Claw</b> (G): an eagle circles once over the rat nearest the food, then swoops down and snatches it</li>
            <li>Each power works once per wave, then recharges for the next wave</li>
            <li>🌦️ The weather changes every wave: sunny mornings, rain, storms, mist, frost and snow. Harder modes get dark, stormy scenes sooner</li>
            <li>🍗 After every wave your owner and his dog bring a treat · <b>M</b> mutes · <b>P</b> / <b>Esc</b> pauses</li>
          </ul>
        </details>
        <button className="btn" onClick={() => game && game.startGame()}>PLAY</button>
      </div>
    </div>
  );
}
