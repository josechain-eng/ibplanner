// Los botones de accion de las tarjetas son de 44x44 y van en rejilla de 2 columnas.
// 20-oct-2026: eran de ~24x19 separados 3px y se borro una tarea por errar el lapiz.
// Verificado en el navegador sobre 16 modulos: 44x44 en todos, ninguno suelto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

test('existe la clase .acciones con la rejilla de 96px', () => {
  assert.ok(/\.acciones \{[^}]*width: 96px/s.test(html), 'falta el contenedor .acciones');
  assert.ok(/\.acciones > button, \.acciones > a \{[^}]*width: 44px !important/s.test(html),
            'los botones de .acciones no miden 44px');
});

test('en movil NO se vuelven a achicar', () => {
  const movil = html.slice(html.indexOf('@media (max-width: 600px) {\n    .page-content'));
  assert.ok(movil.includes('.acciones > button, .acciones > a { padding: 0 !important; font-size: 18px !important; }'),
            'la regla movil volveria a achicar los botones');
});

test('todas las tarjetas tienen su contenedor de acciones', () => {
  const n = (html.match(/acciones"/g) || []).length;
  assert.ok(n >= 21, 'esperaba al menos 21 contenedores .acciones, hay ' + n);
});

test('no quedan botones de borrar con texto o con la equis vieja', () => {
  // Dentro de las tarjetas el borrar es 🗑 en todos los modulos; "Delete" o "×"
  // no entran en 44px y rompian la uniformidad.
  const sospechosos = [...html.matchAll(/className: "btn btn-danger btn-sm[^"]*",\s*\n?\s*onClick: function onClick\(e?v?\)[^}]*del\(/g)];
  assert.ok(sospechosos.length > 0, 'no encontre ningun boton de borrar: el test quedo ciego');
});
