// El chequeo horario de las lineas duras del asistente: SIN modelo, dos reglas
// (aduana a 1 dia o menos; un item 'ya' de la ultima pasada sin decidir), solo de
// 7 a 21 hora de Bolivia, minutos 40-41 de cada hora (antes 15-16: caian cinco
// minutos ANTES de cada ventana de pasada y las dos superficies se anunciaban
// por separado). Corre el cron REAL del
// worker con el arnes de tests/_arnes_cron.mjs.
//
// El Worker corre en UTC; esta prueba tambien, sea cual sea la zona de la maquina
// (aqui es America/La_Paz). Va ANTES de cualquier constante de fecha.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

const H = 3600000;
const HOY = '2026-11-24';                       // martes, fecha de Bolivia
// Bolivia = UTC-4. bo(10, 40) = 10:40 de Bolivia del martes 24-nov-2026.
const bo = (h, m) => Date.UTC(2026, 10, 24, h + 4, m);
const KEY = 'k_uno';                            // clave inventada, nunca una real
const MARCA = (id, pasada) => 'asis_dicho:' + id + ':' + HOY + ':' + pasada;

const HOST_PUSH = 'push.example.test';
const b64u = (u) => Buffer.from(u).toString('base64url');
async function suscripcion() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, sub: { endpoint: 'https://' + HOST_PUSH + '/uno', keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
}
const SUB = await suscripcion();

async function descifrar(body, s) {
  const salt = body.slice(0, 16), serverPub = body.slice(21, 86), ct = body.slice(86);
  const cat = (...x) => Buffer.concat(x.map(Buffer.from));
  const srvKey = await crypto.subtle.importKey('raw', serverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: srvKey }, s.par.privateKey, 256);
  const ikmKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const ikm = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s.auth,
    info: cat('WebPush: info\0', s.pub, serverPub) }, ikmKey, 256);
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cek = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: Buffer.from('Content-Encoding: aes128gcm\0') }, k, 128);
  const nonce = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: Buffer.from('Content-Encoding: nonce\0') }, k, 96);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plano = Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ct));
  return JSON.parse(plano.slice(0, plano.length - 1).toString('utf8'));
}

const imp = (id, limite, extra) => Object.assign({ id, limiteAduana: limite, status: 'EN_TRANSITO' }, extra || {});

// Mundo: registro con una key, blob guardado 2 h antes de `ms`, una suscripcion.
// El KV registra cada put y cada list: el cron NUNCA debe listar.
function mundo(o) {
  const op = o || {};
  const ms = op.ms || bo(10, 40);
  const claves = {
    synckeys_registry: JSON.stringify(op.registro || [KEY]),
    // bcb realista: el cuerpo del push lleva el tipo de cambio de primera linea.
    dailyinfo_v2: JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1), bcb: { venta: 11.8 }, bcbFecha: HOY }),
    ['subs:' + KEY]: JSON.stringify([SUB.sub]),
  };
  const blobs = op.blobs || { [KEY]: { saveTime: ms - 2 * H, data: op.data || { imports: [imp('i1', '2026-11-25')] } } };
  Object.keys(blobs).forEach((k) => {
    claves['data:' + k] = JSON.stringify(Object.assign({ _cloudSaveTime: blobs[k].saveTime }, blobs[k].data || {}));
  });
  Object.keys(op.extra || {}).forEach((k) => { claves[k] = op.extra[k]; });
  const kv = kvFalso(claves);
  kv._lists = [];
  kv.list = async (x) => { kv._lists.push(x); return { keys: [], list_complete: true }; };
  return kv;
}

// Corre el cron real en el reloj dado. Cuenta los push y los llamados a Anthropic;
// cualquier otro host cae en `prohibidas`, y restaurar() falla si hubo alguno.
async function correr(kv, ms) {
  const w = await cargarWorker();
  const a = anthropicFalso([]);               // ninguna respuesta preparada: llamar al modelo revienta
  const interno = globalThis.fetch;
  const push = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) {
      push.push({ body: init && init.body ? Buffer.from(init.body) : null });
      return new Response(null, { status: 201 });
    }
    return interno(u, init);
  };
  try {
    await conReloj(ms, () => w.scheduled({}, envFalso({ LBP_KV: kv })));
  } finally { a.restaurar(); }
  return { push, llamadas: a.llamadas, prohibidas: a.prohibidas };
}

