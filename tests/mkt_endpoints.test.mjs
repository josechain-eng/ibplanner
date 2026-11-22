// Endpoints de las propuestas de marketing (v5.73): /active-campaigns,
// /mkt-proposals (POST y GET) y /mkt-decisions. Worker real, KV falso, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_mkt_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

function entorno(datos) {
  const kv = new Map();
  kv.set('data:lbp_x', JSON.stringify(datos || {}));
  return {
    kv,
    LBP_KV: {
      list: async op => ({ keys: [...kv.keys()].filter(n => n.indexOf((op && op.prefix) || '') === 0).map(n => ({ name: n })) }),
      get: async k => (kv.has(k) ? kv.get(k) : null),
      put: async (k, v) => { kv.set(k, v); },
    },
  };
}

const W = await cargar();
const get = async (env, q) => (await W.fetch(new Request('https://w.test' + q), env)).json();
const post = async (env, q, body) => (await W.fetch(new Request('https://w.test' + q, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env)).json();

const DATOS = {
  clients: [{ id: 'cl_boss', businessName: 'Boss' }, { id: 'cl_mango', name: 'Mango' }],
  campaigns: [
    { id: 'c1', name: 'Black Friday', dateStart: '2026-11-07', dateEnd: '2026-11-30', status: 'FINALIZADA',
      franchises: [{ clientId: 'cl_boss', lines: [], sublines: [{ name: 'Toda la tienda', discount: '50%' }] }] },
    { id: 'c2', name: 'Vieja', dateStart: '2026-10-01', dateEnd: '2026-10-31', status: 'ACTIVA',
      franchises: [{ clientId: 'cl_mango', lines: ['Mujer'], sublines: [{ name: 'Vestidos', discount: '30%' }] }] },
  ],
  mktDecididas: [
    { id: '2026-S48:BOSS:E1:Negro', decision: 'ok', nota: '', ts: 1 },
    { id: '2026-S48:BOSS:E2:Azul', decision: 'revocada', nota: '', ts: 2 },
    { id: 'oferta:2026-S48:HUGO', decision: 'precio_lleno', nota: '', ts: 3 },
    { id: '2026-S47:BOSS:E9:Rojo', decision: 'no', nota: '', ts: 4 },
  ],
};

test('las cuatro rutas rechazan una key que no existe', async () => {
  const env = entorno(DATOS);
  for (const q of ['/active-campaigns?key=otra&fecha=2026-11-23', '/mkt-proposals?key=otra', '/mkt-decisions?key=otra&semana=2026-S48']) {
    assert.equal((await get(env, q)).error, 'Key no valida', q);
  }
  assert.equal((await post(env, '/mkt-proposals', { key: 'otra', semana: '2026-S48', propuestas: [] })).error, 'Key no valida');
});

test('active-campaigns decide la vigencia por fechas, no por el campo status', async () => {
  const r = await get(entorno(DATOS), '/active-campaigns?key=lbp_x&fecha=2026-11-23');
  const v = Object.fromEntries(r.campanas.map(c => [c.id, c.vigencia]));
  assert.equal(v.c1, 'ACTIVA');
  assert.equal(v.c2, 'FINALIZADA');
  const bf = r.campanas.find(c => c.id === 'c1');
  assert.deepEqual(bf.tiendas[0], { clientId: 'cl_boss', clientName: 'Boss', lines: [],
    sublines: [{ name: 'Toda la tienda', discount: '50%' }] });
  assert.deepEqual(r.clientes, [{ id: 'cl_boss', name: 'Boss' }, { id: 'cl_mango', name: 'Mango' }]);
});

test('lo que sube la Mac es lo que lee la app', async () => {
  const env = entorno(DATOS);
  const semana = { key: 'lbp_x', semana: '2026-S48', generado: '2026-11-23T07:30:00',
    propuestas: [{ id: '2026-S48:BOSS:E1:Negro', tienda: 'BOSS' }], ofertas_faltantes: [], competencia: [], resumen_anterior: [] };
  const r = await post(env, '/mkt-proposals', semana);
  assert.deepEqual(r, { ok: true, semana: '2026-S48' });
  const leida = await get(env, '/mkt-proposals?key=lbp_x');
  assert.equal(leida.semana, '2026-S48');
  assert.deepEqual(leida.propuestas, semana.propuestas);
  assert.equal(leida.key, undefined, 'la sync key no se guarda dentro de la semana');
});

test('sin semana subida responde vacío con error', async () => {
  const r = await get(entorno(DATOS), '/mkt-proposals?key=lbp_x');
  assert.equal(r.error, 'sin semana');
  assert.deepEqual(r.propuestas, []);
});

test('rechaza propuestas que no son lista o que son más de 40', async () => {
  const env = entorno(DATOS);
  assert.ok((await post(env, '/mkt-proposals', { key: 'lbp_x', semana: '2026-S48', propuestas: 'x' })).error);
  const muchas = Array.from({ length: 41 }, (_, i) => ({ id: 'p' + i }));
  assert.ok((await post(env, '/mkt-proposals', { key: 'lbp_x', semana: '2026-S48', propuestas: muchas })).error);
  assert.ok((await post(env, '/mkt-proposals', { key: 'lbp_x', semana: 'S48', propuestas: [] })).error, 'semana mal escrita');
});

test('mkt-decisions filtra por semana y devuelve revocada tal cual', async () => {
  const r = await get(entorno(DATOS), '/mkt-decisions?key=lbp_x&semana=2026-S48');
  assert.deepEqual(r.decisiones.map(d => [d.id, d.decision]), [
    ['2026-S48:BOSS:E1:Negro', 'ok'], ['2026-S48:BOSS:E2:Azul', 'revocada'], ['oferta:2026-S48:HUGO', 'precio_lleno']]);
});
