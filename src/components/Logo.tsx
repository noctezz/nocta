import { useId } from 'react';
import { useSeasonTheme, type SeasonTheme } from '../lib/theme';
import { IS_TV } from '../lib/tv';

const GRADIENTS: Record<SeasonTheme, [string, string, string]> = {
  none: ['#ff3b5c', '#e50f3a', '#99001f'],
  christmas: ['#ff4d5e', '#e0102f', '#8c0018'],
  halloween: ['#ffb347', '#ff6a00', '#a32400'],
};

/** Bonnet de Père Noël, posé sur le « N » */
function SantaHat() {
  return (
    <svg viewBox="0 0 100 80" className="logo-decor logo-hat" aria-hidden>
      <defs>
        <linearGradient id="hatRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4b55" />
          <stop offset="1" stopColor="#b0071c" />
        </linearGradient>
      </defs>
      <path d="M14 58 C22 30 46 10 74 12 C84 13 92 22 88 30 C80 24 70 26 66 34 C60 46 58 54 58 58 Z" fill="url(#hatRed)" />
      <rect x="8" y="54" width="58" height="16" rx="8" fill="#fbfbfb" />
      <circle cx="88" cy="32" r="9" fill="#ffffff" />
    </svg>
  );
}

/** Chapeau de sorcière, posé sur le « N » */
function WitchHat() {
  return (
    <svg viewBox="0 0 100 80" className="logo-decor logo-hat" aria-hidden>
      <defs>
        <linearGradient id="witch" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a2a6b" />
          <stop offset="1" stopColor="#140a1f" />
        </linearGradient>
      </defs>
      <path d="M30 60 L58 4 C60 2 63 3 62 6 L56 26 L70 60 Z" fill="url(#witch)" />
      <path d="M36 52 L66 52 L68 58 L34 58 Z" fill="#ff7a18" />
      <ellipse cx="50" cy="62" rx="44" ry="8" fill="url(#witch)" />
    </svg>
  );
}

/** Logo NOCTA : wordmark légèrement incurvé, dégradé rouge profond (décoré selon la saison) */
export function Logo({ height = 28, glow = false, season }: { height?: number; glow?: boolean; season?: SeasonTheme }) {
  const id = useId().replace(/:/g, '');
  const active = useSeasonTheme();
  // Sur la TV, le logo reste toujours dans sa version normale
  const theme: SeasonTheme = IS_TV ? 'none' : season ?? active;
  const [a, b, c] = GRADIENTS[theme];
  const width = (height * 320) / 92;
  return (
    <span className={`logo-wrap logo-${theme}`} style={{ width, height }}>
      <svg
        className={glow ? 'logo logo-glow' : 'logo'}
        viewBox="0 0 320 92"
        height={height}
        width={width}
        aria-label="NOCTA"
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={a} />
            <stop offset="55%" stopColor={b} />
            <stop offset="100%" stopColor={c} />
          </linearGradient>
          <path id={`p${id}`} d="M8,80 Q160,58 312,80" />
        </defs>
        <text
          fill={`url(#g${id})`}
          fontFamily="'Inter Variable', Inter, system-ui, sans-serif"
          fontWeight={900}
          fontSize={78}
          letterSpacing={-3}
        >
          <textPath href={`#p${id}`} startOffset="50%" textAnchor="middle">NOCTA</textPath>
        </text>
      </svg>
      {theme === 'christmas' && <SantaHat />}
      {theme === 'halloween' && <WitchHat />}
    </span>
  );
}
