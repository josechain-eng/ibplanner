// Ninguna tarjeta pasa de 4 iconos. El cuarto es ⋯ cuando hay mas acciones.
// 21-oct-2026: Reuniones habia llegado a 7 (4 filas, ~200 px solo de botones)
// porque le fuimos agregando de a uno. El tope corta eso de raiz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

test('existe la hoja de acciones y su puente', () => {
  assert.ok(html.includes('window._lbpHojaAcciones = function(titulo, acciones)'));
  assert.ok(html.includes("'M\\u00e1s acciones'") || html.includes('"M\\u00e1s acciones"'),
            'ningun boton abre la hoja');
});

test('la hoja no obliga a reescribir los handlers', () => {
  // Los onClick vienen de los botones originales y esperan un evento.
  assert.ok(html.includes('it.fn({stopPropagation: function(){}, preventDefault: function(){}})'),
            'la hoja deberia pasar un evento de mentira');
});

test('Reuniones tiene 4: editar, grabar, seguimiento y mas', () => {
  const i = html.indexOf('Grabar reuni');
  const a = html.lastIndexOf('className: "acciones"', i);
  const bloque = html.slice(a, a + 9000);
  const corte = bloque.indexOf('"\\u22EF")');
  assert.ok(corte > 0, 'no encuentro el boton ⋯ de Reuniones');
  const soloTarjeta = bloque.slice(0, corte);
  for (const fuera of ['title: "Alarma"', 'title:"AI Prep"']) {
    assert.ok(!soloTarjeta.includes(fuera), fuera + ' deberia estar en la hoja, no en la tarjeta');
  }
});

test('Proyectos tiene 4: editar, estado, reporte y mas', () => {
  const i = html.indexOf('Status Report');
  const a = html.lastIndexOf('className: "acciones"', i);
  const bloque = html.slice(a, a + 6000);
  assert.ok(bloque.includes('"\\u22EF")'), 'no encuentro el boton ⋯ de Proyectos');
});

test('los modales de Reuniones no quedan anidados en el de edicion', () => {
  // Grabador, Prep y Alarma vivian DENTRO del modal de edicion: desde la lista
  // no se abrian nunca, porque ese modal solo existe mientras editas.
  // Se mide de verdad: donde termina el elemento del modal de edicion.
  const ini = html.indexOf('modal && /*#__PURE__*/React.createElement(Modal, {\n    title: editItem ? "Edit Meeting / Event"');
  assert.ok(ini > 0, 'no encuentro el modal de edicion de Reuniones');
  let j = html.indexOf('(', ini), prof = 0, fin = -1;
  while (j < html.length) {
    const c = html[j];
    if (c === '"' || c === "'" || c === '`') {        // saltar textos
      const q = c; j++;
      while (j < html.length && html[j] !== q) j += html[j] === '\\' ? 2 : 1;
    } else if (c === '/' && html[j + 1] === '*') {    // saltar comentarios
      j = html.indexOf('*/', j) + 1;
    } else if (c === '(') prof++;
    else if (c === ')') { prof--; if (prof === 0) { fin = j; break; } }
    j++;
  }
  assert.ok(fin > ini, 'no pude medir donde cierra el modal de edicion');
  for (const m of ['recModal&&recMeeting&&', 'mePrepItem&&mePrepRes&&', 'mAlarmItem &&']) {
    const donde = html.indexOf(m, ini);
    assert.ok(donde > fin, m + ' sigue adentro del modal de edicion');
  }
});
