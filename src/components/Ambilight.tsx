import { useEffect, useRef, useState } from 'react';

type Mode = 'off' | 'bars' | 'immersive';
type RGB = [number, number, number];

/** Même marge que le lecteur (electron/mpv.cjs) en mode immersif */
const MARGIN = 0.06;
/** Le dessin se fait en petit puis est agrandi : le flou devient gratuit */
const SCALE = 1 / 10;

const parse = (s: string): RGB[] => s.split(',').map((h) => [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]);

/** Rectangle occupé par la vidéo dans la fenêtre (comme mpv le calcule) */
function videoRect(W: number, H: number, aspect: number, mode: Mode) {
  const m = mode === 'immersive' ? MARGIN : 0;
  const aw = W * (1 - 2 * m), ah = H * (1 - 2 * m);
  let vw = aw, vh = ah;
  if (aspect > aw / ah) vh = aw / aspect; else vw = ah * aspect;
  return { x: W * m + (aw - vw) / 2, y: H * m + (ah - vh) / 2, w: vw, h: vh };
}

/**
 * Halo lumineux autour de la vidéo, aux couleurs des bords de l'image (mesurées par mpv).
 * Les couleurs glissent en douceur d'une image à l'autre ; la vidéo elle-même n'est jamais teintée.
 */
export function Ambilight({ visible, mode, aspect }: { visible: boolean; mode: Mode; aspect: number }) {
  const [size, setSize] = useState({ W: window.innerWidth, H: window.innerHeight });
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef<RGB[][] | null>(null);
  const current = useRef<RGB[][] | null>(null);

  useEffect(() => {
    const offs = [
      window.nocta!.player.on('mpv:ambi', (s: string) => {
        const sides = s.split('|').map(parse);
        if (sides.length === 4) target.current = sides;
      }),
    ];
    const onResize = () => setSize({ W: window.innerWidth, H: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => { offs.forEach((o) => o()); window.removeEventListener('resize', onResize); };
  }, []);

  const r = videoRect(size.W, size.H, aspect, mode);
  // Pas de place autour de la vidéo (16:9 plein écran en mode « bandes noires ») : rien à dessiner
  const room = r.x > 4 || r.y > 4;
  const active = mode !== 'off' && room;

  // Animation : les couleurs rejoignent la mesure en douceur, dessin à ~30 images/s
  useEffect(() => {
    if (!active) return;
    let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;
      last = now;
      const c = canvas.current, t = target.current;
      if (!c || !t) return;
      if (!current.current) current.current = t.map((side) => side.map((p) => [...p] as RGB));
      const cur = current.current;
      t.forEach((side, si) => side.forEach((p, i) => {
        const q = cur[si]?.[i];
        if (!q) return;
        for (let k = 0; k < 3; k++) q[k] += (p[k] - q[k]) * 0.18;
      }));
      paint(c, cur);
    };
    const paint = (c: HTMLCanvasElement, [top, right, bottom, left]: RGB[][]) => {
      const W = Math.ceil(size.W * SCALE), H = Math.ceil(size.H * SCALE);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; off.width = W; off.height = H; }
      const g = off.getContext('2d')!;
      g.clearRect(0, 0, W, H);
      const x = r.x * SCALE, y = r.y * SCALE, w = r.w * SCALE, h = r.h * SCALE;
      const col = (p: RGB, a: number) => `rgba(${p[0] | 0},${p[1] | 0},${p[2] | 0},${a})`;
      // Chaque zone éclaire depuis le bord de la vidéo vers le bord de l'écran, en s'estompant
      const band = (p: RGB, x0: number, y0: number, x1: number, y1: number, gx0: number, gy0: number, gx1: number, gy1: number) => {
        const grad = g.createLinearGradient(gx0, gy0, gx1, gy1);
        grad.addColorStop(0, col(p, 1));
        grad.addColorStop(0.5, col(p, 0.55));
        grad.addColorStop(1, col(p, 0));
        g.fillStyle = grad;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      };
      const ext = 1.2; // un peu au-delà de chaque zone pour des transitions sans couture
      if (y > 0.5) {
        top.forEach((p, i) => { const zw = w / top.length; band(p, x + i * zw - ext, 0, x + (i + 1) * zw + ext, y + 1, 0, y, 0, 0); });
        bottom.forEach((p, i) => { const zw = w / bottom.length; band(p, x + i * zw - ext, y + h - 1, x + (i + 1) * zw + ext, H, 0, y + h, 0, H); });
      }
      if (x > 0.5) {
        left.forEach((p, i) => { const zh = h / left.length; band(p, 0, y + i * zh - ext, x + 1, y + (i + 1) * zh + ext, x, 0, 0, 0); });
        right.forEach((p, i) => { const zh = h / right.length; band(p, x + w - 1, y + i * zh - ext, W, y + (i + 1) * zh + ext, x + w, 0, W, 0); });
      }
      // Coins : mélange des deux côtés voisins
      const corner = (a: RGB, b: RGB, cx: number, cy: number, x0: number, y0: number) => {
        const m: RGB = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const rad = Math.max(Math.abs(cx - x0), Math.abs(cy - y0)) * 1.4;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, col(m, 0.8));
        grad.addColorStop(1, col(m, 0));
        g.fillStyle = grad;
        g.fillRect(Math.min(cx, x0), Math.min(cy, y0), Math.abs(cx - x0), Math.abs(cy - y0));
      };
      if (x > 0.5 && y > 0.5) {
        corner(top[0], left[0], x, y, 0, 0);
        corner(top[top.length - 1], right[0], x + w, y, W, 0);
        corner(bottom[0], left[left.length - 1], x, y + h, 0, H);
        corner(bottom[bottom.length - 1], right[right.length - 1], x + w, y + h, W, H);
      }
      // Flou appliqué en petit (≈ 50 px une fois agrandi) : une lumière douce, sans pavés
      const v = c.getContext('2d')!;
      v.clearRect(0, 0, W, H);
      v.filter = 'blur(5px)';
      v.drawImage(off, 0, 0);
      v.filter = 'none';
    };
    const off = document.createElement('canvas');
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, size.W, size.H, r.x, r.y, r.w, r.h]);

  if (!active) return null;
  // Trou exact à l'emplacement de la vidéo : la lumière ne déborde jamais sur l'image
  const hole = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, ${r.x}px ${r.y}px)`;
  return (
    <canvas
      ref={canvas}
      className={`ambilight ${visible ? 'is-on' : ''}`}
      style={{ clipPath: hole }}
      aria-hidden
    />
  );
}
