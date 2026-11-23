// La tarjeta «Las tareas propuestas de la semana» del Home (v5.71).
// React compilado no se monta en Node: se fijan por texto los invariantes que
// ya se rompieron en este proyecto o que el diseno exige.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

const ini = html.indexOf('var TareasPropuestas = function');
const fin = html.indexOf('\nvar CampaignsScreen = function', ini);
const bloque = ini >= 0 && fin > ini ? html.slice(ini, fin) : '';

test('existe el componente TareasPropuestas', () => {
  assert.ok(bloque.length > 500, 'no se encontro el bloque de TareasPropuestas');
});

test('la tarjeta se llama «las tareas propuestas de la semana»', () => {
  assert.ok(bloque.includes('🗂 Las tareas propuestas de la semana'), 'falta el titulo exacto');
});

test('la tarjeta aparece todos los dias: no depende del dia de la semana', () => {
  assert.ok(!/getDay\(/.test(bloque), 'el componente mira el dia de la semana');
});

test('no hay un boton Guardar ni casillas que decidan por las filas sin tocar', () => {
  assert.ok(!/Guardar/.test(bloque), 'hay un Guardar: destildar significaria «nunca mas»');
  assert.ok(!/checkbox/.test(bloque), 'hay casillas: una fila sin tocar no puede decidir nada');
});

test('cada fila tiene su propio ✓ y su propia ✗', () => {
  assert.ok(/decidir\(p,\s*'ok'\)/.test(bloque), 'falta el onClick del ✓ por fila');
  assert.ok(/decidir\(p,\s*'no'\)/.test(bloque), 'falta el onClick de la ✗ por fila');
  assert.ok(bloque.includes("'✓'") && bloque.includes("'✗'"), 'faltan los simbolos ✓ y ✗');
});

test('una fila aplica sola: una sola decision por llamada y las alarmas ya puestas viajan como extra', () => {
  assert.ok(/_tpAplicar\(\s*\w+,\s*\[\{propuesta:\s*p,\s*decision:\s*dec\}\],\s*\w+(\.current)?\s*\)/.test(bloque),
    '_tpAplicar debe recibir UNA decision y el `extra` de alarmas ya asignadas');
  assert.ok(/tareasDecididas:\s*r\.tareasDecididas/.test(bloque) && /tasks:\s*r\.tasks/.test(bloque),
    'setData debe escribir tasks y tareasDecididas');
});

test('no poda por su cuenta: _tpAplicar ya lo hace', () => {
  assert.ok(!bloque.includes('_tpPodarDecididas'), 'doble poda');
});

test('filtra lo ya decidido con _tpFiltrar sobre data.tareasDecididas', () => {
  assert.ok(/_tpFiltrar\([^)]*tareasDecididas\)/.test(bloque));
});

test('no habla de campanas: ni el aviso equivocado ni el endpoint de campanas', () => {
  assert.ok(!bloque.includes('Campanas en tu correo'), 'texto de campanas');
  assert.ok(!bloque.includes('/campaign-actions'), 'endpoint de campanas');
  assert.ok(bloque.includes('/task-proposals?key='), 'no llama a /task-proposals');
});

test('hay un boton para volver a leer que pasa refresh=1', () => {
  assert.ok(bloque.includes('↻ volver a leer'), 'falta el boton');
  assert.ok(bloque.includes('&refresh=1'), 'el boton no pide refresh=1');
});

test('hay una pantalla de lo descartado con deshacer', () => {
  assert.ok(/decision\s*===\s*'no'/.test(bloque), 'no lista las descartadas');
  assert.ok(/Deshacer/.test(bloque), 'falta el deshacer');
  assert.ok(/x\.id\s*===\s*id/.test(bloque), 'deshacer debe tocar solo la entrada de ese id');
});

