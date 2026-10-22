// Navigation « façon TV » : les flèches (clavier ou télécommande du téléphone)
// déplacent une sélection d'un élément à l'autre selon leur position à l'écran,
// OK valide, Retour ferme la fenêtre ouverte ou revient à l'accueil.
import { useStore } from './store';
import { IS_TV } from './tv';

// Sur la TV, défilement immédiat : l'animation de défilement saccade sur une box
const SCROLL: ScrollBehavior = IS_TV ? 'auto' : 'smooth';

export type NavKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'home' | 'playpause';

const FOCUSABLE = [
  'button:not([disabled])', 'a[href]', 'input:not([type=hidden]):not([disabled])', 'select', 'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const SCOPES = '.modal-backdrop, .editor, .loading-screen, [data-nav-scope]';
const FOCUS_CLASS = 'nav-focus';

let current: HTMLElement | null = null;
let pageLast: HTMLElement | null = null;

/** Fenêtre au premier plan (fiche, sources, éditeur de profil, chargement) sinon toute la page */
function activeScope(): ParentNode {
  const all = [...document.querySelectorAll<HTMLElement>(SCOPES)].filter((el) => el.isConnected && el.getClientRects().length);
  return all[all.length - 1] || document;
}

function visible(el: HTMLElement) {
  if (el.closest('[data-nav-skip], .hover-preview, .row-arrow')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.pointerEvents !== 'none' && Number(st.opacity) > 0.05;
}

function candidates(scope: ParentNode) {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

function setCurrent(el: HTMLElement, scroll = true) {
  if (current && current !== el) current.classList.remove(FOCUS_CLASS);
  current = el;
  el.classList.add(FOCUS_CLASS);
  el.focus({ preventScroll: true });
  if (!el.closest(SCOPES)) pageLast = el;
  if (scroll) ensureVisible(el);
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 2) return p;
  }
  return null;
}

/** Garde l'élément sélectionné bien visible (défilement vertical seulement) */
function ensureVisible(el: HTMLElement) {
  if (getComputedStyle(el).position === 'fixed' || el.closest('.navbar')) return;
  const r = el.getBoundingClientRect();
  const parent = scrollParent(el);
  if (parent) {
    const pr = parent.getBoundingClientRect();
    if (r.top < pr.top + 60 || r.bottom > pr.bottom - 60) {
      parent.scrollBy({ top: r.top + r.height / 2 - (pr.top + pr.height / 2), behavior: SCROLL });
    }
    return;
  }
  const top = 110, bottom = window.innerHeight - 60;
  // Élément visible en entier tout en haut de la page (boutons de la grande image) : on remonte
  // jusqu'en haut, pour revoir l'image en entier au lieu d'une image coupée
  if (r.top < top && r.bottom + window.scrollY < bottom) { window.scrollTo({ top: 0, behavior: SCROLL }); return; }
  if (r.top < top || r.bottom > bottom) {
    // Rangée sélectionnée vers le haut de l'écran, comme sur les apps TV
    const target = Math.min(window.innerHeight * 0.38, Math.max(top, window.innerHeight - r.height - 80));
    const dy = r.top - target;
    if (window.scrollY + dy < 40 && r.top < top) window.scrollTo({ top: 0, behavior: SCROLL });
    else window.scrollBy({ top: dy, behavior: SCROLL });
  }
}

function defaultTarget(scope: ParentNode, list: HTMLElement[]) {
  if (scope === document && pageLast && pageLast.isConnected && visible(pageLast)) return pageLast;
  const preferred = scope.querySelector<HTMLElement>('[data-nav-default]');
  if (preferred && visible(preferred)) return preferred;
  // Sinon : le premier élément visible en haut à gauche, hors barre de navigation
  const onScreen = list.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth && !el.closest('.navbar');
  });
  const pool = onScreen.length ? onScreen : list;
  return pool.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return Math.abs(ra.top - rb.top) > 20 ? ra.top - rb.top : ra.left - rb.left;
  })[0];
}

