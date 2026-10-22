// « Envoyer vers la TV » : le PC cherche l'appli NOCTA de la TV sur le réseau local et lui
// envoie ses profils, addons et réglages, avec le code à 4 chiffres affiché sur la TV.
// C'est le PC qui se connecte à la TV : le pare-feu de Windows ne bloque pas ce sens-là.
const http = require('node:http');
const remote = require('./remote.cjs');

const PORT = 7991;

function request(ip, path, { method = 'GET', body, timeout = 1500 } = {}) {
  return new Promise((resolve) => {
    const req = http.request({
      host: ip, port: PORT, path, method, timeout,
      headers: body ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } : {},
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* réponse vide */ }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: e.code || e.message }));
    if (body) req.write(body);
    req.end();
  });
}

let scanId = 0;

/** Cherche les TV qui attendent un import ; onFound est appelé pour chaque TV trouvée */
async function scan(onFound) {
  const id = ++scanId;
  const own = remote.addresses().lan;
  const prefixes = [...new Set(own.map((ip) => ip.split('.').slice(0, 3).join('.')))].slice(0, 3);
  const targets = prefixes.flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`)).filter((x) => !own.includes(x));
  let next = 0;
  const worker = async () => {
    while (next < targets.length && id === scanId) {
      const ip = targets[next++];
      const r = await request(ip, '/nocta');
      if (r.status === 200 && r.data?.nocta === 'tv' && id === scanId) onFound({ ip, name: r.data.name || ip });
    }
  };
  await Promise.all(Array.from({ length: 64 }, worker));
  return { done: id === scanId };
}

function stopScan() { scanId++; }

/** Envoie les données à la TV ; 'code' = code faux, 'unreachable' = TV injoignable */
async function send(ip, code, data) {
  const r = await request(ip, `/import?code=${encodeURIComponent(code)}`, { method: 'POST', body: JSON.stringify({ version: 1, data }), timeout: 20000 });
  if (r.status === 200 && r.data?.ok) return { ok: true };
  if (r.status === 403) return { ok: false, error: 'code' };
  return { ok: false, error: r.status ? `http ${r.status}` : 'unreachable', detail: r.error };
}

module.exports = { scan, stopScan, send, PORT };
