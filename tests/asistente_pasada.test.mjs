// La pasada completa del asistente proactivo: contexto, una llamada al modelo
// pidiendo JSON, la entrada en KV y el push solo si pasa la vara. Corre el cron
// REAL del worker (w.scheduled) con el arnes de tests/_arnes_cron.mjs.
//
// El Worker de Cloudflare corre en UTC; esta prueba tambien, sea cual sea la zona
// de la maquina (aqui es America/La_Paz y ocultaria los bugs de hora sin zona).
// Va ANTES de cualquier constante de fecha, que se evalua al importar.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

// ── Relojes ────────────────────────────────────────────────────────────────
// Martes 24-nov-2026. 12:20 UTC = 8:20 Bolivia (pasada de la manana),
// 22:10 UTC = 18:10 Bolivia (pasada de la tarde). Fecha Bolivia: 2026-11-24.
const MANANA = Date.UTC(2026, 10, 24, 12, 20);
const MANANA_2 = Date.UTC(2026, 10, 24, 12, 21);
const HOY = '2026-11-24';
const H = 3600000;

// ── Red: anthropicFalso + el endpoint del servicio push ────────────────────
// anthropicFalso prohibe todo host que no sea api.anthropic.com, y sendPush sale
// al endpoint de la suscripcion. Se envuelve su fetch: el push se cuenta aqui y
// nunca llega al del arnes, asi que `prohibidas` sigue probando que no hubo
// ninguna OTRA salida a la red (y restaurar() falla si la hubo).
const HOST_PUSH = 'push.example.test';
function red(respuestas, opts) {
  const o = opts || {};
  const a = anthropicFalso(respuestas);
  const interno = globalThis.fetch;
  const push = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) {
      push.push({ url: s, body: init && init.body ? Buffer.from(init.body) : null });
      return new Response(null, { status: 201 });
    }
    if (o.alLlamar) o.alLlamar();
    return interno(u, init);
  };
  return { push, llamadas: a.llamadas, cuerpos: a.cuerpos, prohibidas: a.prohibidas, restaurar: () => a.restaurar() };
}

// Respuesta de la API de Anthropic con un bloque de texto, que es lo que lee callClaude.
const dice = (txt) => ({ content: [{ type: 'text', text: txt }], stop_reason: 'end_turn' });
const JSON_OK = (items) => dice(JSON.stringify({ items }));

