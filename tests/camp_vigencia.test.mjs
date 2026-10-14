// El estado guardado se calcula UNA vez, al importar. Un mes despues sigue
// diciendo ACTIVA, asi que la campana aparece como activa en todos los
// informes siguientes y nunca pasa a completadas. El informe tiene que mirar
// las fechas, no el campo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const INI = 'window._campVigencia = function';
const i = HTML.indexOf(INI);
assert.ok(i > 0, 'no encuentro window._campVigencia en el HTML');
const j = HTML.indexOf('\n};\n', i);
const win = {};
new Function('window', HTML.slice(i, j + 4))(win);
const vig = win._campVigencia;

const HOY = Date.parse('2026-11-15T12:00:00Z');

test('ya termino', () => {
  assert.equal(vig({ dateStart: '2026-10-03', dateEnd: '2026-10-31', status: 'ACTIVA' }, HOY), 'FINALIZADA');
});

test('esta corriendo', () => {
  assert.equal(vig({ dateStart: '2026-11-01', dateEnd: '2026-11-30', status: 'FINALIZADA' }, HOY), 'ACTIVA');
});

test('todavia no empieza', () => {
  assert.equal(vig({ dateStart: '2026-12-01', dateEnd: '2026-12-31', status: 'ACTIVA' }, HOY), 'PLANIFICADA');
});

test('sin fecha de fin y ya empezada sigue activa', () => {
  assert.equal(vig({ dateStart: '2026-11-01', dateEnd: '', status: '' }, HOY), 'ACTIVA');
});

test('el ultimo dia todavia cuenta', () => {
  assert.equal(vig({ dateStart: '2026-11-01', dateEnd: '2026-11-15', status: '' }, HOY), 'ACTIVA');
});

test('CANCELADA manda sobre las fechas', () => {
  assert.equal(vig({ dateStart: '2026-11-01', dateEnd: '2026-11-30', status: 'CANCELADA' }, HOY), 'CANCELADA');
});

test('sin fechas cae a lo que diga el campo', () => {
  assert.equal(vig({ status: 'PLANIFICADA' }, HOY), 'PLANIFICADA');
  assert.equal(vig({}, HOY), 'ACTIVA');
});

test('acepta el endDate viejo', () => {
  assert.equal(vig({ dateStart: '2026-10-01', endDate: '2026-10-05', status: '' }, HOY), 'FINALIZADA');
});
