// La Galaxie en 3D (three.js) : bras spiraux de poussière d'étoiles, nébuleuses de couleur par
// genre, affiches flottantes, constellation de l'utilisateur, étoiles filantes, vol de caméra.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { MetaPreview } from './types';
import type { Nebula } from './galaxy';

interface StarObj {
  meta: MetaPreview;
  nebula: number;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  base: THREE.Vector3;
  phase: number;
  mine: boolean;
  scale: number;
}

export interface GalaxyCallbacks {
  /** Survol d'une affiche (null : plus rien) */
  onHover: (meta: MetaPreview | null, nebula?: Nebula) => void;
  /** Clic sur une affiche : la caméra est arrivée devant */
  onPick: (meta: MetaPreview) => void;
  /** Nébuleuse la plus proche de la caméra (pour l'affichage) */
  onNear?: (label: string | null) => void;
}

const POSTER_W = 40;
const POSTER_H = 60;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Petite texture ronde et douce (étoiles, poussière, halos) */
function softDot(size = 64, hard = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(Math.max(0.05, hard), 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Affiche de secours (image indisponible) : titre sur un dégradé de la couleur de la nébuleuse */
function fallbackPoster(meta: MetaPreview, color: string) {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 270;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 180, 270);
  grd.addColorStop(0, color);
  grd.addColorStop(1, '#0b0814');
  g.fillStyle = grd;
  g.fillRect(0, 0, 180, 270);
  g.fillStyle = '#fff';
  g.font = 'bold 20px Inter, sans-serif';
  g.textAlign = 'center';
  const words = (meta.name || '').split(' ');
  let line = '', y = 120;
  for (const w of words) {
    if (g.measureText(line + w).width > 150) { g.fillText(line.trim(), 90, y); line = ''; y += 24; }
    line += w + ' ';
  }
  g.fillText(line.trim(), 90, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bord arrondi + léger dégradé pour les affiches (shader) */
function posterMaterial(map: THREE.Texture | null, color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, tint: { value: color }, hover: { value: 0 }, fade: { value: 0 } },
    transparent: true,
    depthWrite: true,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D map; uniform vec3 tint; uniform float hover; uniform float fade; varying vec2 vUv;
      float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.5);
        float d = rbox(p, vec2(0.5, 0.75), 0.06);
        if (d > 0.0) discard;
        vec3 col = texture2D(map, vUv).rgb;
        // Liseré lumineux de la couleur de la nébuleuse, plus vif au survol
        float edge = smoothstep(-0.035, 0.0, d);
        col = mix(col, tint * 1.6, edge * (0.55 + hover * 0.45));
        col *= 0.82 + hover * 0.28;
        gl_FragColor = vec4(col, fade);
      }`,
  });
}

export class GalaxyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private raf = 0;
  private stars: StarObj[] = [];
  private posterMeshes: THREE.Mesh[] = [];
  private nebulaCenters: THREE.Vector3[] = [];
  private nebulaGroups: THREE.Group[] = [];
  private labels: HTMLElement[] = [];
  private uniforms = { time: { value: 0 }, pixel: { value: 1 } };
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-9, -9);
  private hovered: StarObj | null = null;
  private loader = new THREE.TextureLoader();
  private textures: THREE.Texture[] = [];
  private shooting: { line: THREE.Line; life: number; dir: THREE.Vector3 }[] = [];
  private nextShoot = 2;
  private constellation: THREE.Line | null = null;
  // Caméra en orbite autour d'une cible (angles, distance), avec amorti
  private target = new THREE.Vector3();
  private goalTarget = new THREE.Vector3();
  private theta = 0.6; private phi = 1.05; private dist = 2600;
  private goalTheta = 0.6; private goalPhi = 1.05; private goalDist = 2600;
  private flight: { from: { t: THREE.Vector3; d: number; th: number; ph: number }; to: { t: THREE.Vector3; d: number; th: number; ph: number }; start: number; dur: number; done?: () => void } | null = null;
  private dragging: { x: number; y: number; moved: number } | null = null;
  private autopilot = false;
  private autoNext = 0;
  private paused = false;
  private disposed = false;
  private intro = 1;
  private introStart = performance.now();

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLElement, private nebulae: Nebula[], mine: MetaPreview[], private cb: GalaxyCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x030208, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.uniforms.pixel.value = this.renderer.getPixelRatio();
    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 40000);
    this.scene.fog = new THREE.FogExp2(0x030208, 0.00008);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.6, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildBackground();
    this.buildDisc();
    this.buildNebulae(new Set(mine.map((m) => m.id)));
    this.buildConstellation(mine);
    this.bindEvents();
    this.resize();
    // Entrée en scène : on arrive de très loin, à toute vitesse
    this.dist = 9000; this.phi = 0.5;
    this.introStart = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- Construction ----------
  private points(count: number, fill: (i: number, pos: Float32Array, col: Float32Array, size: Float32Array) => void, opts: { additive?: boolean; twinkle?: boolean; map?: THREE.Texture } = {}) {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { fill(i, pos, col, size); seed[i] = Math.random() * 100; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: this.uniforms.time, pixel: this.uniforms.pixel, map: { value: opts.map || softDot() }, twinkle: { value: opts.twinkle ? 1 : 0 } },
      vertexShader: `
        attribute float size; attribute float seed; attribute vec3 color; varying vec3 vColor; varying float vTw;
        uniform float time; uniform float pixel; uniform float twinkle;
        void main(){
          vColor = color;
          vTw = 1.0 - twinkle * 0.45 * (0.5 + 0.5 * sin(time * (0.6 + fract(seed) * 2.2) + seed));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * pixel * (900.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'uniform sampler2D map; varying vec3 vColor; varying float vTw; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * vTw, t.a * vTw); }',
      transparent: true,
      depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  /** Ciel étoilé lointain, qui scintille */
  private buildBackground() {
    const sky = this.points(7000, (i, p, c, s) => {
      const r = 9000 + Math.random() * 9000, u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      p.set([r * k * Math.cos(a), r * u, r * k * Math.sin(a)], i * 3);
      const w = 0.55 + Math.random() * 0.45, tint = Math.random();
      c.set(tint < 0.15 ? [w, w * 0.8, w * 0.7] : tint < 0.3 ? [w * 0.75, w * 0.85, w] : [w, w, w], i * 3);
      s[i] = 6 + Math.random() * 18;
    }, { twinkle: true });
    this.scene.add(sky);
  }

  /** Disque de la galaxie : bras spiraux de poussière, cœur brillant */
  private buildDisc() {
    const arms = 4;
    const inner = new THREE.Color('#fff1d6'), mid = new THREE.Color('#b28cff'), outer = new THREE.Color('#3a5bff');
    const tmp = new THREE.Color();
    const dust = this.points(18000, (i, p, c, s) => {
      const arm = i % arms;
      const r = Math.pow(Math.random(), 1.6) * 2300 + 30;
      const a = arm * ((Math.PI * 2) / arms) + Math.log(r / 30) * 1.25 + (Math.random() - 0.5) * (0.55 + 380 / r);
      const spread = 40 + r * 0.06;
      p.set([Math.cos(a) * r + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * (70 * Math.exp(-r / 700) + 14), Math.sin(a) * r + (Math.random() - 0.5) * spread], i * 3);
      const t = Math.min(1, r / 2300);
      tmp.copy(inner).lerp(mid, Math.min(1, t * 1.8)).lerp(outer, Math.max(0, t * 1.6 - 0.6));
      const b = (0.16 + Math.random() * 0.4) * (0.4 + 0.6 * t);
      c.set([tmp.r * b, tmp.g * b, tmp.b * b], i * 3);
      s[i] = 3 + Math.random() * 8;
    }, { twinkle: true });
    this.scene.add(dust);
    // Cœur : un soleil laiteux
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(256), color: 0xfff0dd, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    core.scale.set(520, 520, 1);
    (core.material as THREE.SpriteMaterial).opacity = 0.55;
    this.scene.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(256), color: 0x8c6cff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.1, depthWrite: false }));
    halo.scale.set(2400, 2400, 1);
    this.scene.add(halo);
  }

  /** Une nébuleuse par genre, posée sur les bras ; les affiches flottent dedans */
  private buildNebulae(mine: Set<string>) {
    const glowTex = softDot(128, 0.2);
    const n = this.nebulae.length;
    this.nebulae.forEach((neb, ni) => {
      const color = new THREE.Color(neb.color);
      const r = 1000 + (ni % 3) * 450 + Math.random() * 120;
      const a = (ni / n) * Math.PI * 2 + Math.log(r / 30) * 1.25;
      const center = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 160, Math.sin(a) * r);
      this.nebulaCenters.push(center);
      const group = new THREE.Group();
      group.position.copy(center);
      this.scene.add(group);
      this.nebulaGroups.push(group);

      // Nuage de gaz coloré
      const tmp = new THREE.Color();
      const gas = this.points(900, (i, p, c, s) => {
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        p.set([g() * 420, g() * 190, g() * 420], i * 3);
        tmp.copy(color).offsetHSL((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.15);
        const b = 0.025 + Math.random() * 0.05;
        c.set([tmp.r * b, tmp.g * b, tmp.b * b], i * 3);
        s[i] = 80 + Math.random() * 160;
      });
      group.add(gas);
      const sparks = this.points(350, (i, p, c, s) => {
        const g = () => (Math.random() + Math.random() - 1);
        p.set([g() * 380, g() * 170, g() * 380], i * 3);
        tmp.copy(color).lerp(new THREE.Color('#ffffff'), 0.5);
        c.set([tmp.r * 0.7, tmp.g * 0.7, tmp.b * 0.7], i * 3);
        s[i] = 3 + Math.random() * 6;
      }, { twinkle: true });
      group.add(sparks);

      // Affiches : réparties sur une sphère de Fibonacci, un peu de désordre
      const count = neb.stars.length;
      neb.stars.forEach((meta, si) => {
        const y = 1 - (si / Math.max(1, count - 1)) * 2;
        const rad = Math.sqrt(1 - y * y), th = si * 2.39996;
        const R = 230 + Math.random() * 90;
        const local = new THREE.Vector3(Math.cos(th) * rad * R, y * R * 0.55, Math.sin(th) * rad * R);
        const isMine = mine.has(meta.id);
        const mat = posterMaterial(null, isMine ? new THREE.Color('#ffd166') : color);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W, POSTER_H), mat);
        mesh.position.copy(center).add(local);
        const scale = isMine ? 1.35 : 1;
        mesh.scale.setScalar(scale);
        this.scene.add(mesh);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: isMine ? 0xffd166 : color, blending: THREE.AdditiveBlending, transparent: true, opacity: isMine ? 0.5 : 0.12, depthWrite: false }));
        glow.scale.set(POSTER_W * 2.4 * scale, POSTER_W * 2.4 * scale, 1);
        glow.position.copy(mesh.position);
        this.scene.add(glow);
        const star: StarObj = { meta, nebula: ni, mesh, glow, base: mesh.position.clone(), phase: Math.random() * Math.PI * 2, mine: isMine, scale };
        mesh.userData.star = star;
        this.stars.push(star);
        this.posterMeshes.push(mesh);
        // Chargement de l'affiche, apparition en fondu
        const setMap = (t: THREE.Texture) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; mat.uniforms.map.value = t; this.textures.push(t); };
        if (meta.poster) {
          this.loader.setCrossOrigin('anonymous');
          this.loader.load(meta.poster, setMap, undefined, () => setMap(fallbackPoster(meta, neb.color)));
        } else setMap(fallbackPoster(meta, neb.color));
      });

      // Nom de la nébuleuse, flottant au-dessus
      const el = document.createElement('button');
      el.className = 'gx-label';
      el.style.setProperty('--c', neb.color);
      el.innerHTML = `<span>${neb.label}</span><small>${count} titres</small>`;
      el.onclick = () => this.flyToNebula(ni);
      this.overlay.appendChild(el);
      this.labels.push(el);
    });
  }

  /** Ta constellation : tes titres reliés par un fil d'or, du plus récent au plus ancien */
  private buildConstellation(mine: MetaPreview[]) {
    const pts = mine.map((m) => this.stars.find((s) => s.meta.id === m.id)?.base).filter(Boolean) as THREE.Vector3[];
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(pts.length * 24));
    const mat = new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.constellation = new THREE.Line(geo, mat);
    this.constellation.computeLineDistances();
    this.scene.add(this.constellation);
  }

  // ---------- Caméra ----------
  /** Vol en douceur vers un point, à une distance donnée */
  flyTo(point: THREE.Vector3, dist: number, opts: { dur?: number; theta?: number; phi?: number; done?: () => void } = {}) {
    this.flight = {
      from: { t: this.target.clone(), d: this.dist, th: this.theta, ph: this.phi },
      to: { t: point.clone(), d: dist, th: opts.theta ?? this.theta, ph: opts.phi ?? Math.min(1.35, Math.max(0.55, this.phi)) },
      start: performance.now(),
      dur: opts.dur ?? 1600,
      done: opts.done,
    };
    whoosh();
  }

  flyToNebula(i: number) {
    this.autopilot = false;
    const c = this.nebulaCenters[i];
    const ang = Math.atan2(c.z, c.x);
    // On arrive de l'extérieur de la galaxie, face à la nébuleuse
    this.flyTo(c, 900, { theta: ang, phi: 1.12 });
  }

  overview() {
    this.autopilot = false;
    this.flyTo(new THREE.Vector3(), 3200, { phi: 0.72, dur: 2000 });
  }

  /** Cadre toute la constellation de l'utilisateur */
  showConstellation() {
    this.autopilot = false;
    const mine = this.stars.filter((s) => s.mine);
    if (!mine.length) return false;
    const box = new THREE.Box3().setFromPoints(mine.map((s) => s.base));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.flyTo(sphere.center, Math.max(380, sphere.radius * 2.4), { phi: 0.85, dur: 2000 });
    return true;
  }

  /** Va droit sur une affiche (recherche) */
  focusStar(id: string, open = false) {
    const s = this.stars.find((x) => x.meta.id === id);
    if (!s) return false;
    this.autopilot = false;
    this.flyTo(s.base, 150, { dur: 1700, done: open ? () => this.cb.onPick(s.meta) : undefined });
    s.phase = -10; // petite impulsion lumineuse à l'arrivée
    return true;
  }

  setAutopilot(on: boolean) {
    this.autopilot = on;
    this.autoNext = 0;
  }

  /** Pilote auto : visite une nébuleuse, s'approche d'une affiche, repart… */
  private autopilotStep(now: number) {
    if (!this.autopilot || this.flight || now < this.autoNext) return;
    const ni = Math.floor(Math.random() * this.nebulaCenters.length);
    const stars = this.stars.filter((s) => s.nebula === ni);
    const s = stars[Math.floor(Math.random() * stars.length)];
    const near = Math.random() < 0.55 && s;
    const point = near ? s.base : this.nebulaCenters[ni];
    this.flight = {
      from: { t: this.target.clone(), d: this.dist, th: this.theta, ph: this.phi },
      to: { t: point.clone(), d: near ? 230 : 950, th: this.theta + (Math.random() - 0.5) * 1.6, ph: 0.8 + Math.random() * 0.45 },
      start: now,
      dur: 5200,
    };
    this.autoNext = now + 5200 + 2600;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) { this.clock.getDelta(); }
  }

  // ---------- Interaction ----------
  private onDown = (e: PointerEvent) => {
    this.dragging = { x: e.clientX, y: e.clientY, moved: 0 };
    this.canvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!this.dragging) return;
    const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
    this.dragging.moved += Math.abs(dx) + Math.abs(dy);
    this.dragging.x = e.clientX; this.dragging.y = e.clientY;
    this.goalTheta -= dx * 0.0042;
    this.goalPhi = Math.min(1.5, Math.max(0.12, this.goalPhi - dy * 0.0036));
    this.flight = null;
    this.autopilot = false;
  };
  private onUp = (e: PointerEvent) => {
    const d = this.dragging;
    this.dragging = null;
    if (d && d.moved < 6 && this.hovered) {
      const s = this.hovered;
      this.autopilot = false;
      this.flyTo(s.base, 150, { dur: 1300, done: () => this.cb.onPick(s.meta) });
    }
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.flight = null;
    this.autopilot = false;
    // Zoom vers ce qui est sous la souris : la cible glisse un peu dans cette direction
    const k = Math.exp(e.deltaY * 0.0012);
    const next = Math.min(6500, Math.max(80, this.goalDist * k));
    if (k < 1 && this.hovered) this.goalTarget.lerp(this.hovered.base, 0.22);
    else if (k < 1) {
      this.ray.setFromCamera(this.mouse, this.camera);
      const p = this.ray.ray.at(this.goalDist * 0.5, new THREE.Vector3());
      this.goalTarget.lerp(p, 0.12);
    }
    this.goalDist = next;
  };
  private onDbl = () => this.overview();
  private onResize = () => this.resize();

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.onDbl);
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
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
    const t = (this.uniforms.time.value += dt);

    // Entrée : on fond vers la galaxie depuis l'espace lointain
    if (this.intro > 0) {
      this.intro = Math.max(0, 1 - (now - this.introStart) / 2600);
      const k = ease(1 - this.intro);
      this.dist = 9000 + (this.goalDist - 9000) * k;
      this.phi = 0.5 + (this.goalPhi - 0.5) * k;
      this.theta = this.goalTheta - (1 - k) * 1.2;
      this.camera.fov = 55 + this.intro * 35;
      this.camera.updateProjectionMatrix();
    } else if (this.flight) {
      const f = this.flight;
      const k = ease(Math.min(1, (now - f.start) / f.dur));
      this.target.lerpVectors(f.from.t, f.to.t, k);
      // Petit « saut » de recul au milieu du vol, pour l'effet de trajectoire
      const hop = Math.sin(k * Math.PI) * Math.min(900, f.from.t.distanceTo(f.to.t) * 0.35);
      this.dist = f.from.d + (f.to.d - f.from.d) * k + hop;
      this.theta = f.from.th + (f.to.th - f.from.th) * k;
      this.phi = f.from.ph + (f.to.ph - f.from.ph) * k;
      this.goalTarget.copy(this.target); this.goalDist = f.to.d; this.goalTheta = this.theta; this.goalPhi = this.phi;
      if (k >= 1) { this.flight = null; f.done?.(); }
    } else {
      this.target.lerp(this.goalTarget, 0.08);
      this.dist += (this.goalDist - this.dist) * 0.09;
      this.theta += (this.goalTheta - this.theta) * 0.1;
      this.phi += (this.goalPhi - this.phi) * 0.1;
      // Lente dérive quand on ne touche à rien
      if (!this.dragging && !this.autopilot) this.goalTheta += dt * 0.012;
    }
    this.autopilotStep(now);

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.dist * sp * Math.cos(this.theta),
      this.target.y + this.dist * Math.cos(this.phi),
      this.target.z + this.dist * sp * Math.sin(this.theta),
    );
    this.camera.lookAt(this.target);

    // Nébuleuses qui tournent doucement sur elles-mêmes
    this.nebulaGroups.forEach((g, i) => { g.rotation.y = t * (0.02 + (i % 3) * 0.008); });

    // Affiches : face à la caméra, flottement, survol
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.dragging ? null : this.ray.intersectObjects(this.posterMeshes, false)[0];
    const hov = (hit?.object.userData.star as StarObj) || null;
    if (hov !== this.hovered) {
      this.hovered = hov;
      this.canvas.style.cursor = hov ? 'pointer' : 'grab';
      this.cb.onHover(hov ? hov.meta : null, hov ? this.nebulae[hov.nebula] : undefined);
    }
    const camQ = this.camera.quaternion;
    for (const s of this.stars) {
      const m = s.mesh;
      const mat = m.material as THREE.ShaderMaterial;
      const isH = s === this.hovered;
      s.phase += dt;
      const bob = Math.sin(t * 0.8 + s.phase) * 3;
      m.position.set(s.base.x, s.base.y + bob, s.base.z);
      m.quaternion.copy(camQ);
      const want = s.scale * (isH ? 1.9 : 1);
      const cur = m.scale.x + (want - m.scale.x) * Math.min(1, dt * 9);
      m.scale.setScalar(cur);
      mat.uniforms.hover.value += ((isH ? 1 : 0) - mat.uniforms.hover.value) * Math.min(1, dt * 9);
      // Apparition en fondu une fois l'affiche chargée (≈ 0,6 s)
      const ready = mat.uniforms.map.value ? 1 : 0;
      mat.uniforms.fade.value = Math.min(ready, mat.uniforms.fade.value + dt * 1.7);
      mat.transparent = mat.uniforms.fade.value < 1;
      s.glow.position.copy(m.position);
      const pulse = s.phase < 0 ? 2.5 : 1; // impulsion après une recherche
      const go = (s.mine ? 0.5 : 0.12) * (isH ? 3 : 1) * pulse * mat.uniforms.fade.value;
      const gm = s.glow.material as THREE.SpriteMaterial;
      gm.opacity += (go - gm.opacity) * 0.12;
      s.glow.scale.setScalar(POSTER_W * 2.4 * cur);
    }
    if (this.constellation) (this.constellation.material as THREE.LineDashedMaterial).opacity = 0.55 + Math.sin(t * 2) * 0.3;

    this.shootingStars(dt);
    this.placeLabels();
    this.composer.render();
  };

  /** Étoiles filantes de temps en temps */
  private shootingStars(dt: number) {
    this.nextShoot -= dt;
    if (this.nextShoot <= 0) {
      this.nextShoot = 2.5 + Math.random() * 5;
      const start = this.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6000, 1200 + Math.random() * 1500, (Math.random() - 0.5) * 6000));
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.6 - Math.random() * 0.5, (Math.random() - 0.5) * 2).normalize();
      const geo = new THREE.BufferGeometry().setFromPoints([start, start.clone().addScaledVector(dir, -500)]);
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(line);
      this.shooting.push({ line, life: 1.4, dir });
    }
    this.shooting = this.shooting.filter((s) => {
      s.life -= dt;
      s.line.position.addScaledVector(s.dir, dt * 4200);
      (s.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, s.life / 1.4);
      if (s.life > 0) return true;
      this.scene.remove(s.line);
      s.line.geometry.dispose();
      (s.line.material as THREE.Material).dispose();
      return false;
    });
  }

  /** Les noms des nébuleuses suivent leur position à l'écran */
  private placeLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    let nearest = -1, nd = Infinity;
    this.nebulaCenters.forEach((c, i) => {
      const el = this.labels[i];
      v.copy(c).add(new THREE.Vector3(0, 320, 0)).project(this.camera);
      const d = this.camera.position.distanceTo(c);
      if (d < nd) { nd = d; nearest = i; }
      const sy = ((1 - v.y) / 2) * h;
      // Pas de nom sous la barre du haut
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && sy > 90 && sy < h - 110 && d > 260;
      el.style.opacity = visible && this.intro < 0.3 ? String(Math.min(1, Math.max(0.25, 2600 / d))) : '0';
      el.style.pointerEvents = visible ? 'auto' : 'none';
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) scale(${Math.min(1.15, Math.max(0.7, 1400 / d))})`;
    });
    this.cb.onNear?.(nd < 900 && nearest >= 0 ? this.nebulae[nearest].label : null);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDbl);
    window.removeEventListener('resize', this.onResize);
    this.labels.forEach((l) => l.remove());
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

// ---------- Son : un « whoosh » de vaisseau à chaque vol ----------
let audio: AudioContext | null = null;
let lastWhoosh = 0;
function whoosh() {
  const now = performance.now();
  if (now - lastWhoosh < 400) return;
  lastWhoosh = now;
  try {
    audio ||= new AudioContext();
    const ctx = audio, t = ctx.currentTime;
    const len = 1.4;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(220, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + len * 0.45);
    f.frequency.exponentialRampToValueAtTime(300, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + len * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + len);
  } catch {}
}
