import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { MetaPreview, ProgressEntry } from '../lib/types';
import type { CardVariant } from '../lib/ui';
import { useStore } from '../lib/store';
import type { RowDef } from '../pages/Home';
import { Card } from './Card';

interface RowProps {
  /** Rangée issue d'un catalogue (chargement, pagination, « Tout voir ») */
  def?: RowDef;
  title?: string;
  items?: MetaPreview[];
  variant?: CardVariant;
  entries?: Record<string, ProgressEntry>;
}

function perRowFor(width: number, variant: CardVariant) {
  if (variant === 'top10') return width > 1500 ? 6 : width > 1100 ? 5 : 4;
  return width > 1700 ? 6 : width > 1300 ? 5 : width > 900 ? 4 : 3;
}

/** Ajoute les nouveaux titres en ignorant ceux déjà présents */
export function mergeUnique(prev: MetaPreview[], next: MetaPreview[]) {
  const seen = new Set(prev.map((m) => m.id));
  const add = next.filter((m) => !seen.has(m.id) && seen.add(m.id));
  return { list: add.length ? [...prev, ...add] : prev, added: add.length };
}

export function Row({ def, title: givenTitle, items: given, variant: givenVariant, entries }: RowProps) {
  const title = def?.title ?? givenTitle ?? '';
  const variant: CardVariant = def?.variant ?? givenVariant ?? 'landscape';
  const pageable = !!def?.pageable && variant !== 'top10';
  const openBrowse = useStore((s) => s.openBrowse);

  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MetaPreview[] | null>(given ?? null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(!!given);
  const [page, setPage] = useState(0);
  const [perRow, setPerRow] = useState(5);
  const [step, setStep] = useState(0);
  const [moved, setMoved] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetched = useRef(0);
  const exhausted = useRef(false);

  useEffect(() => { if (given) setItems(given); }, [given]);

  // Chargement paresseux quand la rangée approche de l'écran
  useEffect(() => {
    if (given || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [given]);

  useEffect(() => {
    if (!visible || given || !def) return;
    let alive = true;
    def.load(0)
      .then((r) => {
        if (!alive) return;
        fetched.current = r.length;
        exhausted.current = !pageable || r.length === 0;
        setItems(mergeUnique([], r).list);
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [visible, given, def, pageable]);

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

  /** Page suivante du catalogue (rangée infinie) ; renvoie le nombre de titres ajoutés */
  const loadMore = async () => {
    if (!def || exhausted.current || loadingMore) return 0;
    setLoadingMore(true);
    try {
      const more = await def.load(fetched.current);
      fetched.current += more.length;
      const r = mergeUnique(items || [], more);
      setItems(r.list);
      if (!more.length) exhausted.current = true;
      return r.added;
    } catch {
      exhausted.current = true;
      return 0;
    } finally {
      setLoadingMore(false);
    }
  };

  const go = async (d: number) => {
    setMoved(true);
    if (d > 0 && p >= pages - 2 && pageable && !exhausted.current) {
      // On approche de la fin : on charge la suite avant d'y arriver
      const added = await loadMore();
      if (added || p < pages - 1) { setPage(p + 1); return; }
    }
    setPage((x) => (x + d + pages) % pages);
  };

  const seeAll = () => def && openBrowse({ key: def.key, title, load: (skip) => def.load(skip), pageable, loadAll: def.loadAll });

  return (
    <section className={`row row-${variant}`} ref={ref} style={{ ['--per-row' as any]: perRow }}>
      <div className="row-head">
        <h2 className={def && variant !== 'top10' ? 'row-title-link' : ''} onClick={variant !== 'top10' ? seeAll : undefined}>
          {title}
          {def && variant !== 'top10' && <span className="see-all">Tout voir <ChevronRight size={16} /></span>}
        </h2>
        {pages > 1 && (
          <div className="row-dots">
            {Array.from({ length: Math.min(pages, 12) }, (_, i) => <span key={i} className={i === Math.min(p, 11) ? 'is-on' : ''} />)}
          </div>
        )}
      </div>
      <div className="row-viewport">
        {moved && pages > 1 && (
          <button className="row-arrow left" onClick={() => go(-1)} aria-label="Précédent"><ChevronLeft size={40} /></button>
        )}
        <div className="row-track" ref={trackRef} style={{ transform: `translate3d(${-p * perRow * step}px,0,0)` }}>
          {items
            ? list.map((m, i) => <Card key={m.id} item={m} variant={variant} rank={i + 1} entry={entries?.[m.id]} />)
            : Array.from({ length: perRow + 1 }, (_, i) => <div key={i} className="card skeleton" />)}
        </div>
        {(pages > 1 || pageable) && (
          <button className="row-arrow right" onClick={() => go(1)} aria-label="Suivant" disabled={loadingMore}>
            {loadingMore ? <Loader2 className="spin" size={30} /> : <ChevronRight size={40} />}
          </button>
        )}
      </div>
    </section>
  );
}
