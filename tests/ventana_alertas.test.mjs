// La ventana con TODAS las alertas del Home (v5.74).
// React compilado no se monta en Node: el bloque de Alertas del Home y la ventana
// se extraen del HTML por sus marcas y se afirma su estructura. Esto prueba que
// el codigo esta cableado como se disena; NO prueba el scroll ni el clic real
// (eso se mira en el navegador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

function cuerpo(i) {
  let nivel = 0;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') nivel++;
    else if (html[j] === '}' && --nivel === 0) return html.slice(i, j + 1);
  }
  assert.fail('no cierra');
}
function declarada(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  return cuerpo(i);
}
const w = html.indexOf('window._lbpAlertas = function');
assert.ok(w > 0, 'no encuentro window._lbpAlertas');
const win = new Function(
  'var window = {};\n' +
  ['_impNum', '_impDiasLimite', '_impLimiteTexto'].map(declarada).join('\n') + '\n' +
  cuerpo(w) + ';\nreturn window;')();

const b0 = html.indexOf('alertsVisible && ');
const b1 = html.indexOf('"Quick Actions"', b0);
const bloque = b0 > 0 && b1 > b0 ? html.slice(b0, b1) : '';
const v0 = html.indexOf('/*VENTANA_ALERTAS*/');
const v1 = html.indexOf('/*FIN_VENTANA_ALERTAS*/', v0);
const ventana = v0 > 0 && v1 > v0 ? html.slice(v0, v1) : '';

test('el encabezado de Alertas abre la ventana', () => {
  assert.ok(bloque.length > 200, 'no se encontro el bloque de Alertas del Home');
  assert.match(bloque, /setAlertasTodas\(true\)/);
});
test('la ventana lista TODAS, no un recorte', () => {
  assert.ok(ventana.length > 200, 'no se encontro la ventana');
  assert.ok(!/\.slice\(/.test(ventana), 'la ventana no puede recortar con slice, sea cual sea el limite');
  assert.match(ventana, /todas\.map\(/, 'la ventana debe mapear la lista completa');
  assert.match(ventana, /overflowY: *'auto'/);
});
test('las alertas de tarea llevan el tilde y usan completeTask', () => {
  assert.match(ventana, /completeTask\(/);
  assert.match(ventana, /taskId/);
});
test('el tilde es tocable con el dedo y tiene nombre accesible', () => {
  assert.match(ventana, /'aria-label': *'Marcar como hecha'/);
  assert.match(ventana, /minWidth: *44/);
  assert.match(ventana, /minHeight: *44/);
});
test('las que no son tarea siguen navegando', () => {
  assert.match(ventana, /navigate\(/);
});
test('el tilde saca la alerta: abierta da 1, hecha da 0', () => {
  // Alarma ya disparada hoy (hora local, sin toISOString): 09:00, y «ahora» = 15:00.
  const p2 = (n) => String(n).padStart(2, '0');
  const ahora = new Date(2026, 10, 23, 15, 0, 0);
  const antes = new Date(2026, 10, 23, 9, 0, 0);
  const datetime = antes.getFullYear() + '-' + p2(antes.getMonth() + 1) + '-' + p2(antes.getDate()) +
    'T' + p2(antes.getHours()) + ':' + p2(antes.getMinutes()) + ':00';
  const tarea = { id: 't1', title: 'Llamar a aduana', status: 'TODO', alarm: { enabled: true, datetime } };
  const abierta = win._lbpAlertas({ tasks: [tarea] }, ahora.getTime());
  assert.equal(abierta.length, 1, 'la tarea abierta con alarma ya disparada debe dar 1 alerta');
  assert.equal(abierta[0].taskId, 't1');
  const hecha = { ...tarea, status: 'DONE', completedAt: ahora.getTime() };
  assert.equal(win._lbpAlertas({ tasks: [hecha] }, ahora.getTime()).length, 0,
    'completeTask pone DONE: la alerta debe desaparecer');
});
