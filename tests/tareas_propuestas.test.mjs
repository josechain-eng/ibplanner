// Tareas propuestas desde el correo (16-nov-2026): dia habil, escalera de
// alarmas, memoria de lo decidido y alta. Las funciones no se leen como texto:
// se extraen del HTML y se ejecutan.
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
function fuente(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  return cuerpo(i);
}
// Las funciones nuevas son `window._tpX = function(...) {...};`
function fuenteWindow(nombre) {
  const i = html.indexOf('window.' + nombre + ' = function');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i) + ';\n';
}
// _LBP_EVENTS es un array literal: cuerpo() no lo balancea. Es la lista REAL.
const iEv = html.indexOf('window._LBP_EVENTS = [');
assert.ok(iEv > 0, 'no encuentro window._LBP_EVENTS');
const eventos = html.slice(iEv, html.indexOf('\n  ];', iEv) + 4) + ';\n';

const detect = cuerpo(html.indexOf('window._detectClientId = function'));
const alias = cuerpo(html.indexOf('window._LBP_CLIENT_ALIASES = {'));
const prologo = 'var window = {};\n' + alias + ';\n' + detect + ';\n' + eventos;
const tp = ['_tpProximoDiaHabil', '_tpHoraAlarma', '_tpFiltrar', '_tpPodarDecididas', '_tpAplicar'];
const nombres = ['uid', '_fechaLocal', '_clienteDeOrganizador'];
// `hoy` fija la fecha de today(); sin ella, el reloj real. Solo cambia today:
// el resto se extrae igual que siempre.
function montar(hoy) {
  const today = hoy ? "function today(){return '" + hoy + "';}" : fuente('today');
  return new Function(prologo + today + '\n' + nombres.map(fuente).join('\n') + '\n' +
    tp.map(fuenteWindow).join('\n') + '\nreturn window;')();
}
const f = montar();
const { _tpProximoDiaHabil, _tpHoraAlarma, _tpFiltrar, _tpPodarDecididas, _tpAplicar } = f;

const P = (over) => Object.assign({ hiloId: 'hilo:pago royalty fogo', titulo: 'Ver Pago Royalty Fogo',
  remitente: 'Ana <ana@fogodechao.com>', asunto: 'RE: Pago Royalty Fogo', fecha: '2026-11-09',
  cita: 'Favor revisar el pago del royalty de octubre', clienteSugerido: 'Fogo' }, over || {});
const D = (over) => Object.assign({ tasks: [], clients: [], tareasDecididas: [] }, over || {});
const dia = 24 * 3600 * 1000;

test('un viernes cae en lunes', () => assert.equal(_tpProximoDiaHabil('2026-11-20'), '2026-11-23'));
test('salta el feriado de Navidad', () => assert.equal(_tpProximoDiaHabil('2025-12-24'), '2025-12-26'));
test('feriado pegado al fin de semana cae en lunes', () => assert.equal(_tpProximoDiaHabil('2026-12-24'), '2026-12-28'));
test('un dia comun cae al dia siguiente, y es estrictamente posterior', () => {
  assert.equal(_tpProximoDiaHabil('2026-11-17'), '2026-11-18');
});
test('un dia de cat retail no es feriado', () => {
  // 30-ene es «Aniversario Ventura Mall» (retail): se trabaja. 2027-01-29 es viernes.
  assert.equal(_tpProximoDiaHabil('2027-01-28'), '2027-01-29');
  assert.equal(_tpProximoDiaHabil('2027-01-29'), '2027-02-01');
});

test('la escalera arranca 09:40 y suma 5', () => {
  const d = { tasks: [] };
  assert.equal(_tpHoraAlarma(d, '2026-11-17', []), '2026-11-17T09:40');
  assert.equal(_tpHoraAlarma(d, '2026-11-17', ['2026-11-17T09:40']), '2026-11-17T09:45');
  assert.equal(_tpHoraAlarma(d, '2026-11-17', ['2026-11-17T09:40', '2026-11-17T09:45']), '2026-11-17T09:50');
});
test('cuenta las alarmas que ya estan puestas ese dia, no la tanda', () => {
  const d = { tasks: [{ id: 't1', alarm: { enabled: true, datetime: '2026-11-17T09:40' } }] };
  assert.equal(_tpHoraAlarma(d, '2026-11-17', []), '2026-11-17T09:45');
});
test('una alarma de otro dia no ocupa lugar', () => {
  const d = { tasks: [{ id: 't1', alarm: { enabled: true, datetime: '2026-11-18T09:40' } }] };
  assert.equal(_tpHoraAlarma(d, '2026-11-17', []), '2026-11-17T09:40');
});
test('una alarma apagada no ocupa lugar', () => {
  const d = { tasks: [{ id: 't1', alarm: { enabled: false, datetime: '2026-11-17T09:40' } }] };
  assert.equal(_tpHoraAlarma(d, '2026-11-17', []), '2026-11-17T09:40');
});
test('la escalera pasa de 09:55 a 10:00 con cero a la izquierda', () => {
  const extra = ['09:40', '09:45', '09:50', '09:55'].map((h) => '2026-11-17T' + h);
  assert.equal(_tpHoraAlarma({ tasks: [] }, '2026-11-17', extra), '2026-11-17T10:00');
});
test('estas alarmas no llevan recordatorios', () => {
  const r = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]);
  const a = r.tasks[0].alarm;
  assert.equal(a.repeatIntervals, null);
  assert.equal(a.repeatCount, 0);
  assert.equal(a.enabled, true);
  assert.equal(a.recurrence, 'once');
});