// ── Suscripcion de push real (para poder descifrar el cuerpo) ──────────────
const b64u = (u) => Buffer.from(u).toString('base64url');
async function suscripcion(ruta) {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { par, pub, auth, sub: { endpoint: 'https://' + HOST_PUSH + '/' + (ruta || 'uno'), keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
}
const SUB = await suscripcion('uno');

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
  return JSON.parse(plano.slice(0, plano.length - 1).toString('utf8'));  // sin el delimitador 0x02
}

// ── El puente del correo (service binding BRIEFING_SERVICE) ────────────────
// Sin binding el worker sale por fetch publico, que el arnes prohibe: todas las
// pruebas pasan uno. `status` distinto de 200 simula el puente caido.
function puente(o) {
  const op = o || {};
  const pedidos = [];
  return {
    pedidos,
    fetch: async (req) => {
      pedidos.push(String(req.url));
      if (op.status && op.status !== 200) return new Response('no', { status: op.status });
      return new Response(JSON.stringify({ ts: op.ts === undefined ? new Date(MANANA - 2 * H).toISOString() : op.ts,
                                           emails: op.emails || [] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

// ── El KV del mundo de la prueba ───────────────────────────────────────────
// dailyinfo_v2 se siembra con updatedAt en el futuro lejano (como hace el arnes
// cuando no se lo pasa) para que el refresco del tipo de cambio no se dispare, y
// con un bcb realista para poder leer la primera linea del summary.
function mundo(o) {
  const op = o || {};
  const claves = {
    synckeys_registry: JSON.stringify(op.registro || ['k_uno']),
    dailyinfo_v2: JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1), bcb: { venta: 11.8 }, bcbFecha: HOY }),
  };
  const blobs = op.blobs || { k_uno: { saveTime: MANANA - 2 * H, data: op.data || {} } };
  Object.keys(blobs).forEach((k) => {
    claves['data:' + k] = JSON.stringify(Object.assign({ _cloudSaveTime: blobs[k].saveTime }, blobs[k].data || {}));
    if (blobs[k].sub) claves['subs:' + k] = JSON.stringify([blobs[k].sub]);
  });
  if (!op.blobs) claves['subs:k_uno'] = JSON.stringify([SUB.sub]);
  Object.keys(op.extra || {}).forEach((k) => { claves[k] = op.extra[k]; });
  return kvFalso(claves);
}

const leer = (kv, k) => JSON.parse(kv._map.get(k));
const entradaDe = (kv, key) => leer(kv, 'asis:' + (key || 'k_uno') + ':' + HOY);

// Corre el cron real en el reloj dado.
async function correr(kv, ms, respuestas, opts) {
  const w = await cargarWorker();
  const r = red(respuestas, opts);
  const pte = (opts && opts.puente) || puente();
  try {
    await conReloj(ms, () => w.scheduled({}, envFalso({ LBP_KV: kv, BRIEFING_SERVICE: pte })));
  } finally { r.restaurar(); }
  return Object.assign(r, { puente: pte });
}

// ───────────────────────────────────────────────────────────────────────────

test('con el blob de hace 3 dias NO llama al modelo ni manda push', async () => {
  const kv = mundo({ blobs: { k_uno: { saveTime: MANANA - 72 * H, sub: SUB.sub,
    data: { imports: [{ id: 'i1', limiteAduana: '2026-11-25', status: 'EN_TRANSITO' }] } } } });
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0, 'llamo al modelo con datos de hace 3 dias');
  assert.equal(r.push.length, 0, 'mando push con datos de hace 3 dias');
  assert.deepEqual(r.prohibidas, []);
  const e = entradaDe(kv);
  assert.deepEqual(e.items, []);
  assert.match(e.summary, /DATOS VIEJOS/);
  assert.match(e.summary, /2026-11-21/);        // la fecha del blob, no la de hoy
  assert.match(e.summary, /sincronizar/);
});

test('la marca se escribe ANTES de llamar al modelo', async () => {
  const kv = mundo({ data: { tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX',
    alarm: { enabled: true, datetime: '2026-11-24T08:00' } }] } });
  const marca = 'asis_mark:k_uno:' + HOY + ':manana';
  const visto = [];
  const r = await correr(kv, MANANA, [JSON_OK([])], { alLlamar: () => visto.push(kv._map.has(marca)) });
  assert.equal(r.llamadas.length, 1, 'no llamo al modelo: la prueba no mide nada');
  assert.deepEqual(visto, [true], 'la marca no estaba en el KV cuando se llamo al modelo');
});

test('dos disparos en la misma ventana = UNA llamada al modelo', async () => {
  const kv = mundo({ data: { tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX',
    alarm: { enabled: true, datetime: '2026-11-24T08:00' } }] } });
  const r1 = await correr(kv, MANANA, [JSON_OK([{ id: 'a', urgencia: 'ya', titulo: 'Aduana Mango',
    porque: 'vence el 2026-11-25', accion: '', ruta: 'imports', refId: 'i1' }])]);
  assert.equal(r1.llamadas.length, 1);
  const r2 = await correr(kv, MANANA_2, []);
  assert.equal(r2.llamadas.length, 0, 'el segundo disparo de la ventana volvio a llamar al modelo');
  assert.equal(r2.push.length, 0, 'el segundo disparo de la ventana volvio a mandar push');
});

test('JSON que no parsea: sinModelo y la lista del detector', async () => {
  const kv = mundo({ data: {
    tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX', alarm: { enabled: true, datetime: '2026-11-24T08:00' } }],
    projects: [{ id: 'p1', name: 'Remodelacion', status: 'ACTIVE', updatedAt: MANANA - 40 * 24 * H }],
  } });
  const r = await correr(kv, MANANA, [dice('lo siento, no puedo')]);
  assert.equal(r.llamadas.length, 1);
  const e = entradaDe(kv);
  assert.equal(e.sinModelo, true);
  assert.deepEqual(e.items.map((x) => x.id).sort(), ['proj_p1', 'today_t1']);
  // Nada de texto inventado: el "porque" queda vacio y el titulo es el del detector.
  assert.deepEqual(e.items.map((x) => x.porque), ['', '']);
  assert.ok(e.items.every((x) => /Pagar Mango|Remodelacion/.test(x.titulo)), 'el titulo no sale del detector');
});

test('en sinModelo los items igual llevan urgencia y la vara puede pasar', async () => {
  const kv = mundo({ data: { imports: [{ id: 'i1', limiteAduana: '2026-11-25', status: 'EN_TRANSITO' }] } });
  const r = await correr(kv, MANANA, [dice('no puedo ayudarte con eso')]);
  const e = entradaDe(kv);
  assert.equal(e.sinModelo, true);
  assert.equal(e.items[0].urgencia, 'ya', 'el item del detector perdio su urgencia');
  assert.equal(r.push.length, 1, 'con el modelo caido y una aduana a 1 dia el asistente quedo mudo');
});

