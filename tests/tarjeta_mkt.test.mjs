// La tarjeta «Propuestas de marketing de la semana» del Home (v5.73).
// React compilado no se monta en Node: se fijan por texto los invariantes del diseño.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const ini = html.indexOf('var PropuestasMarketing = function');
const fin = html.indexOf('\nvar TareasPropuestas = function', ini);
const bloque = ini >= 0 && fin > ini ? html.slice(ini, fin) : '';

test('existe el componente PropuestasMarketing', () => {
  assert.ok(bloque.length > 500, 'no se encontro el bloque de PropuestasMarketing');
});

test('titulo exacto', () => {
  assert.ok(bloque.includes('📣 Propuestas de marketing de la semana'));
});

test('lee las propuestas del worker con la sync key', () => {
  assert.ok(bloque.includes("'/mkt-proposals?key='"), 'no lee /mkt-proposals');
});

test('las tiendas sin campaña van arriba con sus dos botones', () => {
  const faltan = bloque.indexOf('ofertas_faltantes');
  const props = bloque.indexOf('lote.propuestas');
  assert.ok(faltan > 0 && props > 0 && faltan < props, 'las ofertas faltantes no van antes de las propuestas');
  assert.ok(bloque.includes('Precio lleno esta semana'));
  assert.ok(bloque.includes('Falta cargar la campaña'));
  assert.ok(bloque.includes("'precio_lleno'") && bloque.includes("'falta'"));
});

test('cada propuesta tiene tilde y cruz, y no hay Guardar', () => {
  assert.ok(bloque.includes("decidir(p.id,'ok')") && bloque.includes("decidir(p.id,'no')"));
  assert.ok(!/Guardar/.test(bloque), 'hay un Guardar');
});

test('una tienda sin propuestas se dice, no desaparece', () => {
  assert.ok(bloque.includes('sin propuestas esta semana'));
});

test('dice cuando las propuestas no son de esta semana', () => {
  assert.ok(bloque.includes('_mktSemana('), 'no compara la semana');
});

test('las decisiones van a mktDecididas por _mktAplicar', () => {
  assert.ok(bloque.includes('window._mktAplicar('));
  assert.ok(bloque.includes('mktDecididas'));
  assert.ok(!bloque.includes('_deletedIds'), 'usa marcas de borrado');
});

test('mktDecididas sincroniza como lista', () => {
  const i = html.indexOf('var _SYNC_LISTS = [');
  const j = html.indexOf('];', i);
  assert.ok(html.slice(i, j).includes("'mktDecididas'"));
});

test('se monta en el Home despues de las tareas propuestas', () => {
  const tp = html.indexOf('React.createElement(TareasPropuestas, {data:data, setData:setData})');
  const mk = html.indexOf('React.createElement(PropuestasMarketing, {data:data, setData:setData})');
  assert.ok(tp > 0 && mk > tp && mk - tp < 200);
});

test('version 5.82', () => {
  assert.ok(html.includes("window.LBP_VERSION = '5.82'"));
});

test('muestra el nombre del color si viene (Mango guarda codigos)', () => {
  assert.ok(bloque.includes('p.color_nombre||p.color'));
});

test('lo que quedo sin cupo se muestra tal cual', () => {
  assert.ok(bloque.includes("t.indexOf(':')>=0 ? t : t+': sin propuestas esta semana'"));
});