test('lo descartado no vuelve', () => {
  const r = _tpAplicar(D(), [{ propuesta: P(), decision: 'no' }]);
  assert.deepEqual(_tpFiltrar([P()], r.tareasDecididas), []);
  assert.equal(r.tasks.length, 0);
  assert.equal(r.res.descartadas, 1);
});
test('lo aceptado tampoco vuelve', () => {
  const r = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]);
  assert.deepEqual(_tpFiltrar([P()], r.tareasDecididas), []);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.res.creadas, 1);
});
test('la fila sin tocar si vuelve', () => {
  const otra = P({ hiloId: 'hilo:otra cosa', titulo: 'Otra' });
  const r = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]);
  assert.deepEqual(_tpFiltrar([P(), otra], r.tareasDecididas).map((p) => p.hiloId), ['hilo:otra cosa']);
});
test('la misma propuesta confirmada dos veces crea una sola tarea', () => {
  // Dos veces en la misma tanda...
  const a = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }, { propuesta: P(), decision: 'ok' }]);
  assert.equal(a.tasks.length, 1);
  assert.equal(a.res.creadas, 1);
  assert.equal(a.tareasDecididas.length, 1);
  // ...y otra vez, con el resultado de la primera ya guardado.
  const b = _tpAplicar(D({ tasks: a.tasks, tareasDecididas: a.tareasDecididas }), [{ propuesta: P(), decision: 'ok' }]);
  assert.equal(b.tasks.length, 1);
  assert.equal(b.res.creadas, 0);
});
test('una decision de hace 200 dias se poda', () => {
  const viejas = [{ id: 'hilo:vieja', decision: 'no', ts: Date.now() - 200 * dia },
                  { id: 'hilo:reciente', decision: 'ok', ts: Date.now() - 10 * dia }];
  assert.deepEqual(_tpPodarDecididas(viejas).map((x) => x.id), ['hilo:reciente']);
  // _tpAplicar poda lo que escribe
  const r = _tpAplicar(D({ tareasDecididas: viejas }), [{ propuesta: P(), decision: 'no' }]);
  assert.deepEqual(r.tareasDecididas.map((x) => x.id).sort(), ['hilo:pago royalty fogo', 'hilo:reciente']);
});
test('podar deduplica por id y gana el ts mas nuevo', () => {
  const ahora = Date.now();
  const r = _tpPodarDecididas([{ id: 'a', decision: 'no', ts: ahora - 5 * dia }, { id: 'a', decision: 'ok', ts: ahora - 1 * dia }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].decision, 'ok');
});