function move(dir: 'up' | 'down' | 'left' | 'right', within?: HTMLElement) {
  const scope = within || activeScope();
  const list = candidates(scope);
  if (!list.length) return;
  const cur = current && current.isConnected && list.includes(current) ? current : null;
  if (!cur) { const d = defaultTarget(scope, list); if (d) setCurrent(d); return; }

  const a = cur.getBoundingClientRect();
  const horiz = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  const scored: { el: HTMLElement; primary: number; orth: number; overlap: boolean }[] = [];
  for (const el of list) {
    if (el === cur || cur.contains(el) || el.contains(cur)) continue;
    const b = el.getBoundingClientRect();
    const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    // Distance dans la direction voulue, d'un bord à l'autre
    const primary = horiz
      ? (sign > 0 ? b.left - a.right : a.left - b.right)
      : (sign > 0 ? b.top - a.bottom : a.top - b.bottom);
    const centerAhead = horiz ? (bc.x - ac.x) * sign > 4 : (bc.y - ac.y) * sign > 4;
    if (primary < -Math.min(horiz ? a.width : a.height, 40) * 0.5 || !centerAhead) continue;
    const orth = horiz ? Math.abs(bc.y - ac.y) : Math.abs(bc.x - ac.x);
    const overlap = horiz ? b.top < a.bottom - 4 && b.bottom > a.top + 4 : b.left < a.right - 4 && b.right > a.left + 4;
    scored.push({ el, primary: Math.max(0, primary), orth, overlap });
  }
  // La barre de navigation reste fixée en haut : elle paraît « plus proche » que les éléments
  // de la page passés au-dessus de l'écran. On ne la rejoint qu'en haut de la page.
  const inNav = (el: HTMLElement) => !!el.closest('.navbar');
  if (dir === 'up' && !inNav(cur) && scored.some((s) => !inNav(s.el))) {
    for (let i = scored.length - 1; i >= 0; i--) if (inNav(scored[i].el)) scored.splice(i, 1);
  }
  if (!scored.length) return;
  let best;
  if (horiz) {
    // Même ligne d'abord (cartes d'une rangée), sinon le plus proche
    const same = scored.filter((s) => s.overlap);
    const pool = same.length ? same : scored;
    best = pool.sort((x, y) => (x.primary + x.orth * 2) - (y.primary + y.orth * 2))[0];
  } else {
    // La ligne la plus proche, puis l'élément le mieux aligné dans cette ligne
    const nearest = Math.min(...scored.map((s) => s.primary));
    const line = scored.filter((s) => s.primary <= nearest + 24);
    best = line.sort((x, y) => x.orth - y.orth)[0];
  }
  setCurrent(best.el);
}

function activate() {
  const el = current && current.isConnected ? current : null;
  if (!el) { move('down'); return; }
  if (el.matches('input[type=checkbox]')) { el.click(); return; }
  if (el.matches('input, textarea, select')) { el.focus(); return; }
  el.click();
}

function back() {
  const scope = activeScope();
  const st = useStore.getState();
  if (scope !== document) {
    const btn = (scope as HTMLElement).querySelector<HTMLElement>('[data-nav-back]');
    if (btn) { btn.click(); return; }
    if (st.picker) { st.closePicker(); return; }
    if (st.detail) { st.closeDetail(); return; }
    return;
  }
  if (st.searchQuery) { st.setSearch(''); return; }
  if (st.page !== 'home') { st.setPage('home'); window.scrollTo({ top: 0 }); return; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Sélectionne un élément précis (télécommande) */
export function navFocus(el: HTMLElement) {
  document.documentElement.classList.add('kbd-nav');
  setCurrent(el, false);
}

/** Flèches de la télécommande dans un panneau précis (ex. audio et sous-titres du lecteur) */
export function navWithin(scope: HTMLElement, dir: 'up' | 'down' | 'left' | 'right') {
  document.documentElement.classList.add('kbd-nav');
  if (!current || !scope.contains(current)) {
    const first = scope.querySelector<HTMLElement>('.is-on') || candidates(scope)[0];
    if (first) setCurrent(first);
    return;
  }
  move(dir, scope);
}

const WEB_PLAYER_KEYS: Record<string, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: ' ', playpause: ' ', back: 'Escape', next: 'n' };

/** Commande venue de la télécommande ou du clavier */
export function navigate(k: NavKey | 'next' | 'skip') {
  const st = useStore.getState();
  // Lecteur de secours (dans cette fenêtre) : on rejoue ses raccourcis clavier
  if (st.player) {
    const key = WEB_PLAYER_KEYS[k];
    if (key) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    return;
  }
  document.documentElement.classList.add('kbd-nav');
  switch (k) {
    case 'up': case 'down': case 'left': case 'right': move(k); break;
    case 'ok': activate(); break;
    case 'back': back(); break;
    case 'home':
      st.closePicker(); st.closeDetail(); st.setSearch(''); st.setPage('home');
      window.scrollTo({ top: 0 });
      current?.classList.remove(FOCUS_CLASS); current = null; pageLast = null;
      break;
  }
}

const ARROWS: Record<string, NavKey> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** Branche le clavier (mode canapé) et efface la sélection dès que la souris bouge */
export function installSpatialNav() {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const st = useStore.getState();
    if (st.player) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.matches('textarea, select') || (t.matches('input') && !t.matches('[type=checkbox], [type=range], [type=button]')));
    const dir = ARROWS[e.key];
    if (dir) {
      if (typing && (dir === 'left' || dir === 'right')) return;
      e.preventDefault();
      if (t && t !== document.body && t !== current && candidates(document).includes(t)) current = t;
      navigate(dir);
    } else if (e.key === 'Enter' && current && t === current && !current.matches('button, a, input, select, textarea')) {
      e.preventDefault();
      current.click();
    }
  };
  let lastX = -1, lastY = -1;
  const onMouse = (e: MouseEvent) => {
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) < 3) return;
    lastX = e.clientX; lastY = e.clientY;
    if (!document.documentElement.classList.contains('kbd-nav')) return;
    document.documentElement.classList.remove('kbd-nav');
    current?.classList.remove(FOCUS_CLASS);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('mousemove', onMouse, { passive: true });
  return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMouse); };
}
