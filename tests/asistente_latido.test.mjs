// El latido: la app avisa que esta viva y hasta donde subio, en pocos bytes.
//
// POR QUE EXISTE. El blob de 4 MB se sube SOLO cuando Pepe edita algo (el efecto
// del store se saltea el primer montaje a proposito). Medido el 24-nov-2026: abrir
// la app dos veces no movio _cloudSaveTime, que siguio en el dia anterior, y la
// pasada se nego a correr. Con la regla vieja --"blob de mas de 18 h = datos
// viejos"-- un dia sin editar deja al asistente callado aunque todo funcione, y
// una subida fallida con blob reciente NO se nota: es el fallo silencioso con
// cara de sano. El latido separa los tres casos.
//
// El Worker de Cloudflare corre en UTC; esta prueba tambien, sea cual sea la zona
// de la maquina (aqui es America/La_Paz y ocultaria los bugs de hora sin zona).
// Va ANTES de cualquier constante de fecha, que se evalua al importar.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

const MANANA = Date.UTC(2026, 10, 24, 12, 20);   // 8:20 Bolivia
const CHEQUEO = Date.UTC(2026, 10, 24, 13, 40);  // 9:40 Bolivia, minuto del chequeo horario
const HOY = '2026-11-24';
const H = 3600000;
const M = 60000;

// ── Red ────────────────────────────────────────────────────────────────────
const HOST_PUSH = 'push.example.test';
function red(respuestas) {
  const a = anthropicFalso(respuestas);
  const interno = globalThis.fetch;
  const push = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) { push.push(s); return new Response(null, { status: 201 }); }
    return interno(u, init);
  };
  return { push, llamadas: a.llamadas, prohibidas: a.prohibidas, restaurar: () => a.restaurar() };
}
const dice = (txt) => ({ content: [{ type: 'text', text: txt }], stop_reason: 'end_turn' });
const JSON_OK = (items) => dice(JSON.stringify({ items: items }));

// Suscripcion con una llave ECDH DE VERDAD. Con bytes inventados el cifrado
// aes128gcm falla y el worker se traga el error: "no sono" daria verde por la
// razon equivocada y las pruebas del chequeo horario no medirian nada.
const b64u = (u) => Buffer.from(u).toString('base64url');
const PAR = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const SUB = { endpoint: 'https://' + HOST_PUSH + '/uno',
  keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', PAR.publicKey))),
          auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };

function puente() {
  return { fetch: async () => new Response(JSON.stringify({ ts: new Date(MANANA - 2 * H).toISOString(), emails: [] }),
    { status: 200, headers: { 'content-type': 'application/json' } }) };
}

// Un mundo con UN blob, su antiguedad a eleccion, y el latido que se le pase.
function mundo(o) {
  const op = o || {};
  const claves = {
    synckeys_registry: JSON.stringify(['k_uno']),
    dailyinfo_v2: JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1), bcb: { venta: 11.8 }, bcbFecha: HOY }),
    'data:k_uno': JSON.stringify(Object.assign({ _cloudSaveTime: op.blobMs }, op.data || {})),
    'subs:k_uno': JSON.stringify([SUB]),
  };
  if (op.latido !== undefined) claves['asis_latido:k_uno'] = JSON.stringify(op.latido);
  return kvFalso(claves);
}

async function correr(kv, ms, respuestas) {
  const w = await cargarWorker();
  const r = red(respuestas);
  try {
    await conReloj(ms, () => w.scheduled({}, envFalso({ LBP_KV: kv, BRIEFING_SERVICE: puente() })));
  } finally { r.restaurar(); }
  return r;
}
const entrada = (kv) => JSON.parse(kv._map.get('asis:k_uno:' + HOY) || 'null');

// Una tarea con alarma de hoy: hay algo que detectar, asi que si la pasada corre
// de verdad llama al modelo. Sin esto una pasada muda no se distingue de una
// pasada que se nego a correr.
const DATOS = { tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX',
  alarm: { enabled: true, datetime: '2026-11-24T08:00' } }] };

// Un despacho de aduana a un dia: la linea dura del chequeo horario.
const DATOS_ADUANA = { imports: [{ id: 'i1', limiteAduana: '2026-11-25', status: 'EN_TRANSITO' }] };

// ───────────────────────────────────────────────────────────────────────────
// 1. El endpoint
// ───────────────────────────────────────────────────────────────────────────