const marcas = (kv) => [...kv._map.keys()].filter((k) => k.indexOf('asis_dicho:') === 0);
const leer = (kv, k) => JSON.parse(kv._map.get(k));

// ───────────────────────────────────────────────────────────────────────────

test('aduana que vence manana dispara a las 10:40 Bolivia', async () => {
  const kv = mundo();
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 1, 'no hubo push');
  const cuerpo = await descifrar(r.push[0].body, SUB);
  assert.match(cuerpo.body, /aduana vence en 1 dia/);
  assert.deepEqual(marcas(kv), [MARCA('aduana_i1', 'manana')]);
  assert.equal(kv._opts.get(MARCA('aduana_i1', 'manana')).expirationTtl, 3 * 86400);
  const log = leer(kv, 'push_log:' + KEY);
  assert.equal(log[0].type, 'asistente');
  assert.equal(log[0].sent, 1);
});

test('a las 00:40 Bolivia NO dispara nada', async () => {
  // Sin la franja, un "ya" de las 18:10 pierde su marca a medianoche y vuelve.
  // El control prueba que el mismo mundo SI dispara en horario: sin el, esta
  // prueba pasaria igual con un chequeo que nunca dispara.
  const control = await correr(mundo(), bo(10, 40));
  assert.equal(control.push.length, 1, 'el control no disparo: la prueba no prueba nada');
  const kv = mundo({ ms: bo(0, 40) });
  const r = await correr(kv, bo(0, 40));
  assert.equal(r.push.length, 0);
  assert.deepEqual(marcas(kv), []);
});

test('a las 22:40 Bolivia NO dispara nada', async () => {
  const kv = mundo({ ms: bo(22, 40) });
  const r = await correr(kv, bo(22, 40));
  assert.equal(r.push.length, 0);
  assert.deepEqual(marcas(kv), []);
});

test('la franja es de 7 a 21 inclusive: 6:40 no, 7:40 y 21:40 si', async () => {
  const fuera = mundo({ ms: bo(6, 40) });
  assert.equal((await correr(fuera, bo(6, 40))).push.length, 0, '6:40 disparo');
  const siete = mundo({ ms: bo(7, 40) });
  assert.equal((await correr(siete, bo(7, 40))).push.length, 1, '7:40 no disparo');
  const veintiuno = mundo({ ms: bo(21, 40) });
  assert.equal((await correr(veintiuno, bo(21, 40))).push.length, 1, '21:40 no disparo');
});

test('solo los minutos 40 y 41 de la hora: el 39 y el 42 no disparan', async () => {
  for (const m of [39, 42]) {
    const kv = mundo({ ms: bo(10, m) });
    assert.equal((await correr(kv, bo(10, m))).push.length, 0, 'disparo en el minuto ' + m);
  }
  const kv = mundo({ ms: bo(10, 41) });
  assert.equal((await correr(kv, bo(10, 41))).push.length, 1, 'no disparo en el minuto 41');
});

test('el chequeo horario NUNCA llama al modelo', async () => {
  // anthropicFalso([]) no tiene respuestas: una llamada la hace fallar, y
  // restaurar() falla ademas si salio a CUALQUIER otro host.
  const kv = mundo();
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 1, 'el mundo no disparo: la prueba no prueba nada');
  assert.deepEqual(r.llamadas, [], 'llamo a Anthropic');
  assert.deepEqual(r.prohibidas, []);
});

