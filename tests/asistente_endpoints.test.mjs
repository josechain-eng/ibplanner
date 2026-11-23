// Las tres rutas HTTP del asistente proactivo:
//   GET  /asistente?key=&date=      -> la entrada del dia (la app la lee)
//   GET  /force-asistente?key=&pasada= -> borra la marca del dia y corre la pasada
//   POST /asistente/senal           -> el vigilante deposita hallazgos (cabecera X-Asis-Key)
// Se prueba el worker REAL con el arnes de tests/_arnes_cron.mjs.
//
// El Worker corre en UTC; esta prueba tambien, sea cual sea la zona de la maquina
// (aqui es America/La_Paz). Va ANTES de cualquier constante de fecha.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

const MANANA = Date.UTC(2026, 10, 24, 12, 20);   // 8:20 Bolivia, martes 24-nov-2026
const HOY = '2026-11-24';
const H = 3600000;
const KEY = 'lbp_clave_de_prueba';               // clave inventada, nunca una real
const SECRETO = 'asis-falsa';                    // el que pone envFalso en ASIS_KEY

// KV del arnes + list() (que usa _syncKeyValida) + registro de lecturas y listas.
function kvConLista(entradas, o) {
  const op = o || {};
  const kv = kvFalso(entradas);
  const gets = [], lists = [], puts = [];
  const get0 = kv.get, put0 = kv.put;
  kv.get = async (k) => { gets.push(k); return get0(k); };
  kv.put = async (k, v, opts) => { puts.push(k); return put0(k, v, opts); };
  kv.list = async (opts) => {
    lists.push(opts);
    if (op.listaFalla) throw new Error('kv caido');
    const pre = (opts && opts.prefix) || '';
    return { keys: [...kv._map.keys()].filter(n => n.indexOf(pre) === 0).map(n => ({ name: n })), list_complete: true };
  };
  kv._gets = gets; kv._lists = lists; kv._puts = puts;
  return kv;
}

// Mundo minimo para que una pasada real corra: registro + blob fresco con la key.
function mundo(o) {
  const op = o || {};
  return kvConLista(Object.assign({
    synckeys_registry: JSON.stringify([KEY]),
    ['data:' + KEY]: JSON.stringify({ _cloudSaveTime: MANANA - 2 * H }),
    dailyinfo_v2: JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1), bcb: { venta: 11.8 }, bcbFecha: HOY }),
  }, op.extra || {}), op);
}

async function pedir(kv, metodo, ruta, opts) {
  const o = opts || {};
  const env = envFalso({ LBP_KV: kv });
  if (o.sinSecreto) delete env.ASIS_KEY;
  const w = await cargarWorker();
  const init = { method: metodo, headers: o.headers || {} };
  if (o.body !== undefined) init.body = o.body;
  const r = await w.fetch(new Request('https://x' + ruta, init), env);
  const txt = await r.text();
  let cuerpo = null; try { cuerpo = JSON.parse(txt); } catch (e) { /* no era JSON */ }
  return { status: r.status, txt, cuerpo };
}
const senal = (kv, body, opts) => pedir(kv, 'POST', '/asistente/senal',
  Object.assign({ headers: { 'X-Asis-Key': SECRETO, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body) }, opts || {}));

const HALL = { hallazgos: [{ que: 'Respuesta de CJ', detalle: 'Contesto el ticket 4471', desde: '2026-11-23' }] };

// ── GET /asistente ─────────────────────────────────────────────────────────

test('GET /asistente sin key da error y NO lee KV', async () => {
  const kv = mundo();
  const r = await pedir(kv, 'GET', '/asistente');
  assert.equal(r.status, 400);
  assert.ok(r.cuerpo.error);
  assert.deepEqual(kv._gets, []);
  assert.deepEqual(kv._lists, []);
});

test('GET /asistente con key invalida da error y no lee la entrada', async () => {
  const kv = mundo({ extra: { ['asis:otra_key:' + HOY]: JSON.stringify({ items: [] }) } });
  for (const mala of ['cualquier-cosa-inventada', 'lbp_', 'lbp_x_no', 'otra_key']) {
    const r = await pedir(kv, 'GET', '/asistente?key=' + mala + '&date=' + HOY);
    assert.equal(r.status, 200);
    assert.ok(r.cuerpo.error, 'key ' + mala);
    assert.equal(r.cuerpo.ready, false);
    assert.equal(r.cuerpo.entrada, undefined);
  }
  assert.deepEqual(kv._gets.filter(k => k.indexOf('asis:') === 0), []);
});

