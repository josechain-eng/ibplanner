// Prueba /meeting-proposals (proxy a las reuniones de Outlook) y el texto del
// aviso de /push-campanas segun tipo, contra el worker.js real. Sin modelo:
// el endpoint es un proxy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_lbp_meetings_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const EVENTO = { uid: 'u1', titulo: 'Revision Mango', fecha: '2026-12-02', inicio: '10:00', fin: '11:00',
                 diaEntero: false, organizador: 'x@y.com', estado: 'ACEPTADA', otrosUids: [] };
const VIVO = { ts: '2026-11-14T12:15:31', completa: true, eventos: [EVENTO] };
const VACIO = { ts: null, completa: false, eventos: [] };

function entorno(o) {
  o = o || {};
  const llamadas = [];
  const gets = [], listas = [];
  // El KV falso anota lo que se le pide. `get` de un blob de datos devuelve un
  // texto gordo a proposito: si el endpoint lo bajara, se nota en la prueba.
  const blob = '{"x":"' + 'z'.repeat(5000) + '"}';
  const env = {
    BRIEFING_KEY: o.sinBriefKey ? undefined : 'bk',
    LBP_KV: {
      get: async k => { gets.push(k); return k === 'data:lbp_x' ? blob : null; },
      list: async opciones => {
        listas.push(opciones);
        const pre = (opciones && opciones.prefix) || '';
        // Como el KV de verdad: `prefix` casa por PREFIJO, no exacto.
        const todas = ['data:lbp_x', 'subs:lbp_x'];
        return { keys: todas.filter(n => n.indexOf(pre) === 0).map(n => ({ name: n })), list_complete: true };
      },
      put: async () => {}
    },
    llamadas, gets, listas,
  };
  if (!o.sinBinding) {
    env.BRIEFING_SERVICE = {
      fetch: async (req) => {
        llamadas.push(req.url);
        return (o.status && o.status !== 200)
          ? new Response('no', { status: o.status })
          : new Response(JSON.stringify(o.payload || VIVO), { status: 200 });
      }
    };
  }
  return env;
}
const pedir = (key) => new Request('https://x/meeting-proposals?key=' + (key === undefined ? 'lbp_x' : key));

test('meeting-proposals sin key devuelve el error en 200', async () => {
  const r = await (await cargar()).fetch(pedir(''), entorno());
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.error, /key/i);
  assert.equal(b.completa, false);
  assert.deepEqual(b.eventos, []);
});

test('meeting-proposals con una key inventada devuelve la forma vacia y no llama al briefing', async () => {
  const env = entorno();
  const r = await (await cargar()).fetch(pedir('cualquier-cosa-inventada'), env);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(b.error);
  assert.equal(b.completa, false);
  assert.deepEqual(b.eventos, []);
  assert.equal(b.ts, undefined);
  assert.deepEqual(env.llamadas, []);   // ni una llamada entre Workers sin autenticar
});

test('meeting-proposals sin BRIEFING_KEY lo dice, en 200', async () => {
  const r = await (await cargar()).fetch(pedir(), entorno({ sinBriefKey: true }));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.error, /BRIEFING_KEY/);
  assert.equal(b.completa, false);
  assert.deepEqual(b.eventos, []);
});

test('meeting-proposals usa el service binding y pasa ts y eventos tal cual', async () => {
  const env = entorno();
  const b = await (await (await cargar()).fetch(pedir(), env)).json();
  assert.equal(env.llamadas.length, 1);
  assert.match(env.llamadas[0], /^https:\/\/briefing\.internal\/reuniones-correo\?key=bk$/);
  assert.equal(b.error, undefined);
  assert.equal(b.ts, '2026-11-14T12:15:31');   // hora local sin zona, intacta
  assert.equal(b.completa, true);
  assert.deepEqual(b.eventos, [EVENTO]);
});

test('meeting-proposals propaga completa:false cuando el briefing no tiene nada', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ payload: VACIO }))).json();
  assert.equal(b.completa, false);
  assert.equal(b.ts, null);
  assert.deepEqual(b.eventos, []);
});

test('meeting-proposals con el briefing caido lo dice y marca binding', async () => {
  const r = await (await cargar()).fetch(pedir(), entorno({ status: 500 }));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.error, /500/);
  assert.match(b.error, /binding/);
  assert.equal(b.completa, false);
  assert.deepEqual(b.eventos, []);
});

test('meeting-proposals sin binding cae al fetch publico', async () => {
  const visto = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (u) => { visto.push(String(u)); return new Response(JSON.stringify(VIVO), { status: 200 }); };
  try {
    const b = await (await (await cargar()).fetch(pedir(), entorno({ sinBinding: true }))).json();
    assert.equal(visto.length, 1);
    assert.match(visto[0], /workers\.dev\/reuniones-correo\?key=bk$/);
    assert.equal(b.completa, true);
  } finally { globalThis.fetch = original; }
});

