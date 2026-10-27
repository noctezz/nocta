const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const { MINI } = require('./variant.cjs');

// NOCTA Mini lit et écrit les mêmes données que NOCTA (profils, addons, progression) :
// les deux applis partagent la même bibliothèque.
const file = () => path.join(MINI ? path.join(app.getPath('appData'), 'NOCTA') : app.getPath('userData'), 'nocta-data.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return null;
  }
}

// Écriture atomique : on écrit dans un fichier temporaire puis on renomme
function save(data) {
  const target = file();
  const tmp = target + '.tmp';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, target);
  return true;
}

module.exports = { load, save };
