'use strict';
/* Tiny synthesized sound set - no audio files needed. */
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null;
  let step = 0, stepT = 0;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(type, f0, f1, dur, vol, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, f0, f1, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  const BASS = [0, 0, 12, 0, 3, 0, 10, 0, 0, 0, 12, 0, 5, 0, 7, 3];

  return {
    init,
    laser() { tone('square', 980, 320, 0.07, 0.035); },
    cannon() { tone('sawtooth', 420, 90, 0.14, 0.07); },
    boom(size) { noise(0.25 + size * 0.35, 0.18 + size * 0.2, 1800, 80); tone('sine', 140, 30, 0.3 + size * 0.3, 0.2); },
    shield() { tone('sine', 620, 1240, 0.12, 0.09); tone('triangle', 310, 200, 0.15, 0.06); },
    shieldDown() { tone('sawtooth', 500, 60, 0.5, 0.12); },
    shieldUp() { tone('sine', 300, 900, 0.3, 0.09); },
    hull() { noise(0.3, 0.3, 900, 100); tone('square', 110, 50, 0.25, 0.14); },
    pickup() { tone('sine', 660, 660, 0.07, 0.08); tone('sine', 990, 990, 0.1, 0.08, 0.07); },
    emp() { tone('sawtooth', 80, 1600, 0.35, 0.12); noise(0.5, 0.2, 4000, 200, 0.1); },
    power() { tone('triangle', 440, 880, 0.1, 0.07); },
    ui() { tone('square', 520, 780, 0.08, 0.05); },
    alarm() { tone('square', 880, 880, 0.12, 0.05); },
    overheat() { noise(0.4, 0.12, 6000, 1500); },
    fanfare() { [0, 4, 7, 12].forEach((n, i) => tone('square', 330 * Math.pow(2, n / 12), 330 * Math.pow(2, n / 12), 0.22, 0.07, i * 0.13)); },
    lose() { [7, 3, 0, -5].forEach((n, i) => tone('sawtooth', 220 * Math.pow(2, n / 12), 200 * Math.pow(2, n / 12), 0.3, 0.07, i * 0.2)); },
    // Call every frame; intensity 0 = calm (menus), 1 = action.
    music(dt, intensity) {
      if (!ac) return;
      stepT -= dt;
      if (stepT > 0) return;
      stepT += 0.2;
      const n = BASS[step % 16];
      const f = 55 * Math.pow(2, n / 12);
      if (intensity > 0 || step % 2 === 0) tone('triangle', f, f, 0.18, 0.11);
      if (intensity > 0 && step % 4 === 2) noise(0.05, 0.05, 9000, 5000);
      if (intensity > 0 && step % 8 === 0) tone('sine', 120, 40, 0.15, 0.16);
      if (step % 32 === 0) tone('sine', f * 8, f * 8, 0.8, 0.02);
      step++;
    },
  };
})();
