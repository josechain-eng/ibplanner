// Task 7: el asistente proactivo reemplazo al briefing y a cuatro notificaciones
// sueltas. Aqui se prueba que esas cinco compuertas del cron estan APAGADAS y que
// las tres que se dejan a proposito (deadlines, habits, weekly) SIGUEN prendidas.
// Corre el cron REAL (w.scheduled) con el arnes de tests/_arnes_cron.mjs.
//
// El Worker corre en UTC; la maquina de desarrollo es America/La_Paz.
// Va ANTES de cualquier constante de fecha.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cargarWorker, kvFalso, envFalso, conReloj, anthropicFalso } from './_arnes_cron.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const K = 'k_uno';
// Martes 24-nov-2026 (dia 2), lunes 23, sabado 28, miercoles 25.
const MARTES = (h, m) => Date.UTC(2026, 10, 24, h, m);
const LUNES_1345 = Date.UTC(2026, 10, 23, 13, 45);
const SABADO_1500 = Date.UTC(2026, 10, 28, 15, 0);
const MIERC_0100 = Date.UTC(2026, 10, 25, 1, 0);
const VIEJO = Date.UTC(2026, 8, 1);

// ── Red: el push sale a un host de prueba y se cuenta; el modelo se cuenta ──
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

const b64u = (u) => Buffer.from(u).toString('base64url');
async function suscripcion() {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { endpoint: 'https://' + HOST_PUSH + '/uno', keys: { p256dh: b64u(pub), auth: b64u(auth) } };
}
const SUB = await suscripcion();

// Un mundo con datos que HARIAN salir las cinco notificaciones viejas y las tres
// que se conservan, cada una en su hora. Asi cada prueba solo cambia el reloj.
function mundo() {
  const data = {
    tasks: [
      { id: 't1', title: 'Tarea de hoy', status: 'TODO', dueDate: '2026-11-24' },
      { id: 't2', title: 'Vence manana', status: 'TODO', dueDate: '2026-11-25' },
      { id: 't3', title: 'Alarma vieja', status: 'TODO', alarm: { enabled: true, datetime: '2026-11-20T10:00:00Z' } },
    ],
    meetings: [{ id: 'm1', title: 'Reunion sin seguimiento', date: '2026-11-20' }],
    projects: [{ id: 'p1', name: 'Proyecto parado', status: 'ACTIVE', updatedAt: VIEJO }],
    clients: [{ id: 'c1', name: 'Cliente frio', status: 'ACTIVE', createdAt: VIEJO }],
    habits: [{ id: 'h1', name: 'Leer', active: true }],
    habitEntries: [],
  };
  return kvFalso({
    synckeys_registry: JSON.stringify([K]),
    ['data:' + K]: JSON.stringify(Object.assign({ _cloudSaveTime: MARTES(11, 0) }, data)),
    ['subs:' + K]: JSON.stringify([SUB]),
  });
}

async function correr(ms) {
  const kv = mundo();
  const w = await cargarWorker();
  const r = red([{ content: [{ type: 'text', text: 'Resumen del dia.' }], stop_reason: 'end_turn' }]);
  // sendSmartNotif traga sus errores con console.error('Smart notif error: <tipo> ...').
  // Hoy los generadores meeting_followup, stale_alarms, project_health y
  // client_health lanzan ReferenceError (usan `now`, que no existe ahi), asi que una
  // compuerta encendida NO deja push ni marca: solo esa linea. Se captura para que
  // la prueba pueda ver que la compuerta corrio aunque el generador este roto.
  const errores = [];
  const ce = console.error;
  console.error = (...a) => { errores.push(a.map(String).join(' ')); };
  try {
    await conReloj(ms, () => w.scheduled({}, envFalso({ LBP_KV: kv })));
  } finally { console.error = ce; r.restaurar(); }
  const claves = [...kv._map.keys()];
  return { kv, errores, push: r.push, llamadas: r.llamadas, claves,
    smart: claves.filter((c) => c.startsWith('smart:')),
    briefing: claves.filter((c) => c.startsWith('briefing_ai:')) };
}

