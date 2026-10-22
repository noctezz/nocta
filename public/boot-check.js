// Vérification du démarrage (écrite en JavaScript ancien, pour marcher partout) : si l'interface
// ne s'affiche pas, on explique pourquoi au lieu de laisser un écran vide.
(function () {
  var errors = [];
  window.addEventListener('error', function (e) {
    errors.push((e && (e.message || (e.error && e.error.message))) || 'erreur inconnue');
  });
  window.addEventListener('unhandledrejection', function (e) {
    errors.push('Promesse : ' + ((e && e.reason && (e.reason.message || e.reason)) || 'inconnue'));
  });
  setTimeout(function () {
    var root = document.getElementById('root');
    if (root && root.children.length) return;
    var m = /Chrome\/(\d+)/.exec(navigator.userAgent);
    var version = m ? parseInt(m[1], 10) : 0;
    var old = version && version < 100;
    var box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;top:0;left:0;right:0;bottom:0;background:#0b0b0e;color:#f5f5f7;font-family:sans-serif;padding:60px 80px;font-size:22px;line-height:1.5;overflow:auto;z-index:9999');
    var html = '<div style="color:#e50f3a;font-size:44px;font-weight:900;margin-bottom:24px">NOCTA</div>';
    if (old) {
      html += '<p><b>Le moteur web de cet appareil est trop ancien</b> (version ' + version + ').</p>' +
        '<p>Ouvre le <b>Play Store</b>, cherche <b>Android System WebView</b> et fais la <b>mise à jour</b>, puis relance NOCTA.</p>';
    } else {
      html += '<p><b>L\'interface n\'a pas pu démarrer.</b></p>';
    }
    html += '<p style="color:#a3a3ad;font-size:16px;margin-top:30px">Pour le diagnostic : moteur ' + (version || 'inconnu') + ' · ' +
      navigator.userAgent.replace(/</g, '') + '</p>';
    if (errors.length) html += '<p style="color:#ff8a8a;font-size:16px">' + errors.slice(0, 4).join('<br>').replace(/</g, '&lt;') + '</p>';
    box.innerHTML = html;
    document.body.appendChild(box);
  }, 9000);
})();
