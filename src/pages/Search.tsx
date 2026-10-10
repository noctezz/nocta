import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/Card';
import { getCatalog, searchableCatalogs, typeLabel } from '../lib/addons';
import { useStore } from '../lib/store';
import type { MetaPreview } from '../lib/types';

export function Search() {
  const query = useStore((s) => s.searchQuery);
  const addons = useStore((s) => s.addons);
  const [results, setResults] = useState<{ type: string; items: MetaPreview[] }[] | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setResults(null);
    let alive = true;
    const t = setTimeout(async () => {
      const cats = searchableCatalogs(addons);
      const settled = await Promise.allSettled(cats.map(({ addon, catalog }) =>
        getCatalog(addon, catalog.type, catalog.id, { search: q }).then((items) => ({ type: catalog.type, items }))));
      if (!alive) return;
      const byType = new Map<string, MetaPreview[]>();
      const seen = new Set<string>();
      for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        for (const m of r.value.items) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          byType.set(r.value.type, [...(byType.get(r.value.type) || []), m]);
        }
      }
      setResults(Array.from(byType, ([type, items]) => ({ type, items })));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [query, addons]);

  return (
    <div className="page page-padded">
      {results === null && <div className="grid">{Array.from({ length: 12 }, (_, i) => <div key={i} className="card skeleton" />)}</div>}
      {results && results.length === 0 && query.trim().length >= 2 && (
        <div className="empty big">
          <h3>Aucun résultat pour « {query} »</h3>
          <p>Essaie un autre titre, ou installe un addon de catalogue supplémentaire.</p>
        </div>
      )}
      {results?.map((g) => (
        <section key={g.type} className="search-group">
          <h2>{typeLabel(g.type)}</h2>
          <div className="grid">
            {g.items.map((m, i) => (
              <motion.div key={m.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}>
                <Card item={m} />
              </motion.div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