test('si no se puede leer el correo queda cegado y lo dice', async () => {
  const kv = mundo({ data: { tasks: [] } });
  await correr(kv, MANANA, [JSON_OK([])], { puente: puente({ status: 500 }) });
  const e = entradaDe(kv);
  assert.equal(e.cegado, true);
  assert.match(e.summary, /sin correo de hoy - abri Outlook/);
});

test('el correo del puente de hace 40h tambien deja cegado', async () => {
  const kv = mundo({ data: { tasks: [] } });
  const pte = puente({ ts: new Date(MANANA - 40 * H).toISOString(),
    emails: [{ date: new Date(MANANA - 3 * H).toISOString(), from: 'laura@mango.com', subject: 'Pago', threadId: 'x1', snippet: 'urgente' }] });
  const r = await correr(kv, MANANA, [JSON_OK([])], { puente: pte });
  const e = entradaDe(kv);
  assert.equal(e.cegado, true, 'un puente de hace 40h no dejo cegado');
  assert.match(e.summary, /sin correo de hoy/);
  assert.ok(!/laura@mango\.com/.test(r.cuerpos[0] || ''), 'mando al modelo correo de un puente viejo');
});

test('manda 25 hilos, no 40, y un solo mensaje por hilo', async () => {
  const emails = [];
  for (let i = 1; i <= 40; i++) {
    emails.push({ date: new Date(MANANA - i * H).toISOString(), from: 'de' + i + '@mango.com',
      subject: 'Hilo ' + i, threadId: 'th' + i,
      mensajes: [{ date: new Date(MANANA - i * H).toISOString(), from: 'de' + i + '@mango.com', snippet: 'NUEVO-' + i },
                 { date: new Date(MANANA - (i + 24) * H).toISOString(), from: 'otro@mango.com', snippet: 'VIEJO-' + i }] });
  }
  const kv = mundo({ data: { tasks: [] } });
  const r = await correr(kv, MANANA, [JSON_OK([])], { puente: puente({ emails }) });
  assert.equal(r.llamadas.length, 1);
  const cuerpo = r.cuerpos[0];
  assert.equal((cuerpo.match(/ASUNTO: Hilo /g) || []).length, 25, 'el tope de 25 hilos no se respeto');
  assert.ok(cuerpo.includes('NUEVO-1'), 'falta el mensaje mas nuevo del hilo mas nuevo');
  assert.ok(!/VIEJO-/.test(cuerpo), 'mando mas de un mensaje por hilo');
  assert.ok(!cuerpo.includes('Hilo 26'), 'mando hilos mas viejos que el tope');
});

test('una sola llamada al modelo por pasada', async () => {
  const emails = [];
  for (let i = 1; i <= 30; i++) emails.push({ date: new Date(MANANA - i * H).toISOString(), from: 'd' + i + '@x.com', subject: 'S' + i, threadId: 't' + i, snippet: 's' + i });
  const kv = mundo({
    data: { tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX', alarm: { enabled: true, datetime: '2026-11-24T08:00' } }],
            imports: [{ id: 'i1', limiteAduana: '2026-11-26', status: 'EN_TRANSITO' }] },
    extra: { asis_senal: JSON.stringify({ ts: MANANA - 3 * H, hallazgos: ['CJ no respondio el reclamo'] }) },
  });
  const r = await correr(kv, MANANA, [JSON_OK([])], { puente: puente({ emails }) });
  assert.equal(r.llamadas.length, 1, 'la pasada hizo ' + r.llamadas.length + ' llamadas al modelo');
});

test('con 4 sync keys en el registro corre para la del blob mas fresco', async () => {
  const fresca = await suscripcion('fresca');
  const kv = mundo({
    registro: ['k_a', 'k_b', 'k_fresca', 'k_d'],
    blobs: {
      k_a: { saveTime: MANANA - 10 * H, sub: SUB.sub, data: { tasks: [] } },
      k_b: { saveTime: MANANA - 6 * H, sub: SUB.sub, data: { tasks: [] } },
      k_fresca: { saveTime: MANANA - 1 * H, sub: fresca.sub,
        data: { imports: [{ id: 'i9', limiteAduana: '2026-11-24', status: 'EN_TRANSITO' }] } },
      k_d: { saveTime: MANANA - 8 * H, sub: SUB.sub, data: { tasks: [] } },
    },
  });
  const r = await correr(kv, MANANA, [JSON_OK([{ id: 'aduana_i9', urgencia: 'ya', titulo: 'Aduana i9',
    porque: 'limite 2026-11-24', accion: 'llamar al agente', ruta: 'imports', refId: 'i9' }])]);
  assert.equal(r.llamadas.length, 1, 'llamo al modelo una vez por sync key');
  assert.ok(kv._map.has('asis:k_fresca:' + HOY), 'no escribio la entrada de la llave fresca');
  assert.ok(!['k_a', 'k_b', 'k_d'].some((k) => kv._map.has('asis:' + k + ':' + HOY)), 'escribio entradas de otras llaves');
  assert.equal(r.push.length, 1);
  assert.match(r.push[0].url, /\/fresca$/, 'el push no salio a las subs de la llave fresca');
});

