import { useEffect, useRef } from 'react';
import type { SeasonTheme } from '../lib/theme';

interface Flake { x: number; y: number; r: number; vx: number; vy: number; o: number; phase: number }
interface Bat { x: number; y: number; vx: number; size: number; t: number; amp: number }

/**
 * Ambiance saisonnière dessinée sur un canvas (léger, sans images) :
 * neige qui tombe pour Noël, braises qui s'élèvent et chauves-souris pour Halloween.
 */
export function SeasonalLayer({ theme, density = 1, className = '' }: { theme: SeasonTheme; density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (theme === 'none') return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), lastDraw = 0;
    // Petites particules floues : la pleine résolution n'apporte rien et coûte 4× plus cher
    const dpr = 1;
    // Braise pré-dessinée une fois (au lieu d'un dégradé recalculé à chaque image)
    const ember = document.createElement('canvas');
    ember.width = ember.height = 32;
    {
      const ec = ember.getContext('2d')!;
      const g = ec.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, '#ffd27a');
      g.addColorStop(0.4, '#ff7a18');
      g.addColorStop(1, 'rgba(255,90,0,0)');
      ec.fillStyle = g;
      ec.fillRect(0, 0, 32, 32);
    }

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.round((theme === 'christmas' ? 140 : 70) * density * Math.min(1.6, (w * h) / (1440 * 900) + 0.4));
    const flakes: Flake[] = Array.from({ length: count }, () => spawn(true));
    const bats: Bat[] = [];
    let nextBat = 2500;

    function spawn(initial = false): Flake {
      if (theme === 'christmas') {
        const r = Math.random() < 0.15 ? 2.4 + Math.random() * 1.6 : 0.8 + Math.random() * 1.6;
        return { x: Math.random() * w, y: initial ? Math.random() * h : -10, r, vx: -0.15 + Math.random() * 0.3, vy: 0.25 + r * 0.32, o: 0.35 + Math.random() * 0.55, phase: Math.random() * 6.28 };
      }
      // braises : montent depuis le bas
      const r = 0.8 + Math.random() * 1.8;
      return { x: Math.random() * w, y: initial ? Math.random() * h : h + 10, r, vx: -0.1 + Math.random() * 0.2, vy: -(0.2 + Math.random() * 0.45), o: 0.25 + Math.random() * 0.6, phase: Math.random() * 6.28 };
    }

    const drawBat = (b: Bat) => {
      const flap = Math.sin(b.t * 0.018) * 0.55;
      const s = b.size;
      ctx.save();
      ctx.translate(b.x, b.y + Math.sin(b.t * 0.003) * b.amp);
      ctx.scale(b.vx > 0 ? 1 : -1, 1);
      ctx.fillStyle = 'rgba(10, 6, 14, 0.85)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-s * 0.6, -s * (0.5 + flap), -s * 1.4, -s * (0.1 + flap));
      ctx.quadraticCurveTo(-s * 1.0, s * 0.05, -s * 0.9, s * 0.3);
      ctx.quadraticCurveTo(-s * 0.5, s * 0.05, 0, s * 0.25);
      ctx.quadraticCurveTo(s * 0.5, s * 0.05, s * 0.9, s * 0.3);
      ctx.quadraticCurveTo(s * 1.0, s * 0.05, s * 1.4, -s * (0.1 + flap));
      ctx.quadraticCurveTo(s * 0.6, -s * (0.5 + flap), 0, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -s * 0.05, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const frame = (now: number) => {
      // 30 images/s suffisent pour de la neige ou des braises ; rien quand la fenêtre est cachée
      if (!reduce) raf = requestAnimationFrame(frame);
      if (document.hidden || now - lastDraw < 32) return;
      lastDraw = now;
      const dt = Math.min(50, now - last) / 16.67;
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.phase += 0.01 * dt;
        f.x += (f.vx + Math.sin(f.phase) * 0.25) * dt;
        f.y += f.vy * dt;
        if (theme === 'christmas') {
          if (f.y > h + 10 || f.x < -20 || f.x > w + 20) flakes[i] = spawn();
          ctx.globalAlpha = f.o;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          if (f.y < -10) flakes[i] = spawn();
          const flicker = 0.6 + Math.sin(f.phase * 6) * 0.4;
          ctx.globalAlpha = f.o * flicker * Math.min(1, f.y / (h * 0.5));
          const size = f.r * 6.4;
          ctx.drawImage(ember, f.x - size / 2, f.y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;

      if (theme === 'halloween') {
        nextBat -= dt * 16.67;
        if (nextBat <= 0 && bats.length < 3) {
          const ltr = Math.random() < 0.5;
          bats.push({ x: ltr ? -40 : w + 40, y: 60 + Math.random() * h * 0.45, vx: (ltr ? 1 : -1) * (2.2 + Math.random() * 1.6), size: 9 + Math.random() * 9, t: 0, amp: 12 + Math.random() * 20 });
          nextBat = 6000 + Math.random() * 9000;
        }
        for (let i = bats.length - 1; i >= 0; i--) {
          const b = bats[i];
          b.t += dt * 16.67;
          b.x += b.vx * dt;
          drawBat(b);
          if (b.x < -80 || b.x > w + 80) bats.splice(i, 1);
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [theme, density]);

  if (theme === 'none') return null;
  return <canvas ref={ref} className={`seasonal-layer ${className}`} aria-hidden />;
}
