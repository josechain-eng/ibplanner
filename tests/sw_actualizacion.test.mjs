// Como se actualiza la app: la PRIMERA carga despues de un despliegue tiene que
// traer la version nueva, no la anterior.
//
// Medido el 24-nov-2026 contra el sitio publicado: pedir la app devolvio la
// v5.69 teniendo la v5.79 en el servidor (identica byte a byte por curl). El
// service worker servia la copia guardada y revalidaba por detras
// (stale-while-revalidate, v4.91), asi que hacia falta cargar DOS veces. La
// consecuencia no era cosmetica: las alarmas se re-registraron con codigo viejo
// y quedaron sin destino.
//
// Ahora: red primero, copia guardada solo si la red falla o tarda demasiado. La
// promesa de abrir offline se mantiene --es el unico caso en que se usa la copia.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SW = fs.readFileSync(path.join(import.meta.dirname, '..', 'sw.js'), 'utf8');
const APP = 'https://app.test/LifeBusinessPlanner2026.html';

// Cache de mentira con un Map de verdad: lo que se guarda se puede volver a leer.
function cacheFalso(inicial) {
  const m = new Map(Object.entries(inicial || {}));
  const clave = (r) => (typeof r === 'string' ? r : String(r.url)).split('/').pop();
  return {
    _m: m,
    async match(r) { const v = m.get(clave(r)); return v === undefined ? undefined : new Response(v); },
    async put(r, resp) { m.set(clave(r), await resp.text()); },
    async keys() { return [...m.keys()].map((k) => new Request('https://app.test/' + k)); },
    async add() {}, async addAll() {}, async delete() { return true; },
  };
}

function cargarSW(opts) {
  const o = opts || {};
  const cache = cacheFalso(o.cache);
  const pedidos = [];
  const listeners = {};
  const self = {
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    registration: { scope: 'https://app.test/', showNotification: async () => {}, getNotifications: async () => [] },
    clients: { matchAll: async () => [], openWindow: async () => null, claim: async () => {} },
    skipWaiting: () => {},
    location: { origin: 'https://app.test', href: 'https://app.test/sw.js' },
  };
  const caches = { open: async () => cache, keys: async () => ['lbp-shell-v1'],
                   match: async (r) => cache.match(r), delete: async () => true };
  const fetchFalso = async (req) => {
    pedidos.push(String(req && req.url ? req.url : req));
    if (o.red === 'caida') throw new Error('sin red');
    if (o.red === 'lenta') { await new Promise((r) => setTimeout(r, o.demora || 9000)); }
    return new Response(o.cuerpo === undefined ? 'HTML DE LA RED' : o.cuerpo,
      { status: o.status || 200 });
  };
  new Function('self', 'caches', 'fetch', 'Request', 'Response', SW)(self, caches, fetchFalso, Request, Response);
  const pedir = (url, mode) => {
    let resp;
    // `mode` de Request es de solo lectura: se usa un objeto plano con lo que
    // el handler mira (url, method, mode).
    const req = { url: url, method: 'GET', mode: mode || 'navigate' };
    const e = { request: req, respondWith: (p) => { resp = p; }, waitUntil: () => {} };
    for (const f of (listeners.fetch || [])) f(e);
    return resp;
  };
  return { cache, pedidos, pedir };
}

const texto = async (p) => (p ? (await p).text() : '(no respondio)');

test('con red, la primera carga trae lo NUEVO aunque haya copia guardada', async () => {
  const sw = cargarSW({ cache: { 'LifeBusinessPlanner2026.html': 'HTML VIEJO' } });
  assert.equal(await texto(sw.pedir(APP)), 'HTML DE LA RED',
    'sirvio la copia guardada: hacen falta dos cargas para ver un despliegue');
});

test('lo que trae la red queda guardado para el proximo offline', async () => {
  const sw = cargarSW({ cache: { 'LifeBusinessPlanner2026.html': 'HTML VIEJO' } });
  await texto(sw.pedir(APP));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sw.cache._m.get('LifeBusinessPlanner2026.html'), 'HTML DE LA RED',
    'no actualizo la copia: la proxima vez sin red abriria algo viejo');
});

test('SIN red, abre con la copia guardada', async () => {
  // La promesa de la v4.91 no se rompe: offline sigue abriendo.
  const sw = cargarSW({ red: 'caida', cache: { 'LifeBusinessPlanner2026.html': 'HTML GUARDADO' } });
  assert.equal(await texto(sw.pedir(APP)), 'HTML GUARDADO');
});

test('con red LENTA no se queda colgada: sirve la copia', async () => {
  // Wifi del mall. Sin tope, red-primero dejaria la app en blanco esperando.
  const sw = cargarSW({ red: 'lenta', demora: 9000, cache: { 'LifeBusinessPlanner2026.html': 'HTML GUARDADO' } });
  const t0 = Date.now();
  const r = await texto(sw.pedir(APP));
  assert.equal(r, 'HTML GUARDADO');
  assert.ok(Date.now() - t0 < 7000, 'tardo ' + (Date.now() - t0) + ' ms en rendirse');
});

test('sin red y sin copia, contesta algo y no revienta', async () => {
  const sw = cargarSW({ red: 'caida', cache: {} });
  const p = sw.pedir(APP);
  assert.ok(p, 'no respondio nada al evento fetch');
  await p.then(function () {}, function () {});   // cualquiera de las dos, pero sin tirar sin atrapar
});

test('una respuesta de error de la red NO pisa la copia buena', async () => {
  const sw = cargarSW({ status: 503, cuerpo: 'error del servidor',
                        cache: { 'LifeBusinessPlanner2026.html': 'HTML BUENO' } });
  await texto(sw.pedir(APP));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sw.cache._m.get('LifeBusinessPlanner2026.html'), 'HTML BUENO',
    'guardo un 503 como si fuera la app');
});

test('React del CDN sigue saliendo del cache, sin pedirlo a la red', async () => {
  // Esto NO cambia: son archivos versionados y es lo que hace que abra rapido.
  const url = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js';
  const sw = cargarSW({ cache: { 'react.production.min.js': 'REACT GUARDADO' } });
  assert.equal(await texto(sw.pedir(url, 'no-cors')), 'REACT GUARDADO');
  assert.deepEqual(sw.pedidos, [], 'salio a la red por algo que ya tenia guardado');
});