test('un hilo ya decidido en tareasDecididas no puede entrar al prompt', async () => {
  const emails = [
    { date: new Date(MANANA - 2 * H).toISOString(), from: 'laura@mango.com', subject: 'Re: Pago interiorismo', threadId: 'th1', snippet: 'cuando pagan' },
    { date: new Date(MANANA - 3 * H).toISOString(), from: 'paola@hugo.com', subject: 'Estado de cuenta', threadId: 'th2', snippet: 'adjunto' },
  ];
  const kv = mundo({
    data: { tasks: [], tareasDecididas: [{ id: 'hilo:pago interiorismo', decision: 'no', ts: MANANA - 5 * H }] },
  });
  const r = await correr(kv, MANANA, [JSON_OK([])], { puente: puente({ emails }) });
  const cuerpo = r.cuerpos[0];
  // El id SI se lista (el prompt prohibe hablar de el); lo que no puede entrar es
  // el hilo: ni su asunto, ni su remitente, ni su texto.
  assert.ok(!cuerpo.includes('ASUNTO: Re: Pago interiorismo'), 'el asunto de un hilo ya decidido entro al prompt');
  assert.ok(!cuerpo.includes('laura@mango.com'), 'el remitente de un hilo ya decidido entro al prompt');
  assert.ok(!cuerpo.includes('cuando pagan'), 'el texto de un hilo ya decidido entro al prompt');
  assert.ok(cuerpo.includes('ASUNTO: Estado de cuenta'), 'se perdio el hilo que no estaba decidido');
  assert.ok(/PROHIBIDO HABLAR[\s\S]*hilo:pago interiorismo/.test(cuerpo), 'el id decidido no se le prohibe al modelo');
});

test('asis_senal con basura no tumba la pasada', async () => {
  const kv = mundo({ data: { tasks: [] }, extra: { asis_senal: '{{{' } });
  const r1 = await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(r1.llamadas.length, 1);
  assert.ok(kv._map.has('asis:k_uno:' + HOY), 'la senal ilegible tumbo la pasada');

  const kv2 = mundo({ data: { tasks: [] }, extra: { asis_senal: JSON.stringify({ hallazgos: ['x'.repeat(1000000)] }) } });
  const r2 = await correr(kv2, MANANA, [JSON_OK([])]);
  assert.equal(r2.llamadas.length, 1);
  assert.ok(kv2._map.has('asis:k_uno:' + HOY), 'la senal de 1MB tumbo la pasada');
  assert.ok(!(r2.cuerpos[0] || '').includes('xxxxxxxxxx'), 'la senal de 1MB entro al prompt');
});

test('si la vara no se pasa: escribe en KV y NO manda push', async () => {
  const kv = mundo({ data: { tasks: [] } });
  const r = await correr(kv, MANANA, [JSON_OK([{ id: 'u1', urgencia: 'hoy', titulo: 'Responder a Paola',
    porque: 'escribio el 2026-11-23 pidiendo el estado de cuenta', accion: '', ruta: 'tasks', refId: '' }])]);
  assert.equal(r.push.length, 0, 'un solo "hoy" mando push');
  const e = entradaDe(kv);
  assert.equal(e.items.length, 1);
});

test('la senal usada queda marcada como consumida', async () => {
  const kv = mundo({ data: { tasks: [] },
    extra: { asis_senal: JSON.stringify({ ts: MANANA - 3 * H, hallazgos: ['CJ no respondio el reclamo del 2026-11-18'] }) } });
  const r = await correr(kv, MANANA, [JSON_OK([])]);
  assert.ok((r.cuerpos[0] || '').includes('CJ no respondio'), 'la senal no entro al prompt');
  const s = leer(kv, 'asis_senal');
  assert.ok(s.consumidaEn, 'la senal usada no quedo marcada como consumida');
  // Y la pasada siguiente ya no la repite.
  kv._map.delete('asis_mark:k_uno:' + HOY + ':tarde');
  const r2 = await correr(kv, Date.UTC(2026, 10, 24, 22, 10), [JSON_OK([])]);
  assert.ok(!(r2.cuerpos[0] || '').includes('CJ no respondio'), 'repitio una senal ya consumida');
});

