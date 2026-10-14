// Chequea sobre el texto del HTML que los filtros de campanas del informe
// usan los estados que el modulo escribe de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');

test('los estados del modulo siguen siendo estos cuatro', () => {
  assert.ok(HTML.includes("var CAMP_STATUSES = ['PLANIFICADA','ACTIVA','FINALIZADA','CANCELADA']"),
    'cambiaron los estados del modulo: hay que revisar el informe');
});

test('el informe cuenta las finalizadas', () => {
  const i = HTML.indexOf('var campaignsDone');
  assert.ok(i > 0);
  const bloque = HTML.slice(i, i + 600);
  assert.ok(/FINALIZADA/.test(bloque), 'el informe no reconoce FINALIZADA');
});

test('el informe cuenta las activas y las planificadas', () => {
  const i = HTML.indexOf('var campaignsActive');
  assert.ok(i > 0);
  const bloque = HTML.slice(i, i + 600);
  assert.ok(/'ACTIVA'/.test(bloque), 'el informe no reconoce ACTIVA');
  assert.ok(/'PLANIFICADA'/.test(bloque), 'el informe ignora las planificadas');
});
