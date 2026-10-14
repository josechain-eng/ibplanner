// Valida _campValidar contra respuestas inventadas del modelo.
// Extrae la funcion de worker.js entre marcadores: worker.js se despliega como
// archivo unico (y se pega en el editor de Cloudflare), asi que no se puede
// partir en modulos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');
const INI = '// <<<CAMPANAS-VALIDA>>>';
const FIN = '// <<<FIN CAMPANAS-VALIDA>>>';
assert.ok(SRC.includes(INI) && SRC.includes(FIN), 'faltan los marcadores en worker.js');
const BLOQUE = SRC.slice(SRC.indexOf(INI) + INI.length, SRC.indexOf(FIN));
const validar = new Function(BLOQUE + '\nreturn _campValidar;')();

const CTX = {
  clientIds: ['cl_ax', 'cl_ck', 'cl_boss', 'cl_mango', 'cl_chilli'],
  lineas: ['Hombre', 'Mujer', 'Nina', 'Nino', 'Kids', 'Toda la Tienda'],
  campanas: [{ id: 'camp_1', name: 'Invierno 2026' }],
};

const nueva = (extra) => ({
  acciones: [Object.assign({
    tipo: 'nueva', confianza: 'alta', correo: 'Campana X', cita: 'desde hoy',
    campana: {
      name: 'Matrimonios y Graduados', dateStart: '2026-10-03', dateEnd: '2026-10-31',
      status: 'ACTIVA', notes: '', franchises: [{ clientId: 'cl_ax', lines: ['Hombre'], sublines: [{ name: 'todas', discount: '30%' }], notes: '' }],
    },
  }, extra || {})],
});

test('una nueva valida pasa entera', () => {
  const r = validar(nueva(), CTX);
  assert.equal(r.acciones.length, 1);
  const a = r.acciones[0];
  assert.equal(a.tipo, 'nueva');
  assert.equal(a.incluir, true);
  assert.equal(a.campana.status, 'ACTIVA');
  assert.equal(a.campana.franchises[0].clientId, 'cl_ax');
  assert.equal(a.campana.franchises[0].sublines[0].discount, '30%');
});

test('tienda inventada se descarta y la campana cae si no queda ninguna', () => {
  const p = nueva();
  p.acciones[0].campana.franchises = [{ clientId: 'cl_inventado', lines: [], sublines: [] }];
  const r = validar(p, CTX);
  assert.equal(r.acciones.length, 0);
  assert.ok(r.descartes.some(d => d.includes('cl_inventado')));
});

test('tienda repetida entra una sola vez', () => {
  const p = nueva();
  p.acciones[0].campana.franchises = [
    { clientId: 'cl_ax', lines: [], sublines: [] },
    { clientId: 'cl_ax', lines: [], sublines: [] },
  ];
  const r = validar(p, CTX);
  assert.equal(r.acciones[0].campana.franchises.length, 1);
  assert.ok(r.descartes.some(d => d.includes('repetida')));
});

test('linea inventada se cae pero la tienda queda', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].lines = ['Hombre', 'MNG HE', 'Gafas'];
  const r = validar(p, CTX);
  assert.deepEqual(r.acciones[0].campana.franchises[0].lines, ['Hombre']);
});

test('estado invalido cae a PLANIFICADA', () => {
  const p = nueva();
  p.acciones[0].campana.status = 'ACTIVE';
  assert.equal(validar(p, CTX).acciones[0].campana.status, 'PLANIFICADA');
});

test('fecha mal formada se vacia; sin fecha de inicio se descarta', () => {
  const p = nueva();
  p.acciones[0].campana.dateEnd = '31/10/2026';
  assert.equal(validar(p, CTX).acciones[0].campana.dateEnd, '');
  const q = nueva();
  q.acciones[0].campana.dateStart = 'manana';
  assert.equal(validar(q, CTX).acciones.length, 0);
});

test('fin antes del inicio: se vacia el fin, no se descarta la campana', () => {
  const p = nueva();
  p.acciones[0].campana.dateStart = '2026-10-10';
  p.acciones[0].campana.dateEnd = '2026-10-01';
  const r = validar(p, CTX);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].campana.dateEnd, '');
  assert.ok(r.descartes.some(d => d.includes('fin antes del inicio')));
});

test('nueva sin nombre se descarta', () => {
  const p = nueva();
  p.acciones[0].campana.name = '   ';
  assert.equal(validar(p, CTX).acciones.length, 0);
});

