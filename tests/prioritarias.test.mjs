// Las tareas PRIORITARIAS insisten durante el dia (v5.89).
//
// Pepe, 26-nov-2026: "al aprobar las tareas podriamos hacer algo especial para
// las que son realmente prioritarias [...] que me vuelva a sonar a la tarde si
// sigue abierta y que aparezca arriba y si no la cerre me avise una ultima vez
// al final del dia". Decidido con el: estrella al lado del tilde (aprobar en
// prioridad alta), los avisos a las 15:25 y 18:45 de Bolivia, y la regla vale
// para CUALQUIER tarea urgente o alta, venga del correo o la hayas hecho vos.
//
// El Worker corre en UTC y las pruebas tambien, sea cual sea la zona de la
// maquina (aqui es America/La_Paz y taparia los errores de hora sin zona).
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarWorker, kvFalso, envFalso, conReloj } from './_arnes_cron.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'worker.js'), 'utf8');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

function fuenteFuncion(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre + ' en worker.js');
  let nivel = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}' && --nivel === 0) return src.slice(i, j + 1);
  }
  assert.fail('no cierra ' + nombre);
}
// _asisDetectar y _prioAbiertas comparten helpers de modulo (_msBolivia desde el
// 26-nov, para que las dos lean las fechas con la misma regla), asi que hay que
// extraerlos junto con ellas.
function fuenteVar(nombre) {
  const i = src.indexOf('var ' + nombre + ' = {');
  assert.ok(i > 0, 'no encuentro var ' + nombre + ' en worker.js');
  return src.slice(i, src.indexOf('};', i) + 2);
}
const nombres = ['_hoyBolivia', '_msBolivia', '_prioAbiertas', '_asisDetectar'];
const { _prioAbiertas, _asisDetectar } = new Function(
  ['PRIO_PESO', 'PRIO_MUERTA'].map(fuenteVar).join('\n') + '\n'
  + nombres.map(fuenteFuncion).join('\n')
  + '\nreturn { _prioAbiertas: _prioAbiertas, _asisDetectar: _asisDetectar };')();

// Miercoles 26-nov-2026, 15:25 de Bolivia = 19:25 UTC.
const AHORA = Date.UTC(2026, 10, 26, 19, 25);
const HOY = '2026-11-26';
const T = (o) => Object.assign({ id: 't' + Math.random().toString(36).slice(2, 8),
  title: 'Tarea', status: 'TODO', priority: 'HIGH' }, o);
const conAlarma = (o, cuando) => T(Object.assign({ alarm: { enabled: true, datetime: cuando } }, o));

// ── Que tareas entran ───────────────────────────────────────────────────
test('entra la urgente o alta, abierta, a la que ya le tocaba', () => {
  const data = { tasks: [
    conAlarma({ id: 'a', title: 'Pagar aduana', priority: 'URGENT' }, HOY + 'T09:40'),
    conAlarma({ id: 'b', title: 'Llamar a Laura', priority: 'HIGH' }, HOY + 'T09:40'),
  ] };
  assert.deepEqual(_prioAbiertas(data, AHORA).map((t) => t.id), ['a', 'b']);
});

test('la media y la baja NO entran, por vencidas que esten', () => {
  const data = { tasks: [
    conAlarma({ id: 'm', priority: 'MEDIUM' }, HOY + 'T09:40'),
    conAlarma({ id: 'l', priority: 'LOW' }, HOY + 'T09:40'),
    conAlarma({ id: 'sin', priority: '' }, HOY + 'T09:40'),
  ] };
  assert.deepEqual(_prioAbiertas(data, AHORA), []);
});

test('la que ya cerraste no vuelve a sonar', () => {
  for (const st of ['DONE', 'CANCELLED', 'ARCHIVED']) {
    const data = { tasks: [conAlarma({ id: 'x', status: st }, HOY + 'T09:40')] };
    assert.deepEqual(_prioAbiertas(data, AHORA), [], 'sono una tarea en ' + st);
  }
});

