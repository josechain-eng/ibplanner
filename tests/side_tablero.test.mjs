// Tablero de side hustles dentro de LB Planner.
//   GET  /side?key=            -> el tablero armado (base de KV + ventas de Hotmart)
//   POST /side/hotmart         -> postback de Hotmart (cabecera X-HOTMART-HOTTOK)
// Se prueba el worker REAL con el arnes de tests/_arnes_cron.mjs.
//
// El Worker corre en UTC; esta prueba tambien, sea cual sea la zona de la maquina.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cargarWorker, kvFalso, envFalso, conReloj } from './_arnes_cron.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const KEY = 'lbp_clave_de_prueba';      // clave inventada, nunca una real
const HOTTOK = 'hottok-de-prueba';      // secreto inventado

// Base minima pero con la forma real: dos productos, uno con ventas previas.
const BASE = {
  actualizado: '2026-11-27T19:00:00Z',
  productos: [
    { id: 'dormir', nombre: 'Dormir bien', linea: 'digital', hotmart: '8711675',
      precio: '$399 MXN', dejaPorVenta: 15.44, marketing: 141.96, otros: 0,
      ventasBase: 3, ingresoBase: 46.32 },
    { id: 'collar', nombre: 'Collar', linea: 'dropshipping', hotmart: '',
      precio: 'US$69,95', dejaPorVenta: 49.62, marketing: 38.35, otros: 12.14,
      ventasBase: 0, ingresoBase: 0 },
  ],
};

function kvConLista(entradas) {
  const kv = kvFalso(entradas);
  const gets = [], lists = [];
  const get0 = kv.get;
  kv.get = async (k) => { gets.push(k); return get0(k); };
  kv.list = async (opts) => {
    lists.push(opts);
    const pre = (opts && opts.prefix) || '';
    return { keys: [...kv._map.keys()].filter(n => n.indexOf(pre) === 0).map(n => ({ name: n })), list_complete: true };
  };
  kv._gets = gets; kv._lists = lists;
  return kv;
}

const mundo = (extra) => kvConLista(Object.assign({
  ['data:' + KEY]: JSON.stringify({ _cloudSaveTime: 1 }),
  side_base: JSON.stringify(BASE),
}, extra || {}));

async function pedir(kv, metodo, ruta, opts) {
  const o = opts || {};
  const env = envFalso({ LBP_KV: kv });
  if (o.sinHottok) delete env.HOTMART_HOTTOK; else env.HOTMART_HOTTOK = o.hottokEnv || HOTTOK;
  const w = await cargarWorker();
  const init = { method: metodo, headers: o.headers || {} };
  if (o.body !== undefined) init.body = o.body;
  const r = await w.fetch(new Request('https://x' + ruta, init), env);
  const txt = await r.text();
  let cuerpo = null; try { cuerpo = JSON.parse(txt); } catch (e) { /* no era JSON */ }
  return { status: r.status, txt, cuerpo };
}

// Postback con la forma de Hotmart 2.0. Lleva datos personales a proposito:
// la prueba exige que NO se guarden.
function postback(o) {
  const op = o || {};
  return {
    id: op.id || 'evt-1',
    event: op.event || 'PURCHASE_APPROVED',
    version: '2.0.0',
    data: {
      product: { id: op.producto || 8711675, name: 'Dormir bien' },
      purchase: {
        transaction: op.transaccion || 'HP0000001',
        status: op.estado || 'APPROVED',
        price: { value: 399.01, currency_value: 'MXN' },
        offer: { code: 'udwdh90m' },
        sckPaymentLink: op.sck || 'meta10v',
      },
      buyer: { email: 'alguien@ejemplo.com', name: 'Nombre Apellido', checkout_phone: '+5215500000000' },
      commissions: [{ value: op.neto === undefined ? 15.44 : op.neto, currency_value: 'USD', source: 'PRODUCER' }],
    },
  };
}
const mandar = (kv, cuerpo, opts) => pedir(kv, 'POST', '/side/hotmart',
  Object.assign({ headers: { 'X-HOTMART-HOTTOK': HOTTOK, 'content-type': 'application/json' },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }, opts || {}));

