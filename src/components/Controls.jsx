import { LEVELS, VIEWS } from '../game/data.js';

export default function Controls({ game, settings }) {
  return (
    <div id="controls">
      <select
        title="Difficulty"
        value={settings.level}
        onChange={(e) => { game.setLevel(e.target.value); e.target.blur(); }}
      >
        {Object.entries(LEVELS).map(([id, d]) => (
          <option key={id} value={id}>⚡ {d.label.replace(/^\S+ /, '')}</option>
        ))}
      </select>
      <select
        title="Camera view (V)"
        value={settings.view}
        onChange={(e) => { game.setView(e.target.value); e.target.blur(); }}
      >
        {Object.entries(VIEWS).map(([id, d]) => (
          <option key={id} value={id}>{d.label}</option>
        ))}
      </select>
      <button className="rot" type="button" title="Rotate camera left (Q)" onClick={() => game.rotateCam(-1)}>⟲</button>
      <button className="rot" type="button" title="Rotate camera right (E)" onClick={() => game.rotateCam(1)}>⟳</button>
    </div>
  );
}