test('el cuerpo del push lleva como maximo 3 items aunque se guarden 5', async () => {
  const items = [];
  for (let i = 1; i <= 5; i++) items.push({ id: 'u' + i, urgencia: 'ya', titulo: 'Cosa ' + i,
    porque: 'vence el 2026-11-2' + i, accion: '', ruta: 'tasks', refId: '' });
  const kv = mundo({ data: { tasks: [] } });
  const r = await correr(kv, MANANA, [JSON_OK(items)]);
  assert.equal(entradaDe(kv).items.length, 5, 'la entrada de KV no guardo los 5');
  assert.equal(r.push.length, 1);
  const aviso = await descifrar(r.push[0].body, SUB);
  const nombrados = [1, 2, 3, 4, 5].filter((i) => aviso.body.includes('Cosa ' + i));
  assert.deepEqual(nombrados, [1, 2, 3], 'el cuerpo del push nombra ' + nombrados.length + ' items, no 3');
});

test('el tipo de cambio es la primera linea del summary y no pasa por el modelo', async () => {
  const kv = mundo({ data: { tasks: [] } });
  const r = await correr(kv, MANANA, [JSON_OK([{ id: 'u1', urgencia: 'hoy', titulo: 'Responder a Paola',
    porque: 'escribio el 2026-11-23 pidiendo el estado de cuenta', accion: '', ruta: 'tasks', refId: '' }])]);
  const e = entradaDe(kv);
  assert.equal(e.summary.split('\n')[0], 'TC oficial: Bs 11.80', 'el TC no es la primera linea del summary');
  assert.equal(e.tc, 11.8);
  // No pasa por el modelo: el prompt le prohibe repetirlo y el valor no viaja en el.
  assert.ok(!(r.cuerpos[0] || '').includes('11.80'), 'el TC viajo al modelo');
});

// El bloque que desconfia de la salida del modelo (Review Focus 3): un JSON
// hostil con las cuatro cosas que tiene que atajar.
test('la salida del modelo se desinfecta: porque vacio, urgencia inventada, ruta rara e id ya decidido', async () => {
  const items = [
    { id: 'hostil', urgencia: 'urgentisima', titulo: 'Aduana Mango', porque: 'limite 2026-11-25', accion: '', ruta: '../admin', refId: 'i1' },
    { id: 'sin_porque', urgencia: 'ya', titulo: 'Algo', porque: '   ', accion: '', ruta: 'tasks', refId: '' },
    { id: 'hilo:pago interiorismo', urgencia: 'ya', titulo: 'Pago interiorismo', porque: 'laura escribio el 2026-11-22', accion: '', ruta: 'tasks', refId: '' },
    { id: 'ok1', urgencia: 'hoy', titulo: 'Dos', porque: 'vence 2026-11-24', accion: '', ruta: 'tasks', refId: 't9' },
  ];
  const kv = mundo({ data: { tasks: [],
    tareasDecididas: [{ id: 'hilo:pago interiorismo', decision: 'no', ts: MANANA - 5 * H }] } });
  const r = await correr(kv, MANANA, [JSON_OK(items)]);
  const e = entradaDe(kv);
  const ids = e.items.map((x) => x.id);
  assert.ok(!ids.includes('sin_porque'), 'un item con "porque" vacio llego al KV');
  assert.ok(!ids.includes('hilo:pago interiorismo'), 'un item ya decidido por Pepe llego al KV');
  assert.deepEqual(ids.slice().sort(), ['hostil', 'ok1'], 'quedaron items que no son los dos validos');
  const h = e.items.find((x) => x.id === 'hostil');
  assert.equal(h.urgencia, 'puede_esperar', 'una urgencia inventada por el modelo llego al KV tal cual');
  assert.equal(h.ruta, '', 'una ruta fuera de la lista blanca llego al KV');
  assert.equal(e.items.find((x) => x.id === 'ok1').ruta, 'tasks', 'se borro una ruta buena');
  // Con la urgencia normalizada queda un solo "hoy": la vara NO manda. Si la
  // "urgentisima" pasara tal cual, _asisPasaLaVara la contaria fuera de los tres
  // valores y este push no saldria igual, pero Tarea 5 la leeria como valida.
  assert.equal(r.push.length, 0, 'mando push con un solo "hoy" real');
});