// ── GET /side ──────────────────────────────────────────────────────────────

test('GET /side sin key da error y NO lee el tablero', async () => {
  const kv = mundo();
  const r = await pedir(kv, 'GET', '/side');
  assert.equal(r.status, 400);
  assert.ok(r.cuerpo.error);
  assert.ok(!kv._gets.includes('side_base'), 'no debe leer la base sin key');
});

test('GET /side con key invalida no devuelve el tablero', async () => {
  const kv = mundo();
  for (const mala of ['cualquier-cosa', 'lbp_', 'otra_key']) {
    const r = await pedir(kv, 'GET', '/side?key=' + mala);
    assert.ok(r.cuerpo.error, 'deberia rechazar ' + mala);
    assert.ok(!r.cuerpo.productos, 'no debe filtrar productos con ' + mala);
  }
});

test('GET /side con key valida devuelve los productos y los totales', async () => {
  const kv = mundo();
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.productos.length, 2);
  const t = r.cuerpo.totales;
  assert.equal(t.clientes, 3);
  assert.equal(t.marketing, 180.31);              // 141,96 + 38,35
  assert.equal(t.otros, 12.14);
  assert.equal(t.ingreso, 46.32);
  assert.equal(t.resultado, -146.13);             // 46,32 - 180,31 - 12,14
});

test('GET /side calcula el resultado de cada producto', async () => {
  const kv = mundo();
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  const d = r.cuerpo.productos.find(x => x.id === 'dormir');
  const c = r.cuerpo.productos.find(x => x.id === 'collar');
  assert.equal(d.clientes, 3);
  assert.equal(d.ingreso, 46.32);
  assert.equal(d.resultado, -95.64);
  assert.equal(c.clientes, 0);
  assert.equal(c.resultado, -50.49);              // 0 - 38,35 - 12,14
});

test('GET /side sin base cargada avisa en vez de romperse', async () => {
  const kv = kvConLista({ ['data:' + KEY]: JSON.stringify({ _cloudSaveTime: 1 }) });
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.status, 200);
  assert.ok(r.cuerpo.error, 'deberia decir que no hay tablero cargado');
});

// ── las ventas de Hotmart entran al tablero ────────────────────────────────

test('una venta aprobada de Hotmart suma al producto y a los totales', async () => {
  const kv = mundo();
  const r1 = await mandar(kv, postback({ transaccion: 'HP1' }));
  assert.equal(r1.status, 200);
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  const d = r.cuerpo.productos.find(x => x.id === 'dormir');
  assert.equal(d.clientes, 4, 'las 3 previas + la nueva');
  assert.equal(d.ingreso, 61.76);                 // 46,32 + 15,44
  assert.equal(r.cuerpo.totales.clientes, 4);
  assert.equal(r.cuerpo.totales.ingreso, 61.76);
});

test('la venta usa lo que realmente cobro Pepe, no el precio de lista', async () => {
  const kv = mundo();
  await mandar(kv, postback({ transaccion: 'HP9', neto: 9.01 }));
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  const d = r.cuerpo.productos.find(x => x.id === 'dormir');
  assert.equal(d.ingreso, 55.33);                 // 46,32 + 9,01
});

test('una venta de un producto que no esta en la base no rompe el tablero', async () => {
  const kv = mundo();
  await mandar(kv, postback({ transaccion: 'HP7', producto: 9999999 }));
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.totales.clientes, 3, 'no se cuenta en ningun producto');
  assert.ok(r.cuerpo.sinUbicar >= 1, 'pero queda avisado');
});

test('el id del producto se guarda aunque sea 0 (la prueba de Hotmart manda 0)', async () => {
  // El sandbox de Hotmart manda product.id = 0. Con `|| ''` el cero se perdia y
  // la venta quedaba sin producto: silenciosa, con cara de sana.
  const kv = mundo();
  const p = postback({ transaccion: 'HP0' });
  p.data.product.id = 0;
  await mandar(kv, p);
  const v = JSON.parse(kv._map.get('side_hotmart'))[0];
  assert.equal(v.producto, '0', 'el id 0 no se puede perder');
});

