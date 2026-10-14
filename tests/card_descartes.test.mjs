// Si la validacion descarta TODAS las propuestas, la tarjeta no puede decir
// "no encontre campañas nuevas": es la conclusion opuesta, y es el mismo error
// que el punto 2 de Review Focus, por otra puerta. El fallo mas comun del
// modelo es inventar ids de tienda, que tira todo abajo de una vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const i = HTML.indexOf('var CampanasCorreo = function');
assert.ok(i > 0, 'no encuentro el componente');
const COMP = HTML.slice(i, HTML.indexOf('var CampaignsScreen = function', i));

test('con descartes y cero acciones se abre la tarjeta, no el mensaje de "nada nuevo"', () => {
  assert.match(COMP, /if \(desc\.length\) \{ setLote\(\{acciones:\[\]/,
    'tiene que entrar a la tarjeta con la lista de descartes');
});

test('el mensaje de "nada nuevo" solo sale cuando NO hubo descartes', () => {
  const j = COMP.indexOf('No encontr');
  const antes = COMP.slice(Math.max(0, j - 420), j);
  assert.match(antes, /if \(desc\.length\)/, 'el setErr queda detras del guardia de descartes');
});

test('la cabecera dice que descarto todo', () => {
  assert.match(COMP, /no pude armar ninguna propuesta/);
});

test('la lista de descartes va abierta cuando no hay propuestas', () => {
  assert.match(COMP, /open:!lote\.acciones\.length/);
});
