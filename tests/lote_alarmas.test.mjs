// El lote de alarmas se parte en pedazos que pasen el tope de `keepalive`.
//
// Consola de Pepe, 24-nov-2026: "Flushing 658 alarms to cloud in one batch".
// 658 alarmas son ~170 KB, y `keepalive` tiene un tope de 64 KB: el envio FALLA
// y no se registra ninguna. En silencio. Las 201 que habia en la nube no las
// escribia el lote sino el re-envio de a una (visibilitychange), y por eso
// ninguna llevaba destino por mas que la app lo mandara.
//
// Es la misma trampa que en la v5.06 tuvo el blob congelado seis dias
// (sendBeacon de 64 KB contra un blob de 4 MB).
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const TOPE_KEEPALIVE = 65536;

// Extrae `function <nombre>() { ... }` por conteo de llaves.
function fuenteFuncion(nombre) {
  const i = HTML.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  let nivel = 0;
  for (let j = HTML.indexOf('{', i); j < HTML.length; j++) {
    if (HTML[j] === '{') nivel++;
    else if (HTML[j] === '}' && --nivel === 0) return HTML.slice(i, j + 1) + '\n';
  }
  assert.fail('no cierra ' + nombre);
}

// Monta _flushCloudAlarms con un buffer dado y dobles para todo lo externo.
function montar(cuantas) {
  const buffer = [];
  for (let i = 0; i < cuantas; i++) {
    buffer.push({
      alarmId: 'mwcrgijrvp3cgvlnfrd_17956152000' + String(i).padStart(2, '0'),
      triggerAt: 1795615200000 + i,
      title: 'Confirmar pedidos Mango Kids showroom enero y febrero antes del 04/12',
      body: 'Confirmar pedidos Mango Kids showroom enero y febrero antes del 04/12 - Tarea propuesta',
      vibration: 'long',
      ir: { ruta: 'tasks', refId: 'mwcrgijrvp3cgvlnfrd' },
    });
  }
  const envios = [];
  const _workerFetch = (ruta, opts) => {
    envios.push({ ruta, opts, bytes: Buffer.byteLength(opts.body), cuerpo: JSON.parse(opts.body) });
    return Promise.resolve({ ok: true, status: 200 });
  };
  const ctx = {
    _cloudAlarmBuffer: buffer.slice(),
    _cloudAlarmFlushTimer: null,
    localStorage: { getItem: (k) => (k === 'lbp_sync_key' ? 'k_uno' : null) },
    window: { LBP_WORKER_URL: 'https://w.test', LBP_VERSION: '5.81', _lbpEquipo: () => ({ id: 'mac' }) },
    _workerFetch,
    console: { log() {}, warn() {}, error() {} },
    envios,
  };
  const correr = new Function('ctx',
    'var _cloudAlarmBuffer = ctx._cloudAlarmBuffer, _cloudAlarmFlushTimer = ctx._cloudAlarmFlushTimer;' +
    'var localStorage = ctx.localStorage, window = ctx.window, _workerFetch = ctx._workerFetch, console = ctx.console;' +
    fuenteFuncion('_flushCloudAlarms') +
    'return { r: _flushCloudAlarms(), buffer: _cloudAlarmBuffer };');
  const estado = {};
  return { ctx, envios, estado, correr: async () => { const o = correr(ctx); await o.r; estado.buffer = o.buffer; } };
}

const todasLasAlarmas = (envios) => envios.reduce((acc, e) => acc.concat(e.cuerpo.alarms), []);

test('658 alarmas NO se mandan en un solo envio que supera el tope', async () => {
  const m = montar(658);
  await m.correr();
  assert.ok(m.envios.length > 0, 'no mando nada');
  const grande = m.envios.filter((e) => e.bytes > TOPE_KEEPALIVE);
  assert.deepEqual(grande.map((e) => e.bytes), [],
    'hay envios de ' + grande.map((e) => e.bytes) + ' bytes: con keepalive fallan en silencio');
});

test('no se pierde ni una alarma al partir el lote', async () => {
  const m = montar(658);
  await m.correr();
  const ids = todasLasAlarmas(m.envios).map((a) => a.alarmId);
  assert.equal(ids.length, 658, 'mando ' + ids.length + ' de 658');
  assert.equal(new Set(ids).size, 658, 'hay alarmas repetidas o perdidas');
});

test('cada pedazo lleva la sync key y el destino de cada alarma', async () => {
  const m = montar(658);
  await m.correr();
  for (const e of m.envios) {
    assert.equal(e.ruta, '/alarms/batch');
    assert.equal(e.cuerpo.syncKey, 'k_uno', 'un pedazo fue sin sync key');
    assert.ok(e.cuerpo.alarms.length > 0);
  }
  assert.ok(todasLasAlarmas(m.envios).every((a) => a.ir && a.ir.ruta === 'tasks'),
    'al partir el lote se perdio el destino');
});

test('un lote chico sigue yendo en UN solo envio', async () => {
  // No se parte por partir: con pocas alarmas es una sola llamada, como siempre.
  const m = montar(5);
  await m.correr();
  assert.equal(m.envios.length, 1);
  assert.ok(m.envios[0].bytes < TOPE_KEEPALIVE);
});

test('una sola alarma gigante se manda igual, aunque no entre', async () => {
  // Preferible intentarlo y que falle visible, a no mandarla nunca.
  const m = montar(1);
  m.ctx._cloudAlarmBuffer[0].title = 'x'.repeat(70000);
  await m.correr();
  assert.equal(m.envios.length, 1, 'descarto la alarma en vez de intentar mandarla');
});

test('el buffer queda vacio despues de mandar', async () => {
  const m = montar(658);
  await m.correr();
  assert.equal(m.estado.buffer.length, 0);
});
