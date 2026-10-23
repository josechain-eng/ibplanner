// Los iconos pasan al renglon de los chips (23-oct-2026). Medido en pantalla de
// 375 px: Tareas 118 -> 88, Reuniones 121 -> 94, Clientes 137 -> 112,
// Journal 224 -> 168, Proyectos 310 -> 254, Recursos 122 -> 66.
// No va en todos los modulos: donde la tarjeta tiene una portada o una foto
// arriba a la izquierda, la rejilla deja huecos y la tarjeta queda MAS alta
// (Libros pasaba de 91 a 189 px), asi que esos quedan como estaban.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

const pantallas = [...html.matchAll(/var (\w+Screen) = function/g)]
  .map(m => ({ nombre: m[1], ini: m.index }))
  .sort((a, b) => a.ini - b.ini)
  .map((p, i, arr) => ({ ...p, fin: i + 1 < arr.length ? arr[i + 1].ini : html.length }));
const cuerpo = (nombre) => {
  const p = pantallas.find(x => x.nombre === nombre);
  assert.ok(p, 'no encuentro ' + nombre);
  return html.slice(p.ini, p.fin);
};

test('el CSS declara las dos variantes', () => {
  assert.match(html, /\.acciones\.acc-fila, \.acciones\.acc-pie \{/);
  assert.match(html, /div:has\(> \.acc-pie\)/, 'falta la rejilla de 3 columnas');
  assert.match(html, /div:has\(\+ \.acc-pie\), div:has\(\+ \.acc-pie\) > :only-child \{ display: contents/,
    'falta disolver el bloque de texto (y el envoltorio extra de Reuniones)');
});

test('los iconos miden 40 px en las dos variantes', () => {
  const m = html.match(/\.acciones\.acc-fila > button[\s\S]{0,320}?\}/);
  assert.ok(m, 'no encuentro la regla del tamano');
  assert.match(m[0], /width: 40px !important; height: 40px !important/);
});

test('la fila de iconos puede cortarse: en Proyectos se salia 34 px', () => {
  assert.match(html, /div:has\(> \.acc-fila\) \{ flex-wrap: wrap !important/);
});

test('Tareas, Reuniones y Clientes usan acc-pie', () => {
  for (const p of ['TasksScreen', 'MeetingsScreen', 'ClientsScreen']) {
    assert.match(cuerpo(p), /className: "acciones acc-pie"/, p + ' deberia usar acc-pie');
  }
});

test('Proyectos, Journal, Documentos y Recursos usan acc-fila', () => {
  for (const p of ['ProjectsScreen', 'JournalScreen', 'DocumentsScreen', 'ResourcesScreen']) {
    assert.match(cuerpo(p), /className: "acciones acc-fila"/, p + ' deberia usar acc-fila');
  }
});

test('las dos tarjetas de Journal quedaron marcadas, no solo una', () => {
  const j = cuerpo('JournalScreen');
  assert.equal((j.match(/className: "acciones acc-fila"/g) || []).length, 2);
});

test('los modulos con portada o foto quedan como estaban', () => {
  // Libros 91 -> 189 px y Hogar 66 -> 88 px con la rejilla: no se tocan.
  for (const p of ['BooksScreen', 'BucketListScreen', 'HouseholdScreen', 'HabitsScreen',
                   'TravelScreen', 'WorkoutPlannerScreen', 'MedicationScreen']) {
    assert.ok(!/className: "acciones acc-(pie|fila)"/.test(cuerpo(p)),
      p + ' no deberia llevar la clase');
  }
});

test('la version subio', () => {
  assert.match(html, /window\.LBP_VERSION = '5\.65'/);
});
