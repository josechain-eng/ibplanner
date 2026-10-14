// Prueba window._campAplicar extrayendola del HTML, igual que ya se probaba
// _buildWeeklyReport en Node. No necesita navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const INI = 'window._campAplicar = function';
const i = HTML.indexOf(INI);
assert.ok(i > 0, 'no encuentro window._campAplicar en el HTML');
const FIN = '\n};\n';
const j = HTML.indexOf(FIN, i);
assert.ok(j > i, 'no encuentro el cierre de _campAplicar');
const win = {};
// _campAplicar usa _campVigencia (al ampliar) y _campYaEsta (para no
// duplicar), asi que el harness carga las tres funciones del HTML publicado.
for (const nombre of ['window._campVigencia = function', 'window._campYaEsta = function']) {
  const k = HTML.indexOf(nombre);
  assert.ok(k > 0, 'no encuentro ' + nombre + ' en el HTML');
  new Function('window', HTML.slice(k, HTML.indexOf(FIN, k) + FIN.length))(win);
}
new Function('window', HTML.slice(i, j + FIN.length))(win);
const aplicar = win._campAplicar;

const fran = (clientId, lines, subs) => ({
  id: 'fran_' + clientId, clientId,
  lines: lines || [], sublines: subs || [{ id: 'sl_0', name: 'todo', discount: '30%' }], notes: ''
});

const BASE = () => ({
  campaigns: [{
    id: 'camp_vieja', name: 'Invierno 2026', dateStart: '2026-06-01', dateEnd: '2026-07-31',
    status: 'FINALIZADA', notes: '', franchises: [fran('cl_ax')]
  }]
});

const accNueva = (over) => Object.assign({
  tipo: 'nueva', confianza: 'alta', correo: 'Campana X', cita: '', incluir: true,
  campana: { name: 'Matrimonios y Graduados', dateStart: '2026-10-03', dateEnd: '2026-10-31',
             status: 'ACTIVA', notes: '', franchises: [fran('cl_ck', ['Hombre'])] }
}, over || {});

test('una nueva se agrega adelante y no toca las existentes', () => {
  const data = BASE();
  const antes = JSON.stringify(data);
  const r = aplicar(data, [accNueva()]);
  assert.equal(r.campaigns.length, 2);
  assert.equal(r.campaigns[0].name, 'Matrimonios y Graduados');
  assert.equal(r.campaigns[0].origen, 'correo');
  assert.ok(r.campaigns[0].id.startsWith('camp_'));
  assert.deepEqual(r.campaigns[1], data.campaigns[0]);
  assert.equal(r.res.nuevas, 1);
  assert.equal(JSON.stringify(data), antes, 'no debe mutar data');
});

test('las acciones destildadas no se aplican', () => {
  const r = aplicar(BASE(), [accNueva({ incluir: false })]);
  assert.equal(r.campaigns.length, 1);
  assert.equal(r.res.nuevas, 0);
});

test('la misma tanda dos veces no duplica', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const dos = aplicar({ campaigns: uno.campaigns }, [accNueva()]);
  assert.equal(dos.campaigns.length, 2);
  assert.equal(dos.res.nuevas, 0);
  assert.equal(dos.res.omitidas, 1);
  assert.ok(dos.res.fallos.some(f => f.includes('ya existía')));
});

test('mismo nombre con otra fecha de inicio SI entra', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const otra = accNueva();
  otra.campana = Object.assign({}, otra.campana, { dateStart: '2027-10-03' });
  const dos = aplicar({ campaigns: uno.campaigns }, [otra]);
  assert.equal(dos.campaigns.length, 3);
});

test('suma agrega solo las tiendas que no estaban', () => {
  const r = aplicar(BASE(), [{
    tipo: 'suma', incluir: true, campanaId: 'camp_vieja', nombreCampana: 'Invierno 2026',
    franchises: [fran('cl_ax'), fran('cl_boss'), fran('cl_mango')]
  }]);
  const c = r.campaigns.find(x => x.id === 'camp_vieja');
  assert.deepEqual(c.franchises.map(f => f.clientId), ['cl_ax', 'cl_boss', 'cl_mango']);
  assert.equal(r.res.sumadas, 2);
  assert.equal(r.campaigns.length, 1);
});

