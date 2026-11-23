// Los feriados movibles de Bolivia (Carnaval, Viernes Santo, Corpus Christi) se
// calculan desde la Pascua, no se clavan a mano. Antes estaban escritos con las
// fechas de 2026, asi que en 2027 la app iba a saltear dos dias habiles
// cualquiera y NO iba a saltear los feriados de verdad.
//
// Las fechas esperadas de aca abajo estan verificadas contra el calendario:
// Pascua 2026 = 5-abr, Pascua 2027 = 28-mar, Pascua 2028 = 16-abr.
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
const iEv = html.indexOf('window._LBP_EVENTS = [');
assert.ok(iEv > 0, 'no encuentro window._LBP_EVENTS');
const eventos = html.slice(iEv, html.indexOf('\n  ];', iEv) + 4) + ';\n';

const nombres = ['_LBP_FERIADOS_MOVILES', '_lbpEsDiaHabil', '_tpProximoDiaHabil', '_lbpUpcomingEvents'];
const win = new Function(
  'var window = {};\n' + eventos + nombres.map(fuenteWindow).join('') + 'return window;'
)();

const porFecha = (anio) => win._LBP_FERIADOS_MOVILES(anio)
  .map((f) => f.m + '-' + f.d + ' ' + f.label)
  .sort();

test('2026 da exactamente las fechas que estaban escritas a mano', () => {
  assert.deepEqual(porFecha(2026), [
    '2-16 Carnaval',
    '2-17 Carnaval',
    '4-3 Viernes Santo',
    '6-4 Corpus Christi',
  ].sort());
});

test('2027 da las fechas reales, que son otras', () => {
  assert.deepEqual(porFecha(2027), [
    '2-8 Carnaval',
    '2-9 Carnaval',
    '3-26 Viernes Santo',
    '5-27 Corpus Christi',
  ].sort());
});

test('2028 cae en un 29 de febrero y no se rompe', () => {
  assert.deepEqual(porFecha(2028), [
    '2-28 Carnaval',
    '2-29 Carnaval',
    '4-14 Viernes Santo',
    '6-15 Corpus Christi',
  ].sort());
});

test('todos salen marcados como feriado y aproximados', () => {
  for (const f of win._LBP_FERIADOS_MOVILES(2027)) {
    assert.equal(f.cat, 'feriado');
    assert.equal(f.aprox, true);
    assert.ok(f.m >= 1 && f.m <= 12 && f.d >= 1 && f.d <= 31);
  }
});

test('ya no quedan feriados movibles clavados en la lista fija', () => {
  const fijos = (win._LBP_EVENTS || []).filter((e) => e.cat === 'feriado');
  for (const movible of ['Carnaval', 'Viernes Santo', 'Corpus Christi']) {
    assert.ok(!fijos.some((e) => e.label === movible),
      movible + ' sigue clavado en _LBP_EVENTS con una fecha fija');
  }
  // Los fijos de verdad siguen ahi.
  assert.ok(fijos.some((e) => e.label === 'Navidad' && e.m === 12 && e.d === 25));
});

// ── El dia habil siguiente, que es lo que mueve las alarmas ────────────────
test('2026 se comporta igual que antes de este cambio', () => {
  // viernes 13-feb -> lunes 16 y martes 17 son Carnaval -> miercoles 18
  assert.equal(win._tpProximoDiaHabil('2026-02-13'), '2026-02-18');
  // jueves 2-abr -> viernes 3 es Viernes Santo -> fin de semana -> lunes 6
  assert.equal(win._tpProximoDiaHabil('2026-04-02'), '2026-04-06');
});

test('2027 saltea los feriados que de verdad caen ese ano', () => {
  // viernes 5-feb -> lunes 8 y martes 9 son Carnaval -> miercoles 10
  assert.equal(win._tpProximoDiaHabil('2027-02-05'), '2027-02-10');
  // jueves 25-mar -> viernes 26 es Viernes Santo -> fin de semana -> lunes 29
  assert.equal(win._tpProximoDiaHabil('2027-03-25'), '2027-03-29');
  // miercoles 26-may -> jueves 27 es Corpus -> viernes 28
  assert.equal(win._tpProximoDiaHabil('2027-05-26'), '2027-05-28');
});

test('2027 NO saltea los dias que eran feriado en 2026', () => {
  // lunes 15-feb-2027: el martes 16 es un dia habil cualquiera.
  // Con las fechas clavadas de 2026 esto devolvia 2027-02-18.
  assert.equal(win._tpProximoDiaHabil('2027-02-15'), '2027-02-16');
  // miercoles 31-mar-2027: el jueves 1-abr tambien. Con las fechas de 2026,
  // el 3-abr era "Viernes Santo" y caia en sabado, asi que ese no se nota;
  // el que se nota es febrero.
  assert.equal(win._tpProximoDiaHabil('2027-03-31'), '2027-04-01');
});

test('la tarjeta de proximos eventos tambien usa las fechas del ano correcto', () => {
  const desde = new Date(2027, 0, 15); // 15-ene-2027
  const ev = win._lbpUpcomingEvents(desde, 3).filter((e) => e.label === 'Carnaval');
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map((e) => e.dt.getMonth() + 1 + '-' + e.dt.getDate()), ['2-8', '2-9']);
});
