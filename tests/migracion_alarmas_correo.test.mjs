// Conversion de las tareas del correo ya aceptadas (alarma 'once') a 'weekdays2'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

function cuerpo(i) {
  let nivel = 0;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') nivel++;
    else if (html[j] === '}' && --nivel === 0) return html.slice(i, j + 1);
  }
  assert.fail('no cierra');
}
const i = html.indexOf('window._lbpMigrarAlarmasCorreo = function');
assert.ok(i > 0, 'no encuentro window._lbpMigrarAlarmasCorreo');
const corte = html.match(/var LBP_CORTE_V574 = \d+;/);
assert.ok(corte, 'no encuentro la constante LBP_CORTE_V574');
const win = new Function('var window = {};\n' + corte[0] + '\n' + cuerpo(i) + ';\nreturn window;')();

const base = (over) => Object.assign({
  id: 't1', title: 'Pagar royalty', status: 'INBOX', tags: ['Correo'],
  alarm: { enabled: true, datetime: '2026-11-20T09:40:00', recurrence: 'once' }
}, over);

test('convierte la tarea del correo sin terminar', () => {
  const r = win._lbpMigrarAlarmasCorreo([base()]);
  assert.equal(r.cambiadas, 1);
  assert.equal(r.tasks[0].alarm.recurrence, 'weekdays2');
  assert.equal(r.tasks[0].alarm.datetime, '2026-11-20T09:40:00'); // la base NO se toca
});

test('es idempotente: la segunda pasada no cambia nada', () => {
  const r1 = win._lbpMigrarAlarmasCorreo([base()]);
  const r2 = win._lbpMigrarAlarmasCorreo(r1.tasks);
  assert.equal(r2.cambiadas, 0);
  assert.equal(r2.tasks, r1.tasks, 'sin cambios tiene que devolver el MISMO array');
});

test('no toca lo que no corresponde', () => {
  for (const t of [
    base({ status: 'DONE' }), base({ status: 'CANCELLED' }), base({ status: 'ARCHIVED' }),
    base({ tags: ['Trabajo'] }), base({ tags: undefined }),
    base({ alarm: { enabled: false, datetime: '2026-11-20T09:40:00', recurrence: 'once' } }),
    base({ alarm: { enabled: true, datetime: '2026-11-20T09:40:00', recurrence: 'daily' } }),
    base({ alarm: null }),
  ]) assert.equal(win._lbpMigrarAlarmasCorreo([t]).cambiadas, 0, JSON.stringify(t.alarm) + ' ' + t.status);
});

test('no inventa updatedAt: lo sella el camino de sincronizacion', () => {
  const r = win._lbpMigrarAlarmasCorreo([base()]);
  assert.equal('updatedAt' in r.tasks[0], false);
});

test('una lista vacia o ausente no rompe', () => {
  assert.equal(win._lbpMigrarAlarmasCorreo([]).cambiadas, 0);
  assert.equal(win._lbpMigrarAlarmasCorreo(undefined).cambiadas, 0);
});

// El efecto de App esta compilado dentro del HTML y no se puede ejecutar aislado:
// estas pruebas son ESTRUCTURALES sobre el fuente y fijan el orden de las decisiones.
test('el efecto migra una sola vez por dispositivo y espera a la nube', () => {
  const ini = html.indexOf('Migracion UNICA POR DISPOSITIVO');
  assert.ok(ini > 0, 'no encuentro el efecto de migracion');
  const fin = html.indexOf('_migN]);', ini);
  assert.ok(fin > ini, 'no encuentro el cierre del efecto');
  const ef = html.slice(ini, fin);
  const iLee = ef.indexOf("localStorage.getItem('lbp_migr_alarmas_correo')");
  const iGate = ef.indexOf("!window._lbpCloudPullDone");
  const iConv = ef.indexOf('window._lbpMigrarAlarmasCorreo(data.tasks)');
  const iEscribe = ef.indexOf("localStorage.setItem('lbp_migr_alarmas_correo'");
  assert.ok(iLee > 0 && iGate > 0 && iConv > 0 && iEscribe > 0, 'falta alguna pieza');
  assert.ok(iLee < iGate && iGate < iConv && iConv < iEscribe,
    'orden esperado: leer marca, esperar nube, convertir, escribir marca');
  // el marcador va despues de la conversion, nunca antes de ver datos reales
  assert.equal(ef.split("setItem('lbp_migr_alarmas_correo'").length - 1, 1);
  // localStorage protegido: lectura y escritura dentro de try/catch
  assert.match(ef, /try \{ if \(localStorage\.getItem\('lbp_migr_alarmas_correo'\)\) return; \}\s*catch/);
  assert.match(ef, /try \{ localStorage\.setItem\('lbp_migr_alarmas_correo', '1'\); \} catch/);
  // la senal que espera existe y se pone al terminar el pull
  assert.ok(html.includes('window._lbpCloudPullDone = true'));
});

test('no convierte una tarea que el usuario toco despues del corte de v5.74', () => {
  // Medianoche del 23-nov-2026 en Bolivia (UTC-4) = 04:00 UTC.
  const corteMs = Date.UTC(2026, 10, 23, 4, 0, 0);
  assert.equal(Number(corte[0].match(/= (\d+)/)[1]), corteMs, 'el corte no es la medianoche boliviana del 23-nov');
  const despues = base({ updatedAt: corteMs + 1 });
  const r = win._lbpMigrarAlarmasCorreo([despues]);
  assert.equal(r.cambiadas, 0, 'una decision posterior al lanzamiento no se deshace');
  assert.equal(r.tasks[0].alarm.recurrence, 'once');
});

test('convierte una tarea tocada antes del corte, y una sin updatedAt', () => {
  const corteMs = Date.UTC(2026, 10, 23, 4, 0, 0);
  const antes = win._lbpMigrarAlarmasCorreo([base({ updatedAt: corteMs - 1 })]);
  assert.equal(antes.cambiadas, 1);
  assert.equal(antes.tasks[0].alarm.recurrence, 'weekdays2');
  const sin = win._lbpMigrarAlarmasCorreo([base()]);
  assert.equal('updatedAt' in base(), false);
  assert.equal(sin.cambiadas, 1);
  // mezcladas en la misma lista: cada una por su cuenta
  const mix = win._lbpMigrarAlarmasCorreo([base({ id: 'a', updatedAt: corteMs + 5 }), base({ id: 'b', updatedAt: corteMs - 5 })]);
  assert.deepEqual(mix.tasks.map(t => t.alarm.recurrence), ['once', 'weekdays2']);
});