test('se guarda tambien el ucode del producto', async () => {
  // Es el identificador estable de Hotmart: si algun dia el id no viene, el
  // ucode permite ubicar la venta en vez de perderla.
  const kv = mundo();
  const p = postback({ transaccion: 'HPu' });
  p.data.product.ucode = 'fb056612-bcc6-4217-9e6d-2a5d1110ac2f';
  await mandar(kv, p);
  const v = JSON.parse(kv._map.get('side_hotmart'))[0];
  assert.equal(v.ucode, 'fb056612-bcc6-4217-9e6d-2a5d1110ac2f');
});

// ── POST /side/hotmart: seguridad ──────────────────────────────────────────

test('postback sin hottok da 401 y no guarda nada', async () => {
  const kv = mundo();
  const r = await mandar(kv, postback(), { headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 401);
  assert.equal(kv._map.get('side_hotmart'), undefined);
});

test('postback con hottok equivocado da 401', async () => {
  const kv = mundo();
  const r = await mandar(kv, postback(), { headers: { 'X-HOTMART-HOTTOK': 'otro', 'content-type': 'application/json' } });
  assert.equal(r.status, 401);
  assert.equal(kv._map.get('side_hotmart'), undefined);
});

test('sin el secreto configurado en el worker, el postback se rechaza', async () => {
  const kv = mundo();
  const r = await mandar(kv, postback(), { sinHottok: true });
  assert.equal(r.status, 401);
});

test('postback con json roto da 400 y no guarda nada', async () => {
  const kv = mundo();
  const r = await mandar(kv, '{no es json');
  assert.equal(r.status, 400);
  assert.equal(kv._map.get('side_hotmart'), undefined);
});

// ── POST /side/hotmart: que se guarda y que no ─────────────────────────────

test('NO se guardan datos personales del comprador', async () => {
  const kv = mundo();
  await mandar(kv, postback({ transaccion: 'HP2' }));
  const crudo = kv._map.get('side_hotmart') || '';
  for (const dato of ['alguien@ejemplo.com', 'Nombre Apellido', '+5215500000000', 'ejemplo.com']) {
    assert.ok(crudo.indexOf(dato) < 0, 'se colo un dato personal: ' + dato);
  }
  const v = JSON.parse(crudo)[0];
  assert.equal(v.transaccion, 'HP2');
  assert.equal(v.producto, '8711675');
  assert.equal(v.sck, 'meta10v');
});

test('la misma transaccion dos veces se cuenta una sola vez', async () => {
  const kv = mundo();
  await mandar(kv, postback({ transaccion: 'HP3' }));
  await mandar(kv, postback({ transaccion: 'HP3', id: 'evt-2' }));
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.cuerpo.productos.find(x => x.id === 'dormir').clientes, 4);
  assert.equal(JSON.parse(kv._map.get('side_hotmart')).length, 1);
});

test('un evento que no es compra aprobada no suma un cliente', async () => {
  const kv = mundo();
  for (const ev of ['PURCHASE_BILLET_PRINTED', 'PURCHASE_OUT_OF_SHOPPING_CART', 'PURCHASE_DELAYED']) {
    await mandar(kv, postback({ transaccion: 'HPx' + ev, event: ev }));
  }
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.cuerpo.productos.find(x => x.id === 'dormir').clientes, 3);
});

test('un reembolso descuenta la venta', async () => {
  const kv = mundo();
  await mandar(kv, postback({ transaccion: 'HP4' }));
  let r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.cuerpo.productos.find(x => x.id === 'dormir').clientes, 4);
  await mandar(kv, postback({ transaccion: 'HP4', id: 'evt-r', event: 'PURCHASE_REFUNDED' }));
  r = await pedir(kv, 'GET', '/side?key=' + KEY);
  const d = r.cuerpo.productos.find(x => x.id === 'dormir');
  assert.equal(d.clientes, 3, 'vuelve a las 3 de la base');
  assert.equal(d.ingreso, 46.32, 'y devuelve la plata');
});

