// Las reuniones que entran de Google Calendar llegaban mudas: 12 de 12 sin
// alarma el 13-nov-2026, contra 25 de 32 en las que Pepe carga a mano. Por eso
// se entera encima de la hora. Esto les pone la alarma sola.
// Las funciones no se leen como texto: se extraen del HTML y se ejecutan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

// Saca el texto de una funcion del HTML contando llaves.
function fuente(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  let nivel = 0, fin = -1;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') nivel++;
    else if (html[j] === '}' && --nivel === 0) { fin = j + 1; break; }
  }
  assert.ok(fin > 0, 'no cierra ' + nombre);
  return html.slice(i, fin);
}

// Varias juntas, para que puedan llamarse entre ellas.
function traer(nombres, prologo = '') {
  const src = nombres.map(fuente).join('\n');
  return new Function(prologo + '\n' + src + '\nreturn {' + nombres.join(',') + '};')();
}

const { _esDiaEntero, _alarmaReunionGcal, _ponerAlarmasGcal } =
  traer(['defaultAlarm', '_fechaLocal', '_esDiaEntero', '_alarmaReunionGcal', '_ponerAlarmasGcal']);

const hoy = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const iso = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const ahora = hoy(9, 0).getTime();

test('una reunion con hora recibe la alarma una hora antes', () => {
  const a = _alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00', endTime:'16:00'}, ahora);
  assert.equal(a.enabled, true);
  assert.equal(a.datetime, iso(hoy(0,0)) + 'T14:00');
  assert.equal(a.label, 'Reunión aceptada');
  assert.equal(a.recurrence, 'once');
});

test('la alarma escala hasta la hora de la reunion', () => {
  const a = _alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}, ahora);
  // base en T-60, y los saltos la llevan a T-30, T-15 y T-5
  assert.deepEqual(a.repeatIntervals, [30, 45, 55]);
  assert.equal(a.repeatCount, 3);
});

test('el evento de dia entero escala como cualquier otra alarma', () => {
  const a = _alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'00:00', endTime:'00:00'}, hoy(6,0).getTime());
  assert.deepEqual(a.repeatIntervals, [5, 10], 'no hay hora a la que llegar: queda la escalada por defecto');
});

test('el evento de dia entero suena a las 8 de ese dia, no la noche anterior', () => {
  const m = {fromGcal:true, date:iso(hoy(0,0)), startTime:'00:00', endTime:'00:00'};
  assert.equal(_esDiaEntero(m), true);
  assert.equal(_alarmaReunionGcal(m, hoy(6,0).getTime()).datetime, iso(hoy(0,0)) + 'T08:00');
});

test('no se escribe una alarma que ya pasó', () => {
  // reunion de hoy 09:30 mirada a las 09:00: la de las 08:30 ya pasó
  assert.equal(_alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'09:30'}, ahora), null);
  // dia entero de hoy, mirado a las 10:00: las 08:00 ya pasaron
  assert.equal(_alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'00:00', endTime:'00:00'}, hoy(10,0).getTime()), null);
});

test('hora vacia o inválida no genera alarma', () => {
  for (const t of ['', '25:99', 'manana', undefined]) {
    assert.equal(_alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:t}, ahora), null, 'con startTime=' + t);
  }
  assert.equal(_alarmaReunionGcal({fromGcal:true, date:'', startTime:'15:00'}, ahora), null);
});

test('no toca lo que no viene de Google ni lo que ya tiene alarma', () => {
  const base = {date:iso(hoy(0,0)), startTime:'15:00'};
  assert.equal(_alarmaReunionGcal(Object.assign({}, base), ahora), null, 'sin fromGcal');
  assert.equal(_alarmaReunionGcal(Object.assign({fromGcal:true, alarm:{enabled:true, datetime:'2026-01-01T10:00'}}, base), ahora), null);
  assert.equal(_alarmaReunionGcal(Object.assign({fromGcal:true, alarm:{enabled:false, datetime:'2026-01-01T10:00'}}, base), ahora), null, 'la apagó a propósito');
});

test('_ponerAlarmasGcal devuelve la MISMA lista si no hay nada que poner', () => {
  const l = [{id:'a', date:iso(hoy(0,0)), startTime:'15:00'}];
  assert.equal(_ponerAlarmasGcal(l, ahora), l);
});

test('_ponerAlarmasGcal solo cambia las que corresponden', () => {
  const l = [{id:'a', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}, {id:'b', date:iso(hoy(0,0)), startTime:'16:00'}];
  const r = _ponerAlarmasGcal(l, ahora);
  assert.notEqual(r, l);
  assert.equal(r[0].alarm.datetime, iso(hoy(0,0)) + 'T14:00');
  assert.equal(r[1].alarm, undefined);
});

test('el importador marca ACEPTADA y aplica las alarmas sobre la lista entera', () => {
  const i = html.indexOf("window._gcalPull = function");
  const cuerpo = html.slice(i, html.indexOf("window.dispatchEvent(new Event('lbp_gcal_pulled'))", i));
  assert.ok(/confirmacion: 'ACEPTADA'/.test(cuerpo), 'el evento importado no se marca ACEPTADA');
  assert.ok(/_ponerAlarmasGcal\(existing/.test(cuerpo),
    'tiene que correr sobre la lista entera, no solo sobre las nuevas: las 12 ya importadas también necesitan alarma');
  assert.ok(cuerpo.indexOf('_ponerAlarmasGcal') > cuerpo.indexOf('existing.push'),
    'la pasada va DESPUÉS de agregar las nuevas');
});

test('la pasada es idempotente: correrla dos veces da la misma lista', () => {
  const l = [{id:'a', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}];
  const uno = _ponerAlarmasGcal(l, ahora);
  assert.equal(_ponerAlarmasGcal(uno, ahora), uno,
    'si no devuelve la misma referencia, cada sync de 15 min reescribe los datos');
});

test('el resumen del dia aclara si la reunion es aceptada o propuesta', () => {
  const i = html.indexOf('\\uD83D\\uDCC5 REUNIONES DE HOY');
  const cuerpo = html.slice(i, i + 1800);
  assert.ok(/m\.confirmacion/.test(cuerpo), 'la tarjeta no mira el campo');
  assert.ok(cuerpo.includes('Propuesta') && cuerpo.includes('Aceptada'), 'faltan los dos textos');
});

test('los dos textos de la alarma existen', () => {
  assert.ok(html.includes("'Reunión aceptada'"));
  assert.ok(html.includes("'Reunión propuesta'"));
});
