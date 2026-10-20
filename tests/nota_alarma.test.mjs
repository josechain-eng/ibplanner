// El cuerpo de la notificacion no puede repetir el nombre de la tarea.
// 20-oct-2026: el asistente de voz copiaba el titulo a alarm.label ("nota del
// recordatorio") y la notificacion salia "Competencia entre tiendas / Competencia
// entre tiendas". El helper _notaAlarma descarta la nota cuando es el mismo texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

test('el helper y sus dos usos estan en el archivo', () => {
  for (const marca of ['function _notaAlarma(',
                       '_notaAlarma(alarm.label, entityName)',   // scheduleAlarms -> nube + SW
                       '_notaAlarma(al.label, _eName)']) {       // check() -> disparo local
    assert.ok(html.includes(marca), 'falta: ' + marca);
  }
});

test('ningun cuerpo se arma ya con el label crudo', () => {
  assert.ok(!html.includes('alarm.label\n      ? (entityName'));
  assert.ok(!html.includes('al.label\n                ? (_eName'));
});

test('el asistente de voz no copia el titulo a la nota', () => {
  assert.ok(!/mkAlarm\(v\.alarmDateTime,\s*v\.title\)/.test(html), 'mkAlarm sigue recibiendo el titulo');
  assert.ok(/var mkAlarm = function\(dt\)\{/.test(html), 'mkAlarm no tiene la firma nueva');
});

// El helper se saca del propio HTML: si alguien lo cambia, estos casos lo atrapan.
const desde = html.indexOf('function _notaAlarma(');
const fuente = html.slice(desde, html.indexOf('\n}', desde) + 2);
const _notaAlarma = new Function(fuente + '\nreturn _notaAlarma;')();

const cuerpo = (label, nombre, tipo) => {
  const n = _notaAlarma(label, nombre);
  return n ? (nombre ? nombre + ' · ' + n : n)
           : (nombre ? nombre + ' · ' + tipo + ' reminder' : tipo + ' reminder');
};

test('la nota igual al titulo se descarta', () => {
  assert.equal(cuerpo('Competencia entre tiendas', 'Competencia entre tiendas', 'Task'),
               'Competencia entre tiendas · Task reminder');
});

test('se descarta aunque cambien mayusculas y espacios', () => {
  assert.equal(cuerpo('  competencia ENTRE tiendas ', 'Competencia entre tiendas', 'Task'),
               'Competencia entre tiendas · Task reminder');
});

test('una nota de verdad se respeta', () => {
  assert.equal(cuerpo('Llevar los planos', 'Competencia entre tiendas', 'Task'),
               'Competencia entre tiendas · Llevar los planos');
});

test('sin nota, sin nota vacia y sin nombre no rompe', () => {
  assert.equal(cuerpo(undefined, 'Arreglo Tienda MNG LP pozo', 'Task'), 'Arreglo Tienda MNG LP pozo · Task reminder');
  assert.equal(cuerpo('', 'Arreglo Tienda MNG LP pozo', 'Task'), 'Arreglo Tienda MNG LP pozo · Task reminder');
  assert.equal(cuerpo('Nota suelta', '', 'Task'), 'Nota suelta');
  assert.equal(cuerpo('', '', 'Task'), 'Task reminder');
});
