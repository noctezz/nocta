// Deux applis à partir du même code : NOCTA, et NOCTA Mini (interface minimaliste).
// NOCTA Mini est empaqueté avec « noctaVariant: mini » dans son package.json (voir le workflow).
const pkg = require('../package.json');

const MINI = pkg.noctaVariant === 'mini' || process.env.NOCTA_MINI === '1';

module.exports = {
  MINI,
  /** Page de l'interface (le lecteur, lui, reste celui de NOCTA) */
  entry: MINI ? 'mini.html' : 'index.html',
  icon: MINI ? 'icon-mini.png' : 'icon.png',
  /** Mises à jour : chaque appli a ses propres versions sur GitHub */
  asset: MINI ? 'NOCTA-Mini-Setup.exe' : 'NOCTA-Setup.exe',
  tagRe: MINI ? /^mini-v\d+\.\d+\.\d+$/ : /^v\d+\.\d+\.\d+$/,
  nameRe: MINI ? /^NOCTA Mini\b/ : /^NOCTA\b/,
};
