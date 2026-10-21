// Machine à remonter le temps (three.js) : un tunnel où chaque année est une porte lumineuse,
// avec son millésime géant et les affiches de l'année sur les parois. On avance dans le passé.
// L'image prend l'allure de chaque époque : muet noir et blanc granuleux qui scintille,
// Technicolor saturé, sépia des années 70, néons des années 80, VHS des années 90…
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FIRST_YEAR, LAST_YEAR } from './timeMachine';
import type { MetaPreview } from './types';

const SP = 700; // distance entre deux années
const R = 360; // rayon du tunnel d'affiches
const PW = 64, PH = 96;
const zOf = (y: number) => -(LAST_YEAR - y) * SP;
const yearAt = (z: number) => LAST_YEAR + z / SP;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- Ambiance de chaque époque (interpolée année par année) ----------
interface Look { bw: number; sepia: number; grain: number; scan: number; chroma: number; vig: number; sat: number; tint: [number, number, number]; ring: string; fog: string }
const LOOKS: [number, Look][] = [
  [1920, { bw: 1, sepia: 0.45, grain: 0.2, scan: 0, chroma: 0, vig: 1, sat: 1, tint: [1, 1, 1], ring: '#e8dcc0', fog: '#0d0b08' }],
  [1945, { bw: 1, sepia: 0.12, grain: 0.13, scan: 0, chroma: 0, vig: 0.8, sat: 1, tint: [1, 1, 1], ring: '#d0d0d0', fog: '#0a0a0a' }],
  [1952, { bw: 0, sepia: 0, grain: 0.09, scan: 0, chroma: 0, vig: 0.6, sat: 1.45, tint: [1.06, 1, 0.94], ring: '#ffb347', fog: '#140b06' }],
  [1966, { bw: 0, sepia: 0.05, grain: 0.07, scan: 0, chroma: 0, vig: 0.55, sat: 1.25, tint: [1.05, 0.98, 0.95], ring: '#ff7a59', fog: '#120807' }],
  [1975, { bw: 0, sepia: 0.3, grain: 0.07, scan: 0, chroma: 0, vig: 0.55, sat: 0.85, tint: [1.08, 1, 0.84], ring: '#e0a060', fog: '#120c06' }],
  [1985, { bw: 0, sepia: 0, grain: 0.03, scan: 0.08, chroma: 0.0015, vig: 0.45, sat: 1.35, tint: [1.06, 0.92, 1.12], ring: '#ff3cac', fog: '#12041a' }],
  [1995, { bw: 0, sepia: 0, grain: 0.05, scan: 0.22, chroma: 0.004, vig: 0.45, sat: 1.05, tint: [1, 1, 1.02], ring: '#7fdbe6', fog: '#04101a' }],
  [2005, { bw: 0, sepia: 0, grain: 0.02, scan: 0, chroma: 0, vig: 0.4, sat: 1, tint: [0.95, 1, 1.06], ring: '#5ab0ff', fog: '#040a18' }],
  [2015, { bw: 0, sepia: 0, grain: 0.01, scan: 0, chroma: 0, vig: 0.35, sat: 1.08, tint: [1, 0.98, 1.05], ring: '#b28cff', fog: '#080418' }],
  [LAST_YEAR, { bw: 0, sepia: 0, grain: 0, scan: 0, chroma: 0, vig: 0.3, sat: 1.1, tint: [1, 1, 1], ring: '#ffffff', fog: '#05040c' }],
];
const cA = new THREE.Color(), cB = new THREE.Color();
function lookAt(year: number) {
  let i = LOOKS.findIndex(([y]) => y > year);
  if (i <= 0) i = i === 0 ? 1 : LOOKS.length - 1;
  const [ya, a] = LOOKS[i - 1], [yb, b] = LOOKS[i];
  const k = smooth(0, 1, Math.min(1, Math.max(0, (year - ya) / (yb - ya))));
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    bw: m(a.bw, b.bw), sepia: m(a.sepia, b.sepia), grain: m(a.grain, b.grain), scan: m(a.scan, b.scan), chroma: m(a.chroma, b.chroma),
    vig: m(a.vig, b.vig), sat: m(a.sat, b.sat), tint: [m(a.tint[0], b.tint[0]), m(a.tint[1], b.tint[1]), m(a.tint[2], b.tint[2])] as [number, number, number],
    ring: cA.set(a.ring).lerp(cB.set(b.ring), k).clone(), fog: cA.set(a.fog).lerp(cB.set(b.fog), k).clone(),
  };
}

