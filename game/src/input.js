// Keyboard and mouse input for Seven Skies Airline. The game reads this one
// object each frame; nothing else in the game touches a DOM event.
//
// Controls: Arrow keys (or WASD) steer — Up/Down pitch, Left/Right bank.
// Shift throttles up, X throttles down. G gear, F flaps, H autopilot, 1–5 the
// pre-flight checklist, Enter confirms, M mutes, P pauses, Esc leaves a flight.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // keys pressed since the last frame was consumed
    mouseX: 0,
    mouseY: 0,
    clicked: null, // { x, y } of the last click, consumed by the loop
    anyKey: false,
  };

  function keyName(e) {
    if (e.key === ' ') return 'Space';
    if (e.key.length === 1) return e.key.toLowerCase();
    return e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.key) >= 0) e.preventDefault();
    if (!input.keys.has(k)) input.pressed.add(k);
    input.keys.add(k);
    input.anyKey = true;
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(keyName(e));
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    input.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  });
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    input.clicked = {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  });
  return input;
}

// Read the held keys into the flight control shape stepFlight wants. One-shot
// keys (gear, flaps, autopilot, checklist) are consumed here so a held key does
// not toggle twice.
export function flightControls(input) {
  const down = (k) => input.keys.has(k);
  const hit = (k) => {
    if (input.pressed.has(k)) {
      input.pressed.delete(k);
      return true;
    }
    return false;
  };
  let check = null;
  for (let i = 1; i <= 5; i += 1) {
    if (hit(String(i))) check = i - 1;
  }
  return {
    pitch: (down('ArrowUp') || down('w') ? 1 : 0) - (down('ArrowDown') || down('s') ? 1 : 0),
    roll: (down('ArrowRight') || down('d') ? 1 : 0) - (down('ArrowLeft') || down('a') ? 1 : 0),
    throttle: (down('Shift') ? 1 : 0) - (down('x') || down('Control') ? 1 : 0),
    gear: hit('g'),
    flaps: hit('f'),
    check,
    autopilot: hit('h'),
  };
}

export function consumePressed(input, key) {
  if (input.pressed.has(key)) {
    input.pressed.delete(key);
    return true;
  }
  return false;
}

export function endFrame(input) {
  input.pressed.clear();
  input.clicked = null;
  input.anyKey = false;
}
