// Las seis reglas de alerta del Home, como funcion pura (window._lbpAlertas).
// La funcion y sus ayudantes de aduana se extraen del HTML y se ejecutan de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

function cuerpo(i) {
  let nivel = 0;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') nivel++;
    else if (html[j] === '}' && --nivel === 0) return html.slice(i, j + 1);
  }
  assert.fail('no cierra');
}
function declarada(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  return cuerpo(i);
}
const i = html.indexOf('window._lbpAlertas = function');
assert.ok(i > 0, 'no encuentro window._lbpAlertas');
const win = new Function(
  'var window = {};\n' +
  ['_impNum', '_impDiasLimite', '_impLimiteTexto'].map(declarada).join('\n') + '\n' +
  cuerpo(i) + ';\nreturn window;')();

// ── Ayudantes: hora local siempre (nunca toISOString) ──
const ahora = new Date(2026, 10, 23, 15, 0, 0).getTime();
const DIA = 86400000;
const p2 = (n) => String(n).padStart(2, '0');
function localIso(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
    'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':00';
}
function localFecha(ms) { return localIso(ms).slice(0, 10); }

// Tarea abierta con alarma; alarmHace (ms) o diasHace (dias enteros) antes de "ahora".
function tarea(o) {
  o = o || {};
  const hace = o.alarmHace != null ? o.alarmHace : (o.diasHace || 0) * DIA;
  return {
    id: o.id || 't1', title: 'Pagar royalty', status: o.status || 'INBOX',
    createdAt: ahora - 30 * DIA,
    alarm: { enabled: true, datetime: localIso(ahora - hace), recurrence: 'once' }
  };
}
// Despacho en aduana a "dias" dias de HOY (el reloj real: _impDiasLimite lo usa).
function imp(o) {
  o = o || {};
  const hoy = Date.now();
  return { id: o.id || 'i1', status: 'EN_ADUANA', season: 'PF27',
           limiteAduana: localFecha(hoy + (o.dias || 0) * DIA) };
}
const fixtureSeisReglas = {
  tasks: [tarea({ alarmHace: 3 * 3600000, id: 'a' }), tarea({ diasHace: 5, id: 'b' })],
  meetings: [{ id: 'm1', title: 'Reunion con Mango', date: localFecha(ahora - DIA), startTime: '10:00' }],
  projects: [{ id: 'p1', name: 'Proyecto parado', status: 'ACTIVE', updatedAt: ahora - 11 * DIA }],
  clients: [{ id: 'c1', name: 'Cliente olvidado', status: 'ACTIVE', createdAt: ahora - 40 * DIA }],
  imports: [imp({ dias: 3 })]
};

test('data incompleto no rompe', () => {
  assert.deepEqual(win._lbpAlertas({}, Date.now()), []);
  assert.deepEqual(win._lbpAlertas({ tasks: undefined, imports: undefined }, Date.now()), []);
});

test('alarma de hoy sin completar', () => {
  const a = win._lbpAlertas({ tasks: [tarea({ alarmHace: 3 * 3600000 })] }, ahora);
  assert.equal(a.length, 1);
  assert.equal(a[0].route, 'tasks');
  assert.equal(a[0].taskId, 't1');
  assert.match(a[0].msg, /alarma de hoy/);
  assert.ok(Object.values(a[0]).every((v) => typeof v !== 'function'), 'sin closures');
});

test('la tarea hecha no alerta', () => {
  assert.deepEqual(win._lbpAlertas({ tasks: [tarea({ alarmHace: 3 * 3600000, status: 'DONE' })] }, ahora), []);
});

test('el limite de dias sube a 60', () => {
  assert.equal(win._lbpAlertas({ tasks: [tarea({ diasHace: 20 })] }, ahora).length, 1,
    'a los 20 dias hoy desaparece; tiene que seguir');
  assert.equal(win._lbpAlertas({ tasks: [tarea({ diasHace: 59 })] }, ahora).length, 1);
  assert.equal(win._lbpAlertas({ tasks: [tarea({ diasHace: 61 })] }, ahora).length, 0);
});

test('las SEIS reglas siguen alcanzables', () => {
  // El traslado del JSX a la funcion no puede perder una regla en el camino.
  const ids = win._lbpAlertas(fixtureSeisReglas, ahora).map((a) => a.id);
  for (const pre of ['today_', 'stale_', 'followup_', 'proj_', 'client_', 'aduana_'])
    assert.ok(ids.some((id) => id.indexOf(pre) === 0), 'falta la regla ' + pre);
});

test('aduana va adelante de las tareas, y la mas urgente primero', () => {
  const a = win._lbpAlertas({ tasks: [tarea({ diasHace: 2 }), tarea({ diasHace: 3, id: 't2' })],
                              imports: [imp({ dias: 5 }), imp({ dias: 1, id: 'i2' })],
                              clients: [] }, ahora);
  assert.match(a[0].id, /^aduana_i2$/);
  assert.match(a[1].id, /^aduana_/);
  assert.equal(a[2].route, 'tasks');
});
