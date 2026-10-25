// Fusion à trois voies de données JSON (synchronisation entre appareils)

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);

/** JSON stable (clés triées) : deux appareils n'écrivent pas forcément les clés dans le même ordre */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (isObj(x)) return `{${Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`;
  return JSON.stringify(x) ?? 'undefined';
}
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Date d'un élément qui se remplace en bloc (une reprise, une note du journal) */
const stampOf = (o: Record<string, any>): number | undefined =>
  typeof o.updatedAt === 'number' ? o.updatedAt : typeof o.at === 'number' ? o.at : undefined;

/**
 * Fusion à trois voies : b = dernière version commune, l = cet appareil, r = le gist.
 * Ce qui n'a changé que d'un côté est repris tel quel ; si les deux ont changé, on descend dans
 * le détail (objets, listes par identifiant) et, au bout, le plus récent gagne.
 */
export function merge(b: any, l: any, r: any): any {
  if (same(l, r)) return l;
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  // Modifié d'un côté, supprimé de l'autre : la modification l'emporte
  if (l === undefined) return r;
  if (r === undefined) return l;
  if (isObj(l) && isObj(r)) {
    const tl = stampOf(l), tr = stampOf(r);
    if (tl !== undefined && tr !== undefined) return tr > tl ? r : l;
    const out: Record<string, any> = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const v = merge(isObj(b) ? b[k] : undefined, l[k], r[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(l) && Array.isArray(r)) return mergeList(Array.isArray(b) ? b : [], l, r);
  // Dates (épisodes vus) : la plus récente
  if (typeof l === 'number' && typeof r === 'number') return Math.max(l, r);
  return l;
}

/** Listes : par identifiant (profils, Ma liste, séances du journal) ou par valeur (favoris…) */
function mergeList(b: any[], l: any[], r: any[]): any[] {
  const keyOf = (x: any): string | null => (isObj(x) ? (x.id != null ? `#${x.id}` : null) : `=${stable(x)}`);
  if ([...l, ...r].some((x) => keyOf(x) === null)) return l;
  const map = (a: any[]) => new Map(a.map((x) => [keyOf(x)!, x]));
  const B = map(b), L = map(l), R = map(r);
  const out: any[] = [];
  for (const k of [...L.keys(), ...[...R.keys()].filter((k) => !L.has(k))]) {
    const v = merge(B.get(k), L.get(k), R.get(k));
    if (v !== undefined) out.push(v);
  }
  return out;
}