test('una compra cancelada tambien descuenta', async () => {
  const kv = mundo();
  await mandar(kv, postback({ transaccion: 'HP5' }));
  await mandar(kv, postback({ transaccion: 'HP5', id: 'evt-c', event: 'PURCHASE_CANCELED' }));
  const r = await pedir(kv, 'GET', '/side?key=' + KEY);
  assert.equal(r.cuerpo.productos.find(x => x.id === 'dormir').clientes, 3);
});

test('la lista de ventas no crece sin limite', async () => {
  const kv = mundo();
  const viejas = [];
  for (let i = 0; i < 300; i++) viejas.push({ transaccion: 'VIEJA' + i, producto: '8711675', estado: 'aprobada', neto: 1 });
  kv._map.set('side_hotmart', JSON.stringify(viejas));
  await mandar(kv, postback({ transaccion: 'HP6' }));
  const lista = JSON.parse(kv._map.get('side_hotmart'));
  assert.ok(lista.length <= 200, 'deberia recortarse, quedaron ' + lista.length);
  assert.ok(lista.some(v => v.transaccion === 'HP6'), 'la nueva no se puede perder');
});

// ── POST /side/venta: Fourthwall y Dodo ────────────────────────────────────
// Esos dos ya validan la firma del proveedor en sus propios workers; aca llega
// la venta ya limpia, firmada con una clave nuestra.

const PUSH = 'side-push-de-prueba';
const BASE2 = {
  productos: [
    { id: 'collar', nombre: 'Collar', linea: 'dropshipping', fuente: 'fourthwall',
      dejaPorVenta: 49.62, marketing: 38.35, otros: 12.14, ventasBase: 0, ingresoBase: 0 },
    { id: 'invoice', nombre: 'Invoice Roundup', linea: 'apps', fuente: 'dodo', ref: 'pdt_prueba',
      dejaPorVenta: 8.05, marketing: 0, otros: 22.48, ventasBase: 0, ingresoBase: 0 },
    { id: 'dormir', nombre: 'Dormir bien', linea: 'digital', hotmart: '8711675',
      dejaPorVenta: 15.44, marketing: 141.96, otros: 0, ventasBase: 3, ingresoBase: 46.32 },
  ],
};
const mundo2 = (extra) => kvConLista(Object.assign({
  ['data:' + KEY]: JSON.stringify({ _cloudSaveTime: 1 }),
  side_base: JSON.stringify(BASE2),
}, extra || {}));

async function venta(kv, cuerpo, opts) {
  const o = opts || {};
  const env = envFalso({ LBP_KV: kv });
  if (o.sinClave) delete env.SIDE_PUSH_KEY; else env.SIDE_PUSH_KEY = PUSH;
  const w = await cargarWorker();
  const r = await w.fetch(new Request('https://x/side/venta', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' },
      o.claveMala ? { 'X-Side-Key': 'otra' } : (o.sinCabecera ? {} : { 'X-Side-Key': PUSH })),
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  }), env);
  const txt = await r.text();
  let c = null; try { c = JSON.parse(txt); } catch (e) {}
  return { status: r.status, cuerpo: c };
}
const leerSide = async (kv) => (await pedir(kv, 'GET', '/side?key=' + KEY)).cuerpo;

test('una venta sin la clave nuestra se rechaza', async () => {
  const kv = mundo2();
  assert.equal((await venta(kv, { fuente: 'fourthwall', id: 'A1', estado: 'aprobada', neto: 49.62 }, { sinCabecera: true })).status, 401);
  assert.equal((await venta(kv, { fuente: 'fourthwall', id: 'A1', estado: 'aprobada', neto: 49.62 }, { claveMala: true })).status, 401);
  assert.equal((await venta(kv, { fuente: 'fourthwall', id: 'A1', estado: 'aprobada', neto: 49.62 }, { sinClave: true })).status, 401);
  assert.equal(kv._map.get('side_ventas'), undefined);
});