test('el tope de 5 tambien se aplica a la salida del modelo', async () => {
  const items = [];
  for (let i = 1; i <= 7; i++) items.push({ id: 'm' + i, urgencia: 'hoy', titulo: 'Cosa ' + i,
    porque: 'vence 2026-11-24', accion: '', ruta: 'tasks', refId: 't' + i });
  const kv = mundo({ data: { tasks: [] } });
  await correr(kv, MANANA, [JSON_OK(items)]);
  const e = entradaDe(kv);
  assert.equal(e.items.length, 5, 'el modelo devolvio 7 items y se guardaron ' + e.items.length);
  assert.deepEqual(e.items.map((x) => x.id), ['m1', 'm2', 'm3', 'm4', 'm5'], 'el recorte no respeto el orden del modelo');
});

test('la pasada de la tarde con el blob ya viejo NO borra la lista de la manana', async () => {
  // Sincronizo a las 23:00 de Bolivia (03:00 UTC): a las 12:20 el blob tiene 9 h
  // y la pasada corre entera; a las 22:10 tiene 19 h y entra por el camino viejo.
  const sync = Date.UTC(2026, 10, 24, 3, 0);
  const kv = mundo({ blobs: { k_uno: { saveTime: sync, sub: SUB.sub, data: { tasks: [] } } } });
  await correr(kv, MANANA, [JSON_OK([{ id: 'u1', urgencia: 'hoy', titulo: 'Responder a Paola',
    porque: 'escribio el 2026-11-23', accion: '', ruta: 'tasks', refId: '' }])]);
  assert.equal(entradaDe(kv).items.length, 1, 'la pasada de la manana no dejo lista');

  const r = await correr(kv, Date.UTC(2026, 10, 24, 22, 10), []);
  assert.equal(r.llamadas.length, 0, 'con el blob viejo llamo al modelo');
  const e = entradaDe(kv);
  assert.equal(e.items.length, 1, 'la pasada de la tarde borro la lista de la manana');
  assert.equal(e.items[0].titulo, 'Responder a Paola');
  assert.match(e.summary, /DATOS VIEJOS/, 'no avisa que los datos estan viejos');
  assert.ok(e.summary.includes('Responder a Paola'), 'el summary perdio el item de la manana');
});

test('en sinModelo una senal que Pepe descarto no vuelve ni hace sonar el telefono', async () => {
  const kv = mundo({ data: {
    imports: [{ id: 'i1', limiteAduana: '2026-11-25', status: 'EN_TRANSITO' }],
    asisDecididos: [{ id: 'aduana_i1', decision: 'no', ts: MANANA - 5 * H }],
  } });
  const r = await correr(kv, MANANA, [dice('no puedo')]);
  const e = entradaDe(kv);
  assert.equal(e.sinModelo, true);
  assert.deepEqual(e.items.map((x) => x.id), [], 'una senal ya descartada volvio en el camino sinModelo');
  assert.equal(r.push.length, 0, 'una senal ya descartada hizo sonar el telefono');
});

test('el push deja constancia en push_log y poda la suscripcion vencida', async () => {
  const kv = mundo({ data: { imports: [{ id: 'i1', limiteAduana: '2026-11-25', status: 'EN_TRANSITO' }] } });
  // Dos subs: la segunda responde 410 (vencida) y tiene que desaparecer del KV.
  const muerta = await suscripcion('muerta');
  kv._map.set('subs:k_uno', JSON.stringify([SUB.sub, muerta.sub]));
  const w = await cargarWorker();
  const a = anthropicFalso([dice('no puedo')]);
  const interno = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (new URL(s).host === HOST_PUSH) return new Response(null, { status: /muerta$/.test(s) ? 410 : 201 });
    return interno(u, init);
  };
  try {
    await conReloj(MANANA, () => w.scheduled({}, envFalso({ LBP_KV: kv, BRIEFING_SERVICE: puente() })));
  } finally { a.restaurar(); }
  const log = leer(kv, 'push_log:k_uno');
  assert.equal(log[0].type, 'asistente');
  assert.equal(log[0].sent, 1, 'el log no distingue el push entregado del fallido');
  assert.equal(log[0].failed, 1);
  assert.equal(log[0].errors[0].status, 410);
  const subs = leer(kv, 'subs:k_uno');
  assert.deepEqual(subs.map((s) => s.endpoint), [SUB.sub.endpoint], 'la suscripcion vencida no se podo');
});

