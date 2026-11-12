'use strict';
/*
 * Input layer for the cabinet.
 *   Player 1 stick + 6 buttons  -> Input.p[0]
 *   Player 2 stick + 6 buttons  -> Input.p[1]
 *   Trackball (mouse)           -> Input.mouse
 *
 * Sticks/buttons are read from BOTH the Gamepad API (USB encoders that show
 * up as game controllers) and the keyboard (I-PAC style encoders using the
 * MAME default keys). Edit CFG below if your cabinet is wired differently.
 */
const Input = (() => {
  const CFG = {
    deadzone: 0.45,
    padButtons: [0, 1, 2, 3, 4, 5], // gamepad button index for B1..B6
    padStart: [8, 9],               // gamepad buttons treated as START
    hatAxis: -1,                    // set to 9 if your encoder reports the stick as a POV hat
    trackballSensitivity: 1.0,
    pointerLock: !/[?&]nolock\b/.test(location.search), // capture the trackball so the crosshair never hits a screen edge
    keys: [
      { // Player 1 (MAME defaults)
        up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
        b: ['ControlLeft', 'AltLeft', 'Space', 'ShiftLeft', 'KeyZ', 'KeyX'],
      },
      { // Player 2 (MAME defaults)
        up: 'KeyR', down: 'KeyF', left: 'KeyD', right: 'KeyG',
        b: ['KeyA', 'KeyS', 'KeyQ', 'KeyW', 'KeyI', 'KeyK'],
      },
    ],
    startKeys: ['Digit1', 'Digit2', 'Enter'],
  };

  let swapPads = false;
  try { swapPads = localStorage.getItem('trinary.swapPads') === '1'; } catch (e) { /* storage unavailable */ }

  const keys = new Set();
  const tapped = new Set(); // keys pressed since the last poll, so very quick taps are never missed
  const down = (code) => keys.has(code) || tapped.has(code);
  const mkPlayer = () => ({
    x: 0, y: 0,
    b: [false, false, false, false, false, false],
    pressed: [false, false, false, false, false, false],
    edge: { up: false, down: false, left: false, right: false },
    active: false, anyPressed: false,
    _px: 0, _py: 0,
  });
  const p = [mkPlayer(), mkPlayer()];
  const mouse = {
    dx: 0, dy: 0, ax: 0, ay: 0, moved: false, locked: false, active: false,
    left: false, right: false, leftPressed: false, rightPressed: false,
    _dx: 0, _dy: 0, _moved: false, _l: false, _r: false, _pl: false, _pr: false,
  };
  const api = { CFG, p, mouse, start: false, any: false, exit: false, swapToggled: false, poll, onFirstInput: null };
  let startPrev = false, exitQueued = false, swapQueued = false, firstDone = false;

  function first() {
    if (!firstDone && api.onFirstInput) { firstDone = true; api.onFirstInput(); }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') exitQueued = true;
    if (e.code === 'F2' && !e.repeat) swapQueued = true;
    keys.add(e.code); tapped.add(e.code);
    first();
    if (!/^F(5|11|12)$/.test(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); e.preventDefault(); });
  window.addEventListener('blur', () => keys.clear());

  window.addEventListener('mousemove', (e) => {
    mouse._dx += e.movementX || 0;
    mouse._dy += e.movementY || 0;
    mouse.ax = e.clientX; mouse.ay = e.clientY;
    mouse._moved = true;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse._l = true; mouse._pl = true; }
    if (e.button === 2) { mouse._r = true; mouse._pr = true; }
    first();
    const el = document.getElementById('game');
    if (CFG.pointerLock && !document.pointerLockElement && el.requestPointerLock) {
      try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* not available */ }
    }
    e.preventDefault();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse._l = false;
    if (e.button === 2) mouse._r = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  function readPad(gp, out) {
    if (!gp) return;
    const dz = CFG.deadzone;
    let x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    x = Math.abs(x) > dz ? Math.sign(x) : 0;
    y = Math.abs(y) > dz ? Math.sign(y) : 0;
    const B = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (B(12)) y = -1;
    if (B(13)) y = 1;
    if (B(14)) x = -1;
    if (B(15)) x = 1;
    if (CFG.hatAxis >= 0 && x === 0 && y === 0) {
      const h = gp.axes[CFG.hatAxis];
      if (h !== undefined && h >= -1.01 && h <= 1.01) {
        const d = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]][Math.round((h + 1) * 3.5)];
        if (d) { x = d[0]; y = d[1]; }
      }
    }
    if (x) out.x = x;
    if (y) out.y = y;
    CFG.padButtons.forEach((bi, i) => { if (B(bi)) out.b[i] = true; });
    if (CFG.padStart.some(B)) out.start = true;
  }

  function poll() {
    let pads = [];
    try { pads = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean); } catch (e) { /* no gamepad api */ }
    if (swapPads) pads = [pads[1], pads[0]];
    let startNow = CFG.startKeys.some(down);
    api.any = false;
    for (let i = 0; i < 2; i++) {
      const k = CFG.keys[i], pl = p[i];
      const cur = { x: 0, y: 0, b: [false, false, false, false, false, false], start: false };
      if (down(k.left)) cur.x -= 1;
      if (down(k.right)) cur.x += 1;
      if (down(k.up)) cur.y -= 1;
      if (down(k.down)) cur.y += 1;
      k.b.forEach((code, j) => { if (down(code)) cur.b[j] = true; });
      readPad(pads[i], cur);
      if (cur.start) { startNow = true; first(); }
      pl.edge.left = cur.x < 0 && pl._px >= 0;
      pl.edge.right = cur.x > 0 && pl._px <= 0;
      pl.edge.up = cur.y < 0 && pl._py >= 0;
      pl.edge.down = cur.y > 0 && pl._py <= 0;
      pl._px = cur.x; pl._py = cur.y;
      pl.x = cur.x; pl.y = cur.y;
      pl.anyPressed = false;
      for (let j = 0; j < 6; j++) {
        pl.pressed[j] = cur.b[j] && !pl.b[j];
        pl.b[j] = cur.b[j];
        if (pl.pressed[j]) pl.anyPressed = true;
      }
      pl.active = cur.x !== 0 || cur.y !== 0 || cur.b.some(Boolean);
      if (pl.active) first();
      if (pl.anyPressed) api.any = true;
    }
    tapped.clear();
    api.start = startNow && !startPrev;
    startPrev = startNow;
    if (api.start) api.any = true;

    mouse.locked = !!document.pointerLockElement;
    mouse.dx = mouse._dx * CFG.trackballSensitivity;
    mouse.dy = mouse._dy * CFG.trackballSensitivity;
    mouse.moved = mouse._moved;
    mouse.left = mouse._l; mouse.right = mouse._r;
    mouse.leftPressed = mouse._pl; mouse.rightPressed = mouse._pr;
    mouse.active = mouse.moved || mouse.left || mouse.right;
    mouse._dx = mouse._dy = 0; mouse._moved = mouse._pl = mouse._pr = false;
    if (mouse.leftPressed) api.any = true;

    api.exit = exitQueued; exitQueued = false;
    api.swapToggled = false;
    if (swapQueued) {
      swapQueued = false;
      swapPads = !swapPads;
      api.swapToggled = true;
      try { localStorage.setItem('trinary.swapPads', swapPads ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    }
  }

  return api;
})();
