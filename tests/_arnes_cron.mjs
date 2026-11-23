// Arnes para probar el cron (scheduled) del worker real: KV falso, reloj fijo
// y red prohibida. No termina en .test.mjs a proposito: el glob de pruebas
// tests/*.test.mjs no debe correrlo como si fuera una prueba.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
let contador = 0;

// Escribe worker.js a un .mjs temporal unico, lo importa con cache-busting y lo borra.
export async function cargarWorker() {
  const src = fs.readFileSync(path.join(RAIZ, 'worker.js'), 'utf8');
  const tmp = path.join(import.meta.dirname, '.worker_arnes_' + process.pid + '_' + (contador++) + '.mjs');
  fs.writeFileSync(tmp, src);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

// KV en memoria. get -> string | null (el worker hace su propio JSON.parse).
// Las opciones de put (expirationTtl) se registran en _opts, no se aplican.
// dailyinfo_v2 se siembra "fresco" si no viene en `entradas`: el cron refresca
// el tipo de cambio por red cuando mm < 5 o 30 <= mm < 35 SOLO si
// now - updatedAt > 20 min. El kv suele crearse ANTES de conReloj, asi que no
// se puede usar Date.now() (el reloj fijado puede ser un dia posterior y la
// entrada nacer vieja); se usa un updatedAt en el futuro lejano, con lo que
// now - updatedAt es negativo con cualquier reloj. Para probar el refresco,
// pasar dailyinfo_v2 explicito con un updatedAt viejo.
export function kvFalso(entradas) {
  const _map = new Map();
  const _opts = new Map();
  const e = entradas || {};
  if (!('dailyinfo_v2' in e)) _map.set('dailyinfo_v2', JSON.stringify({ updatedAt: Date.UTC(2100, 0, 1) }));
  for (const k of Object.keys(e)) _map.set(k, e[k]);
  return {
    _map, _opts,
    async get(k) { return _map.has(k) ? _map.get(k) : null; },
    async put(k, v, opts) { _map.set(k, String(v)); if (opts) _opts.set(k, opts); else _opts.delete(k); },
    async delete(k) { _map.delete(k); _opts.delete(k); },
  };
}

export function envFalso(opts) {
  const o = opts || {};
  const env = {
    LBP_KV: o.LBP_KV || kvFalso(),
    ANTHROPIC_API_KEY: o.ANTHROPIC_API_KEY || 'anthropic-falsa',
    BRIEFING_KEY: o.BRIEFING_KEY || 'briefing-falsa',
    ASIS_KEY: o.ASIS_KEY || 'asis-falsa', // aun nadie la lee; la usa el endpoint de tareas siguientes
  };
  if (o.LBP_R2) env.LBP_R2 = o.LBP_R2;
  if (o.BRIEFING_SERVICE) env.BRIEFING_SERVICE = o.BRIEFING_SERVICE;
  return env;
}

// Fija Date.now y lo restaura siempre, aun si fn lanza.
export async function conReloj(ms, fn) {
  const original = Date.now;
  Date.now = () => ms;
  try { return await fn(); }
  finally { Date.now = original; }
}

// Reemplaza globalThis.fetch. Cualquier host distinto de api.anthropic.com
// lanza un AssertionError (y queda en `prohibidas`, por si el worker lo traga).
// Devuelve las respuestas en orden: cada una es un objeto (se serializa como
// JSON 200) o una Response lista; agotadas -> falla.
export function anthropicFalso(respuestas) {
  const original = globalThis.fetch;
  const cola = (respuestas || []).slice();
  const llamadas = [], cuerpos = [], prohibidas = [];
  globalThis.fetch = async (u, init) => {
    const host = new URL(String(u && u.url ? u.url : u)).host;
    if (host !== 'api.anthropic.com') {
      prohibidas.push(String(u));
      assert.fail('salida a la red prohibida en prueba: ' + host);
    }
    llamadas.push(String(u));
    cuerpos.push(init && init.body !== undefined ? String(init.body) : '');
    assert.ok(cola.length > 0, 'llamada a Anthropic sin respuesta preparada');
    const r = cola.shift();
    return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { llamadas, cuerpos, prohibidas, restaurar() { globalThis.fetch = original; } };
}
