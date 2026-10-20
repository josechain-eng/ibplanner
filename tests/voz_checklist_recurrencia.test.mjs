// El dictado tiene que producir checklist de verdad y alarmas que se repiten.
// 20-oct-2026: el aviso decia que la app "no maneja repeticiones ni checklists"
// (falso), el checklist caia como parrafo y la recurrencia quedaba en One-time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

// Se extraen las funciones REALES del archivo, no una copia.
const trozo = (desde, hasta) => {
  const a = html.indexOf(desde);
  assert.ok(a > 0, 'no encuentro: ' + desde);
  const b = html.indexOf(hasta, a);
  assert.ok(b > a, 'no encuentro el final de: ' + desde);
  return html.slice(a, b + hasta.length);
};
const fuente = trozo("var REC_VALIDAS", "return al;\n  };");
const { mkDescripcion, mkAlarm } = new Function(
  'defaultAlarm',
  fuente + "\nreturn { mkDescripcion: mkDescripcion, mkAlarm: mkAlarm };"
)(() => ({ enabled: false, datetime: '', recurrence: 'once', label: '', repeatIntervals: [5, 10] }));

test('el prompt ya no dice que la app no maneja repeticiones ni checklists', () => {
  assert.ok(html.includes('La app SI maneja alarmas que se repiten, categorias y checklists'),
            'falta la linea que lo corrige');
  assert.ok(html.includes('alarmRecurrence'), 'el prompt no pide alarmRecurrence');
  assert.ok(/task: title, description, checklist \(arreglo\), category/.test(html),
            'el esquema de task no pide checklist ni category');
});

test('el checklist sale como checklist, no como parrafo', () => {
  const h = mkDescripcion('', ['Firma contrato Sebastian', 'Pedido de pisos', 'Mesanine con Angel']);
  assert.ok(h.startsWith('<ul class="rte-checklist">'), 'no arranca con la lista: ' + h.slice(0, 40));
  assert.equal((h.match(/type="checkbox"/g) || []).length, 3, 'faltan checkboxes');
  assert.ok(h.includes('Pedido de pisos'));
  assert.ok(!h.includes('1.'), 'no debe numerar a mano');
});

test('la descripcion y el checklist conviven', () => {
  const h = mkDescripcion('Seguimiento de obra', ['Uno', 'Dos']);
  assert.ok(h.indexOf('Seguimiento de obra') < h.indexOf('<ul'), 'la descripcion va primero');
});

test('sin checklist no inventa una lista vacia', () => {
  assert.equal(mkDescripcion('Solo texto', []), '<div>Solo texto</div>');
  assert.equal(mkDescripcion('', null), '');
});

test('el texto dictado no puede romper el HTML', () => {
  const h = mkDescripcion('', ['<script>alert(1)</script> & co']);
  assert.ok(!h.includes('<script>'), 'se colo una etiqueta sin escapar');
  assert.ok(h.includes('&lt;script&gt;') && h.includes('&amp;'));
});

test('la alarma guarda la recurrencia dictada', () => {
  assert.equal(mkAlarm('2026-10-21T09:50', 'daily').recurrence, 'daily');
  assert.equal(mkAlarm('2026-10-21T09:50', 'weekdays').recurrence, 'weekdays');
  assert.equal(mkAlarm('2026-10-21T09:50').recurrence, 'once', 'sin recurrencia queda una sola vez');
});

test('una recurrencia inventada por la IA no se guarda', () => {
  // 'lunes a sabado' no existe en la app: mejor once que un valor que nadie entiende.
  assert.equal(mkAlarm('2026-10-21T09:50', 'mon-sat').recurrence, 'once');
  assert.equal(mkAlarm('2026-10-21T09:50', 'yearly').recurrence, 'once');
});

test('sin fecha de alarma no se enciende nada', () => {
  const a = mkAlarm('', 'daily');
  assert.equal(a.enabled, false);
  assert.equal(a.recurrence, 'once');
});

test('la tarjeta del borrador deja corregir antes de guardar', () => {
  for (const campo of ["setField(i,'checklist',items)", "opciones('alarmRecurrence'",
                       "fecha('alarmDateTime','datetime-local')", "opciones('category'"]) {
    assert.ok(html.includes(campo), 'falta poder editar: ' + campo);
  }
});

test('tildar un item desde la tarjeta de tarea persiste', () => {
  // Hasta v5.52 la tarjeta usaba RichContent sin onToggle: el tilde se perdia
  // al re-renderizar. El checklist dictado quedaba a medias.
  assert.ok(/html: t\.description,\s*\n[^\n]*\n[^\n]*\n\s*onToggle: function\(nh\)/.test(html),
            'la tarjeta de tarea no guarda el tilde');
  assert.ok(html.includes("e.stopPropagation();   // la tarjeta que lo contiene abre el editor al tocarla"),
            'tildar abriria tambien el editor');
});