/** Filtre d'époque + effet de vitesse (flou radial) */
const EraShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) },
    bw: { value: 0 }, sepia: { value: 0 }, grain: { value: 0 }, scan: { value: 0 }, chroma: { value: 0 }, vig: { value: 0.3 },
    sat: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, warp: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 res;
    uniform float bw, sepia, grain, scan, chroma, vig, sat, warp; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 sampleC(vec2 uv){
      vec2 d = (uv - 0.5) * chroma;
      return vec3(texture2D(tDiffuse, uv + d).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d).b);
    }
    void main(){
      vec2 uv = vUv;
      // Vieille pellicule : l'image tremble un peu
      uv.y += bw * (hash(vec2(floor(time * 18.0), 1.0)) - 0.5) * 0.004;
      vec3 c = sampleC(uv);
      // Vitesse : flou radial vers le centre
      if (warp > 0.01) {
        vec3 acc = c;
        for (int i = 1; i < 8; i++) acc += sampleC(mix(uv, vec2(0.5), float(i) * 0.018 * warp));
        c = acc / 8.0;
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l), bw);
      c = mix(c, vec3(l) * vec3(1.08, 0.9, 0.68) * 1.1, sepia);
      c = mix(vec3(l), c, sat) * tint;
      // Grain, poussières et rayures de pellicule
      float n = hash(uv * res + fract(time) * 97.0) - 0.5;
      c += n * grain;
      float scratch = step(0.997, hash(vec2(floor(uv.x * 220.0), floor(time * 12.0)))) * bw;
      c += scratch * 0.18;
      float speck = step(0.9993, hash(floor(uv * res / 3.0) + floor(time * 18.0))) * bw;
      c -= speck * 0.5;
      c *= 1.0 - bw * 0.07 * hash(vec2(floor(time * 18.0), 7.0));
      // VHS : lignes de balayage
      c *= 1.0 - scan * (0.5 + 0.5 * sin(uv.y * res.y * 1.6));
      c += scan * 0.04 * step(0.985, hash(vec2(floor(uv.y * 60.0 + time * 30.0), 3.0)));
      // Vignettage
      float v = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.15, 1.0)));
      c *= mix(1.0, v, vig);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Typographie du millésime selon l'époque */
