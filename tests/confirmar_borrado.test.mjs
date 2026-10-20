// Ningun basurero borra sin red de seguridad.
// 19-oct-2026: Pepe apreto el basurero queriendo el lapiz y perdio una tarea.
// v5.56: lo que vive en los datos se borra con DESHACER de 6 s; los adjuntos,
// que no se pueden restaurar (el archivo sale de IndexedDB), siguen preguntando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

test('existen los dos caminos: deshacer y preguntar', () => {
  assert.ok(html.includes('function _borrarConDeshacer(nombre, hacerBorrado)'));
  assert.ok(html.includes('window._lbpAvisoDeshacer = function(nombre, restaurar)'),
            'falta el puente de la barra de deshacer');
  assert.ok(html.includes('function _pedirConfirmacionBorrar(nombre, alBorrar)'));
  assert.ok(html.includes("'DESHACER'"), 'falta el boton de deshacer');
});

test('deshacer saca la lapida, o la sincronizacion vuelve a borrar', () => {
  const i = html.indexOf('function _borrarConDeshacer');
  const cuerpo = html.slice(i, i + 3000);
  assert.ok(/delete dels\[item\.id\]/.test(cuerpo), 'no limpia _deletedIds al restaurar');
  assert.ok(/_deletedIds: dels/.test(cuerpo), 'no devuelve las lapidas limpias');
});

test('al restaurar una reunion se limpia el evento de calendario', () => {
  // El evento de Google SI se borro y no vuelve: dejar el id apuntaria a la nada.
  const i = html.indexOf('function _borrarConDeshacer');
  assert.ok(/delete vuelve\.gcalEventId/.test(html.slice(i, i + 3000)));
});

test('los adjuntos siguen preguntando (no se pueden restaurar)', () => {
  assert.ok(/_pedirConfirmacionBorrar\(\(a && \(a\.name \|\| a\.title\)\)/.test(html),
            'los adjuntos deberian seguir con confirmacion');
});

test('si el cartel aun no monto, igual pregunta', () => {
  const i = html.indexOf('function _pedirConfirmacionBorrar');
  const cuerpo = html.slice(i, html.indexOf('\n}', i));
  assert.ok(/confirm\(txt\)/.test(cuerpo), 'sin respaldo: podria borrar sin preguntar');
});

test('ningun basurero de tarjeta llama a del() directo', () => {
  // Se miran SOLO los bloques .acciones, que es donde vive el basurero.
  const sueltos = [];
  let k = 0;
  while ((k = html.indexOf('acciones"', k)) !== -1) {
    const a = html.lastIndexOf('React.createElement("div"', k);
    const fin = html.indexOf('acciones"', k + 5);
    const trozo = html.slice(a, fin === -1 ? a + 6000 : Math.min(fin, a + 6000));
    for (const m of trozo.matchAll(/\b(del|delLog|deleteImport)\((\w+)\.id\)/g)) {
      const antes = trozo.slice(Math.max(0, m.index - 60), m.index);
      if (!antes.includes('_pedirConfirmacionBorrar') && !antes.includes('_borrarConDeshacer')) sueltos.push(m[0]);
    }
    k += 5;
  }
  assert.deepEqual([...new Set(sueltos)], [], 'estos borran sin preguntar');
});

test('el aviso dice QUE se borro', () => {
  assert.ok(html.includes('function _nombreDe(x)'), 'falta el nombre legible');
  assert.ok(html.includes('_borrarConDeshacer(_nombreDe('), 'no se le pasa el nombre');
});