test('dos descuentos quedan como dos sublineas', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].sublines = [
    { name: 'todas las prendas', discount: '50%' },
    { name: 'prendas de invierno', discount: '30%' },
  ];
  const subs = validar(p, CTX).acciones[0].campana.franchises[0].sublines;
  assert.equal(subs.length, 2);
  assert.notEqual(subs[0].id, subs[1].id);
});

test('amplia con campana conocida pasa; con id desconocido se descarta', () => {
  const ok = validar({ acciones: [{ tipo: 'amplia', confianza: 'alta', correo: 'Ampliacion', campanaId: 'camp_1', dateEnd: '2025-11-16' }] }, CTX);
  assert.equal(ok.acciones[0].dateEnd, '2025-11-16');
  assert.equal(ok.acciones[0].nombreCampana, 'Invierno 2026');
  const no = validar({ acciones: [{ tipo: 'amplia', campanaId: 'camp_99', dateEnd: '2025-11-16' }] }, CTX);
  assert.equal(no.acciones.length, 0);
});

test('amplia sin fecha valida se descarta', () => {
  const r = validar({ acciones: [{ tipo: 'amplia', campanaId: 'camp_1', dateEnd: '16 de noviembre' }] }, CTX);
  assert.equal(r.acciones.length, 0);
});

test('suma con campana conocida pasa', () => {
  const r = validar({ acciones: [{ tipo: 'suma', confianza: 'media', correo: 'Continuando', campanaId: 'camp_1', franchises: [{ clientId: 'cl_ck', lines: ['Mujer'], sublines: [{ name: 'todo', discount: '40%' }] }] }] }, CTX);
  assert.equal(r.acciones[0].tipo, 'suma');
  assert.equal(r.acciones[0].campanaId, 'camp_1');
});

test('suma con campana no identificada se vuelve nueva con confianza baja, no se pierde', () => {
  const r = validar({ acciones: [{ tipo: 'suma', confianza: 'alta', correo: 'Continuando con la misma campana', cita: 'para las otras tiendas', campanaId: 'camp_99', campana: { name: 'Dia de la Madre', dateStart: '2026-05-11' }, franchises: [{ clientId: 'cl_ck', lines: [], sublines: [] }] }] }, CTX);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].tipo, 'nueva');
  assert.equal(r.acciones[0].confianza, 'baja');
  assert.equal(r.acciones[0].campana.name, 'Dia de la Madre');
  assert.equal(r.acciones[0].campana.franchises.length, 1);
});

test('suma sin tiendas validas se descarta', () => {
  const r = validar({ acciones: [{ tipo: 'suma', campanaId: 'camp_1', franchises: [] }] }, CTX);
  assert.equal(r.acciones.length, 0);
});

test('tipo desconocido se descarta', () => {
  assert.equal(validar({ acciones: [{ tipo: 'borra', campanaId: 'camp_1' }] }, CTX).acciones.length, 0);
});

test('basura no revienta', () => {
  for (const p of [null, undefined, {}, { acciones: null }, { acciones: [null, 0, 'x'] }]) {
    const r = validar(p, CTX);
    assert.deepEqual(r.acciones, []);
  }
});

test('confianza invalida cae a media', () => {
  const p = nueva({ confianza: 'altisima' });
  assert.equal(validar(p, CTX).acciones[0].confianza, 'media');
});

test('hay tope de acciones y aguanta los dos anios cargados', () => {
  const p = { acciones: Array.from({ length: 200 }, () => nueva().acciones[0]) };
  const r = validar(p, CTX);
  assert.ok(r.acciones.length <= 60, 'tiene que haber tope');
  assert.ok(r.acciones.length >= 30, 'pero no tan bajo que corte 36 correos de dos anios');
});

// ── Estado derivado de las fechas (no de lo que dijo el modelo) ──
// Verificado en vivo el 14-oct-2026 con los correos reales: el modelo marco
// la campana "Matrimonios y Graduados" del 3-oct al 31-oct como FINALIZADA
// estando en curso, y la del 7-oct como ACTIVA. El prompt nunca le dijo como
// elegir el estado, asi que adivina y se contradice. Consecuencia real: el
// informe semanal mete una campana viva en la seccion de terminadas, y el
// badge del modulo dice FINALIZADA sobre un descuento que esta corriendo.
const CTX_HOY = Object.assign({}, CTX, { hoy: '2026-10-14' });

const conFechas = (ini, fin, statusDelModelo) => ({
  acciones: [{
    tipo: 'nueva', confianza: 'alta', correo: 'Campana X',
    campana: {
      name: 'X', dateStart: ini, dateEnd: fin, status: statusDelModelo, notes: '',
      franchises: [{ clientId: 'cl_ax', lines: [], sublines: [] }],
    },
  }],
});