test('una alarma que todavia no sono no entra: no "sigue abierta" aun', () => {
  const data = { tasks: [
    conAlarma({ id: 'luego' }, HOY + 'T22:00'),
    conAlarma({ id: 'manana' }, '2026-11-27T09:40'),
  ] };
  assert.deepEqual(_prioAbiertas(data, AHORA), []);
});

test('sin alarma vale el vencimiento: hoy o antes entra, manana no', () => {
  const data = { tasks: [
    T({ id: 'hoy', dueDate: HOY }),
    T({ id: 'ayer', dueDate: '2026-11-25' }),
    T({ id: 'manana', dueDate: '2026-11-27' }),
    T({ id: 'nada' }),
  ] };
  assert.deepEqual(_prioAbiertas(data, AHORA).map((t) => t.id).sort(), ['ayer', 'hoy']);
});

test('primero las urgentes, y dentro de cada una la mas vieja', () => {
  const data = { tasks: [
    conAlarma({ id: 'alta_hoy' }, HOY + 'T09:40'),
    conAlarma({ id: 'urg_hoy', priority: 'URGENT' }, HOY + 'T09:40'),
    conAlarma({ id: 'alta_vieja' }, '2026-11-20T09:40'),
    conAlarma({ id: 'urg_vieja', priority: 'URGENT' }, '2026-11-18T09:40'),
  ] };
  assert.deepEqual(_prioAbiertas(data, AHORA).map((t) => t.id),
    ['urg_vieja', 'urg_hoy', 'alta_vieja', 'alta_hoy']);
});

test('sin tareas no hay nada que decir', () => {
  assert.deepEqual(_prioAbiertas({}, AHORA), []);
  assert.deepEqual(_prioAbiertas(null, AHORA), []);
  assert.deepEqual(_prioAbiertas({ tasks: [] }, AHORA), []);
});

// ── Arriba en el asistente ──────────────────────────────────────────────
test('una prioritaria vencida se queda en "hoy", no cae a "puede esperar"', () => {
  // El asistente ordena ya -> hoy -> resto y corta en 5. Una tarea alta que
  // caia a "puede_esperar" al dia siguiente quedaba al fondo y nunca sonaba.
  const data = { tasks: [
    conAlarma({ id: 'alta', title: 'Pagar aduana', priority: 'HIGH' }, '2026-11-24T09:40'),
    conAlarma({ id: 'media', title: 'Ordenar fotos', priority: 'MEDIUM' }, '2026-11-24T09:40'),
  ] };
  const s = _asisDetectar(data, AHORA);
  const urg = (id) => (s.find((x) => x.id === 'stale_' + id) || {}).urgencia;
  assert.equal(urg('alta'), 'hoy', 'la prioritaria vieja tiene que pesar');
  assert.equal(urg('media'), 'puede_esperar', 'las demas no cambian');
});

test('la alarma de HOY no sube de tono por ser prioritaria', () => {
  // Ya es 'hoy'. Subirla a 'ya' la metia en el chequeo horario, que suena cada
  // hora de 7 a 21: una tarea alta abierta haria sonar el telefono 14 veces.
  const data = { tasks: [conAlarma({ id: 'p', priority: 'URGENT' }, HOY + 'T09:40')] };
  const s = _asisDetectar(data, AHORA);
  assert.equal((s.find((x) => x.id === 'today_p') || {}).urgencia, 'hoy');
  assert.equal(s.filter((x) => x.urgencia === 'ya').length, 0);
});

// ── El cron ─────────────────────────────────────────────────────────────
const LLAVE = 'lbp_prueba';
function kvConTarea(extra) {
  return kvFalso(Object.assign({
    // scheduledHandler corta en seco con el registro vacio (worker.js:3501).
    synckeys_registry: JSON.stringify([LLAVE]),
    asis_llave: LLAVE,
    ['data:' + LLAVE]: JSON.stringify({ _cloudSaveTime: AHORA - 60000,
      tasks: [{ id: 'p1', title: 'Pagar aduana Hugo', status: 'TODO', priority: 'URGENT',
                alarm: { enabled: true, datetime: HOY + 'T09:40' } }] }),
    ['subs:' + LLAVE]: '[]',   // sin suscripciones: nada sale a la red
  }, extra || {}));
}
const correr = async (ms, kv) => {
  const w = await cargarWorker();
  await conReloj(ms, () => w.scheduled({}, envFalso({ LBP_KV: kv })));
};