test('el chequeo horario no lista el KV ni toca la entrada del dia', async () => {
  const entrada = JSON.stringify({ generado: bo(8, 20), pasada: 'manana', items: [] });
  const kv = mundo({ extra: { ['asis:' + KEY + ':' + HOY]: entrada } });
  await correr(kv, bo(10, 40));
  assert.deepEqual(kv._lists, [], 'llamo a KV.list() desde el cron');
  assert.equal(kv._map.get('asis:' + KEY + ':' + HOY), entrada, 'piso la entrada de la pasada');
  assert.equal(kv._map.has('asis_mark:' + KEY + ':' + HOY + ':manana'), false, 'escribio la marca de la pasada');
});

test('un item ya dicho en esta pasada no se repite', async () => {
  const kv = mundo();
  const a = await correr(kv, bo(10, 40));
  const b = await correr(kv, bo(10, 41));     // el segundo disparo de la ventana
  const c = await correr(kv, bo(11, 40));     // la hora siguiente, misma pasada
  assert.equal(a.push.length, 1);
  assert.equal(b.push.length, 0, 'se repitio en el segundo disparo de la ventana');
  assert.equal(c.push.length, 0, 'se repitio a la hora siguiente');
});

test('un item dicho en la pasada de la manana SI puede decirse en la de la tarde', async () => {
  const kv = mundo();
  await correr(kv, bo(10, 40));
  assert.deepEqual(marcas(kv), [MARCA('aduana_i1', 'manana')]);
  const tarde = await correr(kv, bo(18, 40));
  assert.equal(tarde.push.length, 1, 'no volvio a decirse a la tarde');
  assert.deepEqual(marcas(kv).sort(), [MARCA('aduana_i1', 'manana'), MARCA('aduana_i1', 'tarde')].sort());
});

test('un item que el usuario marco listo no se repite', async () => {
  const kv = mundo({ data: { imports: [imp('i1', '2026-11-25')],
    asisDecididos: [{ id: 'aduana_i1', decision: 'hecha' }] } });
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 0, 'repitio algo que el usuario ya decidio');
  assert.deepEqual(marcas(kv), []);
});

test('una decision revocada no silencia el item', async () => {
  const kv = mundo({ data: { imports: [imp('i1', '2026-11-25')],
    asisDecididos: [{ id: 'aduana_i1', decision: 'revocada' }] } });
  assert.equal((await correr(kv, bo(10, 40))).push.length, 1);
});

test('sin asisDecididos en el blob (aun no existe) nada se da por decidido', async () => {
  const kv = mundo({ data: { imports: [imp('i1', '2026-11-25')] } });
  assert.equal((await correr(kv, bo(10, 40))).push.length, 1);
});

test('aduana a 5 dias no dispara en el chequeo horario', async () => {
  // El detector la ve (<=7), la linea dura no (<=1).
  const kv = mundo({ data: { imports: [imp('i1', '2026-11-29')] } });
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 0);
  assert.deepEqual(marcas(kv), []);
});

test('aduana a 2 dias no dispara; vence hoy y vencida si', async () => {
  const dos = mundo({ data: { imports: [imp('i1', '2026-11-26')] } });
  assert.equal((await correr(dos, bo(10, 40))).push.length, 0, 'a 2 dias disparo');
  for (const lim of ['2026-11-24', '2026-11-20']) {
    const kv = mundo({ data: { imports: [imp('i1', lim)] } });
    assert.equal((await correr(kv, bo(10, 40))).push.length, 1, lim + ' no disparo');
  }
});

test('un despacho recibido o cancelado no dispara', async () => {
  const kv = mundo({ data: { imports: [imp('i1', '2026-11-25', { status: 'RECIBIDO' }), imp('i2', '2026-11-25', { status: 'CANCELADO' })] } });
  assert.equal((await correr(kv, bo(10, 40))).push.length, 0);
});

