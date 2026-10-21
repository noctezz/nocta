// La Galaxie en 3D (three.js) : un système planétaire. Chaque genre est une planète (surface
// dessinée en temps réel : gaz, continents, lave, glace…) autour de laquelle tournent ses films
// et séries en anneaux d'affiches. Au centre, un soleil ; autour, orbites, ceinture
// d'astéroïdes, lunes, comètes, nébuleuses lointaines. Ta planète dorée porte tes titres.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { MetaPreview } from './types';
import type { Nebula, PlanetKind } from './galaxy';

interface StarObj {
  meta: MetaPreview;
  nebula: number;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  phase: number;
  mine: boolean;
  scale: number;
  ring: THREE.Group;
}

interface Planet {
  pivot: THREE.Group; // tourne autour du soleil
  body: THREE.Group; // la planète et ses anneaux
  sphere: THREE.Mesh;
  radius: number;
  orbitR: number;
  speed: number;
  spin: number;
  rings: { group: THREE.Group; speed: number }[];
  moons: { pivot: THREE.Group; speed: number }[];
  mat: THREE.ShaderMaterial;
  label: HTMLElement;
}

export interface GalaxyCallbacks {
  /** Survol d'une affiche (null : plus rien) */
  onHover: (meta: MetaPreview | null, nebula?: Nebula) => void;
  /** Clic sur une affiche : la caméra est arrivée devant */
  onPick: (meta: MetaPreview) => void;
  /** Planète la plus proche de la caméra (pour l'affichage) */
  onNear?: (label: string | null) => void;
}

