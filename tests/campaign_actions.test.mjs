// Prueba /campaign-actions contra el worker.js real, con el briefing y el KV
// falsos y SIN llamar a Anthropic. Cubre los caminos de degradacion: lo que
// no se puede leer tiene que decirlo, no devolver una lista vacia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_lbp_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const CORREO = { id: '1', subject: 'Campana X', date: '2026-10-03', texto: 'Desde hoy y hasta fin de mes en AX' };
const DATOS = JSON.stringify({
  clients: [{ id: 'cl_ax', businessName: 'AX' }, { id: 'cl_ck', name: 'CK' }],
  campaigns: [{ id: 'camp_1', name: 'Invierno 2026', dateStart: '2026-06-01', dateEnd: '2026-07-31', status: 'FINALIZADA', franchises: [{ clientId: 'cl_ax' }] }]
});

function entorno(opts) {
  const o = opts || {};
  return {
    BRIEFING_KEY: o.sinBriefKey ? undefined : 'bk',
    // Sin ANTHROPIC_API_KEY a proposito: callClaude devuelve '' sin salir a la red.
    LBP_KV: { get: async k => (k === 'data:lbp_x' ? (o.datos === undefined ? DATOS : o.datos) : null), put: async () => {} },
    BRIEFING_SERVICE: {
      fetch: async () => (o.briefStatus && o.briefStatus !== 200)
        ? new Response('no', { status: o.briefStatus })
        : new Response(JSON.stringify({ ts: '2026-10-14T10:00:00Z', correos: o.correos === undefined ? [CORREO] : o.correos }), { status: 200 })
    }
  };
}

const pedir = (key) => new Request('https://x/campaign-actions?key=' + (key === undefined ? 'lbp_x' : key));

test('sin key avisa en vez de fallar', async () => {
  const r = await (await cargar()).fetch(pedir(''), entorno());
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.error, /key/i);
  assert.deepEqual(b.acciones, []);
});

test('sin BRIEFING_KEY lo dice', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ sinBriefKey: true }))).json();
  assert.match(b.error, /BRIEFING_KEY/);
});

test('briefing caido lo dice y marca que fue por binding', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ briefStatus: 500 }))).json();
  assert.match(b.error, /500/);
  assert.match(b.error, /binding/);
});

test('sin correos no es un error: es una nota con instruccion', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ correos: [] }))).json();
  assert.equal(b.error, undefined);
  assert.equal(b.correos, 0);
  assert.deepEqual(b.acciones, []);
  assert.match(b.note, /Outlook/);
});

test('sin tiendas en la nube pide sincronizar', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ datos: JSON.stringify({ clients: [] }) }))).json();
  assert.match(b.error, /tiendas/i);
});

test('datos corruptos en KV no revientan el endpoint', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ datos: '{no es json' }))).json();
  assert.ok(b.error);
  assert.deepEqual(b.acciones, []);
});

test('la IA sin responder NO se ve como "nada que cargar"', async () => {
  // Este es el caso de Review Focus #2: hay correos, hay tiendas, y callClaude
  // devuelve '' porque falta ANTHROPIC_API_KEY.
  const b = await (await (await cargar()).fetch(pedir(), entorno())).json();
  assert.equal(b.correos, 1);
  assert.deepEqual(b.acciones, []);
  assert.ok(b.error, 'tiene que haber un error visible, no una lista vacia muda');
  assert.match(b.error, /IA/);
});

// ── I5: /push-campanas estaba abierto a cualquiera ──
// La URL del worker esta configurada dentro de la PWA publicada y se ve en
// cualquier traza de red. Sin autenticacion, un POST {"n":5} le manda una
// notificacion a todos los dispositivos de Pepe.
const pushReq = (auth) => new Request('https://x/push-campanas', {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: auth } : {}),
  body: JSON.stringify({ n: 3 }),
});

const envPush = () => ({
  BRIEFING_KEY: 'bk',
  LBP_KV: { get: async k => (k === 'synckeys_registry' ? '["lbp_a"]' : (k === 'subs:lbp_a' ? '[]' : null)), put: async () => {} },
});

test('push-campanas sin autorizacion da 401', async () => {
  const w = await cargar();
  assert.equal((await w.fetch(pushReq(null), envPush())).status, 401);
  assert.equal((await w.fetch(pushReq('Bearer malo'), envPush())).status, 401);
});

test('push-campanas con el secreto correcto pasa', async () => {
  const w = await cargar();
  const r = await w.fetch(pushReq('Bearer bk'), envPush());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).sent, 0);  // sin suscripciones en este entorno
});

test('push-campanas sin BRIEFING_KEY en el worker no queda abierto', async () => {
  const w = await cargar();
  const env = Object.assign(envPush(), { BRIEFING_KEY: undefined });
  assert.equal((await w.fetch(pushReq('Bearer bk'), env)).status, 401);
});