test('un item ya de la ultima pasada sin decidir dispara (regla b)', async () => {
  const entrada = { generado: bo(8, 20), pasada: 'manana', items: [
    { id: 'mod_manana_0', urgencia: 'ya', titulo: 'Responder a CJ hoy', porque: 'p', accion: 'a', ruta: 'tasks', refId: '' },
    { id: 'mod_manana_1', urgencia: 'hoy', titulo: 'Algo de hoy', porque: 'p', accion: 'a', ruta: 'tasks', refId: '' },
    { id: 'mod_manana_2', urgencia: 'puede_esperar', titulo: 'Algo que espera', porque: 'p', accion: 'a', ruta: 'tasks', refId: '' }] };
  const kv = mundo({ data: {}, extra: { ['asis:' + KEY + ':' + HOY]: JSON.stringify(entrada) } });
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 1);
  const cuerpo = await descifrar(r.push[0].body, SUB);
  assert.match(cuerpo.body, /Responder a CJ hoy/);
  assert.doesNotMatch(cuerpo.body, /Algo de hoy|Algo que espera/, 'un hoy o un puede_esperar paso la linea dura');
  assert.deepEqual(marcas(kv), [MARCA('mod_manana_0', 'manana')]);
});

test('un item ya de la ultima pasada que el usuario decidio no dispara', async () => {
  const entrada = { generado: bo(8, 20), pasada: 'manana', items: [
    { id: 'mod_manana_0', urgencia: 'ya', titulo: 'Responder a CJ hoy', porque: 'p', accion: 'a', ruta: 'tasks', refId: '' }] };
  const kv = mundo({ data: { asisDecididos: [{ id: 'mod_manana_0', decision: 'descartada' }] },
    extra: { ['asis:' + KEY + ':' + HOY]: JSON.stringify(entrada) } });
  assert.equal((await correr(kv, bo(10, 40))).push.length, 0);
});

test('un mismo item en la aduana y en la entrada se dice una sola vez', async () => {
  const entrada = { generado: bo(8, 20), pasada: 'manana', items: [
    { id: 'aduana_i1', urgencia: 'ya', titulo: 'Aduana i1', porque: 'p', accion: 'a', ruta: 'imports', refId: 'i1' }] };
  const kv = mundo({ extra: { ['asis:' + KEY + ':' + HOY]: JSON.stringify(entrada) } });
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 1);
  assert.deepEqual(marcas(kv), [MARCA('aduana_i1', 'manana')]);
});

test('con el blob viejo (mas de 18 h) no dice nada: puede estar desactualizado', async () => {
  const kv = mundo({ blobs: { [KEY]: { saveTime: bo(10, 40) - 30 * H, data: { imports: [imp('i1', '2026-11-25')] } } } });
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 0);
  assert.deepEqual(marcas(kv), []);
});

test('con varias keys usa solo la del blob mas nuevo', async () => {
  const ms = bo(10, 40);
  const kv = mundo({ registro: ['k_vieja', KEY], blobs: {
    k_vieja: { saveTime: ms - 5 * H, data: { imports: [imp('v1', '2026-11-25')] } },
    [KEY]: { saveTime: ms - 1 * H, data: { imports: [imp('i1', '2026-11-25')] } } } });
  kv._map.set('subs:k_vieja', JSON.stringify([SUB.sub]));
  const r = await correr(kv, ms);
  assert.equal(r.push.length, 1, 'mando push a mas de un equipo');
  assert.deepEqual(marcas(kv), [MARCA('aduana_i1', 'manana')]);
  assert.equal(kv._map.has('push_log:k_vieja'), false);
});

test('sin blob en el registro no hace nada y no revienta', async () => {
  const kv = mundo({ registro: [], blobs: {} });
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 0);
});

test('lo que el usuario decidio en tareasDecididas tampoco se repite', async () => {
  // Misma exclusion que usa la pasada: dos listas, una sola regla.
  const kv = mundo({ data: { imports: [imp('i1', '2026-11-25')],
    tareasDecididas: [{ id: 'aduana_i1', decision: 'hecha' }] } });
  assert.equal((await correr(kv, bo(10, 40))).push.length, 0);
});

