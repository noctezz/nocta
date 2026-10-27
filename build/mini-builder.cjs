// Empaquetage de NOCTA Mini : même code que NOCTA, autre nom, autre icône, autres versions.
// « noctaVariant: mini » dans le package.json empaqueté fait charger l'interface minimaliste.
const base = require('../package.json').build;

module.exports = {
  ...base,
  appId: 'app.nocta.mini',
  productName: 'NOCTA Mini',
  extraMetadata: { name: 'nocta-mini', productName: 'NOCTA Mini', noctaVariant: 'mini' },
  win: { ...base.win, icon: 'build/icon-mini.png' },
  nsis: { ...base.nsis, shortcutName: 'NOCTA Mini', artifactName: 'NOCTA-Mini-Setup.${ext}' },
  portable: { artifactName: 'NOCTA-Mini-Portable.${ext}' },
};