test('GET /asistente con el KV caido falla cerrado', async () => {
  const kv = mundo({ listaFalla: true, extra: { ['asis:' + KEY + ':' + HOY]: JSON.stringify({ items: [{ id: 'a' }] }) } });
  const r = await pedir(kv, 'GET', '/asistente?key=' + KEY + '&date=' + HOY);
  assert.ok(r.cuerpo.error);
  assert.equal(r.cuerpo.ready, false);
  assert.deepEqual(kv._gets.filter(k => k.indexOf('asis:') === 0), []);
});

test('GET /asistente con entrada de hoy la devuelve', async () => {
  const entrada = { generado: MANANA, pasada: 'manana', items: [{ id: 'a', urgencia: 'hoy', titulo: 't', porque: 'p', accion: 'x', ruta: 'tasks', refId: '' }], cegado: false, sinModelo: false, tc: 11.8, summary: 's', diag: {}, motivo: 'm' };
  const kv = mundo({ extra: { ['asis:' + KEY + ':' + HOY]: JSON.stringify(entrada) } });
  const r = await conReloj(MANANA, () => pedir(kv, 'GET', '/asistente?key=' + KEY));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.ready, true);
  assert.deepEqual(r.cuerpo.entrada, entrada);
});

test('GET /asistente sin date usa el dia de Bolivia, no el UTC', async () => {
  // 02:00 UTC del 25 = 22:00 Bolivia del 24: la entrada es la del 24.
  const entrada = { items: [], motivo: 'del 24' };
  const kv = mundo({ extra: { ['asis:' + KEY + ':2026-11-24']: JSON.stringify(entrada) } });
  const r = await conReloj(Date.UTC(2026, 10, 25, 2, 0), () => pedir(kv, 'GET', '/asistente?key=' + KEY));
  assert.equal(r.cuerpo.ready, true);
  assert.equal(r.cuerpo.entrada.motivo, 'del 24');
});

test('GET /asistente sin entrada del dia da ready:false sin error', async () => {
  const kv = mundo();
  const r = await pedir(kv, 'GET', '/asistente?key=' + KEY + '&date=' + HOY);
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.ready, false);
  assert.equal(r.cuerpo.error, undefined);
});

test('GET /asistente con date que no es una fecha da 400 y no lee la entrada', async () => {
  const kv = mundo();
  const r = await pedir(kv, 'GET', '/asistente?key=' + KEY + '&date=../x');
  assert.equal(r.status, 400);
  assert.deepEqual(kv._gets.filter(k => k.indexOf('asis:') === 0), []);
});

// ── POST /asistente/senal ──────────────────────────────────────────────────

test('POST /asistente/senal sin el secreto da 401 y no escribe', async () => {
  const kv = mundo();
  const sin = await pedir(kv, 'POST', '/asistente/senal', { body: JSON.stringify(HALL) });
  assert.equal(sin.status, 401);
  const mal = await senal(kv, HALL, { headers: { 'X-Asis-Key': 'otro-secreto' } });
  assert.equal(mal.status, 401);
  const vacio = await senal(kv, HALL, { headers: { 'X-Asis-Key': '' } });
  assert.equal(vacio.status, 401);
  assert.equal(kv._map.has('asis_senal'), false);
  assert.deepEqual(kv._puts, []);
});

test('POST /asistente/senal falla cerrado si el worker no tiene ASIS_KEY', async () => {
  const kv = mundo();
  for (const h of ['undefined', '', SECRETO]) {
    const r = await senal(kv, HALL, { sinSecreto: true, headers: { 'X-Asis-Key': h } });
    assert.equal(r.status, 401, 'cabecera "' + h + '"');
  }
  assert.equal(kv._map.has('asis_senal'), false);
});