test('suma sin tiendas nuevas se informa y no cambia nada', () => {
  const r = aplicar(BASE(), [{
    tipo: 'suma', incluir: true, campanaId: 'camp_vieja', nombreCampana: 'Invierno 2026',
    franchises: [fran('cl_ax')]
  }]);
  assert.equal(r.campaigns[0].franchises.length, 1);
  assert.equal(r.res.omitidas, 1);
});

test('amplia cambia dateEnd y el estado, nada mas', () => {
  // El estado se recalcula a proposito (ver "ampliar al futuro recalcula el
  // estado"): lo que no puede tocar es el nombre, el inicio ni las tiendas.
  const data = BASE();
  const r = aplicar(data, [{
    tipo: 'amplia', incluir: true, campanaId: 'camp_vieja', nombreCampana: 'Invierno 2026', dateEnd: '2026-11-16'
  }]);
  const c = r.campaigns[0], v = data.campaigns[0];
  assert.equal(c.dateEnd, '2026-11-16');
  assert.equal(c.name, v.name);
  assert.equal(c.dateStart, v.dateStart);
  assert.deepEqual(c.franchises, v.franchises);
  assert.equal(r.res.ampliadas, 1);
});

test('suma o amplia sobre una campana borrada se informa, no revienta', () => {
  const r = aplicar(BASE(), [
    { tipo: 'suma', incluir: true, campanaId: 'camp_no', nombreCampana: 'Fantasma', franchises: [fran('cl_ck')] },
    { tipo: 'amplia', incluir: true, campanaId: 'camp_no', nombreCampana: 'Fantasma', dateEnd: '2026-12-01' }
  ]);
  assert.equal(r.campaigns.length, 1);
  assert.equal(r.res.fallos.length, 2);
  assert.ok(r.res.fallos[0].includes('ya no existe'));
});

test('ids de campana y de franquicia unicos en la misma tanda', () => {
  const a = accNueva(), b = accNueva();
  b.campana = Object.assign({}, b.campana, { name: 'Otra', franchises: [fran('cl_boss'), fran('cl_mango')] });
  const r = aplicar(BASE(), [a, b]);
  const ids = r.campaigns.map(c => c.id).concat(
    r.campaigns.flatMap(c => (c.franchises || []).map(f => f.id)));
  assert.equal(new Set(ids).size, ids.length);
});

test('sin campanas previas funciona igual', () => {
  const r = aplicar({}, [accNueva()]);
  assert.equal(r.campaigns.length, 1);
});

test('basura no revienta', () => {
  for (const acc of [null, undefined, [], [null, 0, 'x', {}, { tipo: 'raro', incluir: true }]]) {
    const r = aplicar(BASE(), acc);
    assert.equal(r.campaigns.length, 1);
  }
});

// ── C2: el guardia de duplicados dependia del nombre, que el modelo cambia ──
// Observado en vivo: la misma campana salio una vez como "Matrimonios y
// Graduados" y otra como "Matrimonios y Graduados - detalle CK, AX y Outlet
// Express". Un caracter de diferencia y el duplicado entra en los datos reales
// de Pepe, y de ahi al informe semanal que manda.
test('mismo inicio y mismas tiendas = duplicado, aunque el nombre cambie', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const otra = accNueva();
  otra.campana = Object.assign({}, otra.campana, { name: 'Matrimonios y Graduados - detalle CK, AX' });
  const dos = aplicar({ campaigns: uno.campaigns }, [otra]);
  assert.equal(dos.campaigns.length, 2, 'no entra una tercera');
  assert.equal(dos.res.nuevas, 0);
  assert.equal(dos.res.omitidas, 1);
  assert.ok(dos.res.fallos.some(f => /ya existía|ya existia/.test(f)));
});