function yearTexture(year: number) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 400;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const txt = String(year);
  if (year < 1950) {
    g.font = 'italic 700 260px Georgia, "Times New Roman", serif';
    g.fillStyle = '#f3ead6';
    g.shadowColor = 'rgba(255,240,200,0.6)'; g.shadowBlur = 30;
    g.fillText(txt, 512, 200);
    g.strokeStyle = 'rgba(255,240,200,0.5)'; g.lineWidth = 3;
    g.strokeRect(120, 50, 784, 300);
  } else if (year < 1980) {
    g.font = '900 270px "Arial Black", Impact, sans-serif';
    const grd = g.createLinearGradient(0, 80, 0, 320);
    grd.addColorStop(0, '#ffe08a'); grd.addColorStop(1, '#ff6a3d');
    g.fillStyle = grd;
    g.shadowColor = 'rgba(255,120,40,0.7)'; g.shadowBlur = 40;
    g.fillText(txt, 512, 210);
  } else if (year < 1990) {
    // Chrome et néon des années 80
    g.font = 'italic 900 270px "Arial Black", Impact, sans-serif';
    g.shadowColor = '#ff3cac'; g.shadowBlur = 50;
    const grd = g.createLinearGradient(0, 70, 0, 330);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.48, '#7fdbe6'); grd.addColorStop(0.52, '#2b1055'); grd.addColorStop(1, '#ff3cac');
    g.fillStyle = grd;
    g.fillText(txt, 512, 200);
    g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText(txt, 512, 200);
  } else if (year < 2000) {
    g.font = '700 250px "Courier New", monospace';
    g.shadowColor = '#7fdbe6'; g.shadowBlur = 30;
    g.fillStyle = '#e8fbff';
    g.fillText(txt, 512, 200);
    g.globalAlpha = 0.5; g.fillStyle = '#ff3c6e'; g.fillText(txt, 520, 200); g.globalAlpha = 1;
  } else {
    g.font = '800 270px Inter, "Segoe UI", sans-serif';
    g.shadowColor = 'rgba(178,140,255,0.8)'; g.shadowBlur = 40;
    const grd = g.createLinearGradient(0, 80, 1024, 320);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#c9b8ff');
    g.fillStyle = grd;
    g.fillText(txt, 512, 200);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pellicule de film (bande avec perforations) */
function filmTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0907'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#d8cdb4';
  for (let x = 6; x < 512; x += 32) { g.fillRect(x, 8, 16, 12); g.fillRect(x, 108, 16, 12); }
  for (let i = 0; i < 4; i++) {
    const grd = g.createLinearGradient(i * 128, 28, i * 128 + 128, 100);
    grd.addColorStop(0, '#6d6656'); grd.addColorStop(1, '#2c2a24');
    g.fillStyle = grd;
    g.fillRect(i * 128 + 8, 28, 112, 72);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softDot(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function fallbackPoster(meta: MetaPreview) {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 270;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 180, 270);
  grd.addColorStop(0, '#3a3348'); grd.addColorStop(1, '#0b0814');
  g.fillStyle = grd; g.fillRect(0, 0, 180, 270);
  g.fillStyle = '#fff'; g.font = 'bold 20px Inter, sans-serif'; g.textAlign = 'center';
  let line = '', y = 120;
  for (const w of (meta.name || '').split(' ')) {
    if (g.measureText(line + w).width > 150) { g.fillText(line.trim(), 90, y); line = ''; y += 24; }
    line += w + ' ';
  }
  g.fillText(line.trim(), 90, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Slot {
  year: number;
  group: THREE.Group;
  ring: THREE.Mesh;
  label?: THREE.Mesh;
  posters: THREE.Mesh[];
  state: 'empty' | 'loading' | 'ready';
  items?: MetaPreview[];
}

export interface TimeCallbacks {
  onYear: (year: number) => void;
  onHover: (meta: MetaPreview | null) => void;
  onPick: (meta: MetaPreview) => void;
  loadYear: (year: number) => Promise<MetaPreview[]>;
}

export class TimeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private era: ShaderPass;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private raf = 0;
  private slots = new Map<number, Slot>();
  private posterMeshes: THREE.Mesh[] = [];
  private textures = new Set<THREE.Texture>();
  private loader = new THREE.TextureLoader();
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-9, -9);
  private hovered: THREE.Mesh | null = null;
  private down: { x: number; y: number; moved: number; mesh: THREE.Mesh | null } | null = null;
  private z = zOf(LAST_YEAR) + 900;
  private vel = 0;
  private jump: { from: number; to: number; start: number; dur: number } | null = null;
  private auto = 0; // voyage automatique : -1 vers le passé, 1 vers le présent
  private look = new THREE.Vector2();
  private lastYear = -1;
  private streaks!: THREE.LineSegments;
  private streakPos!: Float32Array;
  private grid!: THREE.Mesh;
  private dust!: THREE.Points;
  private paused = false;
  private disposed = false;
  private sound: { ctx: AudioContext; gain: GainNode; timer: number } | null = null;
  private soundOn = true;
  private tmpQ = new THREE.Quaternion();

  constructor(private canvas: HTMLCanvasElement, private cb: TimeCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.camera = new THREE.PerspectiveCamera(70, 1, 1, 9000);
    this.scene.fog = new THREE.Fog(0x05040c, 2500, 7500);
    this.scene.background = new THREE.Color(0x05040c);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.era = new ShaderPass(EraShader);
    this.composer.addPass(this.era);
    this.composer.addPass(new OutputPass());

    this.buildTunnel();
    this.bindEvents();
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- Construction ----------
  private buildTunnel() {
    // Une porte (anneau) par année ; les décennies brillent davantage
    for (let y = LAST_YEAR; y >= FIRST_YEAR; y--) {
      const group = new THREE.Group();
      group.position.z = zOf(y);
      const decade = y % 10 === 0;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R + 70, decade ? 3.2 : 1.4, 8, 160),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: decade ? 0.95 : 0.45, fog: true }),
      );
      group.add(ring);
      this.scene.add(group);
      this.slots.set(y, { year: y, group, ring, posters: [], state: 'empty' });
    }
    // Poussière temporelle tout le long du tunnel
    const n = 26000;
    const pos = new Float32Array(n * 3);
    const span = zOf(FIRST_YEAR) - 1200;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 900;
      pos.set([Math.cos(a) * r, Math.sin(a) * r, 1200 + Math.random() * (span - 1200)], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 3.2, map: softDot(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd9d2ff }));
    this.scene.add(this.dust);

    // Traînées de vitesse (s'allongent quand on voyage vite)
    const sn = 420;
    this.streakPos = new Float32Array(sn * 6);
    for (let i = 0; i < sn; i++) this.resetStreak(i, this.z - Math.random() * 4000);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xe8e0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.streaks);

    // Pellicule en spirale à l'époque du muet et du noir et blanc
    const tex = filmTexture();
    const z0 = zOf(1956), z1 = zOf(FIRST_YEAR) - 600;
    const turns = (z0 - z1) / 1400;
    const segs = Math.floor(turns * 120);
    const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, a = t * turns * Math.PI * 2, z = z0 + (z1 - z0) * t, rr = R + 150;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      verts.push(x, y, z - 45, x, y, z + 45);
      const u = (t * (z0 - z1)) / 180;
      uvs.push(u, 0, u, 1);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    fg.setIndex(idx);
    this.scene.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));

    // Sol en grille néon des années 80
    const gz0 = zOf(1993), gz1 = zOf(1977);
    this.grid = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, gz0 - gz1, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        transparent: true,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float time; varying vec2 vUv;
          void main(){
            vec2 g = vec2(vUv.x * 60.0, vUv.y * 160.0 + time * 2.0);
            vec2 f = abs(fract(g) - 0.5);
            float line = 1.0 - smoothstep(0.0, 0.06, min(f.x, f.y));
            float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y) * smoothstep(0.0, 0.3, 1.0 - abs(vUv.x - 0.5) * 2.0);
            gl_FragColor = vec4(mix(vec3(1.0, 0.24, 0.67), vec3(0.5, 0.86, 0.9), vUv.x) * line * 1.6, line * edge * 0.85);
          }`,
      }),
    );
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.set(0, -R - 40, (gz0 + gz1) / 2);
    this.scene.add(this.grid);
    // Soleil couchant rétro au bout de la grille
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(700, 64),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv; void main(){
          vec3 c = mix(vec3(1.0, 0.25, 0.6), vec3(1.0, 0.85, 0.3), vUv.y);
          float bands = step(0.5, fract(vUv.y * 14.0)) + step(0.55, vUv.y);
          gl_FragColor = vec4(c * 1.3, min(1.0, bands) * 0.9);
        }`,
      }),
    );
    sun.position.set(0, 300, gz1 - 2600);
    this.scene.add(sun);
  }

  private resetStreak(i: number, z: number) {
    const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 650;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    this.streakPos.set([x, y, z, x, y, z], i * 6);
  }

  /** Affiches et millésime d'une année (chargés quand on s'en approche) */
  private ensureSlot(s: Slot) {
    if (!s.label) {
      const tex = yearTexture(s.year);
      this.textures.add(tex);
      s.label = new THREE.Mesh(new THREE.PlaneGeometry(560, 219), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.label.position.z = 120;
      s.group.add(s.label);
    }
    if (s.state !== 'empty') return;
    s.state = 'loading';
    this.cb.loadYear(s.year).then((items) => {
      if (this.disposed) return;
      s.items = items;
      s.state = 'ready';
      const n = items.length;
      items.forEach((meta, i) => {
        // Les affiches tapissent la paroi, en spirale d'une année à l'autre
        const a = (i / Math.max(1, n)) * Math.PI * 2 + s.year * 0.7;
        const zz = (i % 3 - 1) * 110 + (Math.random() - 0.5) * 40;
        const mat = new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
        mesh.position.set(Math.cos(a) * R, Math.sin(a) * R, zz);
        mesh.userData = { meta, year: s.year };
        s.group.add(mesh);
        s.posters.push(mesh);
        this.posterMeshes.push(mesh);
        const set = (t: THREE.Texture) => { if (this.disposed) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mat.map = t; mat.needsUpdate = true; this.textures.add(t); };
        if (meta.poster) { this.loader.setCrossOrigin('anonymous'); this.loader.load(meta.poster, set, undefined, () => set(fallbackPoster(meta))); } else set(fallbackPoster(meta));
      });
    }).catch(() => { s.state = 'empty'; });
  }

  /** Libère les années lointaines (mémoire graphique) */
  private releaseSlot(s: Slot) {
    if (s.label) {
      const lm = s.label.material as THREE.MeshBasicMaterial;
      if (lm.map) { this.textures.delete(lm.map); lm.map.dispose(); }
      lm.dispose(); s.label.geometry.dispose(); s.group.remove(s.label);
      s.label = undefined;
    }
    if (s.state !== 'ready') return;
    for (const m of s.posters) {
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map) { this.textures.delete(mat.map); mat.map.dispose(); }
      mat.dispose(); m.geometry.dispose(); s.group.remove(m);
    }
    this.posterMeshes = this.posterMeshes.filter((m) => !s.posters.includes(m));
    s.posters = [];
    s.state = 'empty';
  }

  // ---------- Voyage ----------
  /** Saut vers une année (vol avec effet de vitesse) */
  goTo(year: number) {
    const y = Math.min(LAST_YEAR, Math.max(FIRST_YEAR, Math.round(year)));
    const to = zOf(y) + 380;
    const dy = Math.abs(yearAt(this.z) - y);
    this.auto = 0;
    this.jump = { from: this.z, to, start: performance.now(), dur: Math.min(4200, 900 + dy * 70) };
    this.vel = 0;
    whoosh();
  }

  step(dir: number) { this.goTo(Math.round(yearAt(this.z - 380)) + dir); }

  /** Voyage automatique : on remonte (ou redescend) le temps tout seul */
  setAuto(dir: number) { this.auto = dir; this.jump = null; }
  get autoDir() { return this.auto; }

  setSound(on: boolean) { this.soundOn = on; if (!on) this.stopSound(); }

  setPaused(p: boolean) { this.paused = p; if (!p) this.clock.getDelta(); if (p) this.stopSound(); }

  // ---------- Interaction ----------
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.jump = null; this.auto = 0;
    // Molette vers le bas : on remonte dans le passé
    this.vel -= e.deltaY * 4;
    this.vel = Math.max(-9000, Math.min(9000, this.vel));
  };
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (this.down) this.down.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  };
  private onDown = (e: PointerEvent) => {
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObjects(this.posterMeshes, false)[0];
    this.down = { x: e.clientX, y: e.clientY, moved: 0, mesh: (hit?.object as THREE.Mesh) || this.hovered };
  };
  private onUp = () => {
    const d = this.down;
    this.down = null;
    if (d && d.moved < 8 && d.mesh) this.cb.onPick(d.mesh.userData.meta);
  };
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
    else if (e.key === 'PageUp') this.step(-10);
    else if (e.key === 'PageDown') this.step(10);
  };
  private onResize = () => this.resize();

  private bindEvents() {
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.era.uniforms.res.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Animation ----------
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now();
    const t = this.clock.elapsedTime;

    // Déplacement : saut animé, voyage auto ou élan de la molette
    const prevZ = this.z;
    if (this.jump) {
      const k = Math.min(1, (now - this.jump.start) / this.jump.dur);
      this.z = this.jump.from + (this.jump.to - this.jump.from) * ease(k);
      if (k >= 1) this.jump = null;
    } else if (this.auto) {
      this.z += this.auto * dt * 1050;
    } else {
      this.z += this.vel * dt;
      this.vel *= Math.pow(0.08, dt);
      // Arrêt en douceur devant l'année la plus proche
      if (Math.abs(this.vel) < 160) {
        const snap = zOf(Math.round(yearAt(this.z - 380))) + 380;
        this.z += (snap - this.z) * Math.min(1, dt * 2.2);
      }
    }
    const maxZ = zOf(LAST_YEAR) + 900, minZ = zOf(FIRST_YEAR) + 380;
    if (this.z > maxZ) { this.z = maxZ; this.vel = 0; if (this.auto > 0) this.auto = 0; }
    if (this.z < minZ) { this.z = minZ; this.vel = 0; if (this.auto < 0) this.auto = 0; }
    const speed = Math.abs(this.z - prevZ) / Math.max(dt, 1e-3);

    // Caméra : léger regard vers la souris, petit balancement
    this.look.lerp(new THREE.Vector2(this.mouse.x === -9 ? 0 : this.mouse.x, this.mouse.y === -9 ? 0 : this.mouse.y), 0.05);
    this.camera.position.set(Math.sin(t * 0.3) * 12, Math.cos(t * 0.23) * 8, this.z);
    this.camera.lookAt(this.look.x * 120, this.look.y * 80, this.z - 600);
    this.camera.fov = 70 + Math.min(18, speed / 260);
    this.camera.updateProjectionMatrix();

    // Ambiance de l'époque
    const year = yearAt(this.z - 380);
    const L = lookAt(year);
    const u = this.era.uniforms;
    u.time.value = t;
    u.bw.value = L.bw; u.sepia.value = L.sepia; u.grain.value = L.grain; u.scan.value = L.scan; u.chroma.value = L.chroma;
    u.vig.value = L.vig; u.sat.value = L.sat; u.tint.value.set(...L.tint);
    u.warp.value = Math.min(1, speed / 4200);
    (this.scene.background as THREE.Color).copy(L.fog);
    (this.scene.fog as THREE.Fog).color.copy(L.fog);
    (this.grid.material as THREE.ShaderMaterial).uniforms.time.value = t;
    this.updateSound(L.bw);

    // Années proches : chargées ; lointaines : libérées
    const yi = Math.round(year);
    if (yi !== this.lastYear) { this.lastYear = yi; this.cb.onYear(Math.min(LAST_YEAR, Math.max(FIRST_YEAR, yi))); }
    for (const s of this.slots.values()) {
      const d = s.year - year;
      if (d <= 2.5 && d >= -7) this.ensureSlot(s);
      else if (d > 6 || d < -14) { if (s.label || s.state === 'ready') this.releaseSlot(s); }
      // Anneaux aux couleurs de l'époque, qui tournent doucement
      (s.ring.material as THREE.MeshBasicMaterial).color.copy(L.ring);
      s.group.rotation.z = t * 0.025 * (s.year % 2 ? 1 : -1);
      if (s.label) {
        // Le millésime s'efface quand on le traverse
        const dist = this.camera.position.z - (s.group.position.z + 120);
        (s.label.material as THREE.MeshBasicMaterial).opacity = smooth(40, 520, dist) * (1 - smooth(2600, 4800, dist));
        s.label.rotation.z = -s.group.rotation.z;
      }
      // Affiches toujours droites et face au voyageur, même quand leur anneau tourne
      if (s.posters.length) s.group.getWorldQuaternion(this.tmpQ).invert().multiply(this.camera.quaternion);
      for (const m of s.posters) {
        m.quaternion.copy(this.tmpQ);
        const mat = m.material as THREE.MeshBasicMaterial;
        if (mat.map && mat.opacity < 1) mat.opacity = Math.min(1, mat.opacity + dt * 1.6);
        const target = m === this.hovered ? 1.35 : 1;
        m.scale.setScalar(m.scale.x + (target - m.scale.x) * Math.min(1, dt * 10));
      }
    }

    // Traînées : visibles et longues quand on file
    const len = Math.min(1600, speed * 0.32);
    const sm = this.streaks.material as THREE.LineBasicMaterial;
    sm.opacity = Math.min(0.7, speed / 3000);
    sm.color.copy(L.ring);
    for (let i = 0; i < this.streakPos.length / 6; i++) {
      const z = this.streakPos[i * 6 + 2];
      if (z > this.z + 200 || z < this.z - 4200) this.resetStreak(i, this.z - 200 - Math.random() * 4000);
      this.streakPos[i * 6 + 5] = this.streakPos[i * 6 + 2] + len;
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;

    // Survol des affiches
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = speed < 600 ? this.ray.intersectObjects(this.posterMeshes, false)[0] : undefined;
    const h = (hit?.object as THREE.Mesh) || null;
    if (h !== this.hovered) {
      this.hovered = h;
      this.canvas.style.cursor = h ? 'pointer' : 'default';
      this.cb.onHover(h ? h.userData.meta : null);
    }

    this.composer.render();
  };

  // ---------- Son : cliquetis du projecteur à l'époque du muet ----------
  private updateSound(bw: number) {
    if (!this.soundOn || bw < 0.05) { this.stopSound(); return; }
    try {
      if (!this.sound) {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);
        // Une petite « claque » de bruit filtré, 18 fois par seconde (cadence du muet)
        const len = Math.floor(ctx.sampleRate * 0.012);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const timer = window.setInterval(() => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 600; f.Q.value = 0.8;
          src.connect(f).connect(gain);
          src.start();
        }, 1000 / 18);
        this.sound = { ctx, gain, timer };
      }
      this.sound.gain.gain.value = bw * 0.05;
    } catch { /* pas de son */ }
  }

  private stopSound() {
    if (!this.sound) return;
    clearInterval(this.sound.timer);
    this.sound.ctx.close().catch(() => {});
    this.sound = null;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.stopSound();
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.textures.forEach((t) => t.dispose());
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}

let audio: AudioContext | null = null;
function whoosh() {
  try {
    audio ||= new AudioContext();
    const ctx = audio, t = ctx.currentTime, len = 1.6;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(160, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + len * 0.5);
    f.frequency.exponentialRampToValueAtTime(260, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + len * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t); src.stop(t + len);
  } catch {}
}
