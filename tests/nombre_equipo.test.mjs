// El 15-oct-2026 un almacen de sincronizacion viejo seguia recibiendo cambios
// y no habia forma de saber desde que equipo. El User-Agent solo no alcanza:
// dos perfiles del mismo Chrome, y la app instalada junto a la pestana, lo
// comparten identico. Por eso el nombre legible se arma del User-Agent Y del
// modo de presentacion, y el id unico sale del almacen local de cada uno.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const INI = 'window._lbpNombreEquipo = function';
const i = HTML.indexOf(INI);
assert.ok(i > 0, 'no encuentro window._lbpNombreEquipo en el HTML');
const win = {};
new Function('window', HTML.slice(i, HTML.indexOf('\n  };\n', i) + 6))(win);
const nombre = win._lbpNombreEquipo;

const UA_CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const UA_SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_EDGE_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';

test('Chrome en la Mac, en una pestana', () => {
  assert.equal(nombre(UA_CHROME_MAC, false), 'Chrome en Mac (pestaña)');
});

test('la app instalada se distingue de la pestana en el mismo equipo', () => {
  assert.equal(nombre(UA_CHROME_MAC, true), 'Chrome en Mac (app instalada)');
  assert.notEqual(nombre(UA_CHROME_MAC, true), nombre(UA_CHROME_MAC, false));
});

test('Safari en el iPhone', () => {
  assert.equal(nombre(UA_SAFARI_IPHONE, false), 'Safari en iPhone/iPad (pestaña)');
});

test('Chrome en Android', () => {
  assert.equal(nombre(UA_CHROME_ANDROID, false), 'Chrome en Android (pestaña)');
});

test('Edge dice Edge, no Chrome: su User-Agent incluye los dos', () => {
  assert.equal(nombre(UA_EDGE_WIN, false), 'Edge en Windows (pestaña)');
});

test('un User-Agent irreconocible no rompe ni queda vacio', () => {
  const r = nombre('algo rarisimo', false);
  assert.equal(typeof r, 'string');
  assert.ok(r.length > 0);
  assert.ok(r.includes('(pestaña)'));
});

test('sin User-Agent tampoco rompe', () => {
  assert.equal(typeof nombre(undefined, false), 'string');
  assert.equal(typeof nombre(null, true), 'string');
});