const POSTER_W = 40;
const POSTER_H = 60;
const KINDS: Record<PlanetKind, number> = { gas: 0, rock: 1, lava: 2, ice: 3, toxic: 4, ocean: 5 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Bruit 3D (simplex, Ashima Arts) et fBm, partagés par les surfaces de planètes et le soleil
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float f=0.0, a=0.5; for(int i=0;i<5;i++){ f+=a*snoise(p); p*=2.03; a*=0.5; } return f*0.5+0.5; }
`;

/** Surface de planète dessinée par le GPU, éclairée par le soleil (au centre du système) */
function planetMaterial(n: Nebula, seed: number) {
  const [a, b, c] = n.palette.map((x) => new THREE.Color(x));
  return new THREE.ShaderMaterial({
    uniforms: { c1: { value: a }, c2: { value: b }, c3: { value: c }, kind: { value: KINDS[n.kind] }, time: { value: 0 }, seed: { value: seed } },
    vertexShader: `
      varying vec3 vP; varying vec3 vN; varying vec3 vW;
      void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform float kind; uniform float time; uniform float seed;
      varying vec3 vP; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        vec3 n0 = normalize(vP);
        vec3 p = n0 * 1.6 + seed;
        vec3 col; vec3 glow = vec3(0.0); float spec = 0.0;
        if (kind < 0.5) {
          // Géante gazeuse : bandes tourbillonnantes et tempêtes
          float w = fbm(p * 1.2 + vec3(time * 0.02, 0.0, 0.0));
          float band = sin((n0.y * 9.0 + w * 3.2) * 1.4) * 0.5 + 0.5;
          float storm = smoothstep(0.72, 0.9, fbm(p * 3.0 + time * 0.01));
          col = mix(mix(c1, c2, band), c3, smoothstep(0.55, 1.0, band * w * 1.6));
          col = mix(col, c3 * 1.1, storm * 0.6);
        } else if (kind < 1.5 || kind > 4.5) {
          // Continents et océans (ou monde océan), avec nuages et calottes
          float h = fbm(p * 1.4);
          float sea = kind > 4.5 ? 0.62 : 0.5;
          float land = smoothstep(sea - 0.02, sea + 0.02, h);
          vec3 ocean = mix(c1 * 0.7, c1 * 1.3, smoothstep(0.2, sea, h));
          vec3 ground = mix(c2, c3, smoothstep(sea + 0.05, 0.85, h));
          col = mix(ocean, ground, land);
          spec = (1.0 - land) * 0.6;
          float cl = smoothstep(0.55, 0.75, fbm(p * 2.2 + vec3(time * 0.015, time * 0.01, 0.0)));
          col = mix(col, vec3(1.0), cl * 0.75);
          col = mix(col, vec3(0.95), smoothstep(0.82, 0.95, abs(n0.y)) * 0.8);
        } else if (kind < 2.5) {
          // Lave : roche sombre, fissures incandescentes qui pulsent
          float f = fbm(p * 2.0);
          float crack = pow(1.0 - abs(fbm(p * 3.5 + f) * 2.0 - 1.0), 7.0);
          col = mix(c1, c1 * 2.2, f);
          glow = c3 * crack * (1.6 + 0.6 * sin(time * 1.5 + f * 10.0)) + c2 * pow(crack, 0.5) * 0.25;
        } else if (kind < 3.5) {
          // Glace : plaques claires, crevasses bleues
          float f = fbm(p * 2.4);
          float crack = pow(1.0 - abs(snoise(p * 4.0)), 12.0);
          col = mix(c3, c2, smoothstep(0.35, 0.75, f));
          col = mix(col, c1, crack * 0.8);
          spec = 0.5;
        } else {
          // Monde toxique : marbrures et lueurs
          float f = fbm(p * 1.8 + vec3(0.0, time * 0.02, 0.0));
          float g = fbm(p * 3.0 - f);
          col = mix(c1, c2, f);
          glow = c3 * smoothstep(0.62, 0.8, g) * 0.9;
        }
        vec3 L = normalize(-vW);
        vec3 V = normalize(cameraPosition - vW);
        float d = max(dot(vN, L), 0.0);
        float lit = 0.07 + d * 1.15;
        float s = pow(max(dot(reflect(-L, vN), V), 0.0), 24.0) * spec * d;
        gl_FragColor = vec4(col * lit + s + glow * (0.35 + 0.65 * (1.0 - d)), 1.0);
      }`,
  });
}

/** Atmosphère : halo lumineux sur le bord, plus fort côté jour */
function atmosphereMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform vec3 color; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(vN, V), 0.0), 3.0);
        float day = 0.25 + 0.75 * max(dot(vN, normalize(-vW)), 0.0);
        gl_FragColor = vec4(color * rim * day * 1.8, rim * day);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** Anneau façon Saturne : bandes fines et translucides */
function ringMaterial(color: string, inner: number, outer: number) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, inner: { value: inner }, outer: { value: outer } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 color; uniform float inner; uniform float outer; varying vec3 vP;
      float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      void main(){
        float r = (length(vP.xy) - inner) / (outer - inner);
        float bands = 0.55 + 0.45 * sin(r * 70.0) * sin(r * 23.0 + 1.3);
        float gaps = smoothstep(0.0, 0.03, abs(r - 0.62)) * smoothstep(0.0, 0.02, abs(r - 0.3));
        float a = bands * gaps * smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r) * 0.55;
        gl_FragColor = vec4(mix(color, vec3(1.0), 0.35) * (0.6 + 0.4 * h(floor(r * 80.0))), a);
      }`,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

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

/** Affiche de secours (image indisponible) : titre sur un dégradé de la couleur de la planète */
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