// ── C1: el dia del blob viejo no puede parecer un dia sano ─────────────────
test('la entrada del camino de datos viejos lleva la bandera datosViejos', async () => {
  // El aviso vivia SOLO dentro del texto de `summary`, que la app no mira para
  // decidir que superficie pintar: con el blob de hace 3 dias el bloque decia
  // "al dia", la ventana "ya decidiste todo lo de hoy" y _lbpAlertas --que corre
  // sobre el blob LOCAL, que si esta fresco-- no se consultaba. Un dato en el
  // texto no es una bandera; la app necesita el campo.
  const kv = mundo({ blobs: { k_uno: { saveTime: MANANA - 72 * H, sub: SUB.sub,
    data: { tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX',
      alarm: { enabled: true, datetime: '2026-11-18T08:00' } }] } } } });
  const r = await correr(kv, MANANA, []);
  assert.equal(r.llamadas.length, 0);
  const e = entradaDe(kv);
  assert.equal(e.datosViejos, true, 'la entrada del camino de datos viejos no se marca');
  assert.match(e.summary, /DATOS VIEJOS/);
});

test('una pasada normal NO marca datosViejos', async () => {
  const kv = mundo({ data: { tasks: [{ id: 't1', title: 'Pagar Mango', status: 'INBOX',
    alarm: { enabled: true, datetime: '2026-11-24T08:00' } }] } });
  await correr(kv, MANANA, [JSON_OK([])]);
  assert.ok(!entradaDe(kv).datosViejos,
    'sin la distincion, marcar datosViejos apagaria el asistente todos los dias');
});

// ── I4: el tipo de cambio tiene que seguir llegando como push ──────────────
test('el cuerpo del push empieza por la linea del tipo de cambio', async () => {
  // El push del briefing de las 8:03 llevaba el TC en su cuerpo y se apago. Es
  // "lo que mas me ayuda de todo" segun Pepe, y el cuerpo del asistente era solo
  // los titulos: el TC dejaba de llegar al telefono. Va de primera linea en
  // TODOS los push del asistente; lo que NO se hace es mandar push a diario solo
  // para entregarlo, porque callarse es la funcion.
  const kv = mundo({ data: { tasks: [] } });
  const r = await correr(kv, MANANA, [JSON_OK([{ id: 'u1', urgencia: 'ya', titulo: 'Aduana CK',
    porque: 'limite el 2026-11-25', accion: '', ruta: 'imports', refId: 'i1' }])]);
  assert.equal(r.push.length, 1);
  const aviso = await descifrar(r.push[0].body, SUB);
  assert.equal(aviso.body.split('\n')[0], 'TC oficial: Bs 11.80',
    'el cuerpo del push no empieza por el tipo de cambio');
  assert.match(aviso.body, /- Aduana CK/, 'y los items siguen estando debajo');
});

test('sin tipo de cambio en KV el push sale igual, sin linea en blanco', async () => {
  const kv = mundo({ data: { tasks: [] } });
  kv._map.set('dailyinfo_v2', JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1) }));
  const r = await correr(kv, MANANA, [JSON_OK([{ id: 'u1', urgencia: 'ya', titulo: 'Aduana CK',
    porque: 'limite el 2026-11-25', accion: '', ruta: 'imports', refId: 'i1' }])]);
  assert.equal(r.push.length, 1);
  const aviso = await descifrar(r.push[0].body, SUB);
  assert.equal(aviso.body.split('\n')[0], '- Aduana CK',
    'sin TC el cuerpo no puede empezar con una linea vacia');
});

// ── I5: la lista de exclusion no puede crecer sin techo dentro del prompt ──
test('al prompt van los 200 ids decididos mas recientes, pero filtran TODOS', async () => {
  // Los ids son `hilo:<asunto completo del correo>`: en seis meses son cientos
  // de asuntos enteros repetidos en los dos prompts de cada dia. El tope es
  // del PROMPT; el filtro sigue siendo completo, porque hablar de un hilo que
  // Pepe descarto a mano es peor que repetirse.
  const dec = [];
  for (let i = 1; i <= 250; i++) dec.push({ id: 'hilo:d' + String(i).padStart(4, '0'),
    decision: 'no', ts: MANANA - (251 - i) * 60000 });   // i mayor = mas reciente
  const kv = mundo({ data: { tasks: [], asisDecididos: dec } });
  const r = await correr(kv, MANANA, [JSON_OK([
    { id: 'hilo:d0001', urgencia: 'ya', titulo: 'El mas viejo decidido', porque: 'p', accion: '', ruta: 'tasks', refId: '' },
    { id: 'nuevo', urgencia: 'hoy', titulo: 'Algo sin decidir', porque: 'p', accion: '', ruta: 'tasks', refId: '' },
  ])]);
  // r.cuerpos[0] es el cuerpo HTTP (JSON): los saltos de linea viajan escapados,
  // asi que el prompt se lee parseado y no con un regex sobre el JSON crudo.
  const prompt = JSON.parse(r.cuerpos[0]).messages[0].content;
  const sec = prompt.slice(prompt.indexOf('YA DECIDIDO POR PEPE'));
  const listados = (sec.match(/^- hilo:d\d{4}$/gm) || []);
  assert.equal(listados.length, 200, 'el prompt lista ' + listados.length + ' ids, no 200');
  assert.ok(sec.includes('- hilo:d0250'), 'falta el id mas reciente');
  assert.ok(sec.includes('- hilo:d0051'), 'falta el 200o mas reciente');
  assert.ok(!sec.includes('- hilo:d0050'), 'el id 201 por antiguedad no puede entrar al prompt');
  assert.ok(!sec.includes('- hilo:d0001'), 'el mas viejo no puede entrar al prompt');
  // Y el filtro SI los cubre a todos: el item del id mas viejo no se guarda.
  assert.deepEqual(entradaDe(kv).items.map((x) => x.id), ['nuevo'],
    'un id decidido viejo se colo en la entrada porque el filtro quedo recortado');
});