test('suena a las 15:25 y a las 18:45 de Bolivia, y no en otro momento', async () => {
  for (const [h, m, slot] of [[19, 25, 'prio1525'], [22, 45, 'prio1845']]) {
    const kv = kvConTarea();
    await correr(Date.UTC(2026, 10, 26, h, m), kv);
    assert.ok(kv._map.has('smart:' + LLAVE + ':' + HOY + ':' + slot),
      'no corrio el aviso de prioritarias a las ' + h + ':' + m + ' UTC');
  }
  for (const [h, m] of [[19, 20], [19, 28], [22, 40], [22, 50], [12, 25]]) {
    const kv = kvConTarea();
    await correr(Date.UTC(2026, 10, 26, h, m), kv);
    const marcas = [...kv._map.keys()].filter((k) => k.indexOf(':prio') > 0);
    assert.deepEqual(marcas, [], 'sono fuera de hora: ' + h + ':' + m + ' UTC');
  }
});

test('la ventana es de dos minutos pero el aviso sale UNA vez', async () => {
  // Cloudflare pierde ~20% de los disparos del cron: por eso la ventana es de
  // dos minutos. Que los dos disparos no den dos push lo garantiza la marca.
  const kv = kvConTarea();
  await correr(Date.UTC(2026, 10, 26, 19, 25), kv);
  const antes = kv._map.get('smart:' + LLAVE + ':' + HOY + ':prio1525');
  await correr(Date.UTC(2026, 10, 26, 19, 26), kv);
  assert.equal(kv._map.get('smart:' + LLAVE + ':' + HOY + ':prio1525'), antes,
    'el segundo disparo volvio a avisar');
});

test('sin prioritarias abiertas no suena ni deja marca', async () => {
  const kv = kvFalso({ synckeys_registry: JSON.stringify([LLAVE]), asis_llave: LLAVE,
    ['data:' + LLAVE]: JSON.stringify({ _cloudSaveTime: AHORA - 60000,
      tasks: [{ id: 'm1', title: 'Ordenar fotos', status: 'TODO', priority: 'MEDIUM',
                alarm: { enabled: true, datetime: HOY + 'T09:40' } }] }),
    ['subs:' + LLAVE]: '[]' });
  await correr(Date.UTC(2026, 10, 26, 19, 25), kv);
  assert.deepEqual([...kv._map.keys()].filter((k) => k.indexOf(':prio') > 0), [],
    'aviso sin tener nada que decir');
});

// ── La estrella al aprobar ──────────────────────────────────────────────
test('la tarjeta de propuestas tiene estrella ademas de tilde y cruz', () => {
  const i = html.indexOf('var TareasPropuestas');
  assert.ok(i > 0, 'no encuentro la tarjeta de propuestas');
  const card = html.slice(i, i + 14000);
  assert.match(card, /decidir\(p,'prio'\)/, 'no hay con que aprobar en prioridad alta');
  assert.match(card, /⭐|★/, 'la estrella no se dibuja');
});

test('aprobar con estrella crea la tarea en prioridad alta', () => {
  const i = html.indexOf("window._tpAplicar = function");
  assert.ok(i > 0, 'no encuentro _tpAplicar');
  const fn = html.slice(i, html.indexOf('\n};', i));
  assert.match(fn, /priority: *\(?[^,\n]*'HIGH'/,
    'el tilde con estrella tiene que crear la tarea en HIGH');
  assert.match(fn, /'MEDIUM'/, 'el tilde normal sigue creando en media');
});