test('cuando el correo esta viejo la tarjeta lo dice con la fecha', () => {
  assert.ok(/lote\.ts/.test(bloque), 'no mira el ts del lote');
  assert.ok(/24\s*\*\s*3600\s*\*\s*1000/.test(bloque), 'no hay umbral de 24 h');
  assert.ok(/sin leer desde/.test(bloque), 'el texto no nombra desde cuando');
});

test('fechas locales: nada de toISOString en el componente', () => {
  assert.ok(!bloque.includes('toISOString'), 'toISOString corre el dia en Bolivia (UTC-4)');
});

test('React.createElement, sin JSX', () => {
  assert.ok(bloque.includes('React.createElement('));
  assert.ok(!/<\/?[A-Z][A-Za-z]*[ >]/.test(bloque.replace(/'[^'\n]*'/g, "''")), 'parece JSX');
});

test('se monta en el Home justo despues de la tarjeta del briefing', () => {
  const brf = html.indexOf('Briefing del d\\u00eda');
  const montaje = html.indexOf('React.createElement(TareasPropuestas,', brf);
  assert.ok(brf > 0 && montaje > brf, 'no se monta despues del briefing');
  const siguiente = html.indexOf('todayTasks.slice(0,5)', brf);
  assert.ok(montaje > siguiente, 'se monto antes de que termine la tarjeta del briefing');
  assert.ok(montaje - siguiente < 1200, 'se monto lejos de la tarjeta del briefing');
});

test('version 5.74', () => {
  assert.ok(html.includes("window.LBP_VERSION = '5.74'"));
});

test('deshacer reescribe la entrada como revocada, sin marca de borrado ni tratadas pegada', () => {
  assert.ok(/decision:\s*'revocada'/.test(bloque), 'deshacer debe escribir decision revocada');
  assert.ok(!bloque.includes('_lbpRecordDel'), 'la marca de borrado mata la proxima decision del hilo');
  assert.ok(!bloque.includes('_deletedIds'));
  assert.ok(/delete tratadas\.current\[id\]/.test(bloque), 'deshacer debe soltar la guarda de idempotencia');
});

test('la tarjeta muestra los descartes del lote, como CampanasCorreo', () => {
  assert.ok(/lote\.descartes\.length/.test(bloque) && /lote\.descartes\.map\(/.test(bloque), 'descartes se guarda pero no se muestra');
  assert.ok(bloque.includes('Descartado por la validación'));
});

test('una tanda de la IA caida se dice en la tarjeta y no se lee como «sin novedades»', () => {
  assert.ok(/fallos:res\.fallos/.test(bloque) && /tandas:res\.tandas/.test(bloque), 'no lee fallos/tandas de la respuesta');
  assert.ok(/lote\.fallos>0/.test(bloque), 'no mira lote.fallos');
  assert.ok(bloque.includes('esta lista puede estar incompleta'), 'falta el aviso');
  assert.ok(/incompleta \?[^:]*'No sé si hay propuestas/.test(bloque.replace(/\n\s*/g, ' ')), 'con fallos, la frase vacia no puede ser «Sin novedades»');
});

test('el recorte de hilos se dice en la tarjeta', () => {
  assert.ok(/recortados:res\.recortados/.test(bloque), 'no lee recortados');
  assert.ok(/lote\.recortados>0/.test(bloque) && bloque.includes('quedaron sin leer'), 'falta el aviso del recorte');
});

test('un puente que nunca publico (ts null) no dice «Sin novedades»', () => {
  assert.ok(/sinPuente\s*=\s*!!\(lote && !lote\.ts\)/.test(bloque), 'no hay rama para !lote.ts');
  assert.ok(bloque.includes('todavía no hay correos publicados'), 'falta la frase de ts null');
  const plano = bloque.replace(/\n\s*/g, ' ');
  assert.ok(plano.indexOf('sinPuente ?') < plano.indexOf("'Sin novedades:"), 'la rama de ts null debe ir antes de «Sin novedades»');
});