test('mismo inicio con OTRAS tiendas SI entra', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const otra = accNueva();
  otra.campana = Object.assign({}, otra.campana, {
    name: 'Otra cosa', franchises: [fran('cl_boss'), fran('cl_mango')] });
  const dos = aplicar({ campaigns: uno.campaigns }, [otra]);
  assert.equal(dos.campaigns.length, 3);
});

test('mismas tiendas en otra fecha SI entra', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const otra = accNueva();
  otra.campana = Object.assign({}, otra.campana, { name: 'Otra', dateStart: '2027-01-05' });
  assert.equal(aplicar({ campaigns: uno.campaigns }, [otra]).campaigns.length, 3);
});

// ── I1: ampliar una campana terminada la deja FINALIZADA ──
// Entonces no aparece ni en CAMPANAS ACTIVAS ni en COMPLETADAS: desaparece del
// informe justo cuando esta corriendo.
test('ampliar al futuro recalcula el estado', () => {
  const data = { campaigns: [{ id: 'c1', name: 'Suit Up Day', dateStart: '2025-10-20',
    dateEnd: '2025-10-31', status: 'FINALIZADA', franchises: [fran('cl_ax')] }] };
  const r = aplicar(data, [{ tipo: 'amplia', incluir: true, campanaId: 'c1',
    nombreCampana: 'Suit Up Day', dateEnd: '2099-11-16' }]);
  assert.equal(r.campaigns[0].dateEnd, '2099-11-16');
  assert.equal(r.campaigns[0].status, 'ACTIVA', 'una campana extendida al futuro esta viva');
});

test('ampliar una campana que sigue terminada la deja FINALIZADA', () => {
  const data = { campaigns: [{ id: 'c1', name: 'X', dateStart: '2020-01-01',
    dateEnd: '2020-02-01', status: 'ACTIVA', franchises: [fran('cl_ax')] }] };
  const r = aplicar(data, [{ tipo: 'amplia', incluir: true, campanaId: 'c1', dateEnd: '2020-03-01' }]);
  assert.equal(r.campaigns[0].status, 'FINALIZADA');
});

test('ampliar no toca una campana CANCELADA', () => {
  const data = { campaigns: [{ id: 'c1', name: 'X', dateStart: '2020-01-01',
    dateEnd: '2020-02-01', status: 'CANCELADA', franchises: [] }] };
  const r = aplicar(data, [{ tipo: 'amplia', incluir: true, campanaId: 'c1', dateEnd: '2099-03-01' }]);
  assert.equal(r.campaigns[0].status, 'CANCELADA');
});

// ── El guardia al escribir ──
// La tarjeta deja editar todo, incluso borrar el nombre o la fecha. Lo que
// llega sin eso no se puede guardar: una campana sin inicio no tiene vigencia,
// y sin nombre no se puede ni buscar.
test('no escribe una campana sin fecha de inicio', () => {
  const a = accNueva();
  a.campana = Object.assign({}, a.campana, { dateStart: '' });
  const r = aplicar(BASE(), [a]);
  assert.equal(r.campaigns.length, 1);
  assert.equal(r.res.nuevas, 0);
  assert.ok(r.res.fallos.some(f => /fecha de inicio/.test(f)));
});

test('no escribe una campana sin nombre', () => {
  const a = accNueva();
  a.campana = Object.assign({}, a.campana, { name: '  ' });
  const r = aplicar(BASE(), [a]);
  assert.equal(r.res.nuevas, 0);
  assert.ok(r.res.fallos.some(f => /sin nombre/.test(f)));
});

test('no escribe una campana sin tiendas', () => {
  const a = accNueva();
  a.campana = Object.assign({}, a.campana, { franchises: [] });
  const r = aplicar(BASE(), [a]);
  assert.equal(r.res.nuevas, 0);
  assert.ok(r.res.fallos.some(f => /tienda/.test(f)));
});
