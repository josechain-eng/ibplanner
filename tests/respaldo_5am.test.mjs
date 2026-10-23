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
