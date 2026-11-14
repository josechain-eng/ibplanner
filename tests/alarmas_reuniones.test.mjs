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
function traer(nombres, prologo = '', extra = []) {
  const src = nombres.map(fuente).join('\n');
  return new Function(prologo + '\n' + src + '\nreturn {' + nombres.concat(extra).join(',') + '};')();
}

const { _esDiaEntero, _alarmaReunionGcal, _normalizarGcal } =
  traer(['defaultAlarm', '_fechaLocal', '_esDiaEntero', '_alarmaReunionGcal', '_normalizarGcal']);

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
  assert.equal(_normalizarGcal(l, ahora), l);
});

test('_ponerAlarmasGcal solo cambia las que corresponden', () => {
  const l = [{id:'a', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}, {id:'b', date:iso(hoy(0,0)), startTime:'16:00'}];
  const r = _normalizarGcal(l, ahora);
  assert.notEqual(r, l);
  assert.equal(r[0].alarm.datetime, iso(hoy(0,0)) + 'T14:00');
  assert.equal(r[1].alarm, undefined);
});

test('el importador marca ACEPTADA y aplica las alarmas sobre la lista entera', () => {
  const i = html.indexOf("window._gcalPull = function");
  const cuerpo = html.slice(i, html.indexOf("window.dispatchEvent(new Event('lbp_gcal_pulled'))", i));
  assert.ok(/confirmacion: 'ACEPTADA'/.test(cuerpo), 'el evento importado no se marca ACEPTADA');
  assert.ok(/_normalizarGcal\(existing/.test(cuerpo),
    'tiene que correr sobre la lista entera, no solo sobre las nuevas: las 12 ya importadas también necesitan alarma');
  assert.ok(cuerpo.indexOf('_normalizarGcal') > cuerpo.indexOf('existing.push'),
    'la pasada va DESPUÉS de agregar las nuevas');
});

test('la pasada es idempotente: correrla dos veces da la misma lista', () => {
  const l = [{id:'a', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}];
  const uno = _normalizarGcal(l, ahora);
  assert.equal(_normalizarGcal(uno, ahora), uno,
    'si no devuelve la misma referencia, cada sync de 15 min reescribe los datos');
});

test('el resumen del dia aclara si la reunion es aceptada, propuesta o cancelada', () => {
  const i = html.indexOf('\\uD83D\\uDCC5 REUNIONES DE HOY');
  const cuerpo = html.slice(i, i + 1800);
  // El chip salio a _chipReunion el 14-nov, para que una CANCELADA tambien se
  // vea: antes la fila solo miraba `confirmacion` y una reunion que el
  // organizador habia cancelado seguia con su chip verde «Aceptada».
  assert.ok(/_chipReunion\(m\)/.test(cuerpo), 'la fila de hoy no muestra el chip');
  const j = html.indexOf('function _chipReunion(');
  const chip = html.slice(j, j + 600);
  assert.ok(/m\.confirmacion/.test(chip), 'el chip no mira el campo');
  assert.ok(chip.includes('Propuesta') && chip.includes('Aceptada') && chip.includes('Cancelada'),
            'faltan los textos del chip');
});

test('los dos textos de la alarma existen', () => {
  assert.ok(html.includes("'Reunión aceptada'"));
  assert.ok(html.includes("'Reunión propuesta'"));
});

// ── Aviso al toque ─────────────────────────────────────────────────────────
// El worker ya manda un push por reunion a las 17:00 de Bolivia mirando las de
// manana (worker.js, sendSmartNotif 'deadlines'). Lo que entra despues de esa
// hora no recibe nada hasta la alarma de 1 hora antes: eso es lo que se tapa.
// _fireNotification y localStorage se inyectan de mentira para espiarlos.
const PROLOGO = `
  var __avisos = [];
  var __guardado = {};
  var localStorage = {
    getItem: function(k) { return k in __guardado ? __guardado[k] : null; },
    setItem: function(k, v) { __guardado[k] = String(v); }
  };
  function _fireNotification(t, b) { __avisos.push(t + '|' + b); }
`;
const avisar = traer(
  ['_fechaLocal', '_esDiaEntero', '_reunionesParaAvisarYa', '_avisarReunionesNuevas'],
  PROLOGO,
  ['__avisos']
);

test('solo avisa al toque lo que ya no alcanza el recordatorio de las 17:00', () => {
  const hoyIso = iso(hoy(0,0));
  const manIso = iso(new Date(hoy(0,0).getTime() + 86400000));
  const lejos = iso(new Date(hoy(0,0).getTime() + 3*86400000));
  const r = (l, ms) => avisar._reunionesParaAvisarYa(l, ms).map(x => x.id);
  assert.deepEqual(r([{id:'hoy', date:hoyIso, startTime:'15:00'}], hoy(9,0).getTime()), ['hoy']);
  assert.deepEqual(r([{id:'man', date:manIso, startTime:'10:00'}], hoy(9,0).getTime()), [],
    'manana antes de las 17:00 lo cubre el push del worker');
  assert.deepEqual(r([{id:'man', date:manIso, startTime:'10:00'}], hoy(18,0).getTime()), ['man']);
  assert.deepEqual(r([{id:'lejos', date:lejos, startTime:'10:00'}], hoy(18,0).getTime()), []);
});

test('no avisa de una reunion que ya empezo', () => {
  assert.deepEqual(avisar._reunionesParaAvisarYa([{id:'x', date:iso(hoy(0,0)), startTime:'08:00'}], hoy(9,0).getTime()), []);
});

test('no repite el aviso de la misma reunion', () => {
  const l = [{id:'u', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00', title:'Con Mango'}];
  assert.equal(avisar._avisarReunionesNuevas(l, hoy(9,0).getTime()), 1);
  assert.equal(avisar._avisarReunionesNuevas(l, hoy(9,5).getTime()), 0, 'la segunda vez no avisa');
  assert.equal(avisar.__avisos.length, 1);
  assert.match(avisar.__avisos[0], /Con Mango/);
});

test('el aviso al toque se llama fuera del reductor de setData', () => {
  const i = html.indexOf("window._gcalPull = function");
  // El cuerpo de _gcalPull entero: la siguiente asignacion a window._gcal* lo cierra.
  const fin = html.indexOf('window._gcal', html.indexOf("lbp_gcal_pulled", i));
  const cuerpo = html.slice(i, fin > i ? fin : i + 5000);
  assert.ok(/_avisarReunionesNuevas\(/.test(cuerpo), 'no se llama al sincronizar');
  assert.ok(cuerpo.indexOf('_avisarReunionesNuevas') > cuerpo.indexOf("lbp_gcal_pulled"),
    'tiene que ir después del reductor, no adentro: React puede correrlo dos veces');
});

// Hallazgo al probarlo en el sitio publicado: _gcalPull le pasa la lista ENTERA
// de reuniones, asi que una que Pepe acaba de cargar a mano para hoy le
// disparaba un aviso "al toque" 15 minutos despues. El acaba de escribirla: ya
// lo sabe. Solo se avisa de lo que entro solo.
test('no avisa al toque de una reunion que cargó él mismo', () => {
  const l = [{id:'mia', date:iso(hoy(0,0)), startTime:'15:00', title:'La cargué yo'}];
  assert.equal(avisar._avisarReunionesNuevas(l, hoy(9,0).getTime()), 0,
    'sin fromGcal ni confirmacion, es de Pepe: no se avisa');
});

test('sí avisa de lo que entró solo, venga de Google o del correo', () => {
  const base = {date:iso(hoy(0,0)), startTime:'15:00', title:'X'};
  assert.equal(avisar._avisarReunionesNuevas([Object.assign({id:'g'}, base, {fromGcal:true})], hoy(9,0).getTime()), 1);
  assert.equal(avisar._avisarReunionesNuevas([Object.assign({id:'c'}, base, {confirmacion:'PROPUESTA'})], hoy(9,0).getTime()), 1,
    'las que traiga la parte B desde el correo también');
});

// ── Hallazgos de la revisión de rama (13-nov-2026) ─────────────────────────

// 1. El bucle de _gcalPull sale antes de tocar un evento que ya existe, y
// `confirmacion` solo se escribía ahí. Las 12 reuniones que motivaron todo el
// cambio nunca iban a mostrar el chip.
test('las reuniones de Google que ya estaban también quedan marcadas ACEPTADA', () => {
  const r = _normalizarGcal([{id:'vieja', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}], ahora);
  assert.equal(r[0].confirmacion, 'ACEPTADA');
});

test('no le pone confirmacion a lo que no vino de Google', () => {
  const l = [{id:'mia', date:iso(hoy(0,0)), startTime:'15:00'}];
  assert.equal(_normalizarGcal(l, ahora), l, 'ni la toca');
});

// 2. Un cumpleaños es un evento de día entero: avisarlo "al toque" como
// «Reunión 00:00 — Cumpleaños de Lucy» es la alarma al pedo del anti objetivo.
test('no avisa al toque de un cumpleaños (evento de día entero)', () => {
  const man = iso(new Date(hoy(0,0).getTime() + 86400000));
  assert.deepEqual(avisar._reunionesParaAvisarYa(
    [{id:'c', fromGcal:true, date:man, startTime:'00:00', endTime:'00:00', title:'Cumpleaños de Lucy'}],
    hoy(18,0).getTime()), []);
});

// 4. scheduleAlarms salta las canceladas; el aviso al toque no lo hacía.
test('no avisa de una reunion cancelada o archivada', () => {
  for (const st of ['CANCELLED', 'DONE', 'ARCHIVED']) {
    assert.deepEqual(avisar._reunionesParaAvisarYa(
      [{id:'x', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00', status:st}], hoy(9,0).getTime()), [],
      'con status ' + st);
  }
});

// 6. El candado miraba `datetime`. Si Pepe abre el panel y la deja apagada sin
// fecha, queda {enabled:false, datetime:''} y se le volvía a encender.
test('una alarma apagada a mano sin fecha tampoco se re-enciende', () => {
  const m = {fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00', alarm:{enabled:false, datetime:''}};
  assert.equal(_alarmaReunionGcal(m, ahora), null);
});

// 7. El diseño dice que B hereda esto sin tocar nada, pero la alarma exigía
// fromGcal y el aviso al toque no: lo del correo avisaba y no sonaba.
test('lo que traiga el correo (confirmacion, sin fromGcal) también recibe alarma', () => {
  const a = _alarmaReunionGcal({confirmacion:'PROPUESTA', date:iso(hoy(0,0)), startTime:'15:00'}, ahora);
  assert.ok(a, 'la parte B tiene que heredarla sin tocar nada');
  assert.equal(a.label, 'Reunión propuesta');
});
