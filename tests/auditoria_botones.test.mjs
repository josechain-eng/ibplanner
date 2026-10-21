// Hallazgos de la auditoria general del 21-oct-2026: botones que nunca
// funcionaron, detectados apretandolos uno por uno en el navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

// Limites de cada componente de pantalla, para preguntar "esto esta declarado ACA".
const pantallas = [...html.matchAll(/var (\w+Screen) = function/g)]
  .map(m => ({ nombre: m[1], ini: m.index }))
  .sort((a, b) => a.ini - b.ini)
  .map((p, i, arr) => ({ ...p, fin: i + 1 < arr.length ? arr[i + 1].ini : html.length }));
const cuerpo = (nombre) => {
  const p = pantallas.find(x => x.nombre === nombre);
  assert.ok(p, 'no encuentro ' + nombre);
  return html.slice(p.ini, p.fin);
};
const declara = (txt, v) =>
  new RegExp('\\b' + v + '\\s*=\\s*(?:_\\w+\\[|useRef|function)').test(txt) ||
  new RegExp('var\\s+' + v + '\\b').test(txt);

test('Libros declara el editItem que usa su lapiz', () => {
  const b = cuerpo('BooksScreen');
  assert.ok(/setEditItem\(/.test(b), 'el lapiz deberia usar setEditItem');
  assert.ok(declara(b, 'setEditItem'), 'BooksScreen usa setEditItem sin declararlo');
});

test('Hogar declara editItem y su save actualiza en vez de duplicar', () => {
  const h = cuerpo('HouseholdScreen');
  assert.ok(declara(h, 'setEditItem'), 'HouseholdScreen usa setEditItem sin declararlo');
  assert.ok(/if \(editItem\) \{/.test(h), 'save() siempre agregaria: duplicaria al editar');
  assert.ok(/editItem \? "Edit Household Task"/.test(h), 'el modal no dice que esta editando');
});

test('el grabador de Journal vive en JournalScreen, no en Goals', () => {
  const j = cuerpo('JournalScreen');
  const g = cuerpo('GoalsScreen');
  for (const f of ['jRecOpen', 'jRecClose', 'jRecStart', 'jRecStop']) {
    assert.ok(declara(j, f), f + ' no esta declarado en JournalScreen');
    assert.ok(!declara(g, f), f + ' volvio a GoalsScreen, donde no existe su estado');
  }
});

test('ninguna pantalla usa setEditItem sin declararlo', () => {
  const culpables = pantallas
    .map(p => ({ n: p.nombre, t: html.slice(p.ini, p.fin) }))
    .filter(x => /setEditItem\(/.test(x.t) && !declara(x.t, 'setEditItem'))
    .map(x => x.n);
  assert.deepEqual(culpables, [], 'estas pantallas romperian al editar');
});

test('la fila con acciones no estira el chip ni centra el titulo', () => {
  assert.ok(html.includes('.row:has(.acciones), div:has(> .acciones) { align-items: flex-start; }'),
            'sin esta regla el chip de estado sale de 79x96 en vez de 79x17');
});
