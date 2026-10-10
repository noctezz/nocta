import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MetaPreview, ProgressEntry } from '../lib/types';
import type { CardVariant } from '../lib/ui';
import { Card } from './Card';

interface RowProps {
  title: string;
  items?: MetaPreview[];
  load?: () => Promise<MetaPreview[]>;
  variant?: CardVariant;
  entries?: Record<string, ProgressEntry>;
  limit?: number;
}

function perRowFor(width: number, variant: CardVariant) {
  if (variant === 'top10') return width > 1500 ? 6 : width > 1100 ? 5 : 4;
  return width > 1700 ? 6 : width > 1300 ? 5 : width > 900 ? 4 : 3;
}

export function Row({ title, items: given, load, variant = 'landscape', entries, limit = 30 }: RowProps) {
  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MetaPreview[] | null>(given ?? null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(!!given);
  const [page, setPage] = useState(0);
  const [perRow, setPerRow] = useState(5);
  const [step, setStep] = useState(0);
  const [moved, setMoved] = useState(false);

  useEffect(() => { if (given) setItems(given); }, [given]);

  // Chargement paresseux quand la rangée approche de l'écran
  useEffect(() => {
    if (given || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [given]);

  useEffect(() => {
    if (!visible || given || !load) return;
    let alive = true;
    load().then((r) => alive && setItems(r.slice(0, limit))).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [visible, given, load, limit]);

  useLayoutEffect(() => {
    const measure = () => {
      const w = ref.current?.clientWidth || window.innerWidth;
      setPerRow(perRowFor(w, variant));
      const first = trackRef.current?.firstElementChild as HTMLElement | null;
      if (first) {
        const gap = parseFloat(getComputedStyle(trackRef.current!).columnGap || '0') || 0;
        setStep(first.offsetWidth + gap);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [variant, items]);

  if (failed || (items && items.length === 0)) return null;

  const list = items || [];
  const pages = Math.max(1, Math.ceil(list.length / perRow));
  const p = Math.min(page, pages - 1);
  const go = (d: number) => { setMoved(true); setPage((x) => (x + d + pages) % pages); };

  return (
    <section className={`row row-${variant}`} ref={ref} style={{ ['--per-row' as any]: perRow }}>
      <div className="row-head">
        <h2>{title}</h2>
        {pages > 1 && (
          <div className="row-dots">
            {Array.from({ length: pages }, (_, i) => <span key={i} className={i === p ? 'is-on' : ''} />)}
          </div>
        )}
      </div>
      <div className="row-viewport">
        {moved && pages > 1 && (
          <button className="row-arrow left" onClick={() => go(-1)} aria-label="Précédent"><ChevronLeft size={40} /></button>
        )}
        <div className="row-track" ref={trackRef} style={{ transform: `translate3d(${-p * perRow * step}px,0,0)` }}>
          {items
            ? list.map((m, i) => <Card key={m.id + i} item={m} variant={variant} rank={i + 1} entry={entries?.[m.id]} />)
            : Array.from({ length: perRow + 1 }, (_, i) => <div key={i} className="card skeleton" />)}
        </div>
        {pages > 1 && (
          <button className="row-arrow right" onClick={() => go(1)} aria-label="Suivant"><ChevronRight size={40} /></button>
        )}
      </div>
    </section>
  );
}