test('POST /asistente/senal con el secreto correcto escribe asis_senal con TTL de 72 h', async () => {
  const kv = mundo();
  const r = await conReloj(MANANA, () => senal(kv, HALL));
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.ok, true);
  const g = JSON.parse(kv._map.get('asis_senal'));
  assert.equal(Array.isArray(g.hallazgos), true);          // forma {hallazgos:[...]}
  assert.equal(g.hallazgos.length, 1);
  assert.equal(g.hallazgos[0].que, 'Respuesta de CJ');
  assert.equal(g.hallazgos[0].detalle, 'Contesto el ticket 4471');
  assert.equal(g.hallazgos[0].desde, '2026-11-23');
  assert.equal(g.consumidaEn, undefined);                   // una senal nueva no nace consumida
  assert.deepEqual(kv._opts.get('asis_senal'), { expirationTtl: 72 * 3600 });
  assert.deepEqual(kv._lists, []);                          // no hay sync key: no se lista nada
});

test('POST /asistente/senal nueva reemplaza a una ya consumida', async () => {
  const kv = mundo({ extra: { asis_senal: JSON.stringify({ hallazgos: [{ texto: 'viejo' }], consumidaEn: 1 }) } });
  const r = await senal(kv, HALL);
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(kv._map.get('asis_senal')).consumidaEn, undefined);
});

test('POST /asistente/senal de 1MB se rechaza sin escribir', async () => {
  const kv = mundo();
  const enorme = JSON.stringify({ hallazgos: [{ que: 'x', detalle: 'a'.repeat(1024 * 1024), desde: '' }] });
  const r = await senal(kv, enorme);
  assert.equal(r.status, 413);
  assert.equal(kv._map.has('asis_senal'), false);
  assert.deepEqual(kv._puts, []);
});

test('POST /asistente/senal que entra en 4 KB pero ya guardada pasaria de 4 KB se rechaza', async () => {
  // El lector ignora todo asis_senal de mas de 4096 bytes. Lo que se guarda lleva
  // ademas "texto", asi que el tope se mide sobre lo GUARDADO, no sobre el cuerpo.
  const kv = mundo();
  const cuerpo = JSON.stringify({ hallazgos: [{ que: 'x', detalle: 'a'.repeat(2500), desde: '' }] });
  assert.ok(cuerpo.length < 4096);
  const r = await senal(kv, cuerpo);
  assert.equal(r.status, 413);
  assert.equal(kv._map.has('asis_senal'), false);
});

test('POST /asistente/senal con cuerpo que no es una senal da 400 y no escribe', async () => {
  const kv = mundo();
  const malos = ['no es json', '{}', '[]', 'null', '"texto"', JSON.stringify({ hallazgos: [] }),
    JSON.stringify({ hallazgos: 'x' }), JSON.stringify({ hallazgos: [{ detalle: 'sin que' }] }),
    JSON.stringify({ hallazgos: [{ que: '   ' }] }), JSON.stringify({ hallazgos: ['suelto'] })];
  for (const b of malos) {
    const r = await senal(kv, b);
    assert.equal(r.status, 400, 'cuerpo ' + b);
  }
  assert.equal(kv._map.has('asis_senal'), false);
});

// ── El contrato con el lector (correrAsistente) ────────────────────────────

test('lo que escribe /asistente/senal llega al modelo como texto legible, no como [object Object]', async () => {
  const kv = mundo();
  await conReloj(MANANA, () => senal(kv, HALL));
  const w = await cargarWorker();
  const a = anthropicFalso([{ content: [{ type: 'text', text: '{"items":[]}' }], stop_reason: 'end_turn' }]);
  try {
    await conReloj(MANANA, () => w.fetch(new Request('https://x/force-asistente?key=' + KEY + '&pasada=manana'),
      envFalso({ LBP_KV: kv, BRIEFING_SERVICE: { fetch: async () => new Response('{"emails":[]}', { status: 200 }) } })));
  } finally { a.restaurar(); }
  assert.equal(a.cuerpos.length, 1);
  assert.match(a.cuerpos[0], /Respuesta de CJ/);
  assert.match(a.cuerpos[0], /ticket 4471/);
  assert.doesNotMatch(a.cuerpos[0], /\[object Object\]/);
  // y la senal quedo consumida por el lector
  assert.ok(JSON.parse(kv._map.get('asis_senal')).consumidaEn);
});

// ── GET /force-asistente ───────────────────────────────────────────────────