test('en curso es ACTIVA aunque el modelo diga FINALIZADA', () => {
  // El caso exacto que fallo en vivo.
  const r = validar(conFechas('2026-10-03', '2026-10-31', 'FINALIZADA'), CTX_HOY);
  assert.equal(r.acciones[0].campana.status, 'ACTIVA');
});

test('ya terminada es FINALIZADA aunque el modelo diga ACTIVA', () => {
  const r = validar(conFechas('2026-07-31', '2026-08-31', 'ACTIVA'), CTX_HOY);
  assert.equal(r.acciones[0].campana.status, 'FINALIZADA');
});

test('todavia no empezo es PLANIFICADA', () => {
  const r = validar(conFechas('2026-11-01', '2026-11-30', 'ACTIVA'), CTX_HOY);
  assert.equal(r.acciones[0].campana.status, 'PLANIFICADA');
});

test('sin fecha de fin y ya empezada es ACTIVA', () => {
  const r = validar(conFechas('2026-10-03', '', 'FINALIZADA'), CTX_HOY);
  assert.equal(r.acciones[0].campana.status, 'ACTIVA');
});

test('el ultimo dia todavia es ACTIVA (dateEnd inclusive)', () => {
  const r = validar(conFechas('2026-10-03', '2026-10-14', 'FINALIZADA'), CTX_HOY);
  assert.equal(r.acciones[0].campana.status, 'ACTIVA');
});

test('empieza hoy es ACTIVA', () => {
  const r = validar(conFechas('2026-10-14', '2026-10-31', 'PLANIFICADA'), CTX_HOY);
  assert.equal(r.acciones[0].campana.status, 'ACTIVA');
});

test('sin hoy en el contexto cae a lo que dijo el modelo', () => {
  // Para no romper si alguien llama al validador sin fecha.
  const r = validar(conFechas('2026-10-03', '2026-10-31', 'CANCELADA'), CTX);
  assert.equal(r.acciones[0].campana.status, 'CANCELADA');
});

// ── Dos "nueva" con el mismo nombre en la misma tanda ──
// Verificado en vivo: el correo "Re: Campaña Matrimonios y Graduados" del 7-oct
// es la continuacion del del 3-oct, pero la campana del 3-oct todavia no existe
// en los datos (se esta proponiendo en la misma tanda), asi que no hay
// campanaId al que apuntar y el modelo la devuelve como nueva con confianza
// baja — que es lo que el spec pide. El resultado, sin embargo, son DOS
// campanas llamadas "Matrimonios y Graduados" con dateStart distinto, y las dos
// se guardan. Hay que decirlo en la tarjeta.
test('la segunda nueva con el mismo nombre queda marcada como posible continuacion', () => {
  const una = nueva().acciones[0];
  const otra = nueva().acciones[0];
  otra.campana = Object.assign({}, otra.campana, { dateStart: '2026-10-07' });
  const r = validar({ acciones: [una, otra] }, CTX_HOY);
  assert.equal(r.acciones.length, 2);
  assert.ok(!r.acciones[0].posibleContinuacion, 'la primera no se marca');
  assert.equal(r.acciones[1].posibleContinuacion, true);
  assert.equal(r.acciones[1].continuacionDe, 'Matrimonios y Graduados');
});

test('nombres distintos no se marcan', () => {
  const una = nueva().acciones[0];
  const otra = nueva().acciones[0];
  otra.campana = Object.assign({}, otra.campana, { name: 'Dia de la Madre' });
  const r = validar({ acciones: [una, otra] }, CTX_HOY);
  assert.ok(!r.acciones[0].posibleContinuacion);
  assert.ok(!r.acciones[1].posibleContinuacion);
});

test('el nombre se compara sin acentos ni mayusculas', () => {
  const una = nueva().acciones[0];
  const otra = nueva().acciones[0];
  otra.campana = Object.assign({}, otra.campana, { name: '  MATRIMONIOS Y GRADUADOS ', dateStart: '2026-10-07' });
  const r = validar({ acciones: [una, otra] }, CTX_HOY);
  assert.equal(r.acciones[1].posibleContinuacion, true);
});

// ── I4: la reconversion suma->nueva salteaba TODAS las guardas de 'nueva' ──
// Es el unico camino que produce una 'nueva' que las reglas del propio spec
// dicen que no puede existir.
test('reconvertida con fin antes del inicio se vacia el fin', () => {
  const r = validar({ acciones: [{ tipo: 'suma', campanaId: 'camp_99', correo: 'Continuando',
    campana: { name: 'Dia de la Madre', dateStart: '2026-05-11', dateEnd: '2026-05-01' },
    franchises: [{ clientId: 'cl_ck', lines: [], sublines: [] }] }] }, CTX_HOY);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].campana.dateEnd, '');
});

