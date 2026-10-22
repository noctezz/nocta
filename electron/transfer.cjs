// « Envoyer vers la TV » : pendant quelques minutes, le PC partage ses profils, addons et
// réglages sur le réseau local. L'appli NOCTA de la TV le retrouve toute seule et les récupère
// avec un code à 4 chiffres affiché sur le PC.
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const remote = require('./remote.cjs');

const PORT = 7990;
const DURATION = 10 * 60 * 1000;

let srv = null;
let code = '';
let until = 0;
let timer = null;
let tries = 0;

function stop() {
  clearTimeout(timer);
  timer = null;
  if (srv) srv.close();
  srv = null;
  code = '';
}

function status() {
  return {
    running: !!srv,
    code,
    until,
    ips: remote.addresses().lan,
    name: os.hostname(),
  };
}

/** Lance le partage ; getData renvoie les données à envoyer, onDone prévient l'interface */
function start(getData, onDone) {
  stop();
  code = String(crypto.randomInt(1000, 10000));
  until = Date.now() + DURATION;
  tries = 0;
  return new Promise((resolve) => {
    srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      // Découverte : la TV cherche les PC qui partagent en ce moment
      if (url.pathname === '/nocta') return res.end(JSON.stringify({ nocta: true, name: os.hostname() }));
      if (url.pathname === '/transfer') {
        // Trop d'essais ratés : le partage s'arrête (protection contre les codes devinés)
        if (url.searchParams.get('code') !== code) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'code' }));
          if (++tries >= 8) { stop(); onDone({ ok: false, reason: 'tries' }); }
          return;
        }
        res.end(JSON.stringify({ version: 1, data: getData() }));
        setTimeout(() => { stop(); onDone({ ok: true }); }, 500);
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    srv.on('error', (e) => { stop(); resolve({ ...status(), error: e.code === 'EADDRINUSE' ? 'Le port 7990 est déjà utilisé' : String(e.message || e) }); });
    srv.listen(PORT, '0.0.0.0', () => {
      timer = setTimeout(() => { stop(); onDone({ ok: false, reason: 'timeout' }); }, DURATION);
      resolve(status());
    });
  });
}

module.exports = { start, stop, status, PORT };