// ── I4: el chequeo horario tambien lleva el tipo de cambio ─────────────────
test('el cuerpo del push del chequeo horario empieza por el tipo de cambio', async () => {
  const kv = mundo();
  const r = await correr(kv, bo(10, 40));
  assert.equal(r.push.length, 1);
  const cuerpo = await descifrar(r.push[0].body, SUB);
  assert.equal(cuerpo.body.split('\n')[0], 'TC oficial: Bs 11.80',
    'el push de las lineas duras no lleva el tipo de cambio');
  assert.match(cuerpo.body, /aduana vence en 1 dia/, 'y la linea dura sigue estando debajo');
});

// ── I7: el chequeo horario deja de parsear los cuatro blobs ────────────────
// Una invocacion que parsea los cuatro blobs del registro son ~18 MB de JSON;
// el chequeo corre 30 veces al dia. Este repo ya murio dos veces por un tick del
// cron que hacia demasiado. La pasada deja escrita la llave elegida y el chequeo
// lee ESE blob; si la entrada no esta o su blob desaparecio, cae a la regla
// completa (_asisBlobMasNuevo) y no se queda sin nada.
function conGets(kv) {
  const get0 = kv.get;
  kv._gets = [];
  kv.get = async (k) => { kv._gets.push(k); return get0(k); };
  return kv;
}
const blobsLeidos = (kv) => kv._gets.filter((k) => k.indexOf('data:') === 0);

test('con la llave escrita, el chequeo horario lee UN solo blob', async () => {
  const ms = bo(10, 40);
  const kv = conGets(mundo({ registro: ['k_a', 'k_b', 'k_c', KEY], blobs: {
    k_a: { saveTime: ms - 9 * H, data: {} }, k_b: { saveTime: ms - 8 * H, data: {} },
    k_c: { saveTime: ms - 7 * H, data: {} },
    [KEY]: { saveTime: ms - 1 * H, data: { imports: [imp('i1', '2026-11-25')] } } },
    extra: { asis_llave: KEY } }));
  const r = await correr(kv, ms);
  assert.equal(r.push.length, 1, 'con la llave escrita el chequeo dejo de avisar');
  assert.deepEqual(blobsLeidos(kv), ['data:' + KEY],
    'el chequeo leyo ' + blobsLeidos(kv).length + ' blobs: tiene que leer uno');
  assert.deepEqual(kv._lists, [], 'y nunca lista el KV');
});

test('sin la llave escrita, el chequeo horario cae a la regla completa', async () => {
  const ms = bo(10, 40);
  const kv = conGets(mundo({ registro: ['k_vieja', KEY], blobs: {
    k_vieja: { saveTime: ms - 5 * H, data: {} },
    [KEY]: { saveTime: ms - 1 * H, data: { imports: [imp('i1', '2026-11-25')] } } } }));
  const r = await correr(kv, ms);
  assert.equal(r.push.length, 1, 'sin la llave el chequeo se quedo mudo');
  assert.equal(blobsLeidos(kv).length, 2, 'la regla completa recorre el registro entero');
});

test('con la llave apuntando a un blob que ya no existe, cae a la regla completa', async () => {
  const ms = bo(10, 40);
  const kv = conGets(mundo({ registro: ['k_vieja', KEY], blobs: {
    k_vieja: { saveTime: ms - 5 * H, data: {} },
    [KEY]: { saveTime: ms - 1 * H, data: { imports: [imp('i1', '2026-11-25')] } } },
    extra: { asis_llave: 'k_que_ya_no_esta' } }));
  const r = await correr(kv, ms);
  assert.equal(r.push.length, 1,
    'una llave rancia no puede dejar al chequeo horario sin datos');
});

// ── #21: lo mismo del lado del chequeo horario ────────────────────────────
test('tareasDecididas o asisDecididos que no son array no tumban el chequeo', async () => {
  for (const mal of ['x', 7, { a: 1 }, true]) {
    const kv = mundo({ data: { imports: [imp('i1', '2026-11-25')], tareasDecididas: mal, asisDecididos: mal } });
    assert.equal((await correr(kv, bo(10, 40))).push.length, 1,
      'con ' + JSON.stringify(mal) + ' en el blob el chequeo horario se cayo EN SILENCIO');
  }
});