test('una venta de Fourthwall suma al producto de dropshipping', async () => {
  const kv = mundo2();
  const r = await venta(kv, { fuente: 'fourthwall', id: 'HUBXVCJS', estado: 'aprobada', neto: 49.62, moneda: 'USD' });
  assert.equal(r.status, 200);
  const d = await leerSide(kv);
  const c = d.productos.find(x => x.id === 'collar');
  assert.equal(c.clientes, 1);
  assert.equal(c.ingreso, 49.62);
  assert.equal(c.resultado, -0.87);          // 49,62 - 38,35 - 12,14
  assert.equal(d.totales.clientes, 4, 'las 3 de Hotmart mas esta');
});

test('un pago de Dodo suma a la micro app por su producto', async () => {
  const kv = mundo2();
  await venta(kv, { fuente: 'dodo', id: 'pay_1', producto: 'pdt_prueba', estado: 'aprobada', neto: 8.05 });
  const d = await leerSide(kv);
  assert.equal(d.productos.find(x => x.id === 'invoice').clientes, 1);
  assert.equal(d.productos.find(x => x.id === 'invoice').ingreso, 8.05);
});

test('un pago de Dodo de otro producto no se cuenta en el nuestro', async () => {
  const kv = mundo2();
  await venta(kv, { fuente: 'dodo', id: 'pay_x', producto: 'pdt_de_otra_app', estado: 'aprobada', neto: 8.05 });
  const d = await leerSide(kv);
  assert.equal(d.productos.find(x => x.id === 'invoice').clientes, 0);
  assert.ok(d.sinUbicar >= 1);
});

test('la misma venta reenviada dos veces se cuenta una sola vez', async () => {
  const kv = mundo2();
  await venta(kv, { fuente: 'fourthwall', id: 'REPE', estado: 'aprobada', neto: 49.62 });
  await venta(kv, { fuente: 'fourthwall', id: 'REPE', estado: 'aprobada', neto: 49.62 });
  const d = await leerSide(kv);
  assert.equal(d.productos.find(x => x.id === 'collar').clientes, 1);
  assert.equal(JSON.parse(kv._map.get('side_ventas')).length, 1);
});

test('una venta cancelada descuenta', async () => {
  const kv = mundo2();
  await venta(kv, { fuente: 'fourthwall', id: 'CANC', estado: 'aprobada', neto: 49.62 });
  await venta(kv, { fuente: 'fourthwall', id: 'CANC', estado: 'devuelta' });
  const d = await leerSide(kv);
  assert.equal(d.productos.find(x => x.id === 'collar').clientes, 0);
  assert.equal(d.productos.find(x => x.id === 'collar').ingreso, 0);
});

test('de una venta reenviada no se guarda ningun dato personal', async () => {
  const kv = mundo2();
  await venta(kv, { fuente: 'fourthwall', id: 'PRIV', estado: 'aprobada', neto: 49.62,
    email: 'alguien@ejemplo.com', nombre: 'Nombre Apellido', direccion: 'Calle Falsa 123' });
  const crudo = kv._map.get('side_ventas') || '';
  for (const dato of ['alguien@ejemplo.com', 'Nombre Apellido', 'Calle Falsa']) {
    assert.ok(crudo.indexOf(dato) < 0, 'se colo un dato personal: ' + dato);
  }
});

test('una venta sin fuente o sin id no se guarda', async () => {
  const kv = mundo2();
  assert.equal((await venta(kv, { id: 'SIN_FUENTE', estado: 'aprobada' })).status, 400);
  assert.equal((await venta(kv, { fuente: 'fourthwall', estado: 'aprobada' })).status, 400);
  assert.equal(kv._map.get('side_ventas'), undefined);
});

test('las ventas de Hotmart y las reenviadas conviven en el mismo tablero', async () => {
  const kv = mundo2();
  await mandar(kv, postback({ transaccion: 'HPmix' }));
  await venta(kv, { fuente: 'fourthwall', id: 'FWmix', estado: 'aprobada', neto: 49.62 });
  const d = await leerSide(kv);
  assert.equal(d.productos.find(x => x.id === 'dormir').clientes, 4);
  assert.equal(d.productos.find(x => x.id === 'collar').clientes, 1);
  assert.equal(d.totales.clientes, 5);
});

