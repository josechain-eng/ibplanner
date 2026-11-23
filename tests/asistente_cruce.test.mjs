// EL CRUCE ENTRE LAS DOS SUPERFICIES QUE HABLAN: la pasada y el chequeo horario.
//
// Las siete tareas de esta rama se revisaron una por una y ninguna prueba cruzo
// la costura: `correrAsistente` escribia solo `asis_mark` y `_asisLineasDuras`
// solo `asis_dicho`, ninguna leia la marca de la otra, y la compuerta horaria
// caia CINCO MINUTOS ANTES de cada ventana de pasada. Un solo despacho producia
// cuatro push en un dia, dos de ellos a cinco minutos uno del otro diciendo lo
// mismo con otras palabras. Por eso esta prueba corre la HORA COMPLETA del cron,
// minuto a minuto y en orden, y mide los push de las dos superficies juntas.
//
// El Worker de Cloudflare corre en UTC; esta prueba tambien, sea cual sea la
// zona de la maquina (aqui es America/La_Paz). Va ANTES de cualquier constante.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

// Martes 24-nov-2026. 12:xx UTC = 8:xx de Bolivia: la hora de la pasada de la
// manana (12:20-12:22) y, dentro de la MISMA hora, el chequeo horario.
const DIA = [2026, 10, 24];
const HOY = '2026-11-24';
const H = 3600000;
const HOST_PUSH = 'push.example.test';
// Suscripcion con claves de verdad (sendPush cifra con ellas: con una clave
// falsa revienta ANTES de salir a la red y la prueba contaria cero push sin que
// se note). Valores generados aqui: nada de este repo.
const _par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const _pub = Buffer.from(await crypto.subtle.exportKey('raw', _par.publicKey)).toString('base64url');
const SUB = { endpoint: 'https://' + HOST_PUSH + '/uno',
  keys: { p256dh: _pub, auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') } };

const dice = (txt) => ({ content: [{ type: 'text', text: txt }], stop_reason: 'end_turn' });
const JSON_OK = (items) => dice(JSON.stringify({ items }));

// El puente del correo: sin binding el worker saldria por fetch publico, que el
// arnes prohibe.
const puente = () => ({ fetch: async () => new Response(JSON.stringify({
  ts: new Date(Date.UTC(...DIA, 10, 0)).toISOString(), emails: [] }),
  { status: 200, headers: { 'content-type': 'application/json' } }) });

// Un solo despacho, con el limite de aduana MANANA: el detector lo da como
// urgencia 'ya' (regla dura (a)) y el modelo lo devuelve como item 'ya' (regla
// dura (b)). Es exactamente el caso del dia simulado de la revision.
function mundo(saveTime) {
  return kvFalso({
    synckeys_registry: JSON.stringify(['k_uno']),
    dailyinfo_v2: JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1), bcb: { venta: 11.8 }, bcbFecha: HOY }),
    'data:k_uno': JSON.stringify({ _cloudSaveTime: saveTime,
      imports: [{ id: 'i1', limiteAduana: '2026-11-25', status: 'EN_TRANSITO', season: 'FA26' }],
      clients: [{ id: 'c1', name: 'CK', status: 'ACTIVE', createdAt: saveTime }] }),
    'subs:k_uno': JSON.stringify([SUB]),
  });
}

const ITEM_YA = [{ id: 'aduana_i1', urgencia: 'ya', titulo: 'Aduana CK FA26 vence manana',
  porque: 'limite en aduana el 2026-11-25', accion: 'pagar tributos', ruta: 'imports', refId: 'i1' }];

// Corre el cron real en CADA minuto de la hora dada, en orden, y devuelve los
// push de toda la hora. Un solo worker y un solo doble de red para las 60
// invocaciones: lo que se mide es la hora entera, no un minuto suelto.
async function horaCompleta(kv, utcH, respuestas) {
  const w = await cargarWorker();
  const a = anthropicFalso(respuestas);
  const interno = globalThis.fetch;
  const push = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) { push.push(s); return new Response(null, { status: 201 }); }
    return interno(u, init);
  };
  const env = envFalso({ LBP_KV: kv, BRIEFING_SERVICE: puente() });
  try {
    for (let mm = 0; mm < 60; mm++) {
      const ms = Date.UTC(...DIA, utcH, mm);
      await conReloj(ms, () => w.scheduled({}, env));
    }
  } finally { a.restaurar(); }
  return push;
}

test('en la hora de la pasada de la manana sale UN solo push, no dos', async () => {
  const kv = mundo(Date.UTC(...DIA, 10, 0));   // blob de 2 h: la pasada corre entera
  const push = await horaCompleta(kv, 12, [JSON_OK(ITEM_YA)]);
  assert.equal(push.length, 1,
    'un solo despacho produjo ' + push.length + ' push en la misma hora: la pasada y el ' +
    'chequeo horario se estan anunciando por separado');
  // Y la pasada CORRIO de verdad: sin esto la prueba pasaria con el asistente apagado.
  const e = JSON.parse(kv._map.get('asis:k_uno:' + HOY));
  assert.equal(e.pasada, 'manana');
  assert.deepEqual(e.items.map((x) => x.id), ['aduana_i1']);
  // La marca que hace que el chequeo horario encuentre lo ya dicho por la pasada.
  assert.ok(kv._map.has('asis_dicho:aduana_i1:' + HOY + ':manana'),
    'la pasada no dejo la marca asis_dicho de lo que acaba de anunciar');
});

