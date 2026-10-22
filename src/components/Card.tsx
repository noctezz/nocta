import { useRef, useState } from 'react';
import type { MetaPreview, ProgressEntry } from '../lib/types';
import { useStore } from '../lib/store';
import { backdropOf, logoOf, posterOf, useHover, type CardVariant } from '../lib/ui';
import { cardImg, cardImgFailed, lightImg } from '../lib/tv';

export function Card({
  item, variant = 'landscape', rank, entry,
}: { item: MetaPreview; variant?: CardVariant; rank?: number; entry?: ProgressEntry }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openDetail = useStore((s) => s.openDetail);
  const seen = useStore((s) => !!s.profiles.find((p) => p.id === s.activeProfileId)?.watched?.[item.id]);
  const show = useHover((s) => s.show);
  const [logoOk, setLogoOk] = useState(true);
  const [imgOk, setImgOk] = useState(true);

  const enter = () => {
    timer.current = setTimeout(() => {
      if (ref.current) show(item, ref.current.getBoundingClientRect(), entry);
    }, 520);
  };
  const leave = () => clearTimeout(timer.current);
  const click = () => { clearTimeout(timer.current); openDetail({ type: item.type, id: item.id, preview: item }); };

  if (variant === 'top10') {
    return (
      <div className="card card-top10" tabIndex={0} ref={ref} onMouseEnter={enter} onMouseLeave={leave} onClick={click}>
        <svg className="rank" viewBox="0 0 120 160" aria-hidden>
          <text x="120" y="150" textAnchor="end">{rank}</text>
        </svg>
        <img src={cardImg(posterOf(item))} alt={item.name} loading="lazy" decoding="async" draggable={false} onError={(e) => cardImgFailed(e.currentTarget, posterOf(item))} />
      </div>
    );
  }

  const logo = logoOf(item);
  const pct = entry && entry.duration ? Math.min(100, (entry.position / entry.duration) * 100) : 0;

  return (
    <div className="card" tabIndex={0} ref={ref} onMouseEnter={enter} onMouseLeave={leave} onClick={click}>
      <div className="card-img">
        {imgOk ? (
          <img src={cardImg(lightImg(backdropOf(item), 'w780'))} alt="" loading="lazy" decoding="async" draggable={false} onError={(e) => { if (!cardImgFailed(e.currentTarget, lightImg(backdropOf(item), 'w780'))) setImgOk(false); }} />
        ) : (
          <div className="card-fallback" />
        )}
        {logo && logoOk ? (
          <img className="card-logo" src={logo} alt={item.name} loading="lazy" decoding="async" draggable={false} onError={() => setLogoOk(false)} />
        ) : (
          <div className="card-title">{item.name}</div>
        )}
        {seen && variant !== 'continue' && <span className="card-seen" title="Déjà vu">✓ Vu</span>}
        {variant === 'continue' && (
          <div className="card-progress"><div style={{ width: `${pct}%` }} /></div>
        )}
      </div>
      {variant === 'continue' && entry?.episodeTitle && <div className="card-sub">{entry.episodeTitle}</div>}
    </div>
  );
}
