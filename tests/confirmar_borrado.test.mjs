// Ningun basurero de tarjeta borra sin preguntar.
// 19-oct-2026: Pepe apreto el basurero queriendo el lapiz y perdio una tarea.
// Verificado en el navegador sobre 16 pantallas: todas preguntan, cancelar no
// toca los datos y confirmar borra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

test('existe el helper y el cartel propio de la app', () => {
  assert.ok(html.includes('function _pedirConfirmacionBorrar(nombre, alBorrar)'));
  assert.ok(html.includes('window._lbpConfirmarBorrar = function(nombre, alBorrar)'),
            'falta el puente global');
  assert.ok(html.includes("'\\u00bfSeguro que quer\\u00e9s eliminar '"), 'falta el texto del cartel');
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
      if (!antes.includes('_pedirConfirmacionBorrar')) sueltos.push(m[0]);
    }
    k += 5;
  }
  assert.deepEqual([...new Set(sueltos)], [], 'estos borran sin preguntar');
});

test('la confirmacion dice QUE se va a borrar', () => {
  assert.ok(html.includes('function _nombreDe(x)'), 'falta el nombre legible');
  assert.ok(html.includes('_pedirConfirmacionBorrar(_nombreDe('), 'no se le pasa el nombre');
});
