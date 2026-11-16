// Prueba GET /task-proposals contra el worker.js real, con briefing, KV y
// Anthropic falsos. Nada sale a la red: globalThis.fetch se reemplaza y se
// restaura al terminar cada prueba.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_tp_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const HOY = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const HILOS = [
  { threadId: 'outlook-1', subject: 'RE: Pago Royalty Fogo', from: 'Ana <ana@fogodechao.com>',
    date: HOY + 'T09:00:00', snippet: 'gracias',
    mensajes: [{ from: 'Ana <ana@fogodechao.com>', date: HOY + 'T09:00:00', snippet: 'gracias' },
               { from: 'Ana <ana@fogodechao.com>', date: HOY + 'T08:00:00', snippet: 'Favor revisar el pago del royalty de octubre' }] },
  { threadId: 'outlook-2', subject: '(sin asunto)', from: 'Luis <luis@mango.com>',
    date: HOY + 'T09:00:00', snippet: 'mandame el pedido' },
];
const RESPUESTA = { propuestas: [
  { correo: 1, titulo: 'Ver Pago Royalty Fogo', cita: 'Favor revisar el pago del royalty de octubre', cliente: 'Fogo' },
  { correo: 2, titulo: 'Mandar el pedido a Mango', cita: 'mandame el pedido', cliente: 'Mango' },
  { correo: 9, titulo: 'Inventada', cita: 'no existe', cliente: '' } ] };
const TS = '2026-11-16T10:00:00Z';

const fetchOriginal = globalThis.fetch;
let llamadasModelo, cuerposModelo, llamadasBriefing, kv;
afterEach(() => { globalThis.fetch = fetchOriginal; });

function entorno(opts) {
  const o = opts || {};
  llamadasModelo = 0; cuerposModelo = []; llamadasBriefing = 0; kv = new Map();
  kv.set('data:lbp_x', JSON.stringify({ clients: [{ id: 'cl_f', businessName: 'Fogo' }],
    tasks: [{ title: 'Revisar contrato PF Changs', createdAt: HOY + 'T01:00:00Z' }] }));
  globalThis.fetch = async (u, init) => {
    assert.match(String(u), /api\.anthropic\.com/, 'solo se permite hablar con Anthropic (falso)');
    llamadasModelo++; cuerposModelo.push(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(RESPUESTA) }] }), { status: 200 });
  };
  return {
    BRIEFING_KEY: 'bk', ANTHROPIC_API_KEY: 'x',
    LBP_KV: {
      list: async op => ({ keys: [...kv.keys()].filter(n => n.indexOf((op && op.prefix) || '') === 0).map(n => ({ name: n })) }),
      get: async k => (kv.has(k) ? kv.get(k) : null),
      put: async (k, v) => { kv.set(k, v); }
    },
    BRIEFING_SERVICE: { fetch: async () => { llamadasBriefing++; return new Response(JSON.stringify({ ts: TS, emails: HILOS }), { status: 200 }); } }
  };
}

const pedir = (q) => new Request('https://x/task-proposals?key=lbp_x&days=10' + (q || ''));
const llamar = async (env, q) => (await (await cargar()).fetch(pedir(q), env)).json();

