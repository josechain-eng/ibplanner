// El 9-oct-2026 la Mac perdio su lbp_sync_key sin perder los datos. La app
// genero una clave nueva EN SILENCIO y durante 5 dias sincronizo a un almacen
// propio: 20 proyectos y 106 tareas de un lado, 114 tareas y 9 clientes del
// otro. Pepe lo noto recien cuando un proyecto no aparecia en el celular.
// Generar una clave nueva es normal en una instalacion nueva; hacerlo cuando
// YA hay datos locales significa que la clave se perdio, y eso hay que decirlo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const INI = 'window._claveHuerfana = function';
const i = HTML.indexOf(INI);
assert.ok(i > 0, 'no encuentro window._claveHuerfana en el HTML');
const win = {};
new Function('window', HTML.slice(i, HTML.indexOf('\n};\n', i) + 4))(win);
const chequear = win._claveHuerfana;

const conDatos = JSON.stringify({ tasks: [{ id: 't1' }, { id: 't2' }], projects: [{ id: 'p1' }] });

test('sin clave y CON datos locales: avisa', () => {
  const r = chequear(null, conDatos);
  assert.ok(r, 'tiene que avisar');
  assert.equal(r.registros, 3);
});

test('sin clave y sin datos: instalacion nueva, no avisa', () => {
  assert.equal(chequear(null, JSON.stringify({ tasks: [], projects: [] })), null);
  assert.equal(chequear(null, null), null);
  assert.equal(chequear('', ''), null);
});

test('con clave guardada nunca avisa, haya datos o no', () => {
  assert.equal(chequear('lbp_abc123', conDatos), null);
  assert.equal(chequear('lbp_abc123', null), null);
});

test('datos corruptos no revientan ni avisan de mas', () => {
  assert.equal(chequear(null, '{no es json'), null);
  assert.equal(chequear(null, 'null'), null);
  assert.equal(chequear(null, '[]'), null);
});

test('cuenta registros de todas las listas que importan', () => {
  const d = JSON.stringify({ meetings: [{}], clients: [{}], campaigns: [{}],
                             documents: [{}], journal: [{}], transactions: [{}] });
  assert.equal(chequear(null, d).registros, 6);
});

test('una sola lista con contenido ya alcanza para avisar', () => {
  assert.ok(chequear(null, JSON.stringify({ clients: [{ id: 'c1' }] })));
});
