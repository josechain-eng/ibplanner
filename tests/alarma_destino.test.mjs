// El destino de la alarma tiene que SOBREVIVIR al re-envio.
//
// Auditoria del 24-nov-2026: despues de recargar los dos equipos con la v5.79,
// las 201 alarmas de la nube seguian SIN destino. El lote (/alarms/batch) lo
// escribia bien, pero cada vez que la app vuelve al frente re-sube las alarmas
// futuras UNA POR UNA por POST /alarm (upsert, desde la v4.92), y ese camino
// reconstruia la alarma con campos fijos: el destino se perdia en silencio.
//
// Y el latido ahora dice que version corre cada equipo: sin eso no habia forma
// de saber si un arreglo no funcionaba o el equipo corria codigo viejo.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cargarWorker, kvFalso, envFalso, conReloj } from './_arnes_cron.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'LifeBusinessPlanner2026.html'), 'utf8');
const AHORA = Date.UTC(2026, 10, 24, 12, 0);
const IR = { ruta: 'tasks', refId: 't1' };

async function postear(kv, ruta, cuerpo) {
  const w = await cargarWorker();
  const env = envFalso({ LBP_KV: kv });
  env.LBP_KV.list = async () => ({ keys: [...kv._map.keys()].map((n) => ({ name: n })), list_complete: true });
  const req = new Request('https://w.test' + ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
  const res = await conReloj(AHORA, () => w.fetch(req, env));
  return { status: res.status, body: await res.json() };
}
const alarmas = (kv) => JSON.parse(kv._map.get('alarms:k_uno') || '[]');

// ── 1. POST /alarm, el camino del re-envio ─────────────────────────────────

test('POST /alarm guarda el destino', async () => {
  const kv = kvFalso({ 'data:k_uno': '{}' });
  await postear(kv, '/alarm', { syncKey: 'k_uno', alarmId: 'a1', triggerAt: AHORA + 3600000,
    title: 'T', body: 'B', vibration: 'long', ir: IR });
  assert.deepEqual(alarmas(kv)[0].ir, IR, 'el re-envio pierde el destino');
});

test('el re-envio NO borra el destino que puso el lote', async () => {
  // El caso medido: el lote escribe bien y el upsert de /alarm lo pisa.
  const kv = kvFalso({ 'data:k_uno': '{}' });
  await postear(kv, '/alarms/batch', { syncKey: 'k_uno',
    alarms: [{ alarmId: 'a1', triggerAt: AHORA + 3600000, title: 'T', body: 'B', vibration: 'long', ir: IR }] });
  assert.deepEqual(alarmas(kv)[0].ir, IR, 'el lote ya no guarda el destino');
  await postear(kv, '/alarm', { syncKey: 'k_uno', alarmId: 'a1', triggerAt: AHORA + 3600000,
    title: 'T', body: 'B', vibration: 'long', ir: IR });
  assert.deepEqual(alarmas(kv)[0].ir, IR, 'volver a la app borro el destino de la alarma');
});

test('una alarma sin destino se guarda igual, con ir nulo', async () => {
  const kv = kvFalso({ 'data:k_uno': '{}' });
  await postear(kv, '/alarm', { syncKey: 'k_uno', alarmId: 'a1', triggerAt: AHORA + 3600000, title: 'T', body: 'B' });
  assert.equal(alarmas(kv).length, 1);
  assert.equal(alarmas(kv)[0].ir, null);
});

test('la app manda el destino al re-subir las alarmas al volver al frente', () => {
  const i = HTML.indexOf("upsert por alarma (/alarm)");
  assert.ok(i > 0, 'no encuentro el re-envio del visibilitychange');
  const bloque = HTML.slice(i, i + 700);
  assert.match(bloque, /ir:\s*a\.ir\s*\|\|\s*null/,
    'el re-envio al volver al frente sigue mandando la alarma sin destino');
});

// ── 2. El latido dice que version corre el equipo ──────────────────────────

test('el latido guarda la version de cada equipo', async () => {
  const kv = kvFalso({ 'data:k_uno': '{}' });
  await postear(kv, '/latido', { syncKey: 'k_uno', equipo: 'mac', lastSave: 1, v: '5.80' });
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.equal(reg.mac.v, '5.80', 'sin la version no hay forma de saber que codigo corre el equipo');
});

test('una version con forma rara no se guarda entera', async () => {
  const kv = kvFalso({ 'data:k_uno': '{}' });
  await postear(kv, '/latido', { syncKey: 'k_uno', equipo: 'mac', lastSave: 1, v: 'x'.repeat(200) });
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.ok(String(reg.mac.v).length <= 16, 'guardo una version de ' + String(reg.mac.v).length + ' caracteres');
});

test('sin version el latido sigue funcionando', async () => {
  const kv = kvFalso({ 'data:k_uno': '{}' });
  const r = await postear(kv, '/latido', { syncKey: 'k_uno', equipo: 'mac', lastSave: 1 });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(kv._map.get('asis_latido:k_uno')).mac.v, '');
});

test('la app manda su version en el latido', () => {
  const i = HTML.indexOf('window._lbpLatido = function');
  const bloque = HTML.slice(i, i + 1600);   // el cuerpo lleva comentarios largos
  assert.match(bloque, /v:\s*(String\()?window\.LBP_VERSION/,
    'el latido no dice que version corre: ese dato es el que faltaba para auditar');
});
