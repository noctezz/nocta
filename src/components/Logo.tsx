import { useId } from 'react';

/** Logo NOCTA : wordmark légèrement incurvé, dégradé rouge profond */
export function Logo({ height = 28, glow = false }: { height?: number; glow?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={glow ? 'logo logo-glow' : 'logo'}
      viewBox="0 0 320 92"
      height={height}
      width={(height * 320) / 92}
      aria-label="NOCTA"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff3b5c" />
          <stop offset="55%" stopColor="#e50f3a" />
          <stop offset="100%" stopColor="#99001f" />
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
  );
}