test('GET /force-asistente sin key da 400 y con key invalida no corre ni toca la marca', async () => {
  const marca = 'asis_mark:' + KEY + ':' + HOY + ':manana';
  const kv = mundo({ extra: { [marca]: '1' } });
  const a = anthropicFalso([]);
  try {
    const sin = await conReloj(MANANA, () => pedir(kv, 'GET', '/force-asistente'));
    assert.equal(sin.status, 400);
    const mala = await conReloj(MANANA, () => pedir(kv, 'GET', '/force-asistente?key=lbp_x_no&pasada=manana'));
    assert.ok(mala.cuerpo.error);
  } finally { a.restaurar(); }
  assert.equal(a.llamadas.length, 0);
  assert.equal(kv._map.get(marca), '1');                    // la marca sigue ahi
  assert.equal(kv._map.has('asis:' + KEY + ':' + HOY), false);
});

test('GET /force-asistente con el KV caido falla cerrado', async () => {
  const marca = 'asis_mark:' + KEY + ':' + HOY + ':manana';
  const kv = mundo({ listaFalla: true, extra: { [marca]: '1' } });
  const a = anthropicFalso([]);
  try {
    const r = await conReloj(MANANA, () => pedir(kv, 'GET', '/force-asistente?key=' + KEY + '&pasada=manana'));
    assert.ok(r.cuerpo.error);
  } finally { a.restaurar(); }
  assert.equal(a.llamadas.length, 0);
  assert.equal(kv._map.get(marca), '1');
});

test('GET /force-asistente con pasada desconocida da 400 y no borra la marca', async () => {
  const marca = 'asis_mark:' + KEY + ':' + HOY + ':manana';
  const kv = mundo({ extra: { [marca]: '1' } });
  const r = await conReloj(MANANA, () => pedir(kv, 'GET', '/force-asistente?key=' + KEY + '&pasada=noche'));
  assert.equal(r.status, 400);
  assert.equal(kv._map.get(marca), '1');
});

test('GET /force-asistente borra la marca del dia y corre', async () => {
  const marca = 'asis_mark:' + KEY + ':' + HOY + ':manana';
  const kv = mundo({ extra: { [marca]: String(MANANA - H) } });   // ya habia corrido hoy
  const a = anthropicFalso([{ content: [{ type: 'text', text: '{"items":[]}' }], stop_reason: 'end_turn' }]);
  let r;
  try {
    const w = await cargarWorker();
    r = await conReloj(MANANA, async () => {
      const x = await w.fetch(new Request('https://x/force-asistente?key=' + KEY + '&pasada=manana'),
        envFalso({ LBP_KV: kv, BRIEFING_SERVICE: { fetch: async () => new Response('{"emails":[]}', { status: 200 }) } }));
      return x.json();
    });
  } finally { a.restaurar(); }
  assert.equal(a.llamadas.length, 1, 'sin borrar la marca no habria llamado al modelo');
  assert.equal(r.ok, true);
  assert.equal(kv._map.get(marca), String(MANANA));          // la marca se reescribio con el reloj de ahora
  assert.ok(kv._map.has('asis:' + KEY + ':' + HOY));
});

// ── La respuesta nunca trae la sync key ────────────────────────────────────

test('la respuesta de /asistente y la de /force-asistente nunca contienen la sync key', async () => {
  const kv = mundo();
  const a = anthropicFalso([{ content: [{ type: 'text', text: '{"items":[]}' }], stop_reason: 'end_turn' }]);
  const env = envFalso({ LBP_KV: kv, BRIEFING_SERVICE: { fetch: async () => new Response('{"emails":[]}', { status: 200 }) } });
  let forzada, leida;
  try {
    const w = await cargarWorker();
    forzada = await conReloj(MANANA, async () => (await w.fetch(new Request('https://x/force-asistente?key=' + KEY + '&pasada=manana'), env)).text());
    leida = await conReloj(MANANA, async () => (await w.fetch(new Request('https://x/asistente?key=' + KEY), env)).text());
  } finally { a.restaurar(); }
  assert.equal(JSON.parse(leida).ready, true);               // la entrada existe: no es una prueba vacia
  assert.equal(forzada.includes(KEY), false);
  assert.equal(leida.includes(KEY), false);
});