async function postLatido(kv, cuerpo, ms) {
  const w = await cargarWorker();
  const env = envFalso({ LBP_KV: kv });
  // _syncKeyValida pide KV.list; el kv del arnes no lo tiene (el cron no puede
  // llamarlo). Aqui es una ruta HTTP, donde list si esta permitido.
  env.LBP_KV.list = async (op) => {
    const pre = (op && op.prefix) || '';
    const todas = [...kv._map.keys()].filter((n) => n.indexOf(pre) === 0);
    return { keys: todas.map((n) => ({ name: n })), list_complete: true };
  };
  const req = new Request('https://w.test/latido', { method: 'POST',
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });
  const res = await conReloj(ms || MANANA, () => w.fetch(req, env));
  return { status: res.status, body: await res.json() };
}

test('sin syncKey no escribe nada y da 400', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  const r = await postLatido(kv, { lastSave: 1 });
  assert.equal(r.status, 400);
  assert.equal(kv._map.has('asis_latido:k_uno'), false, 'escribio el latido sin key');
});

test('con una key inventada no escribe nada y da 401', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  const r = await postLatido(kv, { syncKey: 'k_inventada', lastSave: 1 });
  assert.equal(r.status, 401);
  assert.equal(kv._map.has('asis_latido:k_inventada'), false, 'escribio el latido de una key inventada');
  assert.equal(kv._map.has('asis_latido:k_uno'), false);
});

test('si el KV se cae al validar, falla CERRADO y no escribe', async () => {
  // La validacion de la key usa KV.list; si lanza, _syncKeyValida da false.
  // Fallar abierto dejaria a cualquiera escribir el latido de una key ajena.
  const kv = mundo({ blobMs: MANANA - 2 * H });
  const w = await cargarWorker();
  const env = envFalso({ LBP_KV: kv });
  env.LBP_KV.list = async () => { throw new Error('kv caido'); };
  const req = new Request('https://w.test/latido', { method: 'POST',
    body: JSON.stringify({ syncKey: 'k_uno', equipo: 'mac', lastSave: 1 }) });
  const res = await conReloj(MANANA, () => w.fetch(req, env));
  assert.equal(res.status, 401);
  assert.equal(kv._map.has('asis_latido:k_uno'), false, 'escribio el latido con el KV caido');
});

test('con json roto da 400 y no escribe', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  const r = await postLatido(kv, 'no soy json');
  assert.equal(r.status, 400);
  assert.equal(kv._map.has('asis_latido:k_uno'), false);
});

test('guarda el equipo con la hora y el lastSave, y pone TTL', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  const r = await postLatido(kv, { syncKey: 'k_uno', equipo: 'mac', lastSave: MANANA - 3 * H });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.equal(reg.mac.t, MANANA);
  assert.equal(reg.mac.lastSave, MANANA - 3 * H);
  assert.ok(kv._opts.get('asis_latido:k_uno').expirationTtl > 0, 'el latido se guardo sin TTL');
});

test('dos equipos conviven; el segundo no borra al primero', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  await postLatido(kv, { syncKey: 'k_uno', equipo: 'mac', lastSave: MANANA - 3 * H }, MANANA - 10 * M);
  await postLatido(kv, { syncKey: 'k_uno', equipo: 'cel', lastSave: MANANA - 5 * H }, MANANA);
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.deepEqual(Object.keys(reg).sort(), ['cel', 'mac']);
});

test('un equipo que no dio senales en mas de 3 dias se olvida', async () => {
  // Si no se olvidara, su lastSave rancio seguiria diciendo "hay cambios sin
  // subir" para siempre y el asistente quedaria callado sin remedio.
  const kv = mundo({ blobMs: MANANA - 2 * H,
    latido: { viejo: { t: MANANA - 5 * 24 * H, lastSave: MANANA } } });
  await postLatido(kv, { syncKey: 'k_uno', equipo: 'mac', lastSave: MANANA - 3 * H });
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.deepEqual(Object.keys(reg), ['mac']);
});

test('un lastSave en el futuro se descarta', async () => {
  // Un reloj adelantado no puede dejar al asistente callado para siempre.
  const kv = mundo({ blobMs: MANANA - 2 * H });
  await postLatido(kv, { syncKey: 'k_uno', equipo: 'mac', lastSave: MANANA + 48 * H });
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.equal(reg.mac.lastSave, 0);
});