test('meeting-proposals no llama a ningun modelo', async () => {
  const visto = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (u) => { visto.push(String(u)); return new Response('{}'); };
  try {
    const env = entorno(); env.ANTHROPIC_API_KEY = 'sk-test';
    await (await cargar()).fetch(pedir(), env);
    assert.deepEqual(visto, []);
  } finally { globalThis.fetch = original; }
});

// ── Texto del aviso de /push-campanas segun tipo ──
// Se genera una suscripcion real, se captura el POST cifrado al servicio push
// y se descifra: asi se prueba lo que de verdad le llega al telefono.
async function suscripcionReal() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const b64u = (u) => Buffer.from(u).toString('base64url');
  return { par, pub, auth, sub: { endpoint: 'https://push.example.test/abc', keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
}

async function descifrar(body, s) {
  const salt = body.slice(0, 16);
  const serverPub = body.slice(21, 86);
  const ct = body.slice(86);
  const cat = (...a) => Buffer.concat(a.map(x => Buffer.from(x)));
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
  return JSON.parse(plano.slice(0, plano.length - 1).toString('utf8'));  // quita el delimitador 0x02
}

async function avisoPara(cuerpo) {
  const s = await suscripcionReal();
  const capturados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (u, init) => { capturados.push(Buffer.from(init.body)); return new Response(null, { status: 201 }); };
  try {
    const env = {
      BRIEFING_KEY: 'bk',
      LBP_KV: { get: async k => (k === 'synckeys_registry' ? '["lbp_a"]' : (k === 'subs:lbp_a' ? JSON.stringify([s.sub]) : null)), put: async () => {} },
    };
    const r = await (await cargar()).fetch(new Request('https://x/push-campanas', {
      method: 'POST', headers: { Authorization: 'Bearer bk', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo) }), env);
    assert.equal((await r.json()).sent, 1);
    return await descifrar(capturados[0], s);
  } finally { globalThis.fetch = original; }
}

test('push-campanas sin tipo sigue avisando de campanas (el caller actual no cambia)', async () => {
  const a = await avisoPara({ n: 2 });
  assert.match(a.title, /Campanas en tu correo/);
  assert.match(a.body, /2 correos de campana listos para revisar en Campaigns/);
});

test('push-campanas tipo reuniones avisa de reuniones, no de campanas', async () => {
  const a = await avisoPara({ n: 2, tipo: 'reuniones' });
  assert.match(a.title, /Reuniones/);
  assert.match(a.body, /2 reuniones/);
  assert.doesNotMatch(a.title + ' ' + a.body, /campana/i);
  const una = await avisoPara({ n: 1, tipo: 'reuniones' });
  assert.match(una.body, /1 reunion /);   // singular
});

test('push-campanas con un tipo desconocido cae a campanas', async () => {
  const a = await avisoPara({ n: 1, tipo: 'otra-cosa' });
  assert.match(a.title, /Campanas/);
});

// ── I3 (revision de rama): el control de la key no puede bajar el blob ─────
// El endpoint hacia `get('data:<syncKey>')` solo para probar que la clave
// existe: ~4,6 MB en un camino que se pide al abrir la app y cada hora por
// dispositivo. En la historia de este mismo worker, una validacion que bajaba y
// parseaba `data:<syncKey>` cada minuto es lo que rompio la push del briefing
// de las 8am. El control se queda; el costo, no.
test('meeting-proposals no baja el blob de datos para validar la key', async () => {
  const env = entorno();
  const r = await (await cargar()).fetch(pedir(), env);
  assert.equal((await r.json()).completa, true);
  assert.deepEqual(env.gets.filter(k => k.indexOf('data:') === 0), [],
                   'bajo el blob de ~4,6 MB solo para ver si la clave existe');
  assert.deepEqual(env.listas, [{ prefix: 'data:lbp_x', limit: 1 }]);
});

test('meeting-proposals sigue exigiendo la key EXACTA, no un prefijo', async () => {
  // `list({prefix})` casa por prefijo: sin comparar el nombre, una clave corta
  // como "lbp_" pasaria el control y leeria su agenda.
  const env = entorno();
  const r = await (await cargar()).fetch(pedir('lbp_'), env);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.error, /key/i);
  assert.equal(b.completa, false);
  assert.deepEqual(b.eventos, []);
  assert.deepEqual(env.llamadas, [], 'llamo al briefing con una clave parcial');
});

test('meeting-proposals con un KV que revienta falla cerrado', async () => {
  const env = entorno();
  env.LBP_KV.list = async () => { throw new Error('KV caido'); };
  const b = await (await (await cargar()).fetch(pedir(), env)).json();
  assert.match(b.error, /key/i);
  assert.deepEqual(env.llamadas, []);
});