// ── APAGADAS ────────────────────────────────────────────────────────────────
test('a las 12:03 UTC ya NO se genera el briefing', async () => {
  const r = await correr(MARTES(12, 3));
  assert.equal(r.llamadas.length, 0, 'llamo al modelo a las 12:03');
  assert.deepEqual(r.briefing, [], 'escribio briefing_ai:');
  assert.deepEqual(r.errores, [], 'algo corrio y fallo: ' + r.errores.join(' | '));
  assert.deepEqual(r.smart, [], 'marco una smart notif');
  assert.equal(r.push.length, 0, 'mando push a las 12:03');
});

test('a las 13:00 UTC ya NO sale el seguimiento de reuniones', async () => {
  const r = await correr(MARTES(13, 0));
  assert.deepEqual(r.errores.filter((e) => /meeting_followup/.test(e)), [], 'la compuerta corrio');
  assert.deepEqual(r.smart, [], 'marco ' + r.smart.join(','));
  assert.equal(r.push.length, 0);
});

test('a las 14:00 UTC L-V ya NO salen las alarmas viejas', async () => {
  const r = await correr(MARTES(14, 0));
  assert.deepEqual(r.errores.filter((e) => /stale_alarms/.test(e)), [], 'la compuerta corrio');
  assert.deepEqual(r.smart, [], 'marco ' + r.smart.join(','));
  assert.equal(r.push.length, 0);
});

test('el lunes 13:45 UTC ya NO sale salud de proyectos ni de clientes', async () => {
  const r = await correr(LUNES_1345);
  assert.deepEqual(r.errores.filter((e) => /project_health|client_health/.test(e)), [], 'la compuerta corrio');
  assert.deepEqual(r.smart, [], 'marco ' + r.smart.join(','));
  assert.equal(r.push.length, 0);
});

// ── ENCENDIDAS A PROPOSITO ──────────────────────────────────────────────────
test('deadlines a las 21:00 UTC SIGUE funcionando', async () => {
  const r = await correr(MARTES(21, 0));
  assert.equal(r.push.length, 1, 'esperaba un push por la tarea que vence manana');
  assert.equal(r.smart.length, 1);
  assert.match(r.smart[0], /:dl:2026-11-25:Vence manana$/);
});

test('habits a las 01:00 y weekly el sabado SIGUEN funcionando', async () => {
  const h = await correr(MIERC_0100);
  assert.equal(h.push.length, 1, 'habits no mando push');
  assert.deepEqual(h.smart, ['smart:' + K + ':2026-11-25:habits']);
  const w = await correr(SABADO_1500);
  assert.equal(w.push.length, 1, 'weekly no mando push');
  assert.deepEqual(w.smart, ['smart:' + K + ':2026-11-28:weekly']);
});

// ── Volver atras con una linea ──────────────────────────────────────────────
test('el generador del briefing sigue en el archivo y las compuertas estan comentadas', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'worker.js'), 'utf8');
  // Los generadores siguen: son el cuerpo de sendSmartNotif.
  for (const t of ['briefing', 'meeting_followup', 'stale_alarms', 'project_health', 'client_health']) {
    assert.ok(src.includes("type === '" + t + "'"), 'falta el generador de ' + t);
  }
  const llamada = (t) => new RegExp("^(\\s*//)?\\s*await sendSmartNotif\\(env, syncKeys, '" + t + "'", 'm');
  for (const t of ['briefing', 'meeting_followup', 'stale_alarms', 'project_health', 'client_health']) {
    const m = src.match(llamada(t));
    assert.ok(m, 'no se encuentra la llamada de ' + t);
    assert.ok(m[1], 'la compuerta de ' + t + ' no esta comentada');
  }
  for (const t of ['deadlines', 'habits', 'weekly']) {
    const m = src.match(llamada(t));
    assert.ok(m && !m[1], 'la compuerta de ' + t + ' debe seguir encendida');
  }
});