test('reconvertida sin nombre usa el asunto del correo, no "Campana sin nombre"', () => {
  // Una 'suma' no trae bloque campana: el modelo solo manda campanaId y
  // franchises. Descartarla pierde el correo entero; el asunto es un nombre
  // util y Pepe lo edita en la tarjeta.
  const r = validar({ acciones: [{ tipo: 'suma', campanaId: 'camp_99',
    correo: 'Re: Campana Matrimonios y Graduados',
    franchises: [{ clientId: 'cl_ck', lines: [], sublines: [] }] }] }, CTX_HOY);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].campana.name, 'Re: Campana Matrimonios y Graduados');
  assert.equal(r.acciones[0].confianza, 'baja');
});

test('reconvertida sin nombre NI asunto si se descarta', () => {
  const r = validar({ acciones: [{ tipo: 'suma', campanaId: 'camp_99',
    franchises: [{ clientId: 'cl_ck', lines: [], sublines: [] }] }] }, CTX_HOY);
  assert.equal(r.acciones.length, 0);
});

test('reconvertida sin fecha de inicio pasa marcada, no se descarta', () => {
  // Sin fecha no se puede guardar (lo impide _campAplicar), pero la tarjeta
  // tiene un selector de fecha: proponerla marcada le deja completarla.
  // Descartarla en silencio le saca esa posibilidad.
  const r = validar({ acciones: [{ tipo: 'suma', campanaId: 'camp_99', correo: 'Re: Campana X',
    franchises: [{ clientId: 'cl_ck', lines: [], sublines: [] }] }] }, CTX_HOY);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].campana.dateStart, '');
  assert.equal(r.acciones[0].faltanDatos, true);
});

test('una nueva directa sin nombre SI se descarta', () => {
  // Ahi el modelo tuvo toda la informacion y no lo lleno: es una senal de que
  // entendio mal el correo.
  const p = nueva();
  p.acciones[0].campana.name = '   ';
  assert.equal(validar(p, CTX_HOY).acciones.length, 0);
});

// ── I1: amplia no validaba la fecha contra la campana que modifica ──
// Es la unica accion que CAMBIA datos existentes en vez de agregar.
test('amplia con fin anterior al inicio de la campana se descarta', () => {
  const ctx = Object.assign({}, CTX_HOY, {
    campanas: [{ id: 'camp_1', name: 'Suit Up Day', dateStart: '2025-10-20', dateEnd: '2025-10-31' }] });
  const r = validar({ acciones: [{ tipo: 'amplia', campanaId: 'camp_1', dateEnd: '2024-11-16' }] }, ctx);
  assert.equal(r.acciones.length, 0, 'un ano mal tipeado no puede invertir una campana real');
  assert.ok(r.descartes.some(d => /antes del inicio/.test(d)));
});

test('amplia valida lleva el inicio de la campana para que se pueda ver', () => {
  const ctx = Object.assign({}, CTX_HOY, {
    campanas: [{ id: 'camp_1', name: 'Suit Up Day', dateStart: '2025-10-20', dateEnd: '2025-10-31' }] });
  const r = validar({ acciones: [{ tipo: 'amplia', campanaId: 'camp_1', dateEnd: '2026-11-16' }] }, ctx);
  assert.equal(r.acciones[0].dateStart, '2025-10-20');
  assert.equal(r.acciones[0].dateEndActual, '2025-10-31');
});

// ── I3: las lineas con eñe ──
// worker.js es ASCII puro, pero el modulo de Campanas usa 'Niña' y 'Niño'.
test('Nina y Nino se guardan con la eñe que usa el modulo', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].lines = ['Nina', 'Nino'];
  const r = validar(p, CTX_HOY);
  assert.deepEqual(r.acciones[0].campana.franchises[0].lines, ['Niña', 'Niño']);
});

test('si el modelo escribe bien el castellano tambien se acepta', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].lines = ['Niña', 'Niño', 'Kids'];
  const r = validar(p, CTX_HOY);
  assert.deepEqual(r.acciones[0].campana.franchises[0].lines, ['Niña', 'Niño', 'Kids']);
});

test('una linea inventada se descarta Y se informa', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].lines = ['Hombre', 'Gafas'];
  const r = validar(p, CTX_HOY);
  assert.deepEqual(r.acciones[0].campana.franchises[0].lines, ['Hombre']);
  assert.ok(r.descartes.some(d => /Gafas/.test(d)), 'un descarte silencioso es invisible');
});
