// Abrir la app NO debe bajar archivos al telefono. El respaldo del dia lo hace
// el cron del worker a las 5am (09:00 UTC; Bolivia es UTC-4 todo el ano).
// 23-oct-2026: cada manana salian DOS ventanas de "guardar como" (un JSON y,
// dos segundos despues, un ZIP con adjuntos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');
const worker = fs.readFileSync(path.join(raiz, 'worker.js'), 'utf8');

const efectoDeRespaldo = () => {
  const i = html.indexOf('// Respaldo al abrir: SOLO a la nube');
  assert.ok(i > 0, 'no encuentro el efecto de respaldo');
  const j = html.indexOf('},[!!data && Object.keys(data).length>0]);', i);
  assert.ok(j > i, 'no encuentro el final del efecto');
  return html.slice(i, j);
};

test('abrir la app no baja ningun archivo', () => {
  const e = efectoDeRespaldo();
  assert.ok(!/\.click\(\)/.test(e), 'el arranque volvio a disparar una descarga');
  assert.ok(!/_downloadFullBackup/.test(e), 'el arranque volvio a bajar el ZIP');
  assert.ok(!/a\.download/.test(e), 'el arranque arma un enlace de descarga');
});

test('el arranque si sube la copia a la nube', () => {
  assert.ok(/\/backup\?key=/.test(efectoDeRespaldo()), 'ya no sube nada a la nube');
});

test('un respaldo fallido no bloquea el del dia siguiente', () => {
  // fetch no rechaza con 500 ni 413: sin mirar r.ok, un fallo marcaba "hecho"
  // y se saltaba 24 horas.
  assert.ok(/if \(r && r\.ok\) localStorage\.setItem\('lbp_last_backup'/.test(efectoDeRespaldo()),
            'se marca como hecho sin confirmar que el worker acepto');
});

test('la descarga manual sigue existiendo', () => {
  assert.ok(/window\._downloadBackup = function/.test(html));
  assert.ok(/window\._downloadBackup && window\._downloadBackup\(\)/.test(html), 'el boton no llama a la descarga');
});

test('el cron respalda a las 09:00 UTC = 5am Bolivia', () => {
  assert.ok(/_dBk\.getUTCHours\(\) === 9 && _dBk\.getUTCMinutes\(\) < 3/.test(worker),
            'cambio la hora del respaldo');
  assert.ok(/backup_mark:/.test(worker), 'sin la marca, el cron repetiria el respaldo cada minuto');
  assert.ok(/expirationTtl: 30 \* 86400/.test(worker), 'el respaldo deberia durar 30 dias');
});

test('worker.js sigue siendo ASCII puro', () => {
  // Un copy/paste al editor de Cloudflare corrompe los no-ASCII.
  const malos = [...worker].filter(c => c.charCodeAt(0) > 126 || c.charCodeAt(0) < 9);
  assert.equal(malos.length, 0, 'aparecieron ' + malos.length + ' caracteres no ASCII');
});

// ── La lista de secretos del wrangler.toml es la checklist pre-deploy ──────
// Existe porque un `wrangler deploy` ya borro dos secretos del dashboard: el
// comentario es lo que se revisa antes de desplegar. Un secreto que el worker
// lee y la lista no nombra es el mismo accidente otra vez.
test('wrangler.toml nombra todos los secretos que el worker lee', () => {
  const toml = fs.readFileSync(path.join(raiz, 'wrangler.toml'), 'utf8');
  const i = toml.indexOf('Secrets esperados');
  assert.ok(i > 0, 'no encuentro la lista de secretos esperados');
  // Se leen los nombres de la LISTA, que termina en el primer punto. Lo que venga
  // despues es prosa que explica para que sirve alguno: una mencion ahi no es
  // estar en la checklist, y tomarla como tal dejaba esta prueba sin poder fallar
  // (mutacion Minor5-M1: se saco ASIS_KEY de la lista y la prueba siguio verde).
  const desde = toml.indexOf(':', i) + 1;
  const hasta = toml.indexOf('.', desde);
  assert.ok(hasta > desde, 'la lista de secretos tiene que terminar en un punto');
  const checklist = new Set(toml.slice(desde, hasta).match(/[A-Z][A-Z0-9_]{2,}/g) || []);
  // Los secretos que el worker busca en env, menos los bindings de KV/R2/servicio.
  const leidos = new Set((worker.match(/env\.[A-Z][A-Z0-9_]+/g) || [])
    .map((m) => m.slice(4))
    .filter((n) => ['LBP_KV', 'LBP_R2', 'BRIEFING_SERVICE', 'BRIEFING_URL'].indexOf(n) < 0));
  assert.ok(leidos.has('ASIS_KEY'), 'la prueba no mide nada si el worker ya no lee ASIS_KEY');
  for (const n of leidos) {
    assert.ok(checklist.has(n), 'el secreto ' + n + ' no esta en la checklist del wrangler.toml');
  }
});

test('wrangler.toml conserva el cron de cada minuto y no declara [vars]', () => {
  const toml = fs.readFileSync(path.join(raiz, 'wrangler.toml'), 'utf8');
  assert.ok(toml.includes('crons = ["* * * * *"]'),
    'sin el cron de cada minuto el deploy lo borra y mueren las alarmas');
  assert.ok(!/^\s*\[vars\]/m.test(toml),
    'un [vars] aca reemplaza el conjunto de vars del worker y borra las del dashboard');
});
