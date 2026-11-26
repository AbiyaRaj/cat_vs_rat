const cls = (...c) => c.filter(Boolean).join(' ');

export default function Powers({ ui, game }) {
  return (
    <div id="powers">
      <button
        className={cls('power', ui.pawUsed && 'used', ui.pawUrgent && 'urgent')}
        type="button"
        title="Big Paw Touch (B)"
        onClick={game.usePaw}
      >
        <span className="pi">🐾</span><span>BIG PAW<br />TOUCH</span>
      </button>
      <button
        className={cls('power', 'claw', ui.clawUsed && 'used', ui.clawUrgent && 'urgent')}
        type="button"
        title="Grip Claw (G)"
        onClick={game.useClaw}
      >
        <span className="pi">🦅</span><span>GRIP<br />CLAW</span>
      </button>
    </div>
  );
}