test('sin equipo guarda igual, bajo un nombre fijo', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  await postLatido(kv, { syncKey: 'k_uno', lastSave: 0 });
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.equal(Object.keys(reg).length, 1);
  assert.equal(reg[Object.keys(reg)[0]].t, MANANA);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. La pasada: que cambia el latido
// ───────────────────────────────────────────────────────────────────────────

test('blob de 30 h + latido fresco al dia => la pasada CORRE', async () => {
  // El caso que motivo el cambio: no edito nada, asi que el blob de ayer es un
  // retrato correcto. Antes se callaba.
  const kv = mundo({ blobMs: MANANA - 30 * H, data: DATOS,
    latido: { mac: { t: MANANA - 20 * M, lastSave: MANANA - 30 * H } } });
  const r = await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(r.llamadas.length, 1, 'no llamo al modelo con el blob viejo y la app viva');
  const e = entrada(kv);
  assert.ok(!e.datosViejos, 'marco datosViejos con la app viva y nada pendiente');
  assert.doesNotMatch(e.summary, /DATOS VIEJOS/);
  assert.deepEqual(r.prohibidas, []);
});

test('blob de 30 h SIN latido => se calla (la regla de antes sigue valiendo)', async () => {
  // Compatibilidad: un equipo con la app vieja no manda latido.
  const kv = mundo({ blobMs: MANANA - 30 * H, data: DATOS });
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0, 'llamo al modelo con el blob viejo y sin latido');
  assert.equal(r.push.length, 0);
  const e = entrada(kv);
  assert.equal(e.datosViejos, true);
  assert.match(e.summary, /DATOS VIEJOS/);
  assert.match(e.summary, /2026-11-23/);
});

test('blob de 30 h + latido de hace 30 h => se calla (nadie abrio la app)', async () => {
  const kv = mundo({ blobMs: MANANA - 30 * H, data: DATOS,
    latido: { mac: { t: MANANA - 30 * H, lastSave: MANANA - 30 * H } } });
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0, 'llamo al modelo sin que nadie abriera la app');
  assert.equal(entrada(kv).datosViejos, true);
});

test('blob RECIENTE pero con cambios sin subir => se calla y lo dice', async () => {
  // Deteccion nueva: con la regla vieja un blob de 2 h se creia sin mas, y una
  // subida fallida (el sendBeacon de 64 KB contra 4 MB tuvo al blob congelado
  // seis dias) no se notaba. El equipo guardo a las 8:00 y la nube quedo en 6:20.
  const kv = mundo({ blobMs: MANANA - 2 * H, data: DATOS,
    latido: { cel: { t: MANANA - 5 * M, lastSave: MANANA - 20 * M } } });
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0, 'llamo al modelo con cambios sin subir');
  assert.equal(r.push.length, 0);
  const e = entrada(kv);
  assert.equal(e.datosViejos, true);
  assert.match(e.summary, /SIN SUBIR/);
});

test('un lastSave adelantado por pocos minutos NO cuenta como pendiente', async () => {
  // La app escribe lbp_last_save al EDITAR, antes del debounce de 2 s y del POST:
  // sin tolerancia, editar un minuto antes de la pasada la callaria.
  const kv = mundo({ blobMs: MANANA - 2 * H, data: DATOS,
    latido: { mac: { t: MANANA - M, lastSave: MANANA - 2 * H + M } } });
  const r = await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(r.llamadas.length, 1, 'se callo por un lastSave adelantado 1 minuto');
  assert.ok(!entrada(kv).datosViejos);
});

test('el pendiente de un equipo manda, aunque otro este al dia', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H, data: DATOS,
    latido: { mac: { t: MANANA - M, lastSave: MANANA - 2 * H },
              cel: { t: MANANA - 2 * M, lastSave: MANANA - 10 * M } } });
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0, 'ignoro el equipo con cambios sin subir');
  assert.match(entrada(kv).summary, /SIN SUBIR/);
});

test('el pendiente de un equipo DORMIDO no cuenta', async () => {
  // Un equipo que no da senales en dias no puede callar al asistente: su
  // lastSave rancio ya no dice nada del estado de hoy.
  const kv = mundo({ blobMs: MANANA - 2 * H, data: DATOS,
    latido: { viejo: { t: MANANA - 4 * 24 * H, lastSave: MANANA },
              mac: { t: MANANA - M, lastSave: MANANA - 2 * H } } });
  const r = await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(r.llamadas.length, 1, 'un equipo dormido callo la pasada');
});

test('un latido ilegible no tumba la pasada: cae a la regla del blob', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H, data: DATOS });
  kv._map.set('asis_latido:k_uno', 'no soy json');
  const r = await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(r.llamadas.length, 1, 'un latido ilegible dejo muda la pasada con blob fresco');
});

