// window._mktAplicar y window._mktSemana (v5.73): funciones puras de la tarjeta de marketing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
function extraer(ini) {
  const i = HTML.indexOf(ini);
  assert.ok(i > 0, 'no encuentro ' + ini);
  const j = HTML.indexOf('\n};\n', i);
  const win = {};
  new Function('window', HTML.slice(i, j + 4))(win);
  return win;
}
const aplicar = extraer('window._mktAplicar = function')._mktAplicar;
const semana = extraer('window._mktSemana = function')._mktSemana;

test('agrega la decision', () => {
  assert.deepEqual(aplicar([], 'S:BOSS:E1:Negro', 'ok', '', 5), [{ id: 'S:BOSS:E1:Negro', decision: 'ok', nota: '', ts: 5 }]);
});

test('el mismo id dos veces deja una sola entrada', () => {
  const a = aplicar([], 'x', 'ok', '', 1);
  const b = aplicar(a, 'x', 'ok', '', 2);
  assert.equal(b.length, 1);
  assert.equal(b[0].ts, 2);
});

test('revocada reemplaza a ok', () => {
  const b = aplicar(aplicar([], 'x', 'ok', '', 1), 'x', 'revocada', '', 2);
  assert.deepEqual(b.map(d => d.decision), ['revocada']);
});

test('no toca las otras decisiones ni muta la lista', () => {
  const a = [{ id: 'y', decision: 'no', nota: '', ts: 1 }];
  const b = aplicar(a, 'x', 'ok', 'reel mejor', 2);
  assert.equal(a.length, 1);
  assert.deepEqual(b.map(d => d.id).sort(), ['x', 'y']);
  assert.equal(b.find(d => d.id === 'x').nota, 'reel mejor');
});

test('semana ISO de una fecha', () => {
  assert.equal(semana(new Date('2026-11-23T12:00:00')), '2026-S48');
  assert.equal(semana(new Date('2027-01-01T12:00:00')), '2026-S53');
  assert.equal(semana(new Date('2026-01-01T12:00:00')), '2026-S01');
});
