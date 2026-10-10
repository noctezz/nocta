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

export function playIntroSound(volume = 0.9) {
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
