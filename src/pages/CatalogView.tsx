import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { Card } from '../components/Card';
import { mergeUnique } from '../components/Row';
import { useStore } from '../lib/store';
import type { MetaPreview } from '../lib/types';

/** « Tout voir » : toute une catégorie en grille, chargée à l'infini, sans doublons */
export function CatalogView() {
  const browse = useStore((s) => s.browse);
  const setPage = useStore((s) => s.setPage);
  const [items, setItems] = useState<MetaPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const fetched = useRef(0);
  const itemsRef = useRef<MetaPreview[]>([]);
  const busy = useRef(false);
  const emptyStreak = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadNext = useCallback(async () => {
    if (!browse || busy.current || done) return;
    busy.current = true;
    setLoading(true);
    try {
      const page = await browse.load(fetched.current);
      fetched.current += page.length;
      const r = mergeUnique(itemsRef.current, page);
      const added = r.added;
      itemsRef.current = r.list;
      setItems(r.list);
      // Fin du catalogue : page vide, pas de pagination, ou plusieurs pages sans nouveauté
      emptyStreak.current = added ? 0 : emptyStreak.current + 1;
      if (!page.length || !browse.pageable || emptyStreak.current >= 3) setDone(true);
    } catch {
      setDone(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [browse, done]);

  // Réinitialise quand on change de catégorie
  useEffect(() => {
    setItems([]);
    itemsRef.current = [];
    setDone(false);
    fetched.current = 0;
    emptyStreak.current = 0;
    window.scrollTo({ top: 0 });
  }, [browse?.key]);

  useEffect(() => {
    if (!browse?.loadAll) return;
    // Onglet Catalogues : le catalogue complet, exactement, sans défilement infini
    let alive = true;
    setLoading(true);
    browse.loadAll()
      .then((all) => { if (alive) { itemsRef.current = all; setItems(all); } })
      .catch(() => {})
      .finally(() => { if (alive) { setLoading(false); setDone(true); } });
    return () => { alive = false; };
  }, [browse]);

  useEffect(() => { if (!browse?.loadAll && !items.length && !done) loadNext(); }, [browse, items.length, done, loadNext]);

  // Défilement infini : charge la suite quand le bas de la grille approche
  useEffect(() => {
    const el = sentinel.current;
    if (!el || browse?.loadAll) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadNext(); }, { rootMargin: '900px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadNext, items.length, browse]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!browse) return null;

  return (
    <div className="page page-padded catalog-view">
      <div className="catalog-head">
        <button className="round" onClick={() => setPage(browse.from)} aria-label="Retour"><ArrowLeft size={20} /></button>
        <motion.h1 className="page-title" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>{browse.title}</motion.h1>
      </div>

      <div className="grid">
        {items.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min((i % 30) * 0.02, 0.4) }}
          >
            <Card item={m} />
          </motion.div>
        ))}
        {loading && Array.from({ length: items.length ? 6 : 18 }, (_, i) => <div key={'s' + i} className="card skeleton" />)}
      </div>

      <div ref={sentinel} className="catalog-sentinel" />
      {done && items.length > 0 && !browse.loadAll && <p className="catalog-end">Tu as tout vu dans cette catégorie.</p>}
      {done && !loading && items.length === 0 && <div className="empty big"><h3>Ce catalogue est vide</h3></div>}

      {showTop && (
        <button className="round round-lg back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Remonter">
          <ArrowUp size={22} />
        </button>
      )}
    </div>
  );
}