/** Bord arrondi + liseré lumineux pour les affiches */
function posterMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null as THREE.Texture | null }, tint: { value: color }, hover: { value: 0 }, fade: { value: 0 } },
    transparent: true,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D map; uniform vec3 tint; uniform float hover; uniform float fade; varying vec2 vUv;
      float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.5);
        float d = rbox(p, vec2(0.5, 0.75), 0.06);
        if (d > 0.0) discard;
        vec3 col = texture2D(map, vUv).rgb;
        float edge = smoothstep(-0.035, 0.0, d);
        col = mix(col, tint * 1.6, edge * (0.55 + hover * 0.45));
        col *= 0.85 + hover * 0.25;
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
  private planets: Planet[] = [];
  private uniforms = { time: { value: 0 }, pixel: { value: 1 } };
  private ray = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-9, -9);
  private hovered: StarObj | null = null;
  private loader = new THREE.TextureLoader();
  private textures: THREE.Texture[] = [];
  private comets: { group: THREE.Group; vel: THREE.Vector3; life: number }[] = [];
  private nextComet = 3;
  private asteroids: THREE.InstancedMesh | null = null;
  private sunCore!: THREE.Sprite;
  // Caméra en orbite autour d'une cible (angles, distance), avec amorti ; elle peut suivre un objet qui bouge
  private target = new THREE.Vector3();
  private goalTarget = new THREE.Vector3();
  private follow: THREE.Object3D | null = null;
  private theta = 0.6; private phi = 1.05; private dist = 7000;
  private goalTheta = 0.6; private goalPhi = 1.0; private goalDist = 7000;
  private flight: { from: { t: THREE.Vector3; d: number; th: number; ph: number }; to: { obj?: THREE.Object3D; t: THREE.Vector3; d: number; th: number; ph: number }; start: number; dur: number; done?: () => void } | null = null;
  private dragging: { x: number; y: number; moved: number; star: StarObj | null } | null = null;
  private autopilot = false;
  private autoNext = 0;
  private paused = false;
  private disposed = false;
  private intro = 1;
  private introStart = performance.now();
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  constructor(private canvas: HTMLCanvasElement, private overlay: HTMLElement, private nebulae: Nebula[], mine: MetaPreview[], private cb: GalaxyCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x020107, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.uniforms.pixel.value = this.renderer.getPixelRatio();
    this.camera = new THREE.PerspectiveCamera(55, 1, 2, 80000);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.55, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Lumière du soleil pour les lunes et les astéroïdes
    this.scene.add(new THREE.AmbientLight(0x404060, 0.6));
    this.scene.add(new THREE.PointLight(0xfff0dd, 3.2, 0, 0));

    this.buildBackground();
    this.buildSun();
    this.buildPlanets(new Set(mine.map((m) => m.id)));
    this.buildAsteroids();
    this.bindEvents();
    this.resize();
    this.dist = 18000; this.phi = 0.45;
    this.introStart = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- Construction ----------
  private points(count: number, fill: (i: number, pos: Float32Array, col: Float32Array, size: Float32Array) => void, opts: { twinkle?: boolean; map?: THREE.Texture } = {}) {
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
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  /** Ciel : étoiles lointaines qui scintillent, voie lactée, nébuleuses colorées à l'horizon */
  private buildBackground() {
    this.scene.add(this.points(8000, (i, p, c, s) => {
      const r = 26000 + Math.random() * 14000, u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const k = Math.sqrt(1 - u * u);
      p.set([r * k * Math.cos(a), r * u, r * k * Math.sin(a)], i * 3);
      const w = 0.5 + Math.random() * 0.5, tint = Math.random();
      c.set(tint < 0.15 ? [w, w * 0.8, w * 0.7] : tint < 0.3 ? [w * 0.75, w * 0.85, w] : [w, w, w], i * 3);
      s[i] = 12 + Math.random() * 30;
    }, { twinkle: true }));
    const mw = new THREE.Color('#c9b8ff');
    this.scene.add(this.points(9000, (i, p, c, s) => {
      const a = Math.random() * Math.PI * 2, r = 30000;
      const off = (Math.random() + Math.random() + Math.random() - 1.5) * 3200;
      p.set([Math.cos(a) * r, off + Math.sin(a * 2) * 1800, Math.sin(a) * r], i * 3);
      const b = 0.05 + Math.random() * 0.12;
      c.set([mw.r * b, mw.g * b, mw.b * b], i * 3);
      s[i] = 50 + Math.random() * 140;
    }));
    const tex = softDot(256);
    ([['#5a2dff', 0.5], ['#ff2d7a', 1.9], ['#14b8c9', 3.4], ['#ff8a1f', 4.6]] as const).forEach(([col, a]) => {
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false }));
        const ang = a + (Math.random() - 0.5) * 0.5;
        sp.position.set(Math.cos(ang) * 22000, (Math.random() - 0.3) * 7000, Math.sin(ang) * 22000);
        sp.scale.setScalar(6000 + Math.random() * 7000);
        this.scene.add(sp);
      }
    });
  }

  /** Le soleil : surface en fusion, halo, couronne */
  private buildSun() {
    const sunMat = new THREE.ShaderMaterial({
      uniforms: { time: this.uniforms.time },
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float time; varying vec3 vP; varying vec3 vN; varying vec3 vW; ${NOISE}
        void main(){
          float f = fbm(normalize(vP) * 3.0 + vec3(time * 0.05));
          float g = fbm(normalize(vP) * 7.0 - vec3(time * 0.08));
          vec3 col = mix(vec3(1.0, 0.5, 0.12), vec3(1.0, 0.95, 0.75), f * 0.7 + g * 0.5);
          float rim = pow(1.0 - max(dot(vN, normalize(cameraPosition - vW)), 0.0), 2.0);
          gl_FragColor = vec4(col * (1.5 + rim * 1.2), 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(280, 64, 64), sunMat));
    const tex = softDot(256);
    this.sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffc77a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sunCore.scale.setScalar(1600);
    this.scene.add(this.sunCore);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff8a3d, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(4600);
    this.scene.add(halo);
  }

  /** Les planètes, leurs anneaux d'affiches, leurs lunes */
  private buildPlanets(mine: Set<string>) {
    const glowTex = softDot(128, 0.2);
    let orbit = 900;
    this.nebulae.forEach((neb, ni) => {
      const isMinePlanet = neb.genre === 'mine';
      const radius = isMinePlanet ? 110 : 130 + ((ni * 37) % 5) * 22;
      const ringR1 = radius + 190, ringR2 = radius + 290;
      let orbitR: number;
      if (isMinePlanet) orbitR = 900;
      else { orbit += ringR2 * 2 + 260; orbitR = orbit; }
      const pivot = new THREE.Group();
      pivot.rotation.y = (ni * 2.399) % (Math.PI * 2);
      pivot.rotation.z = (((ni * 7) % 5) - 2) * 0.025;
      this.scene.add(pivot);
      const body = new THREE.Group();
      body.position.set(orbitR, 0, 0);
      pivot.add(body);

      // Ligne d'orbite
      const orb = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => new THREE.Vector3(Math.cos((i / 256) * Math.PI * 2) * orbitR, 0, Math.sin((i / 256) * Math.PI * 2) * orbitR))),
        new THREE.LineBasicMaterial({ color: neb.color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pivot.add(orb);

      // La planète, inclinée, qui tourne sur elle-même, avec son atmosphère
      const tilt = new THREE.Group();
      tilt.rotation.z = 0.15 + ((ni * 13) % 7) * 0.06;
      body.add(tilt);
      const mat = planetMaterial(neb, ni * 3.7);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 96), mat);
      tilt.add(sphere);
      tilt.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 64, 64), atmosphereMaterial(neb.color)));
      if (neb.ring) {
        const inner = radius * 1.35, outer = radius * 2.1;
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), ringMaterial(neb.palette[2], inner, outer));
        ring.rotation.x = Math.PI / 2;
        tilt.add(ring);
      }
      // Halo : la planète reste repérable de loin
      const far = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: neb.color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      far.scale.setScalar(radius * 6);
      body.add(far);

      // Lunes
      const moons: Planet['moons'] = [];
      const moonCount = isMinePlanet ? 0 : 1 + (ni % 3);
      for (let m = 0; m < moonCount; m++) {
        const mp = new THREE.Group();
        mp.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
        const moon = new THREE.Mesh(new THREE.SphereGeometry(12 + Math.random() * 14, 32, 32), new THREE.MeshStandardMaterial({ color: 0xb8b2c8, roughness: 1 }));
        moon.position.set(ringR2 + 70 + m * 45, 0, 0);
        mp.add(moon);
        body.add(mp);
        moons.push({ pivot: mp, speed: 0.08 + Math.random() * 0.1 });
      }

      // Anneaux d'affiches : films (intérieur) et séries (extérieur), sur deux plans inclinés
      const rings: Planet['rings'] = [];
      const color = new THREE.Color(neb.color);
      const films = neb.stars.filter((s) => s.type !== 'series');
      const shows = neb.stars.filter((s) => s.type === 'series');
      const groups: [MetaPreview[], number, number][] = isMinePlanet ? [[neb.stars, ringR1 + 20, 0.25]] : [[films, ringR1, 0.3], [shows, ringR2, -0.42]];
      groups.forEach(([items, R, inc], gi) => {
        if (!items.length) return;
        const group = new THREE.Group();
        group.rotation.x = inc;
        group.rotation.z = gi ? 0.25 : -0.15;
        body.add(group);
        rings.push({ group, speed: (gi ? -1 : 1) * (0.025 + Math.random() * 0.015) });
        items.forEach((meta, si) => {
          const a = (si / items.length) * Math.PI * 2;
          const isMine = isMinePlanet || mine.has(meta.id);
          const pm = posterMaterial(isMine ? new THREE.Color('#ffd166') : color);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W, POSTER_H), pm);
          mesh.position.set(Math.cos(a) * R, Math.sin(si * 2.1) * 14, Math.sin(a) * R);
          const scale = isMine ? 1.3 : 1;
          mesh.scale.setScalar(scale);
          group.add(mesh);
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: isMine ? 0xffd166 : color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }));
          glow.position.copy(mesh.position);
          glow.scale.setScalar(POSTER_W * 2.4 * scale);
          group.add(glow);
          const star: StarObj = { meta, nebula: ni, mesh, glow, phase: Math.random() * Math.PI * 2, mine: isMine, scale, ring: group };
          mesh.userData.star = star;
          this.stars.push(star);
          this.posterMeshes.push(mesh);
          const setMap = (t: THREE.Texture) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; pm.uniforms.map.value = t; this.textures.push(t); };
          if (meta.poster) {
            this.loader.setCrossOrigin('anonymous');
            this.loader.load(meta.poster, setMap, undefined, () => setMap(fallbackPoster(meta, neb.color)));
          } else setMap(fallbackPoster(meta, neb.color));
        });
      });

      // Nom de la planète
      const el = document.createElement('button');
      el.className = `gx-label ${isMinePlanet ? 'is-mine' : ''}`;
      el.style.setProperty('--c', neb.color);
      el.innerHTML = `<span>${neb.label}</span><small>${isMinePlanet ? `${neb.stars.length} titres à toi` : `${films.length} films · ${shows.length} séries`}</small>`;
      el.onclick = () => this.flyToNebula(ni);
      this.overlay.appendChild(el);

      this.planets.push({
        pivot, body, sphere, radius, orbitR,
        speed: 0.004 * Math.pow(900 / orbitR, 0.7),
        spin: 0.05 + Math.random() * 0.05,
        rings, moons, mat, label: el,
      });
    });
  }

  /** Ceinture d'astéroïdes, au milieu du système */
  private buildAsteroids() {
    const sorted = this.planets.map((p) => p.orbitR).sort((a, b) => a - b);
    const k = Math.floor(sorted.length / 2);
    const mid = sorted.length > 3 ? (sorted[k - 1] + sorted[k]) / 2 : 3000;
    const count = 1600;
    const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xa79fb3, emissive: 0x2a2433, roughness: 1, flatShading: true }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = mid + (Math.random() + Math.random() - 1) * 170;
      p.set(Math.cos(a) * r, (Math.random() - 0.5) * 60, Math.sin(a) * r);
      e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      q.setFromEuler(e);
      const s = 2 + Math.pow(Math.random(), 4) * 9;
      sc.set(s, s * (0.6 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.6));
      inst.setMatrixAt(i, m.compose(p, q, sc));
    }
    this.asteroids = inst;
    this.scene.add(inst);
  }

  // ---------- Caméra ----------
  /** Vol en douceur vers un point (ou un objet qui bouge, que la caméra suit ensuite) */
  flyTo(point: THREE.Vector3 | THREE.Object3D, dist: number, opts: { dur?: number; theta?: number; phi?: number; done?: () => void } = {}) {
    const obj = point instanceof THREE.Object3D ? point : undefined;
    const t = obj ? obj.getWorldPosition(new THREE.Vector3()) : (point as THREE.Vector3).clone();
    this.follow = obj || null;
    this.flight = {
      from: { t: this.target.clone(), d: this.dist, th: this.theta, ph: this.phi },
      to: { obj, t, d: dist, th: opts.theta ?? this.theta, ph: opts.phi ?? Math.min(1.35, Math.max(0.55, this.phi)) },
      start: performance.now(),
      dur: opts.dur ?? 1700,
      done: opts.done,
    };
    whoosh();
  }

  /** Vol vers une planète (index dans la liste des genres) */
  flyToNebula(i: number) {
    this.autopilot = false;
    const p = this.planets[i];
    if (!p) return;
    const w = p.body.getWorldPosition(new THREE.Vector3());
    // Arrivée côté jour, un peu au-dessus des anneaux
    this.flyTo(p.body, p.radius * 4.2 + 520, { theta: Math.atan2(w.z, w.x) - 0.5, phi: 1.12, dur: 2400 });
  }

  overview() {
    this.autopilot = false;
    this.flyTo(new THREE.Vector3(), 9000, { phi: 0.6, dur: 2400 });
  }

  /** Ta planète dorée */
  showConstellation() {
    const i = this.nebulae.findIndex((n) => n.genre === 'mine');
    if (i < 0) return false;
    this.flyToNebula(i);
    return true;
  }

  /** Va droit sur une affiche (recherche) */
  focusStar(id: string, open = false) {
    const s = this.stars.find((x) => x.meta.id === id);
    if (!s) return false;
    this.autopilot = false;
    this.flyTo(s.mesh, 150, { dur: 2200, done: open ? () => this.cb.onPick(s.meta) : undefined });
    s.phase = -10;
    return true;
  }

  setAutopilot(on: boolean) {
    this.autopilot = on;
    this.autoNext = 0;
  }

  /** Pilote auto : visite une planète, frôle ses affiches, repart vers une autre */
  private autopilotStep(now: number) {
    if (!this.autopilot || this.flight || now < this.autoNext) return;
    const pi = Math.floor(Math.random() * this.planets.length);
    const p = this.planets[pi];
    const stars = this.stars.filter((s) => s.nebula === pi);
    const s = stars[Math.floor(Math.random() * stars.length)];
    const near = Math.random() < 0.5 && s;
    const obj = near ? s.mesh : p.body;
    this.follow = obj;
    this.flight = {
      from: { t: this.target.clone(), d: this.dist, th: this.theta, ph: this.phi },
      to: { obj, t: obj.getWorldPosition(new THREE.Vector3()), d: near ? 280 : p.radius * 4.2 + 520, th: this.theta + (Math.random() - 0.5) * 1.8, ph: 0.8 + Math.random() * 0.45 },
      start: now,
      dur: 6500,
    };
    this.autoNext = now + 6500 + 3500;
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.clock.getDelta();
  }

  // ---------- Interaction ----------
  private onDown = (e: PointerEvent) => {
    // L'affiche visée au moment où on appuie : c'est elle qu'on ouvrira au relâchement
    this.dragging = { x: e.clientX, y: e.clientY, moved: 0, star: this.pick(e) || this.hovered };
    this.canvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!this.dragging) return;
    const dx = e.clientX - this.dragging.x, dy = e.clientY - this.dragging.y;
    this.dragging.moved += Math.abs(dx) + Math.abs(dy);
    this.dragging.x = e.clientX; this.dragging.y = e.clientY;
    if (this.dragging.moved < 8) return;
    this.goalTheta -= dx * 0.0042;
    this.goalPhi = Math.min(1.5, Math.max(0.12, this.goalPhi - dy * 0.0036));
    this.flight = null;
    this.autopilot = false;
  };
  private onUp = (e: PointerEvent) => {
    const d = this.dragging;
    this.dragging = null;
    if (d && d.moved < 8 && d.star) {
      const s = d.star;
      this.autopilot = false;
      const w = s.mesh.getWorldPosition(new THREE.Vector3());
      // Déjà tout près : la fiche s'ouvre directement ; sinon on y vole d'abord
      if (this.camera.position.distanceTo(w) < 340) { this.follow = s.mesh; this.cb.onPick(s.meta); }
      else this.flyTo(s.mesh, 150, { dur: 1400, done: () => this.cb.onPick(s.meta) });
    }
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
  };

  /** Affiche sous le pointeur, calculée tout de suite (sans attendre l'image suivante) */
  private pick(e: PointerEvent): StarObj | null {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    return (this.ray.intersectObjects(this.posterMeshes, false)[0]?.object.userData.star as StarObj) || null;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.flight = null;
    this.autopilot = false;
    const k = Math.exp(e.deltaY * 0.0012);
    // On plonge vers l'affiche visée : elle devient le centre de rotation
    if (k < 1 && this.hovered) this.follow = this.hovered.mesh;
    else if (k < 1 && !this.follow) {
      this.ray.setFromCamera(this.mouse, this.camera);
      this.goalTarget.lerp(this.ray.ray.at(this.goalDist * 0.5, new THREE.Vector3()), 0.12);
    }
    this.goalDist = Math.min(20000, Math.max(80, this.goalDist * k));
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

    // Le système vit : orbites, rotations, anneaux, lunes
    for (const p of this.planets) {
      p.pivot.rotation.y += p.speed * dt;
      p.sphere.rotation.y += p.spin * dt;
      p.mat.uniforms.time.value = t;
      for (const r of p.rings) r.group.rotation.y += r.speed * dt;
      for (const m of p.moons) m.pivot.rotation.y += m.speed * dt;
    }
    if (this.asteroids) this.asteroids.rotation.y += dt * 0.006;
    this.scene.updateMatrixWorld();

    // Caméra : suit l'objet visé (les planètes bougent)
    if (this.follow) this.follow.getWorldPosition(this.goalTarget);
    if (this.intro > 0) {
      this.intro = Math.max(0, 1 - (now - this.introStart) / 3200);
      const k = ease(1 - this.intro);
      this.dist = 18000 + (this.goalDist - 18000) * k;
      this.phi = 0.45 + (this.goalPhi - 0.45) * k;
      this.theta = this.goalTheta - (1 - k) * 1.4;
      this.camera.fov = 55 + this.intro * 40;
      this.camera.updateProjectionMatrix();
    } else if (this.flight) {
      const f = this.flight;
      if (f.to.obj) f.to.obj.getWorldPosition(f.to.t);
      const k = ease(Math.min(1, (now - f.start) / f.dur));
      this.target.lerpVectors(f.from.t, f.to.t, k);
      const hop = Math.sin(k * Math.PI) * Math.min(1600, f.from.t.distanceTo(f.to.t) * 0.3);
      this.dist = f.from.d + (f.to.d - f.from.d) * k + hop;
      this.theta = f.from.th + (f.to.th - f.from.th) * k;
      this.phi = f.from.ph + (f.to.ph - f.from.ph) * k;
      this.goalTarget.copy(this.target); this.goalDist = f.to.d; this.goalTheta = this.theta; this.goalPhi = this.phi;
      if (k >= 1) { this.flight = null; f.done?.(); }
    } else {
      this.target.lerp(this.goalTarget, this.follow ? 0.3 : 0.08);
      this.dist += (this.goalDist - this.dist) * 0.09;
      this.theta += (this.goalTheta - this.theta) * 0.1;
      this.phi += (this.goalPhi - this.phi) * 0.1;
      if (!this.dragging && !this.autopilot && !this.follow) this.goalTheta += dt * 0.01;
    }
    this.autopilotStep(now);

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.dist * sp * Math.cos(this.theta),
      this.target.y + this.dist * Math.cos(this.phi),
      this.target.z + this.dist * sp * Math.sin(this.theta),
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.sunCore.material.opacity = 0.72 + Math.sin(t * 1.3) * 0.08;

    // Affiches : face à la caméra, survol, apparition
    this.ray.setFromCamera(this.mouse, this.camera);
    const dragMoved = !!this.dragging && this.dragging.moved >= 8;
    const hit = dragMoved ? null : this.ray.intersectObjects(this.posterMeshes, false)[0];
    const hov = (hit?.object.userData.star as StarObj) || null;
    if (hov !== this.hovered) {
      this.hovered = hov;
      this.canvas.style.cursor = hov ? 'pointer' : 'grab';
      this.cb.onHover(hov ? hov.meta : null, hov ? this.nebulae[hov.nebula] : undefined);
    }
    const camQ = this.camera.quaternion;
    let lastRing: THREE.Group | null = null;
    const inv = this.tmpQ;
    for (const s of this.stars) {
      const m = s.mesh;
      const mat = m.material as THREE.ShaderMaterial;
      const isH = s === this.hovered;
      // L'affiche fait face à la caméra, quelle que soit l'orientation de son anneau
      if (s.ring !== lastRing) { s.ring.getWorldQuaternion(inv).invert(); lastRing = s.ring; }
      m.quaternion.copy(inv).multiply(camQ);
      s.phase += dt;
      const want = s.scale * (isH ? 1.9 : 1);
      const cur = m.scale.x + (want - m.scale.x) * Math.min(1, dt * 9);
      m.scale.setScalar(cur);
      mat.uniforms.hover.value += ((isH ? 1 : 0) - mat.uniforms.hover.value) * Math.min(1, dt * 9);
      const ready = mat.uniforms.map.value ? 1 : 0;
      mat.uniforms.fade.value = Math.min(ready, mat.uniforms.fade.value + dt * 1.7);
      mat.transparent = mat.uniforms.fade.value < 1;
      s.glow.position.copy(m.position);
      const pulse = s.phase < 0 ? 2.5 : 1;
      const go = (s.mine ? 0.5 : 0.1) * (isH ? 3.2 : 1) * pulse * mat.uniforms.fade.value;
      const gm = s.glow.material as THREE.SpriteMaterial;
      gm.opacity += (go - gm.opacity) * Math.min(1, dt * 7);
      s.glow.scale.setScalar(POSTER_W * 2.4 * cur);
    }

    this.cometsStep(dt);
    this.placeLabels();
    this.composer.render();
  };

  /** Comètes : une tête brillante et une longue traîne qui traversent le système */
  private cometsStep(dt: number) {
    this.nextComet -= dt;
    if (this.nextComet <= 0) {
      this.nextComet = 5 + Math.random() * 8;
      const group = new THREE.Group();
      const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).normalize();
      group.position.copy(dir.clone().multiplyScalar(-12000).add(new THREE.Vector3((Math.random() - 0.5) * 5000, (Math.random() - 0.5) * 1800, (Math.random() - 0.5) * 5000)));
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(64, 0.3), color: 0xd9f1ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      head.scale.setScalar(160);
      group.add(head);
      group.add(this.points(160, (i, p, c, s) => {
        const k = i / 160;
        p.set([-dir.x * k * 1600 + (Math.random() - 0.5) * 40 * k, -dir.y * k * 1600 + (Math.random() - 0.5) * 40 * k, -dir.z * k * 1600 + (Math.random() - 0.5) * 40 * k], i * 3);
        const b = (1 - k) * 0.7;
        c.set([0.7 * b, 0.9 * b, b], i * 3);
        s[i] = 46 * (1 - k) + 6;
      }));
      this.scene.add(group);
      this.comets.push({ group, vel: dir.multiplyScalar(3000), life: 8 });
    }
    this.comets = this.comets.filter((c) => {
      c.life -= dt;
      c.group.position.addScaledVector(c.vel, dt);
      if (c.life > 0) return true;
      this.scene.remove(c.group);
      c.group.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.(); });
      return false;
    });
  }

  /** Les noms des planètes suivent leur position à l'écran */
  private placeLabels() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = this.tmpV;
    let nearest = -1, nd = Infinity;
    this.planets.forEach((p, i) => {
      const el = p.label;
      p.body.getWorldPosition(v);
      const d = this.camera.position.distanceTo(v);
      if (d < nd) { nd = d; nearest = i; }
      v.y += p.radius * 1.4 + 40;
      v.project(this.camera);
      const sx = ((v.x + 1) / 2) * w, sy = ((1 - v.y) / 2) * h;
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && sy > 90 && sy < h - 110 && this.intro < 0.25 && d > p.radius * 2.5;
      el.style.opacity = visible ? String(Math.min(1, Math.max(0.4, 7000 / d))) : '0';
      el.style.pointerEvents = visible ? 'auto' : 'none';
      el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px) scale(${Math.min(1.1, Math.max(0.72, 3500 / d))})`;
    });
    this.cb.onNear?.(nearest >= 0 && nd < this.planets[nearest].radius * 8 + 800 ? this.nebulae[nearest].label : null);
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
    this.planets.forEach((p) => p.label.remove());
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
