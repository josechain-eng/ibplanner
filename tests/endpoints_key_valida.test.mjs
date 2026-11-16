// /email-actions, /campaign-actions y /task-proposals solo contestan a una sync key real
// (existe data:<key>). Una key inventada o el prefijo "lbp_" devuelven la forma
// vacia de CADA endpoint y no gastan ni una llamada entre Workers ni al modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_lbp_keyvalida_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const DATOS = JSON.stringify({ clients: [{ id: 'cl_ax', businessName: 'AX' }], campaigns: [] });

function entorno(o) {
  o = o || {};
  const llamadas = [], gets = [];
  return {
    BRIEFING_KEY: 'bk',
    LBP_KV: {
      get: async k => { gets.push(k); return k === 'data:lbp_x' ? DATOS : null; },
      list: async opciones => {
        if (o.kvFalla) throw new Error('kv caido');
        const pre = (opciones && opciones.prefix) || '';
        const todas = ['data:lbp_x', 'subs:lbp_x'];
        return { keys: todas.filter(n => n.indexOf(pre) === 0).map(n => ({ name: n })), list_complete: true };
      },
      put: async () => {}
    },
    BRIEFING_SERVICE: {
      fetch: async req => {
        llamadas.push(req.url);
        return new Response(JSON.stringify({ ts: 't', correos: [], emails: [] }), { status: 200 });
      }
    },
    llamadas, gets
  };
}

// Cualquier salida a la red (incluido el modelo) se anota.
async function con(fn) {
  const salidas = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => { salidas.push(String(u)); return new Response('{}', { status: 200 }); };
  try { return await fn(salidas); } finally { globalThis.fetch = orig; }
}

const CASOS = [
  ['/email-actions', (b) => { assert.equal(b.emails, 0); assert.deepEqual(b.byClient, []); }],
  ['/campaign-actions', (b) => { assert.equal(b.correos, 0); assert.deepEqual(b.acciones, []); }],
  ['/task-proposals', (b) => { assert.deepEqual(b.propuestas, []); }]
];

for (const [ruta, forma] of CASOS) {
  const pedir = k => new Request('https://x' + ruta + '?key=' + k);

  for (const mala of ['cualquier-cosa-inventada', 'lbp_', 'lbp_x_no']) {
    test(ruta + ' con key "' + mala + '" devuelve su forma vacia y no llama a nadie', async () => {
      const env = entorno();
      await con(async salidas => {
        const r = await (await cargar()).fetch(pedir(mala), env);
        const b = await r.json();
        assert.equal(r.status, 200);
        assert.ok(b.error);
        forma(b);
        assert.deepEqual(env.llamadas, []);
        assert.deepEqual(salidas, []);
        assert.deepEqual(env.gets, []);
      });
    });
  }

  test(ruta + ' falla cerrado si el KV lanza', async () => {
    const env = entorno({ kvFalla: true });
    await con(async salidas => {
      const b = await (await (await cargar()).fetch(pedir('lbp_x'), env)).json();
      assert.ok(b.error);
      forma(b);
      assert.deepEqual(env.llamadas, []);
      assert.deepEqual(salidas, []);
    });
  });

  test(ruta + ' con la key real sigue al camino normal (llama al briefing)', async () => {
    const env = entorno();
    await con(async () => {
      await (await cargar()).fetch(pedir('lbp_x'), env);
      assert.equal(env.llamadas.length, 1);
    });
  });
}