// ── I7: la pasada deja escrita la llave elegida ────────────────────────────
test('la pasada escribe la llave elegida para que el chequeo horario no busque', async () => {
  const kv = mundo({ blobs: {
    k_vieja: { saveTime: MANANA - 10 * H, data: {} },
    k_uno: { saveTime: MANANA - 2 * H, sub: SUB.sub, data: { tasks: [] } } } });
  await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(kv._map.get('asis_llave'), 'k_uno',
    'sin esto el chequeo horario parsea los cuatro blobs del registro 30 veces al dia');
  assert.ok(kv._opts.get('asis_llave').expirationTtl > 0,
    'la llave tiene que caducar: si la pasada deja de correr, la regla completa vuelve');
});

test('tambien la escribe el camino del blob viejo', async () => {
  // La eleccion es la misma; lo que cambia es que esa pasada no llama al modelo.
  const kv = mundo({ blobs: { k_uno: { saveTime: MANANA - 72 * H, sub: SUB.sub, data: {} } } });
  await correr(kv, MANANA, []);
  assert.equal(kv._map.get('asis_llave'), 'k_uno');
});

// ── #10: una senal que parsea pero no aporta nada no puede pasar en silencio ─
test('una senal con una forma desconocida queda anotada en senalIgnorada', async () => {
  // El vigilante se veria sano --deposito, 200, sin error-- y no aportaria nada.
  const kv = mundo({ data: { tasks: [] }, extra: { asis_senal: JSON.stringify({ cosas: ['CJ no contesto'] }) } });
  await correr(kv, MANANA, [JSON_OK([])]);
  const e = entradaDe(kv);
  assert.ok(e.senalIgnorada, 'una senal que no aporta nada tiene que quedar anotada');
  assert.match(e.senalIgnorada, /hallazgo|forma/i, 'el motivo tiene que decir que le paso');
});

test('una senal ya consumida NO se anota como ignorada', async () => {
  // Consumida no es ignorada: esa senal ya se dijo en otra pasada.
  const kv = mundo({ data: { tasks: [] }, extra: { asis_senal: JSON.stringify({
    hallazgos: [{ que: 'CJ no contesto' }], consumidaEn: MANANA - 10 * H }) } });
  await correr(kv, MANANA, [JSON_OK([])]);
  assert.equal(entradaDe(kv).senalIgnorada, undefined,
    'marcar como ignorada una senal consumida seria una alarma falsa todos los dias');
});

// ── #21: una lista decidida que no es array no puede tumbar la pasada ──────
test('tareasDecididas o asisDecididos que no son array no tumban la pasada', async () => {
  // El .forEach iba protegido solo con `|| []`: con un objeto o un texto tira, y
  // el catch del cron se traga la pasada entera DESPUES de escribir asis_mark,
  // asi que ese medio dia se pierde sin dejar rastro.
  for (const mal of ['x', 7, { a: 1 }, true]) {
    const kv = mundo({ data: { tasks: [], tareasDecididas: mal, asisDecididos: mal } });
    const r = await correr(kv, MANANA, [JSON_OK([{ id: 'u1', urgencia: 'ya', titulo: 'Aduana CK',
      porque: 'limite el 2026-11-25', accion: '', ruta: 'imports', refId: '' }])]);
    assert.equal(r.llamadas.length, 1, 'con ' + JSON.stringify(mal) + ' la pasada no llego al modelo');
    assert.deepEqual(entradaDe(kv).items.map((x) => x.id), ['u1'],
      'con ' + JSON.stringify(mal) + ' la pasada se cayo en silencio');
  }
});