// ───────────────────────────────────────────────────────────────────────────
// 3. El chequeo horario usa la MISMA regla
// ───────────────────────────────────────────────────────────────────────────

test('chequeo horario: blob de 30 h + app viva => la linea dura suena', async () => {
  const kv = mundo({ blobMs: CHEQUEO - 30 * H, data: DATOS_ADUANA,
    latido: { mac: { t: CHEQUEO - 10 * M, lastSave: CHEQUEO - 30 * H } } });
  const r = await correr(kv, CHEQUEO, []);
  assert.equal(r.llamadas.length, 0, 'el chequeo horario no debe llamar al modelo');
  assert.equal(r.push.length, 1, 'la aduana a un dia no sono con la app viva');
});

test('chequeo horario: blob de 30 h sin latido => no suena', async () => {
  const kv = mundo({ blobMs: CHEQUEO - 30 * H, data: DATOS_ADUANA });
  const r = await correr(kv, CHEQUEO, []);
  assert.equal(r.push.length, 0, 'sono con datos de hace 30 h y sin senales de la app');
});

test('chequeo horario: con cambios sin subir no suena', async () => {
  const kv = mundo({ blobMs: CHEQUEO - 2 * H, data: DATOS_ADUANA,
    latido: { cel: { t: CHEQUEO - 5 * M, lastSave: CHEQUEO - 20 * M } } });
  const r = await correr(kv, CHEQUEO, []);
  assert.equal(r.push.length, 0, 'sono sobre un blob al que le faltan cambios');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. La identidad del equipo
// ───────────────────────────────────────────────────────────────────────────
// window._lbpEquipo() devuelve {id, nombre}, NO un texto. Visto en vivo el
// 24-nov-2026: el primer latido real entro como "sin-equipo". Con un casillero
// unico el latido de la Mac pisa el del celular, y si el celular tenia cambios
// sin subir esa senal se borra: el asistente vuelve a creerle a un blob
// incompleto, que es exactamente la carrera que el mapa por equipo evita.
// La app ya manda el id, pero el worker tiene que aceptar las DOS formas: los
// equipos que sigan en la v5.76 mandan el objeto hasta que se actualicen.

test('acepta el objeto {id, nombre} y guarda bajo el id', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  await postLatido(kv, { syncKey: 'k_uno', equipo: { id: 'a1b2c3', nombre: 'Chrome en Mac' }, lastSave: 1 });
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.deepEqual(Object.keys(reg), ['a1b2c3']);
});

test('dos equipos distintos NO se pisan (ni como objeto ni como texto)', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  await postLatido(kv, { syncKey: 'k_uno', equipo: { id: 'mac1', nombre: 'Mac' }, lastSave: MANANA - 3 * H }, MANANA - 5 * M);
  await postLatido(kv, { syncKey: 'k_uno', equipo: 'cel9', lastSave: MANANA - 4 * H }, MANANA);
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.deepEqual(Object.keys(reg).sort(), ['cel9', 'mac1'], 'un equipo piso al otro');
});

test('el pendiente del celular sobrevive al latido de la Mac', async () => {
  // El dano concreto del casillero unico: el celular avisa que tiene cambios
  // sin subir, la Mac late despues y la pasada vuelve a hablar sobre el blob
  // incompleto. Con casilleros separados, el aviso del celular manda.
  const kv = mundo({ blobMs: MANANA - 2 * H, data: DATOS });
  await postLatido(kv, { syncKey: 'k_uno', equipo: { id: 'cel9' }, lastSave: MANANA - 20 * M }, MANANA - 4 * M);
  await postLatido(kv, { syncKey: 'k_uno', equipo: { id: 'mac1' }, lastSave: MANANA - 2 * H }, MANANA - 2 * M);
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0, 'el latido de la Mac borro el pendiente del celular');
  assert.match(entrada(kv).summary, /SIN SUBIR/);
});

test('un equipo con forma rara cae al nombre fijo y no tumba el latido', async () => {
  const kv = mundo({ blobMs: MANANA - 2 * H });
  const r = await postLatido(kv, { syncKey: 'k_uno', equipo: { nombre: 'sin id' }, lastSave: 1 });
  assert.equal(r.status, 200);
  const reg = JSON.parse(kv._map.get('asis_latido:k_uno'));
  assert.deepEqual(Object.keys(reg), ['sin-equipo']);
});