test('en la hora de la pasada de la tarde sale UN solo push, no dos', async () => {
  const kv = mundo(Date.UTC(...DIA, 20, 0));
  const push = await horaCompleta(kv, 22, [JSON_OK(ITEM_YA)]);
  assert.equal(push.length, 1,
    'la pasada de la tarde (22:10) y el chequeo horario de la misma hora mandaron ' +
    push.length + ' push');
  assert.equal(JSON.parse(kv._map.get('asis:k_uno:' + HOY)).pasada, 'tarde');
  assert.ok(kv._map.has('asis_dicho:aduana_i1:' + HOY + ':tarde'));
});

test('el chequeo horario corre DESPUES de la pasada dentro de la misma hora', async () => {
  // La marca es asimetrica a proposito: la pasada escribe y el chequeo lee. Si la
  // compuerta horaria cayera antes de la ventana de la pasada, el chequeo hablaria
  // primero (sin marca que leer) y la pasada repetiria lo mismo cinco minutos
  // despues. Se mide por COMPORTAMIENTO: corriendo solo el chequeo horario de la
  // hora 12 SIN la pasada, el push sale --prueba de que el minuto existe y que la
  // regla dura dispara-- y en la hora completa, con la pasada por delante, no.
  const kv = mundo(Date.UTC(...DIA, 10, 0));
  const w = await cargarWorker();
  const a = anthropicFalso([]);
  const interno = globalThis.fetch;
  const push = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) { push.push(s); return new Response(null, { status: 201 }); }
    return interno(u, init);
  };
  const env = envFalso({ LBP_KV: kv, BRIEFING_SERVICE: puente() });
  try {
    // Todos los minutos de la hora 12 MENOS la ventana de la pasada (20 y 21).
    for (let mm = 0; mm < 60; mm++) {
      if (mm === 20 || mm === 21) continue;
      await conReloj(Date.UTC(...DIA, 12, mm), () => w.scheduled({}, env));
    }
  } finally { a.restaurar(); }
  assert.equal(push.length, 1,
    'sin la pasada por delante, el chequeo horario tiene que hablar una vez (si no, ' +
    'la prueba de la hora completa pasaria porque el chequeo no corre nunca)');
  assert.equal(a.llamadas.length, 0, 'el chequeo horario no llama al modelo');
});

test('el cuerpo nombra 3 pero la marca cubre los 5 items de la entrada', async () => {
  // El cuerpo del push nombra tres y cierra con "+N mas en la app": los cinco
  // quedaron senalados, asi que los cinco se marcan. Si se marcaran solo los
  // tres nombrados, el cuarto 'ya' volveria por el chequeo horario veinte
  // minutos despues: un segundo push de la misma pasada.
  const kv = mundo(Date.UTC(...DIA, 10, 0));
  const cinco = ['i1', 'i2', 'i3', 'i4', 'i5'].map((r, i) => ({
    id: 'aduana_' + r, urgencia: 'ya', titulo: 'Aduana ' + r + ' vence manana',
    porque: 'limite en aduana el 2026-11-25', accion: '', ruta: 'imports', refId: r }));
  const push = await horaCompleta(kv, 12, [JSON_OK(cinco)]);
  assert.equal(push.length, 1, 'salieron ' + push.length + ' push para una sola pasada');
  const puestas = [...kv._map.keys()].filter((k) => k.indexOf('asis_dicho:') === 0).sort();
  assert.deepEqual(puestas, cinco.map((x) => 'asis_dicho:' + x.id + ':' + HOY + ':manana').sort(),
    'la marca no cubre todos los items que el push senalo');
});

test('si el push de la pasada falla entero, el chequeo horario SI puede decirlo', async () => {
  // La marca se escribe solo cuando al menos un device recibio. Que el chequeo
  // horario hable cuando el envio de la pasada se cayo no es repetir: es la
  // unica recuperacion que queda ese dia.
  const kv = mundo(Date.UTC(...DIA, 10, 0));
  const w = await cargarWorker();
  const a = anthropicFalso([JSON_OK(ITEM_YA)]);
  const interno = globalThis.fetch;
  const intentos = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) { intentos.push(s); return new Response('no', { status: 500 }); }
    return interno(u, init);
  };
  const env = envFalso({ LBP_KV: kv, BRIEFING_SERVICE: puente() });
  try {
    for (let mm = 0; mm < 60; mm++) await conReloj(Date.UTC(...DIA, 12, mm), () => w.scheduled({}, env));
  } finally { a.restaurar(); }
  assert.equal(intentos.length, 2,
    'con el push de la pasada caido, el chequeo horario tambien tiene que intentarlo');
  assert.deepEqual([...kv._map.keys()].filter((k) => k.indexOf('asis_dicho:') === 0),
    ['asis_dicho:aduana_i1:' + HOY + ':manana'],
    'la marca del chequeo horario (que la escribe ANTES de enviar) es la unica que queda');
});