// El KV guarda hasta 60 correos pero el endpoint mandaba al modelo solo los 30
// mas nuevos: con 2025 + 2026 cargados, los mas viejos no llegaban nunca y
// desaparecian sin dejar rastro. Los dos topes tienen que ser el mismo numero.
test('el endpoint manda al modelo todo lo que el KV puede guardar', async () => {
  const SRC_LBP = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');
  const m = SRC_LBP.match(/payload\.correos\.slice\(0,\s*(\d+)\)/);
  assert.ok(m, 'no encuentro el slice de correos en /campaign-actions');
  assert.equal(Number(m[1]), 60, 'el tope del endpoint tiene que igualar el del KV (60)');
});

// callClaude devuelve '' ante CUALQUIER fallo (falta la clave, 400, 429, red)
// y el endpoint decia siempre "La IA no respondio", que no permite distinguir
// una clave faltante de un limite de uso. Me costo un ciclo de diagnostico a
// ciegas el 14-oct; a Pepe le costaria mas.
test('el error dice POR QUE no respondio la IA', async () => {
  const w = await cargar();
  const env = entorno();            // sin ANTHROPIC_API_KEY a proposito
  const b = await (await w.fetch(pedir(), env)).json();
  assert.ok(b.error, 'tiene que haber error');
  assert.match(b.error, /ANTHROPIC_API_KEY/i, 'el motivo concreto, no "no respondio"');
});

// ── Tandas paralelas ──
// Una sola llamada con 36 correos genero tanta salida que Cloudflare corto con
// 524 a los 2:06 (medido el 14-oct-2026 con los correos reales de 2025+2026).
// Se parte en grupos y se llama en paralelo: cada respuesta es corta y el
// tiempo total es el de la tanda mas lenta, no la suma.
function envConIA(porLlamada, contador) {
  return {
    ANTHROPIC_API_KEY: 'sk-test',
    BRIEFING_KEY: 'bk',
    LBP_KV: { get: async k => (k === 'data:lbp_x' ? DATOS : null), put: async () => {} },
    BRIEFING_SERVICE: {
      fetch: async () => new Response(JSON.stringify({
        ts: 't',
        correos: Array.from({ length: 36 }, (_, i) => ({
          id: 'i' + i, subject: 'Campana ' + i, date: '2026-0' + (i % 9 + 1) + '-01', texto: 'cuerpo ' + i })),
      }), { status: 200 }),
    },
  };
}

async function conIAStub(fn, respuestas) {
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (u, o) => {
    if (String(u).includes('api.anthropic.com')) {
      const cuerpo = JSON.parse(o.body);
      const idx = n++;
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify(respuestas(idx, cuerpo)) }],
        stop_reason: 'end_turn',
      }), { status: 200 });
    }
    return real(u, o);
  };
  try { return { res: await fn(), llamadas: () => n }; }
  finally { globalThis.fetch = real; }
}

test('36 correos se reparten en varias llamadas, no una sola', async () => {
  const w = await cargar();
  let llamadas = 0;
  const out = await conIAStub(async () => {
    return (await w.fetch(pedir(), envConIA())).json();
  }, (i) => {
    llamadas = Math.max(llamadas, i + 1);
    return { acciones: [{
      tipo: 'nueva', confianza: 'alta', correo: 'tanda ' + i,
      campana: { name: 'Campana tanda ' + i, dateStart: '2026-03-01', dateEnd: '2026-03-31',
        franchises: [{ clientId: 'cl_ax', lines: [], sublines: [] }] } }] };
  });
  assert.ok(out.llamadas() > 1, 'tiene que partirse en mas de una llamada, hubo ' + out.llamadas());
  const b = await out.res;
  assert.equal(b.acciones.length, out.llamadas(), 'se juntan los resultados de todas las tandas');
  const nombres = b.acciones.map(a => a.campana.name);
  assert.equal(new Set(nombres).size, nombres.length, 'no se pierde ni se duplica ninguna tanda');
});

test('si una tanda falla, las demas igual llegan', async () => {
  const w = await cargar();
  const real = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (u, o) => {
    if (String(u).includes('api.anthropic.com')) {
      if (n++ === 0) return new Response('boom', { status: 500 });
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({ acciones: [{
          tipo: 'nueva', confianza: 'alta', correo: 'ok',
          campana: { name: 'Sobreviviente ' + n, dateStart: '2026-03-01',
            franchises: [{ clientId: 'cl_ax', lines: [], sublines: [] }] } }] }) }],
        stop_reason: 'end_turn' }), { status: 200 });
    }
    return real(u, o);
  };
  try {
    const b = await (await w.fetch(pedir(), envConIA())).json();
    assert.ok(b.acciones.length >= 1, 'las tandas buenas llegan igual');
    assert.ok(b.descartes.some(d => /tanda/i.test(d)), 'la tanda fallida se informa');
  } finally { globalThis.fetch = real; }
});

test('el validador no corta en 20 cuando hay muchos correos', async () => {
  const SRC_LBP = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');
  const m = SRC_LBP.match(/\.slice\(0,\s*(\d+)\)\.forEach\(function \(a\)/);
  assert.ok(m, 'no encuentro el tope de acciones del validador');
  assert.ok(Number(m[1]) >= 60, 'con 60 correos pueden salir mas de 20 campanas, hay ' + m[1]);
});
