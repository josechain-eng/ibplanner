// La clave AUSENTE ya estaba contemplada. El hueco es la clave PRESENTE con la
// API rechazando: callClaude devuelve '' y /chat respondia {"content":""}, asi
// que la app muestra la nada y no hay forma de saber por que.
// Paso de verdad el 14-oct-2026: la cuenta se quedo sin credito y el
// asistente, el brainstorm y "Registrar lo hecho" dejaron de responder en
// silencio. El motivo real (400 "credit balance is too low") solo aparecio
// despues de instrumentar callClaude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_chat_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const pedir = () => new Request('https://x/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'hola' }] }),
});

const ENV = { ANTHROPIC_API_KEY: 'sk-test', LBP_KV: { get: async () => null, put: async () => {} } };

async function conApiQueFalla(status, cuerpo, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(cuerpo, { status });
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('/chat dice por que fallo la API, no devuelve vacio mudo', async () => {
  const w = await cargar();
  const b = await conApiQueFalla(400,
    '{"error":{"message":"Your credit balance is too low"}}',
    async () => (await w.fetch(pedir(), ENV)).json());
  assert.equal(b.content, '');
  assert.ok(b.error, 'tiene que venir el motivo');
  assert.match(b.error, /400/);
  assert.match(b.error, /credit balance/i, 'el texto de la API, no una frase generica');
});

test('/chat sin clave sigue avisando como antes', async () => {
  const w = await cargar();
  const r = await w.fetch(pedir(), { LBP_KV: ENV.LBP_KV });
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /ANTHROPIC_API_KEY/);
});
