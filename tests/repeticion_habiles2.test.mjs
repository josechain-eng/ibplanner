// Repeticion 'weekdays2' (cada 2 dias habiles) y la definicion unica de dia habil.
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
function fuenteWindow(nombre) {
  const i = html.indexOf('window.' + nombre + ' = function');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i) + ';\n';
}
function fuente(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  return cuerpo(i) + '\n';
}
const iEv = html.indexOf('window._LBP_EVENTS = [');
assert.ok(iEv > 0, 'no encuentro window._LBP_EVENTS');
const eventos = html.slice(iEv, html.indexOf('\n  ];', iEv) + 4) + ';\n';

const win = new Function(
  'var window = {};\n' + eventos +
  ['_LBP_FERIADOS_MOVILES', '_lbpEsDiaHabil', '_tpProximoDiaHabil'].map(fuenteWindow).join('') +
  fuente('_futureOccurrences') + fuente('_recentOccurrence') +
  'window._futureOccurrences = _futureOccurrences; window._recentOccurrence = _recentOccurrence;\n' +
  'return window;'
)();

const fmt = (ms) => { const d = new Date(ms);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
// `fmt` usa componentes locales a propósito: toISOString() daría el día anterior.

test('el dia habil excluye finde, feriado fijo y feriado movil', () => {
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 23, 12)), true);   // lunes
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 28, 12)), false);  // sabado
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 29, 12)), false);  // domingo
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 11, 25, 12)), false);  // Navidad
  assert.equal(win._lbpEsDiaHabil(new Date(2027, 1, 9, 12)), false);    // Carnaval 2027
  assert.equal(win._lbpEsDiaHabil(new Date(2027, 1, 16, 12)), true);    // martes comun
});

test('weekdays2 avanza dos dias habiles', () => {
  const occ = win._futureOccurrences('2026-11-23T09:40:00', 'weekdays2', {}, new Date(2026,10,23,12,0).getTime());
  assert.deepEqual(occ.slice(0, 5).map(fmt),
    ['2026-11-25','2026-11-27','2026-12-01','2026-12-03','2026-12-07']);
});

test('weekdays2 saltea Carnaval', () => {
  const occ = win._futureOccurrences('2027-02-04T09:40:00', 'weekdays2', {}, new Date(2027,1,4,12,0).getTime());
  assert.deepEqual(occ.slice(0, 3).map(fmt), ['2027-02-10','2027-02-12','2027-02-16']);
});

test('weekdays2 cruza el ano mirando los feriados del ano nuevo', () => {
  // 1-ene es feriado fijo y cae viernes: el primer habil de 2027 es el lunes 4.
  const occ = win._futureOccurrences('2026-12-29T09:40:00', 'weekdays2', {}, new Date(2026,11,29,12,0).getTime());
  assert.deepEqual(occ.slice(0, 3).map(fmt), ['2026-12-31','2027-01-05','2027-01-07']);
});

test('ninguna ocurrencia cae en dia no habil', () => {
  const occ = win._futureOccurrences('2026-11-23T09:40:00', 'weekdays2', {}, new Date(2026,10,23,12,0).getTime());
  assert.ok(occ.length >= 15, 'esperaba al menos 15 ocurrencias en el horizonte de 60 dias');
  for (const ms of occ) assert.equal(win._lbpEsDiaHabil(new Date(ms)), true, fmt(ms));
});

test('una base de hace un ano no cuelga y da un dia habil pasado', () => {
  const ahora = new Date(2026, 10, 23, 12).getTime();
  const t = win._recentOccurrence('2025-11-24T09:40:00', 'weekdays2', {}, ahora);
  assert.ok(t <= ahora);
  assert.equal(win._lbpEsDiaHabil(new Date(t)), true);
});

test('sin la funcion de feriados moviles el dia habil sigue funcionando', () => {
  // 2031 no lo toca ningun otro test del archivo, asi que su lista no esta en
  // el cache. Con `undefined` instalado, solo un guard dentro de _lbpEsDiaHabil
  // evita que se rompa.
  const guardado = win._LBP_FERIADOS_MOVILES;
  win._LBP_FERIADOS_MOVILES = undefined;
  try {
    assert.equal(win._lbpEsDiaHabil(new Date(2031, 11, 25, 12)), false); // Navidad, jueves: el fijo sigue
    assert.equal(win._lbpEsDiaHabil(new Date(2031, 2, 12, 12)), true);   // miercoles comun
  } finally { win._LBP_FERIADOS_MOVILES = guardado; }
});

test('weekdays NO cambio: sigue cayendo en feriado', () => {
  // El refactor no puede haberle agregado feriados al tipo viejo, que usan
  // habitos y metas. Navidad 2026 es viernes: 'weekdays' tiene que incluirla.
  const occ = win._futureOccurrences('2026-12-21T09:40:00', 'weekdays', {}, new Date(2026,11,21,9,0).getTime());
  assert.ok(occ.map(fmt).includes('2026-12-25'), 'weekdays dejo de incluir Navidad');
});

test('una base de dias atras no queda dentro de la ventana de repesca', () => {
  // Las ventanas locales son de 5 y 15 min: la ultima ocurrencia tiene que
  // quedar MUY lejos de ahora para que convertir no provoque avalancha de avisos.
  const ahora = new Date(2026, 10, 23, 12).getTime();
  const t = win._recentOccurrence('2026-11-16T09:40:00', 'weekdays2', {}, ahora);
  assert.ok(ahora - t > 15 * 60 * 1000, 'caeria dentro de la repesca y avisaria de golpe');
});

test('el tipo nuevo esta en el editor y en la lista blanca', () => {
  assert.match(html, /weekdays2: 'Every 2 weekdays'/);
  assert.match(html, /REC_VALIDAS = \[[^\]]*'weekdays2'/);
});
