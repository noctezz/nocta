import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LibraryBig, Puzzle } from 'lucide-react';
import { Row } from '../components/Row';
import { browsableCatalogs, extraCatalogAddons, getCatalog, getFullCatalog, typeLabel } from '../lib/addons';
import { useStore } from '../lib/store';
import type { InstalledAddon } from '../lib/types';
import type { RowDef } from './Home';

function AddonHeader({ addon }: { addon: InstalledAddon }) {
  const [ok, setOk] = useState(true);
  return (
    <div className="catalogs-addon-head">
      <div className="addon-logo small">
        {addon.manifest.logo && ok ? <img src={addon.manifest.logo} alt="" onError={() => setOk(false)} /> : <Puzzle size={18} />}
      </div>
      <h2>{addon.manifest.name}</h2>
    </div>
  );
}

/** Onglet Catalogues : uniquement les addons de catalogue installés (hors Cinemeta) */
export function Catalogs() {
  const addons = useStore((s) => s.addons);
  const setPage = useStore((s) => s.setPage);
  const groups = useMemo(() => extraCatalogAddons(addons).map((addon) => ({
    addon,
    rows: browsableCatalogs([addon]).map(({ catalog }): RowDef => ({
      key: `cat|${addon.url}|${catalog.type}|${catalog.id}`,
      title: catalog.name ? `${catalog.name}${catalog.name.toLowerCase().includes(typeLabel(catalog.type).toLowerCase()) ? '' : ` · ${typeLabel(catalog.type)}`}` : typeLabel(catalog.type),
      load: () => getCatalog(addon, catalog.type, catalog.id),
      pageable: false,
      loadAll: () => getFullCatalog(addon, catalog),
    })),
  })), [addons]);

  return (
    <div className="page page-padded catalogs-page">
      <h1 className="page-title">Catalogues</h1>
      {groups.length === 0 ? (
        <div className="empty big">
          <LibraryBig size={48} />
          <h3>Aucun catalogue installé</h3>
          <p>Les addons de catalogue que tu installes (Trakt, TMDB, listes, anime…) apparaissent uniquement ici.</p>
          <button className="btn btn-white" onClick={() => setPage('addons')}>Trouver des catalogues</button>
        </div>
      ) : (
        groups.map(({ addon, rows }, gi) => (
          <motion.section
            key={addon.url}
            className="catalogs-group"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(gi * 0.06, 0.3) }}
          >
            <AddonHeader addon={addon} />
            <div className="rows">
              {rows.map((r) => <Row key={r.key} def={r} />)}
            </div>
          </motion.section>
        ))
      )}
    </div>
  );
}
