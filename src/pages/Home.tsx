import { useMemo } from 'react';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { browsableCatalogs, catalogTitle, getCatalog, getCatalogPage, GENRE_FR, supportsSkip } from '../lib/addons';
import { useProfile, useStore } from '../lib/store';
import type { InstalledAddon, MetaPreview } from '../lib/types';

const HOME_GENRES = ['Action', 'Comedy', 'Sci-Fi', 'Thriller', 'Animation', 'Horror', 'Crime', 'Documentary'];

export interface RowDef { key: string; title: string; load: (skip?: number) => Promise<MetaPreview[]>; pageable?: boolean; variant?: 'top10' }

function genreRows(addon: InstalledAddon, type: string, catalogId: string, genres: string[]): RowDef[] {
  const cat = addon.manifest.catalogs?.find((c) => c.type === type && c.id === catalogId);
  const opts = cat?.extra?.find((e) => e.name === 'genre')?.options || [];
  return genres.filter((g) => opts.includes(g)).map((g) => ({
    key: `${addon.url}|${type}|${catalogId}|${g}`,
    title: `${GENRE_FR[g] || g}${type === 'series' ? ' · Séries' : ''}`,
    load: (skip = 0) => getCatalogPage(addon, type, catalogId, { genre: g }, skip),
    pageable: supportsSkip(cat),
  }));
}

/** Construit la liste de rangées pour l'accueil / Films / Séries */
export function useRows(type?: string, genres = HOME_GENRES): RowDef[] {
  const addons = useStore((s) => s.addons);
  return useMemo(() => {
    const cats = browsableCatalogs(addons, type);
    const rows: RowDef[] = [];
    const first = cats.find((c) => c.catalog.type === (type || 'movie')) || cats[0];
    if (first) {
      rows.push({
        key: 'top10',
        title: `Top 10 des ${first.catalog.type === 'series' ? 'séries' : 'films'} aujourd'hui`,
        load: () => getCatalog(first.addon, first.catalog.type, first.catalog.id).then((r) => r.slice(0, 10)),
        variant: 'top10',
      });
    }
    const interleaved: RowDef[] = cats.map(({ addon, catalog }) => ({
      key: `${addon.url}|${catalog.type}|${catalog.id}`,
      title: catalogTitle(addon, catalog),
      load: (skip = 0) => getCatalogPage(addon, catalog.type, catalog.id, {}, skip),
      pageable: supportsSkip(catalog),
    }));
    const cinemeta = addons.find((a) => a.manifest.id === 'com.linvo.cinemeta');
    const gRows: RowDef[] = cinemeta
      ? (type ? [type] : ['movie', 'series']).flatMap((t) => genreRows(cinemeta, t, 'top', type ? genres : genres.slice(0, 4)))
      : [];
    // Alterne catalogues et genres pour varier l'accueil
    const out = [...rows];
    const max = Math.max(interleaved.length, gRows.length);
    for (let i = 0; i < max; i++) {
      if (interleaved[i]) out.push(interleaved[i]);
      if (gRows[i]) out.push(gRows[i]);
    }
    return out;
  }, [addons, type, genres]);
}

export function Home() {
  const profile = useProfile();
  const rows = useRows();
  const continueItems = useMemo(
    () => Object.values(profile?.progress || {}).sort((a, b) => b.updatedAt - a.updatedAt),
    [profile?.progress],
  );

  return (
    <div className="page">
      <Hero />
      <div className="rows">
        {continueItems.length > 0 && (
          <Row
            title={`Reprendre avec le profil de ${profile!.name}`}
            items={continueItems.map((e) => e.meta)}
            entries={profile!.progress}
            variant="continue"
          />
        )}
        {profile && profile.myList.length > 0 && <Row title="Ma liste" items={profile.myList} />}
        {rows.map((r) => <Row key={r.key} def={r} />)}
      </div>
    </div>
  );
}