test('el hiloId sale del asunto normalizado, no del modelo', async () => {
  const b = await llamar(entorno());
  assert.equal(b.propuestas[0].hiloId, 'hilo:pago royalty fogo');
  for (const [asunto, esperado] of [['Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                    ['RE: Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                    ['Fwd: Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                    ['RES:Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                    ['RV : Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                    // un solo prefijo, igual que normalize_subject del puente
                                    // sin recorte previo: el espacio inicial impide quitar el prefijo, igual que en Python
                                    ['  RV : Pago Royalty Fogo  ', 'hilo:rv : pago royalty fogo'],
                                    ['Re: Re: Pago Royalty Fogo', 'hilo:re: pago royalty fogo']]) {
    const env = entorno();
    env.BRIEFING_SERVICE.fetch = async () => new Response(JSON.stringify({ ts: TS, emails: [{ ...HILOS[0], subject: asunto }] }), { status: 200 });
    const r = await llamar(env);
    assert.equal(r.propuestas[0].hiloId, esperado, asunto);
  }
});

test('un asunto vacio cae al threadId', async () => {
  const b = await llamar(entorno());
  assert.equal(b.propuestas[1].hiloId, 'msg:outlook-2');
});

test('una propuesta con un correo que no existe se descarta', async () => {
  const b = await llamar(entorno());
  assert.equal(b.propuestas.length, 2);
  assert.equal(b.descartes.length, 1);
});

test('el cuerpo del modelo incluye el mensaje mas viejo del hilo', async () => {
  const env = entorno();
  await llamar(env);
  assert.equal(llamadasModelo, 1);
  assert.match(cuerposModelo[0], /royalty de octubre/);
  assert.match(cuerposModelo[0], /Revisar contrato PF Changs/);
  // orden: el mensaje viejo va antes que el nuevo (se busca la linea del mensaje, no la palabra,
  // porque el prompt del sistema tambien la menciona)
  const viejo = cuerposModelo[0].indexOf('Favor revisar el pago del royalty de octubre');
  const nuevo = cuerposModelo[0].indexOf(': gracias');
  assert.ok(viejo > -1 && nuevo > -1 && viejo < nuevo);
});

test('la segunda llamada del dia sale del cache y no llama al modelo', async () => {
  const env = entorno();
  const a = await llamar(env);
  const b = await llamar(env);
  assert.equal(a.cacheada, false);
  assert.equal(b.cacheada, true);
  assert.equal(llamadasModelo, 1);
  assert.deepEqual(b.propuestas, a.propuestas);
  assert.ok(kv.has('tprop:lbp_x:' + HOY + ':10'));
});

test('refresh=1 vuelve a llamar al modelo', async () => {
  const env = entorno();
  await llamar(env);
  const b = await llamar(env, '&refresh=1');
  assert.equal(llamadasModelo, 2);
  assert.equal(b.cacheada, false);
});

test('sin key valida no llama ni al briefing ni al modelo', async () => {
  for (const k of ['', 'lbp_']) {
    const env = entorno();
    const r = await (await cargar()).fetch(new Request('https://x/task-proposals?key=' + k), env);
    const b = await r.json();
    assert.equal(r.status, 200);
    assert.match(b.error, /key/i);
    assert.deepEqual(b.propuestas, []);
    assert.equal(llamadasModelo, 0);
    assert.equal(llamadasBriefing, 0);
  }
});

test('el ts del briefing viaja al cliente', async () => {
  const b = await llamar(entorno());
  assert.equal(b.ts, TS);
});

test('otro days el mismo dia no sale del cache de otro days', async () => {
  const env = entorno();
  await llamar(env);
  const r = await (await cargar()).fetch(new Request('https://x/task-proposals?key=lbp_x&days=30'), env);
  const b = await r.json();
  assert.equal(b.cacheada, false);
  assert.equal(llamadasModelo, 2);
  assert.ok(kv.has('tprop:lbp_x:' + HOY + ':30'));
});

test('un briefing que responde null no rompe: 200 con la forma vacia', async () => {
  const env = entorno();
  env.BRIEFING_SERVICE.fetch = async () => new Response('null', { status: 200 });
  const r = await (await cargar()).fetch(pedir(), env);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(b.propuestas, []);
  assert.equal(llamadasModelo, 0);
});

test('una tarea con createdAt NUMERICO (las que nacen de correo o de _tpAplicar) entra al contexto', async () => {
  const env = entorno();
  kv.set('data:lbp_x', JSON.stringify({ tasks: [
    { title: 'Tarea con createdAt numerico', createdAt: Date.now() - 86400000 },
    { title: 'Tarea numerica vieja', createdAt: Date.now() - 90 * 86400000 },
    { title: 'Tarea sin createdAt usable', createdAt: 'basura', dueDate: HOY } ] }));
  await llamar(env);
  assert.match(cuerposModelo[0], /Tarea con createdAt numerico/);
  assert.match(cuerposModelo[0], /Tarea sin createdAt usable/, 'createdAt ilegible debe caer a dueDate');
  assert.doesNotMatch(cuerposModelo[0], /Tarea numerica vieja/, 'fuera de los 60 dias no entra');
});

test('el tope de 60 hilos informa cuantos quedaron fuera (los mas viejos) en vez de callarlo', async () => {
  const env = entorno();
  const muchos = [];
  for (let i = 0; i < 75; i++) muchos.push({ threadId: 'o-' + i, subject: 'Asunto ' + i, from: 'a@b.c', date: HOY + 'T09:00:00', snippet: 's' + i });
  env.BRIEFING_SERVICE.fetch = async () => new Response(JSON.stringify({ ts: TS, emails: muchos }), { status: 200 });
  const b = await llamar(env);
  assert.equal(b.analizados, 60);
  assert.equal(b.recortados, 15);
  assert.equal(llamadasModelo, 6);
  assert.doesNotMatch(cuerposModelo.join(''), /Asunto 74/, 'el hilo 75 (el mas viejo) queda fuera');
  assert.equal((await llamar(entorno())).recortados, 0);
});

test('una tanda caida se informa: fallos y tandas viajan al cliente y la respuesta no se cachea', async () => {
  const env = entorno();
  const muchos = [];
  for (let i = 0; i < 20; i++) muchos.push({ threadId: 'o-' + i, subject: 'Asunto ' + i, from: 'a@b.c', date: HOY + 'T09:00:00', snippet: 's' });
  env.BRIEFING_SERVICE.fetch = async () => new Response(JSON.stringify({ ts: TS, emails: muchos }), { status: 200 });
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ propuestas: [] }) }] }), { status: 200 });
  };
  const b = await llamar(env);
  assert.equal(b.tandas, 2);
  assert.equal(b.fallos, 1);
  assert.equal(b.cacheada, false);
  assert.ok(b.descartes.length >= 1);
  assert.ok(![...kv.keys()].some(k => k.startsWith('tprop:')), 'con una tanda caida no se cachea');
});