const cl = (id, name, email) => ({ id, name, contacts: [{ name: 'x', email }] });
test('el dominio de un contacto decide el clientId', () => {
  const d = D({ clients: [cl('c1', 'Fogo', 'jefe@fogodechao.com'), cl('c2', 'Mango', 'z@mango.com')] });
  assert.equal(_tpAplicar(d, [{ propuesta: P(), decision: 'ok' }]).tasks[0].clientId, 'c1');
});
test('clienteSugerido no decide el clientId', () => {
  const d = D({ clients: [cl('c2', 'Fogo', 'z@otro.com')] }); // el nombre coincide, el dominio no
  assert.equal(_tpAplicar(d, [{ propuesta: P(), decision: 'ok' }]).tasks[0].clientId, '');
});
test('un dominio ambiguo deja clientId vacio', () => {
  const d = D({ clients: [cl('c1', 'A', 'a@fogodechao.com'), cl('c2', 'B', 'b@fogodechao.com')] });
  assert.equal(_tpAplicar(d, [{ propuesta: P(), decision: 'ok' }]).tasks[0].clientId, '');
});
test('un correo gratuito deja clientId vacio', () => {
  const d = D({ clients: [cl('c1', 'A', 'a@gmail.com')] });
  const p = P({ remitente: 'Ana <ana@gmail.com>' });
  assert.equal(_tpAplicar(d, [{ propuesta: p, decision: 'ok' }]).tasks[0].clientId, '');
});
test('la cita y el correo de origen quedan en la descripcion', () => {
  const t = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]).tasks[0];
  assert.ok(t.description.includes('Favor revisar el pago del royalty de octubre'));
  assert.ok(t.description.includes('Ana <ana@fogodechao.com>'));
  assert.ok(t.description.includes('RE: Pago Royalty Fogo'));
  assert.ok(t.description.includes('2026-11-09'));
});
test('la fecha limite que menciona el correo no pisa el dueDate', () => {
  const p = P({ cita: 'Necesito esto para el 2030-01-15, gracias', fecha: '2030-01-10' });
  const t = montar('2026-11-17')._tpAplicar(D(), [{ propuesta: p, decision: 'ok' }]).tasks[0];
  assert.equal(t.dueDate, '2026-11-18');
});
test('la tarea cae en el proximo dia habil: jueves 24-dic salta Navidad y el fin de semana', () => {
  const t = montar('2026-12-24')._tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]).tasks[0];
  assert.equal(t.dueDate, '2026-12-28');
  assert.equal(t.alarm.datetime, '2026-12-28T09:40');
});
test('la tarea cae en el proximo dia habil: viernes cae en lunes', () => {
  const t = montar('2026-11-20')._tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]).tasks[0];
  assert.equal(t.dueDate, '2026-11-23');
  assert.equal(t.alarm.datetime, '2026-11-23T09:40');
});
test('con el reloj real, dueDate es una fecha local valida posterior a hoy', () => {
  const t = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]).tasks[0];
  assert.match(t.dueDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(t.alarm.datetime, t.dueDate + 'T09:40');
});
test('la tarea sigue la forma del proyecto', () => {
  const t = _tpAplicar(D(), [{ propuesta: P(), decision: 'ok' }]).tasks[0];
  assert.equal(t.title, 'Ver Pago Royalty Fogo');
  assert.equal(t.status, 'INBOX');
  assert.equal(t.priority, 'MEDIUM');
  assert.equal(t.category, 'Work');
  assert.deepEqual(t.tags, ['Correo']);
  assert.equal(typeof t.createdAt, 'number');
  assert.ok(t.id);
  assert.equal(t.alarm.datetime.slice(0, 10), t.dueDate);
});
test('dos tareas en una tanda escalonan la alarma, y extra cuenta lo ya puesto', () => {
  const a = P({ hiloId: 'hilo:a' }), b = P({ hiloId: 'hilo:b' });
  const r = _tpAplicar(D(), [{ propuesta: a, decision: 'ok' }, { propuesta: b, decision: 'ok' }]);
  const h = r.tasks.map((t) => t.alarm.datetime.slice(11));
  assert.deepEqual(h, ['09:40', '09:45']);
  // Task 4 aplica de a una fila: lo ya colocado en la tarjeta entra por `extra`.
  const dueDate = r.tasks[0].dueDate;
  const una = _tpAplicar(D(), [{ propuesta: b, decision: 'ok' }], [dueDate + 'T09:40']);
  assert.equal(una.tasks[0].alarm.datetime, dueDate + 'T09:45');
});
test('aplicar no toca los arrays de entrada', () => {
  const d = D();
  _tpAplicar(d, [{ propuesta: P(), decision: 'ok' }]);
  assert.equal(d.tasks.length, 0);
  assert.equal(d.tareasDecididas.length, 0);
});
test('tareasDecididas esta en _SYNC_LISTS', () => {
  const i = html.indexOf('var _SYNC_LISTS = [');
  assert.ok(html.slice(i, html.indexOf('];', i)).includes("'tareasDecididas'"));
});
test('una decision revocada devuelve la propuesta a la lista', () => {
  const p = P();
  const dec = [{ id: p.hiloId, decision: 'revocada', ts: Date.now() }];
  assert.deepEqual(_tpFiltrar([p], dec), [p]);
  assert.deepEqual(_tpFiltrar([p], [{ id: p.hiloId, decision: 'no', ts: Date.now() }]), []);
});
test('✓ sobre un hilo revocado crea la tarea y reemplaza la entrada (no la duplica)', () => {
  const p = P();
  const d = D({ tareasDecididas: [{ id: p.hiloId, decision: 'revocada', ts: Date.now() - 1000 }] });
  const r = _tpAplicar(d, [{ propuesta: p, decision: 'ok' }]);
  assert.equal(r.res.creadas, 1, 'una revocada no puede bloquear la creacion');
  assert.equal(r.tasks.length, 1);
  const mias = r.tareasDecididas.filter((x) => x.id === p.hiloId);
  assert.equal(mias.length, 1);
  assert.equal(mias[0].decision, 'ok');
  // y una decision real sigue bloqueando
  const otra = _tpAplicar(D({ tareasDecididas: r.tareasDecididas, tasks: r.tasks }), [{ propuesta: p, decision: 'ok' }]);
  assert.equal(otra.res.creadas, 0);
});