// ── relojes de corte: los cuenta el tablero, no yo ────────────────────────
// 27-nov: con el texto escrito a mano, una venta nueva movia los KPIs y dejaba
// el reloj diciendo "3 de 10". Un tablero que se contradice es peor que uno
// viejo, porque no sabes a cual creerle.

const BASE3 = {
  productos: [
    { id: 'dormir', nombre: 'Dormir bien', chip: 'Dormir bien', linea: 'digital', hotmart: '8711675',
      dejaPorVenta: 15.44, marketing: 141.96, otros: 0, ventasBase: 3, ingresoBase: 46.32 },
    { id: 'juegos', nombre: 'Juegos por edad', chip: 'Juegos', linea: 'digital', hotmart: '8551784',
      dejaPorVenta: 8, marketing: 134.03, otros: 0, ventasBase: 1, ingresoBase: 8 },
    { id: 'cuaderno', nombre: 'Cuaderno Trazos', chip: 'Cuaderno', linea: 'digital',
      dejaPorVenta: 5, marketing: 0, otros: 0.91, ventasBase: 0, ingresoBase: 0 },
  ],
  relojes: [
    { producto: 'juegos', fecha: '2026-11-22', meta: 10, nota: 'Toca cerrarlo.' },
    { producto: 'dormir', fecha: '2026-12-11', meta: 10, nota: 'El unico con chance.' },
    { producto: 'cuaderno', fecha: '2026-12-20', que: 'publicar', nota: 'Falta abrir Gumroad.' },
  ],
};
const mundo3 = (extra) => kvConLista(Object.assign({
  ['data:' + KEY]: JSON.stringify({ _cloudSaveTime: 1 }),
  side_base: JSON.stringify(BASE3),
}, extra || {}));

// El reloj se juzga contra HOY en Bolivia; se fija el reloj para que la prueba
// no cambie de resultado segun el dia en que se corra.
const HOY27 = Date.UTC(2026, 10, 27, 18, 0); // 14:00 en Bolivia

test('el reloj cuenta los clientes de verdad, no un texto escrito a mano', async () => {
  const kv = mundo3();
  const d = await conReloj(HOY27, () => leerSide(kv));
  const r = d.relojes.find(x => x.producto === 'dormir');
  assert.equal(r.clientes, 3);
  assert.equal(r.meta, 10);
  assert.equal(r.nombre, 'Dormir bien');
});

test('una venta nueva mueve el reloj en el mismo momento que el KPI', async () => {
  const kv = mundo3();
  await mandar(kv, postback({ transaccion: 'HPreloj' }));   // una venta de Dormir bien
  const d = await conReloj(HOY27, () => leerSide(kv));
  assert.equal(d.totales.clientes, 5, '3 + 1 de juegos + la nueva');
  assert.equal(d.relojes.find(x => x.producto === 'dormir').clientes, 4,
               'el reloj tiene que contar lo mismo que el KPI');
});

test('los dias que faltan salen de la fecha de Bolivia', async () => {
  const kv = mundo3();
  const d = await conReloj(HOY27, () => leerSide(kv));
  assert.equal(d.relojes.find(x => x.producto === 'dormir').dias, 14);
  assert.equal(d.relojes.find(x => x.producto === 'cuaderno').dias, 23);
});

test('los dias se cuentan con el dia de BOLIVIA, no con el de UTC', async () => {
  // 28-nov 02:00 UTC es todavia el 27 a las 22:00 en Bolivia. Con la fecha de
  // UTC el reloj descontaria un dia de mas. La prueba anterior fijaba el reloj a
  // una hora en que las dos fechas coinciden: no podia fallar.
  const kv = mundo3();
  const d = await conReloj(Date.UTC(2026, 10, 28, 2, 0), () => leerSide(kv));
  assert.equal(d.relojes.find(x => x.producto === 'dormir').dias, 14,
               'del 27 en Bolivia al 11-dic van 14 dias');
});

test('un reloj pasado de fecha queda marcado vencido', async () => {
  const kv = mundo3();
  const d = await conReloj(HOY27, () => leerSide(kv));
  const j = d.relojes.find(x => x.producto === 'juegos');
  assert.equal(j.vencido, true);
  assert.equal(j.dias, -5);
  assert.equal(j.cumplido, false, '1 de 10 no es cumplido');
});

