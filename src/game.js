'use strict';
/*
 * TRINARY - a three-station co-op starship game for an arcade cabinet.
 *   P1 stick   = PILOT     (turns the ship, thrust, retro brake, light nose cannon)
 *   Trackball  = GUNNER    (main gun: torpedo turret aimed anywhere, tractor beam)
 *   P2 stick   = ENGINEER  (aims the shield arc, routes power, repair, EMP)
 */
(() => {
  // ---------------------------------------------------------------- basics
  const H = 720;
  let W = 1280, scale = 1;
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const TAU = Math.PI * 2;
  const DEV = /[?&]dev\b/.test(location.search);

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const turnTo = (cur, target, max) => cur + clamp(angDiff(target, cur), -max, max);

  const C = {
    pilot: '#35e0ff', gun: '#ff5fd8', eng: '#ffc93c', hull: '#6dff8a',
    bad: '#ff5a4f', white: '#eaf6ff', dim: '#6b7f99', rock: '#9aa7b8',
  };
  const FONT = '"Consolas","Lucida Console","Courier New",monospace';

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(320, Math.floor(innerWidth * dpr));
    cv.height = Math.max(240, Math.floor(innerHeight * dpr));
    scale = cv.height / H;
    W = cv.width / scale;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- state
  let state = 'title', stateT = 0, paused = false;
  let G = { score: 0, mi: 0, loop: 0 };
  let ship, asts, enemies, bullets, shots, pickups, parts, texts;
  let world = { w: 3000, h: 2000 }, cam = { x: 0, y: 0 };
  let M = null;          // current mission runtime
  let stats = null, mTime = 0, shake = 0, alarmT = 0;
  const cross = { x: 640, y: 300 };
  let gunIdle = 99, engIdle = 99, gunAuto = true, engAuto = true;
  let highs = [];
  let entry = { letters: [0, 0, 0], pos: 0 };
  let results = null;
  let toast = '', toastT = 0;

  try { highs = JSON.parse(localStorage.getItem('trinary.highs') || '[]'); } catch (e) { highs = []; }
  if (!Array.isArray(highs) || !highs.length) {
    highs = [{ n: 'ACE', s: 30000 }, { n: 'NOV', s: 20000 }, { n: 'ION', s: 12000 }, { n: 'ZAP', s: 8000 }, { n: 'BOB', s: 4000 }];
  }

  const stars = [];
  for (let i = 0; i < 260; i++) {
    stars.push({ x: Math.random() * 2400, y: Math.random() * 1400, z: rand(0.08, 0.7), s: rand(0.6, 2.2), c: pick(['#ffffff', '#bcd7ff', '#ffe3c2', '#c9b8ff']) });
  }

  // ---------------------------------------------------------------- helpers
  function addParts(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n && parts.length < 700; i++) {
      const a = Math.random() * TAU, s = Math.random() * speed;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rand(0.5, 1), max: life, color, size: size || 2.5 });
    }
  }
  function addText(x, y, str, color) { texts.push({ x, y, str, color: color || C.white, life: 1.1 }); }
  function addScore(n, x, y) {
    G.score += n;
    if (x !== undefined) addText(x, y, '+' + n, C.eng);
  }
  function explode(x, y, size, color) {
    addParts(x, y, 10 + size * 26, color, 120 + size * 220, 0.5 + size * 0.5, 2 + size * 2);
    addParts(x, y, 6 + size * 10, '#ffffff', 80 + size * 120, 0.3 + size * 0.3, 2);
    if (ship) shake = Math.max(shake, size * 14 * clamp(1 - Math.hypot(x - ship.x, y - ship.y) / 900, 0, 1));
    Sfx.boom(size);
  }
  function diff() { return G.loop; }

  // ---------------------------------------------------------------- spawners
  function mkAst(x, y, tier, vx, vy) {
    const r = [18, 34, 58][tier];
    const n = 8 + tier * 2, shape = [];
    for (let i = 0; i < n; i++) shape.push(rand(0.74, 1.14));
    return {
      x, y, tier, r, hp: [2, 5, 10][tier], shape,
      vx: vx !== undefined ? vx : rand(-85, 85), vy: vy !== undefined ? vy : rand(-85, 85),
      rot: Math.random() * TAU, spin: rand(-0.8, 0.8), flash: 0,
    };
  }
  function spawnAsts(n, x0, x1, safe) {
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do { x = rand(x0, x1); y = rand(60, world.h - 60); }
      while (Math.hypot(x - ship.x, y - ship.y) < (safe || 380) && ++tries < 30);
      const t = Math.random();
      asts.push(mkAst(x, y, t < 0.3 ? 0 : t < 0.75 ? 1 : 2));
    }
  }
  // A fast rock thrown at where the ship is heading, from just off screen.
  function spawnMeteor() {
    if (asts.length > 480) return;
    const v = Math.hypot(ship.vx, ship.vy);
    const base = v > 60 ? Math.atan2(ship.vy, ship.vx) : Math.random() * TAU;
    const an = base + rand(-1.3, 1.3), d = Math.max(W, H) * 0.62 + 80;
    const x = clamp(ship.x + Math.cos(an) * d, 30, world.w - 30), y = clamp(ship.y + Math.sin(an) * d, 30, world.h - 30);
    if (Math.hypot(x - ship.x, y - ship.y) < 420) return;
    const sp = rand(170, 250) + 25 * diff(), t = (Math.hypot(x - ship.x, y - ship.y)) / sp;
    const aim = Math.atan2(ship.y + ship.vy * t * 0.7 - y, ship.x + ship.vx * t * 0.7 - x) + rand(-0.12, 0.12);
    const a = mkAst(x, y, Math.random() < 0.55 ? 0 : 1, Math.cos(aim) * sp, Math.sin(aim) * sp);
    a.fast = true;
    asts.push(a);
  }
  function mkEnemy(type, x, y, extra) {
    const base = {
      drone: { r: 13, hp: 4, score: 100 },
      fighter: { r: 15, hp: 8, score: 200 },
      mine: { r: 14, hp: 2, score: 50 },
      turret: { r: 20, hp: 26, score: 400 },
      boss: { r: 78, hp: 120, score: 5000 },
    }[type];
    const e = Object.assign({
      type, x, y, vx: 0, vy: 0, ang: Math.random() * TAU, cd: rand(0.8, 2.2), stun: 0, flash: 0,
      side: Math.random() < 0.5 ? -1 : 1, dormant: false, armed: false, t: Math.random() * 10,
    }, base, extra || {});
    e.maxHp = e.hp;
    enemies.push(e);
    return e;
  }
  function spawnNear(type, minD, maxD, extra) {
    let x, y, tries = 0;
    do {
      const a = Math.random() * TAU, d = rand(minD, maxD);
      x = ship.x + Math.cos(a) * d; y = ship.y + Math.sin(a) * d;
    } while ((x < 40 || y < 40 || x > world.w - 40 || y > world.h - 40) && ++tries < 40);
    return mkEnemy(type, clamp(x, 40, world.w - 40), clamp(y, 40, world.h - 40), extra);
  }
  function mkPickup(type, x, y, vx, vy) {
    pickups.push({ type, x, y, vx: vx || rand(-30, 30), vy: vy || rand(-30, 30), r: type === 'pod' ? 16 : 11, t: Math.random() * 10, life: type === 'pod' ? Infinity : 22 });
  }

  // ---------------------------------------------------------------- missions
  const TIPS = {
    run: ['Short burns. Momentum carries you.', 'Torpedo the rocks in our drift path.', 'The shield breaks fast. Pick your hits.'],
    rescue: ['Brake near each pod so it can be reeled in.', 'RIGHT button: tractor-beam the pods aboard.', 'Cover the ship while it sits still.'],
    battle: ['Keep drifting. You are the hard target.', 'You are the main gun. Lead the fighters.', 'Block incoming fire. EMP wipes bullets.'],
    dock: ['Kill your drift, slip the gap, BRAKE in the bay.', 'Tractor the green beacon to reel us in.', 'ENGINES power for control, shield vs. mines.'],
    boss: ['Circle it. Never stop moving.', 'Kill the 4 turrets, then the core.', 'Shield toward the dreadnought. Save EMP for bursts.'],
  };
  const MISSIONS = [
    {
      name: 'THE BELT', type: 'run', world: [12000, 1800], par: 80, meteors: 1.6,
      brief: 'Cross the asteroid belt and reach the jump gate.',
      setup() {
        spawnAsts(300 + 30 * diff(), 500, 11600);
        for (let i = 0; i < 3 + diff(); i++) mkEnemy('fighter', rand(4000, 11000), rand(200, 1600), { dormant: true });
        for (let i = 0; i < 8 + 2 * diff(); i++) mkEnemy('drone', rand(1500, 11000), rand(200, 1600), { dormant: true });
        M.gate = { x: 11700, y: 900, r: 90 };
      },
      objective: () => 'REACH THE JUMP GATE',
      nav: () => M.gate,
      done: () => dist(ship, M.gate) < M.gate.r,
    },
    {
      name: 'MAYDAY', type: 'rescue', world: [3000, 2200], par: 110, meteors: 3.5,
      brief: 'A liner broke up out here. Tractor every escape pod aboard.',
      setup() {
        spawnAsts(40, 100, 2900);
        M.total = 5; M.rescued = 0; M.spawnT = 8;
        for (let i = 0; i < M.total; i++) {
          const a = (i / M.total) * TAU + rand(-0.3, 0.3), d = rand(650, 1000);
          mkPickup('pod', clamp(1500 + Math.cos(a) * d, 150, 2850), clamp(1100 + Math.sin(a) * d, 150, 2050), rand(-8, 8), rand(-8, 8));
        }
      },
      update(dt) {
        M.spawnT -= dt;
        if (M.spawnT <= 0 && enemies.length < 6 + diff()) {
          M.spawnT = 9 - Math.min(4, diff() * 2);
          spawnNear('fighter', 650, 800);
          spawnNear('drone', 650, 800);
          if (M.rescued >= 2) spawnNear('drone', 650, 800);
        }
      },
      objective: () => 'RESCUE ESCAPE PODS  ' + M.rescued + '/' + M.total,
      nav: () => {
        let best = null, bd = 1e9;
        for (const p of pickups) if (p.type === 'pod') { const d = dist(p, ship); if (d < bd) { bd = d; best = p; } }
        return best;
      },
      done: () => M.rescued >= M.total,
    },
    {
      name: 'AMBUSH', type: 'battle', world: [2600, 1900], par: 90, meteors: 5,
      brief: 'Pirate wings inbound. Destroy all three waves.',
      setup() { spawnAsts(18, 100, 2500); M.wave = 0; M.waveT = 2.5; M.waves = 3; },
      update(dt) {
        if (enemies.length === 0 && M.wave < M.waves) {
          M.waveT -= dt;
          if (M.waveT <= 0) {
            M.wave++; M.waveT = 3;
            const f = 2 + M.wave + diff(), d = 3 + M.wave + diff();
            for (let i = 0; i < f; i++) spawnNear('fighter', 620, 820);
            for (let i = 0; i < d; i++) spawnNear('drone', 620, 820);
            toast = 'WAVE ' + M.wave + ' OF ' + M.waves; toastT = 2;
          }
        }
      },
      objective: () => (M.wave === 0 ? 'STAND BY...' : 'WAVE ' + M.wave + '/' + M.waves + '   HOSTILES ' + enemies.length),
      nav: () => null,
      done: () => M.wave >= M.waves && enemies.length === 0,
    },
    {
      name: 'HOMECOMING', type: 'dock', world: [3400, 2000], par: 80,
      brief: 'Cross the minefield and dock inside the spinning station.',
      setup() {
        M.station = { x: 2750, y: 1000, R: 210, rot: 0, spin: 0.2 + 0.05 * diff(), gap: 1.1, dock: 0 };
        for (let i = 0; i < 22 + 6 * diff(); i++) {
          let x, y;
          do { x = rand(700, 3300); y = rand(100, 1900); } while (Math.hypot(x - 2750, y - 1000) < 330);
          mkEnemy('mine', x, y);
        }
        for (let i = 0; i < 5 + diff(); i++) mkEnemy('fighter', rand(1900, 2500), rand(300, 1700), { dormant: true });
        M.spawnT = 25;
      },
      update(dt) {
        const s = M.station;
        s.rot += s.spin * dt;
        M.spawnT -= dt;
        if (M.spawnT <= 0) { M.spawnT = 11; if (enemies.filter((e) => e.type === 'fighter').length < 4) spawnNear('fighter', 650, 800); }
        const inBay = dist(ship, s) < 60, slow = Math.hypot(ship.vx, ship.vy) < 70;
        if (inBay && slow) s.dock += dt; else s.dock = Math.max(0, s.dock - dt * 2);
      },
      objective: () => {
        const s = M.station;
        if (dist(ship, s) < 60) return Math.hypot(ship.vx, ship.vy) < 70 ? 'DOCKING... HOLD STEADY' : 'TOO FAST - BRAKE!';
        return 'DOCK INSIDE THE STATION';
      },
      nav: () => M.station,
      done: () => M.station.dock >= 2.2,
    },
    {
      name: 'IRON STORM', type: 'run', world: [14000, 1800], par: 100, meteors: 1.1,
      brief: 'Dense rock, live mines, pirate patrols. Punch through to the gate.',
      setup() {
        spawnAsts(350 + 30 * diff(), 500, 13600);
        for (let i = 0; i < 40 + 6 * diff(); i++) mkEnemy('mine', rand(1200, 13400), rand(120, 1680));
        for (let g = 0; g < 6; g++) {
          const gx = 2200 + g * 1900;
          for (let i = 0; i < 3 + diff(); i++) mkEnemy('fighter', gx + rand(-150, 150), rand(300, 1500), { dormant: true });
          mkEnemy('drone', gx + rand(-150, 150), rand(300, 1500), { dormant: true });
        }
        M.gate = { x: 13700, y: 900, r: 90 };
      },
      objective: () => 'REACH THE JUMP GATE',
      nav: () => M.gate,
      done: () => dist(ship, M.gate) < M.gate.r,
    },
    {
      name: 'DREADNOUGHT', type: 'boss', world: [2800, 2000], par: 150, meteors: 5,
      brief: 'The pirate flagship. Strip its turrets, then crack the core.',
      setup() {
        spawnAsts(8, 100, 2700);
        const b = mkEnemy('boss', 1900, 1000, { hp: 220 + 70 * diff(), rot: 0, burstT: 3, spawnT: 5 });
        M.boss = b;
        for (let i = 0; i < 4; i++) mkEnemy('turret', b.x, b.y, { parent: b, off: i * TAU / 4 + TAU / 8, hp: 26 + 8 * diff() });
      },
      objective: () => {
        const t = enemies.filter((e) => e.type === 'turret').length;
        return t ? 'DESTROY THE TURRETS  ' + (4 - t) + '/4' : 'CORE EXPOSED - FIRE!';
      },
      nav: () => (M.boss && !M.boss.dead ? M.boss : null),
      done: () => !M.boss || M.boss.dead,
    },
  ];

  // ---------------------------------------------------------------- game flow
  function mkShip(x, y) {
    return {
      x, y, vx: 0, vy: 0, ang: 0, hull: 100, inv: 0,
      shield: 100, shieldAng: 0, shieldOn: true, shieldHitT: 9, shieldFlash: 0,
      thrusting: false, braking: false,
      heat: 0, overheated: false, turretCd: 0, turretAng: 0, cannonCd: 0,
      power: 'shd', powerT: 0, emp: 0, empFx: 0, repairing: false,
      tractor: null,
    };
  }
  function newGame() {
    G = { score: 0, mi: 0, loop: 0 };
    startMission();
  }
  function startMission() {
    const def = MISSIONS[G.mi];
    world = { w: def.world[0], h: def.world[1] };
    asts = []; enemies = []; bullets = []; shots = []; pickups = []; parts = []; texts = [];
    ship = mkShip(260, world.h / 2);
    M = { def, doneT: 0 };
    stats = { shots: 0, hits: 0, killsGun: 0, killsPilot: 0, absorbed: 0, hullLost: 0, repaired: 0, topSpeed: 0, pods: 0 };
    mTime = 0; shake = 0; paused = false;
    cross.x = W / 2 + 160; cross.y = H / 2;
    cam.x = clamp(ship.x - W / 2, 0, world.w - W); cam.y = clamp(ship.y - H / 2, 0, world.h - H);
    def.setup();
    setState('briefing');
  }
  function setState(s) { state = s; stateT = 0; }
  function finishMission() {
    const def = M.def;
    const clear = 1000 * (G.mi + 1) * (1 + G.loop);
    const hullB = Math.round(ship.hull) * 10;
    const timeB = Math.max(0, Math.round((def.par - mTime) * 20));
    results = { clear, hullB, timeB, total: clear + hullB + timeB, time: mTime };
    G.score += results.total;
    Sfx.fanfare();
    setState('results');
  }
  function nextMission() {
    G.mi++;
    if (G.mi >= MISSIONS.length) { G.mi = 0; G.loop++; }
    startMission();
  }
  function isHigh(s) { return s > 0 && (highs.length < 5 || s > highs[highs.length - 1].s); }
  function saveHigh(name, s) {
    highs.push({ n: name, s });
    highs.sort((a, b) => b.s - a.s);
    highs = highs.slice(0, 5);
    try { localStorage.setItem('trinary.highs', JSON.stringify(highs)); } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------- combat
  function shieldHalf() { return ship.power === 'shd' ? 1.1 : 0.7; }
  function shieldBlocks(ang) { return ship.shieldOn && Math.abs(angDiff(ang, ship.shieldAng)) < shieldHalf(); }
  function absorb(dmg) {
    ship.shield -= dmg * 2.2 * (ship.power === 'shd' ? 0.75 : 1);
    ship.shieldHitT = 0; ship.shieldFlash = 0.25;
    stats.absorbed += dmg;
    Sfx.shield();
    if (ship.shield <= 0) { ship.shield = 0; ship.shieldOn = false; Sfx.shieldDown(); addText(ship.x, ship.y - 60, 'SHIELD DOWN', C.bad); }
  }
  function hurt(dmg) {
    if (ship.inv > 0 || state !== 'play') return;
    ship.hull -= dmg; ship.inv = 0.5; shake = Math.max(shake, 12);
    stats.hullLost += dmg;
    addParts(ship.x, ship.y, 14, C.bad, 220, 0.5, 3);
    Sfx.hull();
    if (ship.hull <= 0) {
      ship.hull = 0;
      explode(ship.x, ship.y, 1.6, C.pilot);
      explode(ship.x, ship.y, 1, C.eng);
      Sfx.lose();
      setState('gameover');
    }
  }
  function splitAst(a, by) {
    a.dead = true;
    explode(a.x, a.y, 0.25 + a.tier * 0.3, C.rock);
    if (by) addScore([20, 50, 100][a.tier], a.x, a.y);
    if (a.tier > 0) {
      for (let i = 0; i < 2; i++) {
        const an = Math.random() * TAU, s = rand(40, 90);
        asts.push(mkAst(a.x + Math.cos(an) * a.r * 0.4, a.y + Math.sin(an) * a.r * 0.4, a.tier - 1, a.vx + Math.cos(an) * s, a.vy + Math.sin(an) * s));
      }
    } else if (by && Math.random() < 0.3) mkPickup('crystal', a.x, a.y);
  }
  function damageAst(a, dmg, by) {
    a.hp -= dmg; a.flash = 0.08;
    if (a.hp <= 0 && !a.dead) splitAst(a, by);
  }
  function turretsAlive() { return enemies.some((e) => e.type === 'turret' && !e.dead); }
  function killEnemy(e, by) {
    if (e.dead) return;
    e.dead = true;
    explode(e.x, e.y, e.type === 'boss' ? 2.2 : e.type === 'turret' ? 0.9 : 0.6, e.type === 'mine' ? C.eng : C.bad);
    if (by) {
      addScore(e.score * (1 + G.loop), e.x, e.y);
      if (by === 'gun') stats.killsGun++; else if (by === 'pilot') stats.killsPilot++;
      const r = Math.random();
      if (e.type !== 'mine') { if (r < 0.12) mkPickup('cell', e.x, e.y); else if (r < 0.2) mkPickup('repair', e.x, e.y); }
    }
    if (e.type === 'boss') {
      for (const o of enemies) if (o !== e) killEnemy(o, null);
      bullets.length = 0;
      for (let i = 0; i < 6; i++) explode(e.x + rand(-80, 80), e.y + rand(-80, 80), 1.2, pick([C.bad, C.eng, '#ffffff']));
    }
  }
  function damageEnemy(e, dmg, by) {
    if (e.type === 'boss' && turretsAlive()) { addParts(e.x + rand(-40, 40), e.y + rand(-40, 40), 3, '#8899aa', 100, 0.3, 2); return; }
    e.hp -= dmg; e.flash = 0.1;
    if (e.hp <= 0) killEnemy(e, by);
  }
  function enemyFire(e, speedMul, angOff) {
    const sp = (330 + 25 * diff()) * (speedMul || 1);
    const d = dist(e, ship), lead = (d / sp) * 0.6;
    let a = Math.atan2(ship.y + ship.vy * lead - e.y, ship.x + ship.vx * lead - e.x);
    if (angOff !== undefined) a = angOff;
    bullets.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 3.2 });
  }
  function playerShot(x, y, ang, speed, dmg, by, life) {
    shots.push({ x, y, vx: Math.cos(ang) * speed + ship.vx * 0.4, vy: Math.sin(ang) * speed + ship.vy * 0.4, dmg, by, life });
    stats.shots++;
  }
  // Station ring: returns true if point (with radius r) touches the wall.
  function ringHit(x, y, r) {
    const s = M.station;
    if (!s) return false;
    const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    if (Math.abs(d - s.R) > 16 + r) return false;
    let rel = (Math.atan2(dy, dx) - s.rot) % TAU;
    if (rel < 0) rel += TAU;
    const m = r / s.R;
    return !(rel > m && rel < s.gap - m);
  }

  // ---------------------------------------------------------------- crew stations
  function updatePilot(dt) {
    const p = Input.p[0];
    const eng = ship.power === 'eng' ? 1.35 : 1;
    // Asteroids-style flight: the stick only turns the ship, B1 fires the main engine,
    // and the ship keeps drifting in a straight line until something pushes back.
    if (p.x || p.y) ship.ang = turnTo(ship.ang, Math.atan2(p.y, p.x), 6 * eng * dt);
    ship.thrusting = p.b[0];
    ship.braking = p.b[1];
    if (ship.thrusting) { ship.vx += Math.cos(ship.ang) * 430 * eng * dt; ship.vy += Math.sin(ship.ang) * 430 * eng * dt; }
    if (ship.braking) { const k = Math.exp(-1.8 * eng * dt); ship.vx *= k; ship.vy *= k; }
    const maxV = 430 * eng, v = Math.hypot(ship.vx, ship.vy);
    if (v > maxV) { const k = lerp(1, maxV / v, Math.min(1, dt * 6)); ship.vx *= k; ship.vy *= k; }
    stats.topSpeed = Math.max(stats.topSpeed, v);
    ship.x += ship.vx * dt; ship.y += ship.vy * dt;
    if (ship.x < 20) { ship.x = 20; ship.vx = Math.abs(ship.vx) * 0.4; }
    if (ship.y < 20) { ship.y = 20; ship.vy = Math.abs(ship.vy) * 0.4; }
    if (ship.x > world.w - 20) { ship.x = world.w - 20; ship.vx = -Math.abs(ship.vx) * 0.4; }
    if (ship.y > world.h - 20) { ship.y = world.h - 20; ship.vy = -Math.abs(ship.vy) * 0.4; }

    // nose cannon
    ship.cannonCd -= dt;
    if (p.b[2] && ship.cannonCd <= 0) {
      ship.cannonCd = 0.3;
      const dmg = ship.power === 'wep' ? 1.5 : 1; // light pea-shooter; the turret is the main gun
      for (const s of [-1, 1]) {
        playerShot(ship.x + Math.cos(ship.ang) * 14 + Math.cos(ship.ang + Math.PI / 2) * 7 * s,
          ship.y + Math.sin(ship.ang) * 14 + Math.sin(ship.ang + Math.PI / 2) * 7 * s, ship.ang, 760, dmg, 'pilot', 0.55);
      }
      Sfx.cannon();
    }
    // engine trail
    if (ship.thrusting && parts.length < 650) {
      const back = ship.ang + Math.PI;
      parts.push({
        x: ship.x + Math.cos(back) * 14, y: ship.y + Math.sin(back) * 14,
        vx: Math.cos(back) * 160 + rand(-30, 30) + ship.vx * 0.3, vy: Math.sin(back) * 160 + rand(-30, 30) + ship.vy * 0.3,
        life: 0.35, max: 0.45, color: Math.random() < 0.3 ? '#ffffff' : C.pilot, size: 3.5,
      });
    }
  }

  function tractorRange() { return ship.power === 'wep' ? 620 : 480; }
  function findTractorTarget(ax, ay) {
    let best = null, bd = 85;
    const range = tractorRange();
    for (const p of pickups) {
      const d = Math.hypot(p.x - ax, p.y - ay);
      if (d < bd && dist(p, ship) < range) { bd = d; best = p; }
    }
    const s = M.station;
    if (s && Math.hypot(s.x - ax, s.y - ay) < bd && dist(s, ship) < range) best = s;
    return best;
  }
  const TORP_SPEED = 720, TORP_BLAST = 78;
  // The turret is the ship's main gun: slow, heavy torpedoes that burst where the crosshair was.
  function fireTurret(ax, ay, rateMul) {
    if (ship.turretCd > 0 || ship.overheated) return;
    const wep = ship.power === 'wep';
    ship.turretCd = (wep ? 0.38 : 0.55) / rateMul;
    ship.heat += wep ? 0.18 : 0.26;
    if (ship.heat >= 1) { ship.heat = 1; ship.overheated = true; Sfx.overheat(); addText(ship.x, ship.y - 60, 'OVERHEAT', C.gun); }
    const a = Math.atan2(ay - ship.y, ax - ship.x), d = Math.hypot(ax - ship.x, ay - ship.y);
    shots.push({
      x: ship.x + Math.cos(a) * 18, y: ship.y + Math.sin(a) * 18, vx: Math.cos(a) * TORP_SPEED, vy: Math.sin(a) * TORP_SPEED,
      dmg: 6, by: 'gun', torp: true, life: clamp((d - 18) / TORP_SPEED, 0.08, 0.95),
    });
    stats.shots++;
    Sfx.torpedo();
  }
  // Torpedo burst: splash damage to everything nearby except the thing it hit directly.
  function detonate(s, direct) {
    let n = 0;
    explode(s.x, s.y, 0.45, C.gun);
    parts.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.22, max: 0.22, color: C.gun, size: TORP_BLAST, ring: true });
    for (const e of enemies.slice()) if (e !== direct && !e.dead && Math.hypot(e.x - s.x, e.y - s.y) < TORP_BLAST + e.r) { damageEnemy(e, 3, 'gun'); n++; }
    for (const a of asts.slice()) if (a !== direct && !a.dead && Math.hypot(a.x - s.x, a.y - s.y) < TORP_BLAST + a.r) { damageAst(a, 3, 'gun'); n++; }
    if (!direct && n) stats.hits++;
  }
  function updateGunner(dt) {
    const m = Input.mouse;
    if (m.active) { gunIdle = 0; } else gunIdle += dt;
    gunAuto = gunIdle > 6;
    ship.turretCd -= dt;
    ship.heat = Math.max(0, ship.heat - dt * (ship.power === 'wep' ? 0.42 : 0.3));
    if (ship.overheated && ship.heat < 0.35) ship.overheated = false;
    let fire = false, tractor = false, rate = 1;

    if (!gunAuto) {
      if (m.locked) { cross.x += m.dx * (H / innerHeight); cross.y += m.dy * (H / innerHeight); }
      else if (m.moved) { cross.x = m.ax * (W / innerWidth); cross.y = m.ay * (H / innerHeight); }
      fire = m.left; tractor = m.right;
    } else {
      // Auto-gunner: slower, short-sighted, but keeps a 1-2 player crew alive.
      let tgt = null, bd = 520;
      for (const e of enemies) { if (e.dormant) continue; const d = dist(e, ship); if (d < bd && !(e.type === 'boss' && turretsAlive())) { bd = d; tgt = e; } }
      if (!tgt) { bd = 190; for (const a of asts) { const d = dist(a, ship) - a.r; if (d < bd) { bd = d; tgt = a; } } }
      let pk = null;
      if (!tgt) { bd = tractorRange() - 20; for (const p of pickups) { const d = dist(p, ship); if (d < bd) { bd = d; pk = p; } } }
      const goal = tgt || pk;
      const lead = tgt ? dist(tgt, ship) / TORP_SPEED : 0; // aim where the target will be
      const gx = goal ? goal.x + goal.vx * lead - cam.x : ship.x - cam.x + Math.cos(ship.ang) * 150;
      const gy = goal ? goal.y + goal.vy * lead - cam.y : ship.y - cam.y + Math.sin(ship.ang) * 150;
      cross.x = lerp(cross.x, gx, Math.min(1, dt * 4)); cross.y = lerp(cross.y, gy, Math.min(1, dt * 4));
      fire = !!tgt && Math.hypot(cross.x - gx, cross.y - gy) < 30 && ship.heat < 0.7;
      tractor = !!pk;
      rate = 0.4;
    }
    cross.x = clamp(cross.x, 8, W - 8); cross.y = clamp(cross.y, 8, H - 8);
    const ax = cross.x + cam.x, ay = cross.y + cam.y;
    ship.turretAng = Math.atan2(ay - ship.y, ax - ship.x);
    if (fire) fireTurret(ax, ay, rate);

    ship.tractor = tractor ? findTractorTarget(ax, ay) : null;
    ship.tractorOn = tractor;
    const t = ship.tractor;
    if (t) {
      const a = Math.atan2(ship.y - t.y, ship.x - t.x);
      if (t === M.station) {
        // Reel the SHIP toward the docking beacon.
        ship.vx -= Math.cos(a) * 230 * dt; ship.vy -= Math.sin(a) * 230 * dt;
        const k = Math.exp(-1.2 * dt); ship.vx *= k; ship.vy *= k;
      } else {
        const pull = t.type === 'pod' ? 420 : 800;
        t.vx += Math.cos(a) * pull * dt; t.vy += Math.sin(a) * pull * dt;
        const k = Math.exp(-2 * dt); t.vx *= k; t.vy *= k;
      }
    }
  }

  function nearestThreatAngle() {
    let best = null, bs = 1e9;
    for (const b of bullets) { const d = dist(b, ship); if (d < 340 && d < bs) { bs = d; best = b; } }
    for (const e of enemies) { if (e.dormant) continue; const d = dist(e, ship) * (e.type === 'boss' ? 0.5 : 1.3); if (d < 480 && d < bs) { bs = d; best = e; } }
    for (const a of asts) { const d = (dist(a, ship) - a.r) * 1.6; if (d < 330 && d < bs) { bs = d; best = a; } }
    return best ? Math.atan2(best.y - ship.y, best.x - ship.x) : null;
  }
  function setPower(p) {
    if (ship.power === p) return;
    ship.power = p; ship.powerT = 0.4; Sfx.power();
    addText(ship.x, ship.y - 60, 'POWER > ' + { eng: 'ENGINES', wep: 'WEAPONS', shd: 'SHIELDS' }[p], C.eng);
  }
  function fireEmp() {
    if (ship.emp > 0) return;
    ship.emp = 18; ship.empFx = 0.5; Sfx.emp(); shake = Math.max(shake, 8);
    const R = 320;
    for (const b of bullets) if (dist(b, ship) < R) { b.life = 0; addParts(b.x, b.y, 3, C.eng, 80, 0.3, 2); }
    for (const e of enemies) {
      if (e.dormant || dist(e, ship) > R + e.r) continue;
      e.stun = 2.5;
      if (e.type === 'mine' || e.type === 'drone') damageEnemy(e, 2, 'eng');
    }
    for (const a of asts) {
      const d = dist(a, ship);
      if (d < R) { const an = Math.atan2(a.y - ship.y, a.x - ship.x); a.vx += Math.cos(an) * 200; a.vy += Math.sin(an) * 200; }
    }
  }
  function updateEngineer(dt) {
    const p = Input.p[1];
    if (p.active) engIdle = 0; else engIdle += dt;
    engAuto = engIdle > 6;
    ship.repairing = false;
    if (!engAuto) {
      if (p.x || p.y) ship.shieldAng = turnTo(ship.shieldAng, Math.atan2(p.y, p.x), 9 * dt);
      if (p.pressed[0]) setPower('eng');
      if (p.pressed[1]) setPower('wep');
      if (p.pressed[2]) setPower('shd');
      if (p.b[3]) ship.repairing = true;
      if (p.pressed[4]) fireEmp();
      if (p.pressed[5]) setPower({ eng: 'wep', wep: 'shd', shd: 'eng' }[ship.power]);
    } else {
      const a = nearestThreatAngle();
      // Deliberately sluggish: it never repairs or fires the EMP, and it turns too slowly to cover two threats.
      if (a !== null) ship.shieldAng = turnTo(ship.shieldAng, a, 1.6 * dt);
    }
    if (ship.repairing && ship.shield > 4 && ship.hull < 100 && ship.shieldOn) {
      ship.shield -= 14 * dt;
      const h = Math.min(100 - ship.hull, 5 * dt);
      ship.hull += h; stats.repaired += h;
      if (Math.random() < dt * 14) addParts(ship.x + rand(-12, 12), ship.y + rand(-12, 12), 1, C.hull, 40, 0.5, 2.5);
    } else ship.repairing = false;
    ship.shieldHitT += dt;
    const shd = ship.power === 'shd'; // slow to come back unless the engineer feeds it
    if (ship.shieldHitT > (shd ? 1.5 : 3.5) && !ship.repairing) ship.shield = Math.min(100, ship.shield + dt * (shd ? 14 : 4.5));
    if (!ship.shieldOn && ship.shield >= 40) { ship.shieldOn = true; Sfx.shieldUp(); }
    ship.emp = Math.max(0, ship.emp - dt);
    ship.empFx = Math.max(0, ship.empFx - dt);
    ship.powerT = Math.max(0, ship.powerT - dt);
    ship.shieldFlash = Math.max(0, ship.shieldFlash - dt);
  }

  // ---------------------------------------------------------------- world update
  function updateAsts(dt) {
    for (const a of asts) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt; a.flash -= dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > 120 && !a.fast) { const k = Math.exp(-1.5 * dt); a.vx *= k; a.vy *= k; }
      if (a.x < a.r) { a.x = a.r; a.vx = Math.abs(a.vx); }
      if (a.y < a.r) { a.y = a.r; a.vy = Math.abs(a.vy); }
      if (a.x > world.w - a.r) { a.x = world.w - a.r; a.vx = -Math.abs(a.vx); }
      if (a.y > world.h - a.r) { a.y = world.h - a.r; a.vy = -Math.abs(a.vy); }
      const dx = a.x - ship.x, dy = a.y - ship.y, d = Math.hypot(dx, dy) || 1;
      if (d > a.r + 46) continue;
      const an = Math.atan2(dy, dx), nx = dx / d, ny = dy / d;
      const blocked = shieldBlocks(an);
      if (!blocked && d > a.r + 15) continue;
      const rel = (a.vx - ship.vx) * nx + (a.vy - ship.vy) * ny; // closing speed along normal (<0 = approaching)
      const push = a.r + (blocked ? 46 : 15) - d;
      a.x += nx * push; a.y += ny * push;
      if (rel < 0) {
        const share = blocked ? 0.25 : 0.5;
        a.vx -= nx * rel * (2 - share * 1.4); a.vy -= ny * rel * (2 - share * 1.4);
        ship.vx += nx * rel * share; ship.vy += ny * rel * share;
      }
      a.vx += nx * 40; a.vy += ny * 40;
      if (blocked) { absorb([5, 10, 18][a.tier]); addParts(ship.x + nx * 44, ship.y + ny * 44, 8, C.eng, 160, 0.35, 2.5); damageAst(a, 2, 'eng'); }
      else if (ship.inv <= 0) { hurt([15, 28, 42][a.tier]); damageAst(a, 2, null); }
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.dead) continue;
      e.flash -= dt; e.t += dt;
      if (e.dormant) { if (dist(e, ship) < 760) e.dormant = false; else continue; }
      const dx = ship.x - e.x, dy = ship.y - e.y, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
      if (e.type === 'turret') {
        const b = e.parent;
        e.x = b.x + Math.cos(b.rot + e.off) * 92; e.y = b.y + Math.sin(b.rot + e.off) * 92;
        e.ang = a;
        if (e.stun > 0) { e.stun -= dt; continue; }
        e.cd -= dt;
        if (e.cd <= 0 && d < 760) { enemyFire(e); e.cd = 1.1 / (1 + 0.2 * diff()) + rand(0, 0.6); }
        continue;
      }
      if (e.stun > 0) {
        e.stun -= dt; const k = Math.exp(-3 * dt); e.vx *= k; e.vy *= k;
      } else if (e.type === 'drone') {
        e.vx += Math.cos(a) * 380 * dt; e.vy += Math.sin(a) * 380 * dt; e.ang = a;
        const sp = Math.hypot(e.vx, e.vy), mx = 250 + 20 * diff();
        if (sp > mx) { e.vx *= mx / sp; e.vy *= mx / sp; }
      } else if (e.type === 'fighter') {
        const want = 330, radial = clamp((d - want) / want, -1, 1) * 1.6;
        e.vx += (Math.cos(a) * radial + Math.cos(a + Math.PI / 2) * e.side) * 240 * dt;
        e.vy += (Math.sin(a) * radial + Math.sin(a + Math.PI / 2) * e.side) * 240 * dt;
        const sp = Math.hypot(e.vx, e.vy), mx = 200 + 15 * diff();
        if (sp > mx) { e.vx *= mx / sp; e.vy *= mx / sp; }
        e.ang = a; e.cd -= dt;
        if (e.cd <= 0 && d < 640) { enemyFire(e); e.cd = 1.3 / (1 + 0.2 * diff()) + rand(0, 0.6); }
      } else if (e.type === 'mine') {
        if (d < 180) e.armed = true;
        if (e.armed) {
          e.vx += Math.cos(a) * 170 * dt; e.vy += Math.sin(a) * 170 * dt;
          const sp = Math.hypot(e.vx, e.vy), mx = 105 + 15 * diff();
          if (sp > mx) { e.vx *= mx / sp; e.vy *= mx / sp; }
        }
      } else if (e.type === 'boss') {
        e.rot += 0.35 * dt;
        if (d > 430) { e.vx += Math.cos(a) * 40 * dt; e.vy += Math.sin(a) * 40 * dt; }
        const k = Math.exp(-0.6 * dt); e.vx *= k; e.vy *= k;
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.spawnT = 5.5 - Math.min(3, diff());
          if (enemies.filter((o) => o.type === 'drone' && !o.dead).length < 4) mkEnemy('drone', e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90);
        }
        if (!turretsAlive()) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burstT = 2.4;
            const n = 14;
            for (let i = 0; i < n; i++) enemyFire(e, 0.75, e.rot + (i / n) * TAU);
            enemyFire(e, 1.1);
          }
        }
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.x = clamp(e.x, e.r, world.w - e.r); e.y = clamp(e.y, e.r, world.h - e.r);

      // contact with the ship / shield
      const an = Math.atan2(-dy, -dx); // direction from ship to enemy
      const blocked = shieldBlocks(an);
      if (d < e.r + (blocked ? 46 : 15)) {
        if (e.type === 'boss') {
          const push = e.r + 16 - d;
          if (push > 0) { ship.x += dx / d * push; ship.y += dy / d * push; ship.vx = dx / d * 260; ship.vy = dy / d * 260; if (blocked) absorb(12); else hurt(12); }
        } else if (e.type === 'fighter') {
          e.vx = -dx / d * 260; e.vy = -dy / d * 260;
          if (blocked) { absorb(6); damageEnemy(e, 2, 'eng'); } else if (ship.inv <= 0) { hurt(10); damageEnemy(e, 2, null); }
        } else {
          const dmg = e.type === 'mine' ? 28 : 14;
          if (blocked) { absorb(dmg * 0.65); killEnemy(e, 'eng'); } else if (ship.inv <= 0) { hurt(dmg); killEnemy(e, null); } else killEnemy(e, null);
        }
      }
    }
  }

  function updateProjectiles(dt) {
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      if (M.station && ringHit(b.x, b.y, 4)) { b.life = 0; addParts(b.x, b.y, 3, C.bad, 80, 0.25, 2); continue; }
      const d = dist(b, ship);
      if (d < 46 && shieldBlocks(Math.atan2(b.y - ship.y, b.x - ship.x))) {
        b.life = 0; absorb(6); addParts(b.x, b.y, 6, C.eng, 140, 0.3, 2.5);
      } else if (d < 14) { b.life = 0; hurt(12); }
    }
    for (const s of shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) { if (s.torp) detonate(s, null); continue; }
      if (M.station && ringHit(s.x, s.y, 3)) { s.life = 0; addParts(s.x, s.y, 3, C.white, 80, 0.2, 2); continue; }
      let hit = null;
      for (const e of enemies) {
        if (e.dead || Math.hypot(e.x - s.x, e.y - s.y) > e.r + 5) continue;
        damageEnemy(e, s.dmg, s.by); hit = e; break;
      }
      if (!hit) for (const a of asts) {
        if (a.dead || Math.hypot(a.x - s.x, a.y - s.y) > a.r + 3) continue;
        damageAst(a, s.dmg, s.by); hit = a; break;
      }
      if (hit && s.torp) detonate(s, hit);
      if (hit) { s.life = 0; stats.hits++; addParts(s.x, s.y, 4, s.by === 'gun' ? C.gun : C.pilot, 120, 0.25, 2); }
    }
  }

  function updatePickups(dt) {
    for (const p of pickups) {
      p.t += dt; p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.exp(-0.6 * dt); p.vx *= k; p.vy *= k;
      p.x = clamp(p.x, 20, world.w - 20); p.y = clamp(p.y, 20, world.h - 20);
      if (dist(p, ship) < 30 + p.r) {
        p.life = 0; Sfx.pickup();
        if (p.type === 'cell') { ship.shield = Math.min(100, ship.shield + 40); addText(p.x, p.y, 'ENERGY', C.eng); }
        else if (p.type === 'repair') { ship.hull = Math.min(100, ship.hull + 25); addText(p.x, p.y, 'HULL +25', C.hull); }
        else if (p.type === 'crystal') addScore(150, p.x, p.y);
        else if (p.type === 'pod') { M.rescued++; stats.pods++; addScore(500, p.x, p.y); addText(p.x, p.y - 22, 'POD ABOARD', C.hull); }
      }
    }
  }

  function updateStationCollision() {
    const s = M.station;
    if (!s || !ringHit(ship.x, ship.y, 15)) return;
    const dx = ship.x - s.x, dy = ship.y - s.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    const side = d >= s.R ? 1 : -1;
    const target = s.R + side * 32;
    ship.x = s.x + nx * target; ship.y = s.y + ny * target;
    const vn = ship.vx * nx + ship.vy * ny;
    if (vn * side < 0) {
      ship.vx -= nx * vn * 1.5; ship.vy -= ny * vn * 1.5;
      if (Math.abs(vn) > 90) { hurt(6); addParts(ship.x, ship.y, 8, C.white, 150, 0.3, 2); }
    }
  }

  function updatePlay(dt) {
    if (Input.start) { paused = !paused; Sfx.ui(); }
    if (DEV && Input.p[0].pressed[5]) { finishMission(); return; }
    if (paused) return;
    mTime += dt;
    ship.inv = Math.max(0, ship.inv - dt);
    updatePilot(dt);
    updateGunner(dt);
    updateEngineer(dt);
    if (M.def.update) M.def.update(dt);
    if (M.def.meteors) {
      M.metT = (M.metT === undefined ? 3 : M.metT) - dt;
      if (M.metT <= 0) { M.metT = M.def.meteors / (1 + 0.25 * diff()) * rand(0.6, 1.4); spawnMeteor(); }
    }
    updateStationCollision();
    updateAsts(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    asts = asts.filter((a) => !a.dead);
    enemies = enemies.filter((e) => !e.dead);
    bullets = bullets.filter((b) => b.life > 0);
    shots = shots.filter((s) => s.life > 0);
    pickups = pickups.filter((p) => p.life > 0);

    const tx = ship.x + ship.vx * 0.35 - W / 2, ty = ship.y + ship.vy * 0.35 - H / 2;
    // The view may overscroll the world edge a little so the HUD never hides the ship.
    cam.x = clamp(lerp(cam.x, tx, Math.min(1, dt * 4)), -60, world.w - W + 60);
    cam.y = clamp(lerp(cam.y, ty, Math.min(1, dt * 4)), -90, world.h - H + 130);

    if (ship.hull < 30 && state === 'play') { alarmT -= dt; if (alarmT <= 0) { alarmT = 0.8; Sfx.alarm(); } }
    if (state === 'play' && M.def.done()) {
      M.doneT += dt;
      ship.inv = 1;
      if (M.doneT > 1.4) finishMission();
    }
  }
  function updateFx(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; const k = Math.exp(-1.6 * dt); p.vx *= k; p.vy *= k; }
    parts = parts.filter((p) => p.life > 0);
    for (const t of texts) { t.y -= 34 * dt; t.life -= dt; }
    texts = texts.filter((t) => t.life > 0);
    shake = Math.max(0, shake - dt * 40);
    toastT = Math.max(0, toastT - dt);
  }

  // ---------------------------------------------------------------- drawing
  function txt(str, x, y, size, color, align, alpha) {
    ctx.font = 'bold ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = color || C.white;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }
  function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow() { ctx.shadowBlur = 0; }
  function bar(x, y, w, h, frac, color, label, warn) {
    ctx.fillStyle = 'rgba(10,18,32,0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = warn ? C.bad : color;
    ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    if (label && frac > 0.45) txt(label, x + 6, y + h / 2 + 1, Math.min(13, h - 3), '#04101c', 'left');
    else if (label) txt(label, x + w - 6, y + h / 2 + 1, Math.min(13, h - 3), color, 'right'); // sit in the empty part
  }

  function drawBackground(cx, cy) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#050816'); g.addColorStop(0.55, '#0a0f24'); g.addColorStop(1, '#150a26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      let x = (s.x - cx * s.z) % 2400, y = (s.y - cy * s.z) % 1400;
      if (x < 0) x += 2400;
      if (y < 0) y += 1400;
      if (x > W || y > H) continue;
      ctx.globalAlpha = 0.35 + s.z;
      ctx.fillStyle = s.c;
      ctx.fillRect(x, y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    const blink = ship.inv > 0 && Math.floor(ship.inv * 20) % 2 === 0;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    // shield arc
    const half = shieldHalf();
    if (ship.shieldOn) {
      const e = ship.shield / 100;
      ctx.strokeStyle = ship.shieldFlash > 0 ? '#ffffff' : C.eng;
      ctx.globalAlpha = 0.35 + 0.65 * e;
      ctx.lineWidth = 3 + 3 * e + (ship.shieldFlash > 0 ? 3 : 0);
      glow(C.eng, 16);
      ctx.beginPath(); ctx.arc(0, 0, 44, ship.shieldAng - half, ship.shieldAng + half); ctx.stroke();
      noGlow();
      ctx.globalAlpha = 0.1 + 0.1 * e;
      ctx.fillStyle = C.eng;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 44, ship.shieldAng - half, ship.shieldAng + half); ctx.fill();
    } else {
      ctx.strokeStyle = C.bad; ctx.globalAlpha = 0.5 * (0.5 + 0.5 * Math.sin(stateT * 20));
      ctx.setLineDash([5, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 44, ship.shieldAng - half, ship.shieldAng + half); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    // drift marker: shows where momentum is carrying the ship, which is not always where it points
    const dv = Math.hypot(ship.vx, ship.vy);
    if (dv > 40) {
      const da = Math.atan2(ship.vy, ship.vx), dl = 58 + dv * 0.09;
      ctx.strokeStyle = C.pilot; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(da - 0.16) * (dl - 9), Math.sin(da - 0.16) * (dl - 9)); ctx.lineTo(Math.cos(da) * dl, Math.sin(da) * dl);
      ctx.lineTo(Math.cos(da + 0.16) * (dl - 9), Math.sin(da + 0.16) * (dl - 9)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (ship.empFx > 0) {
      ctx.strokeStyle = C.eng; ctx.lineWidth = 4; ctx.globalAlpha = ship.empFx * 2;
      ctx.beginPath(); ctx.arc(0, 0, 320 * (1 - ship.empFx * 2 + 0.02), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!blink) {
      ctx.save();
      ctx.rotate(ship.ang);
      glow(C.pilot, 14);
      ctx.fillStyle = '#0b2030'; ctx.strokeStyle = C.pilot; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(-12, -14); ctx.lineTo(-6, 0); ctx.lineTo(-12, 14); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(-16, -19); ctx.moveTo(-2, 9); ctx.lineTo(-16, 19); ctx.stroke();
      noGlow();
      ctx.restore();
      // turret
      ctx.save();
      ctx.rotate(ship.turretAng);
      ctx.strokeStyle = ship.overheated ? C.bad : C.gun; ctx.lineWidth = 3.5;
      glow(C.gun, 8);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(17, 0); ctx.stroke();
      ctx.fillStyle = C.gun; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      noGlow();
      ctx.restore();
    }
    if (ship.repairing) { ctx.strokeStyle = C.hull; ctx.lineWidth = 2; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(0, 0, 24 + Math.sin(stateT * 12) * 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  function drawWorld() {
    ctx.save();
    const sx = shake ? rand(-shake, shake) * 0.5 : 0, sy = shake ? rand(-shake, shake) * 0.5 : 0;
    ctx.translate(-cam.x + sx, -cam.y + sy);
    const vis = (o, r) => o.x > cam.x - r && o.x < cam.x + W + r && o.y > cam.y - r && o.y < cam.y + H + r;

    // world border
    ctx.strokeStyle = 'rgba(255,90,79,0.5)'; ctx.lineWidth = 3; ctx.setLineDash([18, 14]);
    ctx.strokeRect(0, 0, world.w, world.h); ctx.setLineDash([]);

    if (M.gate && vis(M.gate, 150)) {
      const g = M.gate;
      ctx.save(); ctx.translate(g.x, g.y);
      for (let i = 0; i < 3; i++) {
        ctx.rotate(stateT * (0.5 + i * 0.3) * (i % 2 ? -1 : 1));
        ctx.strokeStyle = [C.hull, C.pilot, C.white][i]; ctx.lineWidth = 4 - i; glow(C.hull, 20);
        ctx.setLineDash([30 - i * 6, 14]);
        ctx.beginPath(); ctx.arc(0, 0, g.r + 12 - i * 16, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]); noGlow();
      ctx.restore();
      txt('JUMP GATE', g.x, g.y - g.r - 34, 16, C.hull);
    }
    if (M.station && vis(M.station, 300)) {
      const s = M.station;
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.strokeStyle = '#b8c7dd'; ctx.lineWidth = 30; glow('#7fa2d6', 14);
      ctx.beginPath(); ctx.arc(0, 0, s.R, s.rot + s.gap, s.rot + TAU); ctx.stroke();
      noGlow();
      ctx.strokeStyle = '#33425c'; ctx.lineWidth = 22; ctx.setLineDash([26, 10]);
      ctx.beginPath(); ctx.arc(0, 0, s.R, s.rot + s.gap + 0.04, s.rot + TAU - 0.04); ctx.stroke();
      ctx.setLineDash([]);
      // gap guide lights
      for (const a of [s.rot, s.rot + s.gap]) {
        ctx.fillStyle = Math.floor(stateT * 4) % 2 ? C.hull : '#1d5a2a';
        ctx.beginPath(); ctx.arc(Math.cos(a) * s.R, Math.sin(a) * s.R, 9, 0, TAU); ctx.fill();
      }
      // bay + beacon
      ctx.strokeStyle = C.hull; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (s.dock > 0) { ctx.lineWidth = 6; glow(C.hull, 14); ctx.beginPath(); ctx.arc(0, 0, 60, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.dock / 2.2, 0, 1)); ctx.stroke(); noGlow(); }
      ctx.fillStyle = C.hull; glow(C.hull, 18);
      ctx.beginPath(); ctx.arc(0, 0, 7 + Math.sin(stateT * 6) * 2, 0, TAU); ctx.fill(); noGlow();
      ctx.restore();
    }

    // asteroids
    for (const a of asts) {
      if (!vis(a, a.r + 10)) continue;
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.rot);
      ctx.beginPath();
      for (let i = 0; i < a.shape.length; i++) {
        const an = (i / a.shape.length) * TAU, r = a.r * a.shape[i];
        if (i) ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); else ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r);
      }
      ctx.closePath();
      ctx.fillStyle = a.flash > 0 ? '#59657a' : '#1a2233'; ctx.fill();
      ctx.strokeStyle = a.flash > 0 ? '#ffffff' : a.fast ? '#ffa46b' : C.rock; ctx.lineWidth = a.fast ? 2.5 : 2; ctx.stroke();
      ctx.restore();
    }

    // pickups
    for (const p of pickups) {
      if (!vis(p, 30)) continue;
      const col = { cell: C.eng, repair: C.hull, crystal: C.pilot, pod: C.white }[p.type];
      if (p.life < 4 && Math.floor(p.life * 6) % 2) continue;
      ctx.save(); ctx.translate(p.x, p.y);
      glow(col, 12); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      if (p.type === 'pod') {
        ctx.rotate(p.t * 0.6);
        ctx.fillStyle = '#18222e'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = Math.floor(p.t * 3) % 2 ? C.bad : '#501512'; ctx.beginPath(); ctx.arc(8, 0, 3.5, 0, TAU); ctx.fill();
      } else if (p.type === 'crystal') {
        ctx.rotate(p.t * 2);
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 0); ctx.lineTo(0, 10); ctx.lineTo(-7, 0); ctx.closePath(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
        noGlow();
        txt(p.type === 'cell' ? 'E' : '+', 0, 1, 14, col);
      }
      noGlow();
      ctx.restore();
      if (p.type === 'pod') txt('SOS', p.x, p.y - 24, 11, C.white, 'center', 0.5 + 0.5 * Math.sin(p.t * 5));
    }

    // tractor beam
    if (ship.tractorOn) {
      const t = ship.tractor;
      const tx = t ? t.x : cross.x + cam.x, ty = t ? t.y : cross.y + cam.y;
      ctx.strokeStyle = t ? C.hull : 'rgba(109,255,138,0.25)';
      ctx.lineWidth = t ? 3 + Math.sin(stateT * 30) * 1.5 : 1.5;
      if (t) glow(C.hull, 12);
      ctx.setLineDash([10, 6]); ctx.lineDashOffset = stateT * 80;
      ctx.beginPath(); ctx.moveTo(ship.x, ship.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.setLineDash([]); noGlow();
    }

    // enemies
    for (const e of enemies) {
      if (!vis(e, e.r + 30)) continue;
      ctx.save(); ctx.translate(e.x, e.y);
      const col = e.flash > 0 ? '#ffffff' : e.stun > 0 ? '#8fa8ff' : C.bad;
      ctx.strokeStyle = col; ctx.fillStyle = '#2a0d12'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      if (e.type === 'drone') {
        ctx.rotate(e.ang); glow(C.bad, 8);
        ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-9, -10); ctx.lineTo(-4, 0); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (e.type === 'fighter') {
        ctx.rotate(e.ang); glow(C.bad, 8);
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(0, -7); ctx.lineTo(-12, -16); ctx.lineTo(-8, 0); ctx.lineTo(-12, 16); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (e.type === 'mine') {
        ctx.rotate(e.t);
        const c2 = e.armed ? (Math.floor(e.t * 8) % 2 ? C.bad : '#ffffff') : C.eng;
        ctx.strokeStyle = e.flash > 0 ? '#fff' : c2; ctx.fillStyle = '#2b2410';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 9, Math.sin(an) * 9); ctx.lineTo(Math.cos(an) * 15, Math.sin(an) * 15); ctx.stroke(); }
      } else if (e.type === 'turret') {
        ctx.fillStyle = '#3a1218'; glow(C.bad, 10);
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.rotate(e.ang); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(28, 0); ctx.stroke();
      } else if (e.type === 'boss') {
        const open = !turretsAlive();
        ctx.rotate(e.rot); glow(C.bad, 20);
        ctx.fillStyle = '#1c0c14'; ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const an = i * TAU / 8, r = i % 2 ? 98 : 74; if (i) ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); else ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = open ? (Math.floor(e.t * 6) % 2 ? C.eng : C.bad) : '#4a2030';
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill(); ctx.stroke();
      }
      noGlow();
      ctx.restore();
      if (e.type === 'boss' || e.type === 'turret') bar(e.x - 30, e.y - e.r - 22, 60, 7, e.hp / e.maxHp, C.bad);
    }

    // projectiles
    ctx.lineCap = 'round';
    for (const s of shots) {
      const col = s.by === 'gun' ? C.gun : C.pilot;
      ctx.strokeStyle = col; ctx.lineWidth = s.torp ? 7 : 2.5; glow(col, s.torp ? 18 : 8);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * (s.torp ? 0.03 : 0.018), s.y - s.vy * (s.torp ? 0.03 : 0.018)); ctx.stroke();
      if (s.torp) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill(); }
    }
    glow(C.bad, 12);
    for (const b of bullets) {
      ctx.fillStyle = '#ffd0c8'; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill();
    }
    noGlow();

    if (state !== 'gameover') drawShip();

    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      if (p.ring) { ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.05 - p.life / p.max * 0.6), 0, TAU); ctx.stroke(); continue; }
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (const t of texts) txt(t.str, t.x, t.y, 15, t.color, 'center', clamp(t.life * 1.5, 0, 1));
    ctx.restore();
  }

  function edgeArrow(wx, wy, color, size, label) {
    const x = wx - cam.x, y = wy - cam.y;
    if (x > 20 && x < W - 20 && y > 60 && y < H - 120) return;
    const cx = W / 2, cy = H / 2 - 30, a = Math.atan2(y - cy, x - cx);
    const k = Math.min((W / 2 - 34) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 100) / Math.abs(Math.sin(a) || 1e-6));
    const px = cx + Math.cos(a) * k, py = cy + Math.sin(a) * k;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = color; glow(color, 8);
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.7); ctx.lineTo(-size * 0.7, size * 0.7); ctx.closePath(); ctx.fill();
    noGlow(); ctx.restore();
    if (label) txt(label, px - Math.cos(a) * 34, py - Math.sin(a) * 26, 13, color);
  }

  function drawHud() {
    // crosshair
    ctx.save(); ctx.translate(cross.x, cross.y);
    ctx.strokeStyle = ship.overheated ? C.bad : C.gun; ctx.lineWidth = 2.5; glow(C.gun, 10);
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU);
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4; ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21); }
    ctx.stroke(); noGlow();
    ctx.fillStyle = C.gun; ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();

    // offscreen indicators
    for (const e of enemies) if (!e.dormant && e.type !== 'turret' && (e.type !== 'mine' || e.armed) && dist(e, ship) < 1100) edgeArrow(e.x, e.y, C.bad, 8);
    const nav = M.def.nav();
    if (nav) edgeArrow(nav.x, nav.y, C.hull, 14, Math.round(dist(nav, ship) / 10) + 'm');

    // top bar
    txt('HULL', 24, 30, 15, C.hull, 'left');
    bar(74, 19, 250, 22, ship.hull / 100, C.hull, '', ship.hull < 30 && Math.floor(stateT * 5) % 2 === 0);
    txt(M.def.objective(), W / 2, 30, 20, C.white);
    txt('MISSION ' + (G.mi + 1) + (G.loop ? '  LOOP ' + (G.loop + 1) : '') + '  -  ' + M.def.name, W / 2, 54, 12, C.dim);
    txt(String(G.score).padStart(7, '0'), W - 24, 30, 26, C.white, 'right');

    // station panels: laid out like the control panel (P1 left, trackball centre, P2 right)
    const pw = Math.min(300, (W - 60) / 3 - 10), py = H - 92, ph = 80;
    const panel = (cx, color, title, auto) => {
      const x = cx - pw / 2;
      ctx.fillStyle = 'rgba(6,10,22,0.72)'; ctx.fillRect(x, py, pw, ph);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, py, pw, ph);
      txt(title, x + 10, py + 14, 14, color, 'left');
      if (auto) txt('AUTO', x + pw - 10, py + 14, 12, C.dim, 'right');
      return x;
    };
    // pilot
    let x = panel(30 + pw / 2, C.pilot, 'PILOT', false);
    const sp = Math.hypot(ship.vx, ship.vy);
    bar(x + 10, py + 28, pw - 20, 16, sp / 580, sp < 70 ? C.hull : C.pilot, 'SPEED ' + Math.round(sp));
    txt(ship.thrusting ? 'MAIN ENGINE' : ship.braking ? 'RETRO BRAKE' : sp > 15 ? 'DRIFTING' : 'HOLDING', x + 10, py + 61, 13, ship.thrusting ? C.pilot : ship.braking ? C.eng : C.dim, 'left');
    // gunner
    x = panel(W / 2, C.gun, 'GUNNER', gunAuto);
    bar(x + 10, py + 28, pw - 20, 16, ship.heat, C.gun, ship.overheated ? 'OVERHEAT!' : 'HEAT', ship.overheated);
    txt(ship.tractor ? 'TRACTOR LOCKED' : ship.tractorOn ? 'TRACTOR: NO TARGET' : 'TRACTOR READY', x + 10, py + 61, 13, ship.tractor ? C.hull : C.dim, 'left');
    // engineer
    x = panel(W - 30 - pw / 2, C.eng, 'ENGINEER', engAuto);
    bar(x + 10, py + 28, pw - 20, 16, ship.shield / 100, C.eng, ship.shieldOn ? 'SHIELD' : 'SHIELD OFFLINE', !ship.shieldOn);
    const bw = (pw - 20 - 70) / 3 - 4;
    [['eng', 'ENG'], ['wep', 'WEP'], ['shd', 'SHD']].forEach(([k, lab], i) => {
      const bx = x + 10 + i * (bw + 4), on = ship.power === k;
      ctx.fillStyle = on ? C.eng : 'rgba(10,18,32,0.75)'; ctx.fillRect(bx, py + 52, bw, 18);
      ctx.strokeStyle = C.eng; ctx.lineWidth = 1.5; ctx.strokeRect(bx, py + 52, bw, 18);
      txt(lab, bx + bw / 2, py + 62, 12, on ? '#04101c' : C.eng);
    });
    const ex = x + pw - 10 - 62;
    ctx.fillStyle = ship.emp <= 0 ? (Math.floor(stateT * 3) % 2 ? C.white : C.eng) : 'rgba(10,18,32,0.75)';
    ctx.fillRect(ex, py + 52, 62, 18); ctx.strokeStyle = C.eng; ctx.strokeRect(ex, py + 52, 62, 18);
    txt(ship.emp <= 0 ? 'EMP' : 'EMP ' + Math.ceil(ship.emp), ex + 31, py + 62, 12, ship.emp <= 0 ? '#04101c' : C.dim);

    if (toastT > 0) txt(toast, W / 2, 150, 34, C.eng, 'center', clamp(toastT, 0, 1));
    if (M.doneT > 0) txt('MISSION COMPLETE', W / 2, H / 2 - 110, 44, C.hull);
    if (mTime < 4 && G.mi === 0 && G.loop === 0) txt('WORK TOGETHER - ONE SHIP, THREE STATIONS', W / 2, 110, 18, C.white, 'center', clamp(4 - mTime, 0, 1));
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', W / 2, H / 2 - 20, 60, C.white);
      txt('PRESS START TO RESUME', W / 2, H / 2 + 40, 18, C.dim);
    }
  }

  // ---------------------------------------------------------------- screens
  const ROLE = [
    { name: 'PILOT', dev: 'PLAYER 1 STICK', color: C.pilot, lines: ['STICK  turn the ship', 'B1  thrust (you keep drifting)', 'B2  retro brake', 'B3  light nose cannon'] },
    { name: 'GUNNER', dev: 'TRACKBALL', color: C.gun, lines: ['ROLL  aim the turret', 'LEFT  fire torpedoes', 'RIGHT  tractor beam', 'they burst at the crosshair'] },
    { name: 'ENGINEER', dev: 'PLAYER 2 STICK', color: C.eng, lines: ['STICK  aim the shield', 'B1 B2 B3  power: ENG WEP SHD', 'B4  hold to repair hull', 'B5  EMP blast'] },
  ];
  function drawCards(y, h, tips) {
    const cw = Math.min(360, (W - 80) / 3 - 16);
    ROLE.forEach((r, i) => {
      const cx = W / 2 + (i - 1) * (cw + 20), x = cx - cw / 2;
      ctx.fillStyle = 'rgba(6,10,22,0.8)'; ctx.fillRect(x, y, cw, h);
      ctx.strokeStyle = r.color; ctx.lineWidth = 2.5; glow(r.color, 12); ctx.strokeRect(x, y, cw, h); noGlow();
      txt(r.name, cx, y + 28, 26, r.color);
      txt(r.dev, cx, y + 54, 13, C.dim);
      if (tips) {
        if (Array.isArray(tips[i])) tips[i].forEach((l, j) => txt(l, cx, y + 88 + j * 24, 16, C.white));
        else wrap(tips[i], cx, y + 92, cw - 30, 17, C.white);
      } else {
        r.lines.forEach((l, j) => txt(l, x + 18, y + 86 + j * 24, cw < 300 ? 12 : 14, C.white, 'left'));
        // live input check
        const ix = cx, iy = y + h - 34;
        ctx.strokeStyle = r.color; ctx.lineWidth = 1.5;
        if (i === 1) {
          const m = Input.mouse;
          ctx.beginPath(); ctx.arc(ix - 40, iy, 14, 0, TAU); ctx.stroke();
          ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(ix - 40 + clamp(m.dx, -9, 9), iy + clamp(m.dy, -9, 9), 4, 0, TAU); ctx.fill();
          [m.left, m.right].forEach((on, k) => { ctx.beginPath(); ctx.arc(ix + 10 + k * 30, iy, 9, 0, TAU); if (on) ctx.fill(); ctx.stroke(); });
        } else {
          const p = Input.p[i === 0 ? 0 : 1];
          const ox = ix - cw / 2 + 40;
          ctx.strokeRect(ox - 14, iy - 14, 28, 28);
          ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(ox + p.x * 9, iy + p.y * 9, 5, 0, TAU); ctx.fill();
          for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(ox + 44 + k * 26, iy, 9, 0, TAU); if (p.b[k]) ctx.fill(); ctx.stroke(); }
        }
      }
    });
  }
  function wrap(str, cx, y, maxW, size, color) {
    ctx.font = 'bold ' + size + 'px ' + FONT;
    const words = str.split(' '); let line = '', ly = y;
    for (const w of words) {
      if (ctx.measureText(line + w).width > maxW && line) { txt(line.trim(), cx, ly, size, color); line = ''; ly += size + 7; }
      line += w + ' ';
    }
    txt(line.trim(), cx, ly, size, color);
  }

  function drawTitle() {
    drawBackground(stateT * 40, stateT * 12);
    ctx.save();
    glow(C.pilot, 30);
    txt('TRINARY', W / 2, 96, 96, C.white);
    noGlow(); ctx.restore();
    txt('ONE SHIP  -  THREE STATIONS  -  ZERO MARGIN FOR ERROR', W / 2, 160, 17, C.dim);
    drawCards(200, 240, null);
    if (Math.floor(stateT * 2) % 2) txt('PRESS ANY BUTTON TO LAUNCH', W / 2, 482, 26, C.hull);
    txt('TOP CREWS', W / 2, 532, 16, C.eng);
    highs.forEach((h, i) => txt((i + 1) + '.  ' + h.n + '   ' + String(h.s).padStart(7, '0'), W / 2, 558 + i * 22, 16, i === 0 ? C.white : C.dim));
    txt('Short-handed? Idle stations go on AUTO.   F2 swaps player sticks.   ESC quits.', W / 2, H - 22, 12, C.dim);
  }
  function drawBriefing() {
    drawBackground(cam.x, cam.y);
    drawWorld();
    ctx.fillStyle = 'rgba(2,4,12,0.78)'; ctx.fillRect(0, 0, W, H);
    txt('MISSION ' + (G.mi + 1) + (G.loop ? '   LOOP ' + (G.loop + 1) : ''), W / 2, 110, 20, C.dim);
    ctx.save(); glow(C.eng, 24); txt(M.def.name, W / 2, 170, 70, C.white); noGlow(); ctx.restore();
    txt(M.def.brief, W / 2, 236, 20, C.eng);
    drawCards(290, 190, TIPS[M.def.type]);
    if (stateT > 0.8 && Math.floor(stateT * 2) % 2) txt('PRESS ANY BUTTON', W / 2, 540, 22, C.hull);
  }
  function drawResults() {
    drawBackground(cam.x, cam.y);
    drawWorld();
    ctx.fillStyle = 'rgba(2,4,12,0.8)'; ctx.fillRect(0, 0, W, H);
    txt('MISSION COMPLETE', W / 2, 90, 52, C.hull);
    txt(M.def.name + '   ' + results.time.toFixed(1) + 's', W / 2, 138, 18, C.dim);
    const acc = stats.shots ? Math.round(100 * stats.hits / stats.shots) : 0;
    const tips = [
      ['TOP SPEED  ' + Math.round(stats.topSpeed), 'CANNON KILLS  ' + stats.killsPilot, 'HULL LOST  ' + Math.round(stats.hullLost)],
      ['TURRET KILLS  ' + stats.killsGun, 'ACCURACY  ' + acc + '%', 'PODS RESCUED  ' + stats.pods],
      ['DAMAGE BLOCKED  ' + Math.round(stats.absorbed), 'HULL REPAIRED  ' + Math.round(stats.repaired)],
    ];
    drawCards(180, 170, tips);
    const rows = [['MISSION CLEAR', results.clear], ['HULL BONUS', results.hullB], ['TIME BONUS', results.timeB]];
    rows.forEach((r, i) => {
      if (stateT < 0.5 + i * 0.4) return;
      txt(r[0], W / 2 - 20, 400 + i * 32, 20, C.white, 'right');
      txt('+' + r[1], W / 2 + 20, 400 + i * 32, 20, C.eng, 'left');
    });
    if (stateT > 1.8) txt('SCORE  ' + String(G.score).padStart(7, '0'), W / 2, 520, 32, C.white);
    if (stateT > 2.2 && Math.floor(stateT * 2) % 2) txt('PRESS ANY BUTTON', W / 2, 580, 20, C.hull);
  }
  function drawGameOver() {
    drawBackground(cam.x, cam.y);
    drawWorld();
    ctx.fillStyle = 'rgba(12,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    txt('SHIP DESTROYED', W / 2, H / 2 - 110, 64, C.bad);
    if (stateT > 1.2) {
      txt('CONTINUE?', W / 2, H / 2 - 20, 34, C.white);
      txt(String(Math.max(0, Math.ceil(10.2 - stateT))), W / 2, H / 2 + 50, 80, C.eng);
      txt('PRESS ANY BUTTON  -  RESTART MISSION, SCORE HALVED', W / 2, H / 2 + 120, 16, C.dim);
    }
  }
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function drawEntry() {
    drawBackground(stateT * 30, 0);
    txt('NEW HIGH SCORE', W / 2, 150, 54, C.eng);
    txt(String(G.score).padStart(7, '0'), W / 2, 220, 40, C.white);
    txt('NAME YOUR CREW', W / 2, 290, 20, C.dim);
    for (let i = 0; i < 3; i++) {
      const x = W / 2 + (i - 1) * 90, on = i === entry.pos;
      txt(ALPHA[entry.letters[i]], x, 380, 90, on ? C.hull : C.white);
      if (on && Math.floor(stateT * 3) % 2) { ctx.fillStyle = C.hull; ctx.fillRect(x - 30, 432, 60, 6); }
    }
    txt('STICK UP/DOWN: LETTER     ANY BUTTON: NEXT', W / 2, 500, 16, C.dim);
  }

  // ---------------------------------------------------------------- main loop
  function update(dt) {
    stateT += dt;
    if (Input.exit) { try { window.close(); } catch (e) { /* ignore */ } }
    if (Input.swapToggled) { toast = 'PLAYER STICKS SWAPPED'; toastT = 2; }
    Sfx.music(dt, state === 'play' && !paused ? 1 : 0);
    switch (state) {
      case 'title':
        if (Input.any && stateT > 0.5) { Sfx.ui(); newGame(); }
        break;
      case 'briefing':
        if ((Input.any && stateT > 0.8) || stateT > 12) { Sfx.ui(); setState('play'); gunIdle = engIdle = 0; }
        break;
      case 'play':
        updatePlay(dt);
        break;
      case 'results':
        if ((Input.any && stateT > 2.2) || stateT > 14) { Sfx.ui(); nextMission(); }
        break;
      case 'gameover':
        if (Input.any && stateT > 1.2) { Sfx.ui(); G.score = Math.floor(G.score / 2); startMission(); }
        else if (stateT > 10.2) {
          if (isHigh(G.score)) { entry = { letters: [0, 0, 0], pos: 0 }; setState('entry'); } else setState('title');
        }
        break;
      case 'entry': {
        const e = Input.p[0].edge, f = Input.p[1].edge;
        if (e.up || f.up) { entry.letters[entry.pos] = (entry.letters[entry.pos] + 1) % 26; Sfx.ui(); }
        if (e.down || f.down) { entry.letters[entry.pos] = (entry.letters[entry.pos] + 25) % 26; Sfx.ui(); }
        if (Input.any || e.right || f.right) { entry.pos++; Sfx.pickup(); }
        if (entry.pos >= 3 || stateT > 40) {
          saveHigh(entry.letters.map((l) => ALPHA[l]).join(''), G.score);
          setState('title');
        }
        break;
      }
    }
    if (state !== 'title' && state !== 'entry') updateFx(dt);
  }
  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    switch (state) {
      case 'title': drawTitle(); break;
      case 'briefing': drawBriefing(); break;
      case 'play': drawBackground(cam.x, cam.y); drawWorld(); drawHud(); break;
      case 'results': drawResults(); break;
      case 'gameover': drawGameOver(); break;
      case 'entry': drawEntry(); break;
    }
    if (toastT > 0 && state !== 'play') txt(toast, W / 2, 30, 18, C.eng);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    Input.poll();
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  Input.onFirstInput = () => Sfx.init();
  window.addEventListener('mousedown', () => Sfx.init());
  window.addEventListener('keydown', () => Sfx.init());
  parts = []; texts = [];
  requestAnimationFrame(frame);

  if (DEV) {
    window.TRINARY = {
      get state() { return state; }, get G() { return G; }, get ship() { return ship; }, get M() { return M; }, get stats() { return stats; }, get mTime() { return mTime; }, get cross() { return cross; }, get cam() { return cam; }, get W() { return W; }, get pickups() { return pickups; },
      get counts() { return { asts: asts.length, enemies: enemies.length, bullets: bullets.length, shots: shots.length, parts: parts.length }; },
      goto(i) { G.mi = i; startMission(); },
    };
  }
})();
