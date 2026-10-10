// "Ta-doum" d'intro synthétisé en direct avec la Web Audio API
// (son 100 % original : deux impacts graves + une nappe cuivrée qui s'ouvre).

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function playIntroSound(volume = 0.9, theme: 'none' | 'halloween' | 'christmas' = 'none') {
  let ctx: AudioContext;
  try { ctx = new AudioContext(); } catch { return; }

  const master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.2, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet).connect(master);

  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  const thump = (t: number, pitch: number, level: number) => {
    // corps grave
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(38 * pitch, t + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(master); g.connect(reverb);
    o.start(t); o.stop(t + 1);

    // sub
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 49 * pitch;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(level * 0.5, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    sub.connect(sg).connect(master);
    sub.start(t); sub.stop(t + 1.2);

    // attaque (clic feutré)
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(level * 0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(lp).connect(ng);
    ng.connect(master); ng.connect(reverb);
    n.start(t); n.stop(t + 0.2);
  };

  const swell = (t: number) => {
    const notes = [73.42, 110, 146.83, 220, 293.66, 349.23, 440, 587.33];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(4200, t + 1.5);
    filter.frequency.exponentialRampToValueAtTime(900, t + 3.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 1.1);
    g.gain.setValueAtTime(0.16, t + 1.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.9);
    filter.connect(g);
    g.connect(master); g.connect(reverb);
    notes.forEach((f, i) => {
      for (const detune of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const og = ctx.createGain();
        og.gain.value = i < 2 ? 0.5 : 0.28;
        o.connect(og).connect(filter);
        o.start(t); o.stop(t + 4);
      }
    });
  };

  const t0 = ctx.currentTime + 0.06;
  thump(t0, 1, 1);
  thump(t0 + 0.34, 0.86, 1.15);
  swell(t0 + 0.6);

  // ---------- Touches saisonnières ----------
  if (theme === 'christmas') {
    // Grelots : rafales de bruit filtré dans les aigus, secouées
    for (let i = 0; i < 14; i++) {
      const t = t0 + 0.55 + i * 0.105 + (i % 2 ? 0.02 : 0);
      const n = ctx.createBufferSource();
      n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 6500 + (i % 3) * 900;
      bp.Q.value = 6;
      const g = ctx.createGain();
      const lvl = 0.5 * (1 - i / 18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(bp).connect(g);
      g.connect(master); g.connect(reverb);
      n.start(t); n.stop(t + 0.15);
    }
    // Carillon : arpège cristallin sur la nappe
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      const t = t0 + 1.25 + i * 0.16;
      for (const mult of [1, 2.76]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(mult === 1 ? 0.12 : 0.03, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(g); g.connect(master); g.connect(reverb);
        o.start(t); o.stop(t + 1.7);
      }
    });
  } else if (theme === 'halloween') {
    // Thérémine fantomatique avec vibrato
    const t = t0 + 0.7;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.9);
    o.frequency.exponentialRampToValueAtTime(207.65, t + 2.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 9;
    vib.connect(vibAmt).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
    g.gain.setValueAtTime(0.09, t + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    o.connect(g); g.connect(master); g.connect(reverb);
    o.start(t); vib.start(t); o.stop(t + 3.1); vib.stop(t + 3.1);
    // Vent sourd
    const windLen = 3.4;
    const wb = ctx.createBuffer(1, ctx.sampleRate * windLen, ctx.sampleRate);
    const wd = wb.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = wb;
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(300, t0);
    lp.frequency.linearRampToValueAtTime(900, t0 + 1.6);
    lp.frequency.linearRampToValueAtTime(350, t0 + windLen);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t0);
    wg.gain.exponentialRampToValueAtTime(0.12, t0 + 1.2);
    wg.gain.exponentialRampToValueAtTime(0.0001, t0 + windLen);
    wsrc.connect(lp).connect(wg).connect(master);
    wsrc.start(t0); wsrc.stop(t0 + windLen);
  }
  setTimeout(() => ctx.close().catch(() => {}), 5500);
}

// Petits sons d'interface
export function playClick() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {}
}