test('si llego a la meta, el reloj dice cumplido aunque haya vencido', async () => {
  const kv = mundo3();
  for (let i = 0; i < 10; i++) await mandar(kv, postback({ transaccion: 'HPj' + i, producto: 8551784 }));
  const d = await conReloj(HOY27, () => leerSide(kv));
  const j = d.relojes.find(x => x.producto === 'juegos');
  assert.equal(j.clientes, 11);
  assert.equal(j.cumplido, true);
});

test('un reloj de publicar no inventa un conteo de clientes', async () => {
  const kv = mundo3();
  const d = await conReloj(HOY27, () => leerSide(kv));
  const c = d.relojes.find(x => x.producto === 'cuaderno');
  assert.equal(c.meta, null, 'sin meta de clientes no se cuenta');
  assert.equal(c.que, 'publicar');
});

test('la base ya NO trae la fila de pauta de la caja: la arma el tablero', async () => {
  const kv = mundo3();
  const d = await conReloj(HOY27, () => leerSide(kv));
  assert.equal(d.totales.marketing, 275.99);     // 141,96 + 134,03
  const pauta = (d.caja || []).find(f => String(f[0]).toLowerCase().indexOf('pauta') >= 0);
  assert.equal(pauta, undefined, 'si la base la trae, queda vieja apenas Meta entre solo');
});

// ── la pantalla en la app ──────────────────────────────────────────────────

const html = fs.readFileSync(path.join(RAIZ, 'LifeBusinessPlanner2026.html'), 'utf8');

test('la pantalla esta en el menu, en el grupo Business', async () => {
  const i = html.indexOf("label: '💼 Business'");
  assert.ok(i > 0, 'no encuentro el grupo Business');
  const bloque = html.slice(i, i + 500);
  assert.match(bloque, /\['side',/, 'falta la entrada del tablero en el menu');
});

test('la pantalla esta enchufada al router', () => {
  assert.match(html, /case 'side':\s*\n?\s*return \/\*#__PURE__\*\/React\.createElement\(SideScreen/,
               'renderPage no sabe pintar la pantalla side');
  assert.ok(html.indexOf('function SideScreen') > 0, 'no existe el componente');
});

test('la pantalla pide el tablero al worker con la sync key', () => {
  const i = html.indexOf('function SideScreen');
  const cuerpo = html.slice(i, i + 9000);
  assert.ok(cuerpo.indexOf("'/side?key='") > 0 || cuerpo.indexOf('"/side?key="') > 0,
            'no pide /side con la key');
  assert.ok(cuerpo.indexOf('lbp_side_v1') > 0, 'no cachea el tablero para el celular');
});

test('la pantalla usa el estilo de la app, no una paleta propia', () => {
  // 27-nov: Pepe pidio que se vea como parte de la app, no como un documento
  // pegado adentro. Antes esta prueba exigia lo contrario (paleta editorial
  // propia); la regla cambio, y lo que se mide ahora es que use las piezas y
  // las variables de color del planner.
  const i = html.indexOf('var SIDE_LINEAS');
  assert.ok(i > 0, 'no encuentro el bloque del tablero');
  const cuerpo = html.slice(i, html.indexOf('var SearchScreen'));
  for (const pieza of ['page-header', 'stat-card', "className: 'tabs'", "className: 'card'", 'btn btn-secondary']) {
    assert.ok(cuerpo.indexOf(pieza) > 0, 'no usa la pieza de la app: ' + pieza);
  }
  for (const v of ['var(--text-dim)', 'var(--border)', 'var(--green)', 'var(--red)']) {
    assert.ok(cuerpo.indexOf(v) > 0, 'no usa la variable de color: ' + v);
  }
  for (const viejo of ['#f4f1ea', '#9a7b3f', '#2b2926', '#948d7d', 'Georgia']) {
    assert.ok(cuerpo.indexOf(viejo) < 0, 'quedo un color o fuente propia: ' + viejo);
  }
});
