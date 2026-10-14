// Los correos quedan guardados en el KV y la tarjeta los vuelve a proponer
// cada vez que se abre: en noviembre Pepe ve de nuevo las campanas de octubre,
// todas tildadas, con el boton diciendo "Guardar 3". El guardia de duplicados
// evita que se dupliquen en los datos, pero la tarjeta tiene que DECIRLO.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const i = HTML.indexOf('window._campYaEsta = function');
assert.ok(i > 0, 'no encuentro window._campYaEsta en el HTML');
const win = {};
new Function('window', HTML.slice(i, HTML.indexOf('\n};\n', i) + 4))(win);
const yaEsta = win._campYaEsta;

const camp = (over) => Object.assign({
  name: 'Matrimonios y Graduados', dateStart: '2026-10-03',
  franchises: [{ clientId: 'cl_ax' }, { clientId: 'cl_ck' }],
}, over || {});

const DATA = { campaigns: [{ id: 'c1', name: 'Matrimonios y Graduados', dateStart: '2026-10-03',
  franchises: [{ clientId: 'cl_ck' }, { clientId: 'cl_ax' }] }] };

test('la misma campana se reconoce', () => {
  assert.equal(yaEsta(DATA, camp()), true);
});

test('se reconoce aunque el modelo le cambie el nombre', () => {
  assert.equal(yaEsta(DATA, camp({ name: 'Matrimonios y Graduados - detalle CK, AX' })), true);
});

test('se reconoce por el nombre aunque cambien las tiendas', () => {
  assert.equal(yaEsta(DATA, camp({ franchises: [{ clientId: 'cl_boss' }] })), true);
});

test('otra fecha de inicio es otra campana', () => {
  assert.equal(yaEsta(DATA, camp({ dateStart: '2027-10-03' })), false);
});

test('otro nombre y otras tiendas en la misma fecha es otra campana', () => {
  assert.equal(yaEsta(DATA, camp({ name: 'Dia de la Madre', franchises: [{ clientId: 'cl_boss' }] })), false);
});

test('sin campanas previas nunca esta', () => {
  assert.equal(yaEsta({}, camp()), false);
  assert.equal(yaEsta({ campaigns: [] }, camp()), false);
});

test('basura no revienta', () => {
  assert.equal(yaEsta(DATA, null), false);
  assert.equal(yaEsta(null, camp()), false);
});
