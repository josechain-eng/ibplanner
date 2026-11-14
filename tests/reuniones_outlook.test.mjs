// Las reuniones de Outlook entran solas y se mueven con Outlook (14-nov-2026).
// Las funciones no se leen como texto: se extraen del HTML y se ejecutan.
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
// window._detectClientId y los alias viven en window.*: se extraen igual.
const detect = cuerpo(html.indexOf('window._detectClientId = function'));
const alias = cuerpo(html.indexOf('window._LBP_CLIENT_ALIASES = {'));
const prologo = 'var window = {};\n' + alias + ';\n' + detect + ';\n';
const nombres = ['defaultAlarm', '_fechaLocal', '_esDiaEntero', '_alarmaReunionGcal',
  '_clienteDeOrganizador', '_reunionDeOutlook', '_mezclarOutlook'];
const { _alarmaReunionGcal, _clienteDeOrganizador, _reunionDeOutlook, _mezclarOutlook } =
  new Function(prologo + nombres.map(fuente).join('\n') + '\nreturn {' + nombres.join(',') + '};')();

const dia = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ahora = (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d.getTime(); })();
const clients = [
  { id: 'c1', name: 'Chillibeans', businessName: 'Chillibeans', contacts: [{ name: 'Ana', email: 'ana@chillibeans.com.br' }] },
  { id: 'c2', name: 'Mango', contacts: [] },
];
const UID = '040000008200E00074C5B7101A82E008' + 'A'.repeat(40);
const ev = (o = {}) => Object.assign({ uid: UID, titulo: 'Reunión Mensual', fecha: iso(dia(3)), inicio: '16:00', fin: '16:30',
  diaEntero: false, organizador: 'ana.cardona@chillibeans.com.br', estado: 'PROPUESTA', otrosUids: [] }, o);
const pay = (eventos, completa = true) => ({ ts: '2026-11-14T12:15:31', completa, eventos });
const mezclar = (ms, p, del = {}) => _mezclarOutlook(ms, p, clients, del, ahora);
const importada = (o = {}) => _reunionDeOutlook(ev(), clients, ahora) && Object.assign(_reunionDeOutlook(ev(), clients, ahora), o);

// ── importar ──
test('una reunion nueva entra con su etiqueta y su alarma a T-60', () => {
  const r = mezclar([], pay([ev()]));
  assert.equal(r.meetings.length, 1);
  const m = r.meetings[0];
  assert.equal(m.id, 'outlook_' + UID.replace(/[^a-z0-9]/gi, ''));
  assert.equal(m.outlookEventId, UID);
  assert.equal(m.fromGcal, false);
  assert.equal(m.status, 'SCHEDULED');
  assert.equal(m.confirmacion, 'PROPUESTA');
  assert.equal(m.date, iso(dia(3)));
  assert.equal(m.startTime, '16:00');
  assert.equal(m.endTime, '16:30');
  assert.equal(m.title, 'Reunión Mensual');
  assert.match(m.notes, /ana\.cardona@chillibeans\.com\.br/);
  assert.equal(m.alarm.datetime, iso(dia(3)) + 'T15:00');
  assert.equal(m.alarm.auto, true);
  assert.deepEqual(r.cambios.map(c => c.tipo), ['NUEVA']);
});

test('una ACEPTADA entra con confirmacion ACEPTADA y la otra con PROPUESTA', () => {
  assert.equal(mezclar([], pay([ev({ estado: 'ACEPTADA' })])).meetings[0].confirmacion, 'ACEPTADA');
  assert.equal(mezclar([], pay([ev({ estado: 'PROPUESTA' })])).meetings[0].confirmacion, 'PROPUESTA');
});

test('una RECHAZADA no entra', () => {
  const r = mezclar([], pay([ev({ estado: 'RECHAZADA' })]));
  assert.equal(r.meetings.length, 0);
  assert.deepEqual(r.cambios, []);
});

test('una RECHAZADA ya importada queda CANCELLED y sin alarma', () => {
  const m = importada();
  const r = mezclar([m], pay([ev({ estado: 'RECHAZADA' })]));
  assert.equal(r.meetings[0].status, 'CANCELLED');
  assert.equal(r.meetings[0].alarm.enabled, false);
  assert.deepEqual(r.cambios.map(c => c.tipo), ['CANCELADA']);
});

test('el cliente sale del dominio del organizador', () => {
  const m = mezclar([], pay([ev()])).meetings[0];
  assert.equal(m.clientId, 'c1');
  assert.equal(m.clientName, 'Chillibeans');
  // y por el correo de un contacto, aunque el dominio no este mapeado
  const c = [{ id: 'x9', name: 'Otra SA', contacts: [{ email: 'q@otra.com' }] }];
  assert.deepEqual(_clienteDeOrganizador('Fulano <f@otra.com>', c), { id: 'x9', name: 'Otra SA' });
});

test('sin dominio conocido, clientId y clientName quedan vacios', () => {
  const m = mezclar([], pay([ev({ organizador: 'juan@desconocido.org' })])).meetings[0];
  assert.equal(m.clientId, '');
  assert.equal(m.clientName, '');
  assert.equal(_clienteDeOrganizador('', clients), null);
});

test('una reunion ya importada no se duplica', () => {
  const r = mezclar([importada()], pay([ev()]));
  assert.equal(r.meetings.length, 1);
});

test('una que Pepe borro no vuelve', () => {
  const id = 'outlook_' + UID.replace(/[^a-z0-9]/gi, '');
  const ms = [];
  const r = mezclar(ms, pay([ev()]), { [id]: Date.now() });
  assert.equal(r.meetings.length, 0);
  assert.equal(r.meetings, ms);
});

test('el dia entero lleva 00:00 en inicio y fin y suena a las 08:00', () => {
  const m = mezclar([], pay([ev({ diaEntero: true, inicio: '00:00', fin: '23:59', fecha: iso(dia(2)) })])).meetings[0];
  assert.equal(m.startTime, '00:00');
  assert.equal(m.endTime, '00:00');
  assert.equal(m.alarm.datetime, iso(dia(2)) + 'T08:00');
});

test('isOnline si el titulo menciona Teams, Meet o Zoom, pero no "meeting"', () => {
  assert.equal(_reunionDeOutlook(ev({ titulo: 'Sync por Teams' }), clients, ahora).isOnline, true);
  assert.equal(_reunionDeOutlook(ev({ titulo: 'Weekly meeting' }), clients, ahora).isOnline, false);
});

// ── seguir los cambios ──
test('una movida cambia fecha y hora', () => {
  const r = mezclar([importada()], pay([ev({ fecha: iso(dia(5)), inicio: '10:00', fin: '11:00' })]));
  const m = r.meetings[0];
  assert.equal(m.date, iso(dia(5)));
  assert.equal(m.startTime, '10:00');
  assert.equal(m.endTime, '11:00');
  assert.deepEqual(r.cambios.map(c => c.tipo), ['MOVIDA']);
});

test('una movida recalcula la alarma automatica', () => {
  const r = mezclar([importada()], pay([ev({ fecha: iso(dia(5)), inicio: '10:00', fin: '11:00' })]));
  assert.equal(r.meetings[0].alarm.datetime, iso(dia(5)) + 'T09:00');
  assert.equal(r.meetings[0].alarm.auto, true);
});

test('una movida NO toca la alarma que puso Pepe', () => {
  const suya = { enabled: true, datetime: iso(dia(3)) + 'T07:00', recurrence: 'once' };
  const r = mezclar([importada({ alarm: suya })], pay([ev({ fecha: iso(dia(5)) })]));
  assert.equal(r.meetings[0].date, iso(dia(5)));
  assert.equal(r.meetings[0].alarm, suya);
});

test('una movida al pasado no deja alarma', () => {
  const r = mezclar([importada()], pay([ev({ fecha: iso(dia(0)), inicio: '09:30', fin: '10:00' })]));
  assert.equal(r.meetings[0].date, iso(dia(0)));
  assert.equal(r.meetings[0].alarm, undefined);
});

test('la que desaparecio de Outlook queda CANCELLED y sin alarma', () => {
  const r = mezclar([importada()], pay([]));
  assert.equal(r.meetings.length, 1);
  assert.equal(r.meetings[0].status, 'CANCELLED');
  assert.equal(r.meetings[0].alarm.enabled, false);
  assert.deepEqual(r.cambios.map(c => c.tipo), ['CANCELADA']);
});

test('una pasada que desaparecio no se toca', () => {
  const ms = [importada({ date: iso(dia(-2)) })];
  assert.equal(mezclar(ms, pay([])).meetings, ms);
});

test('un UID que quedo en otrosUids no se cancela (y no se duplica)', () => {
  const B = 'B'.repeat(60);
  const ms = [importada({ outlookEventId: B, id: 'outlook_' + B })];
  const r = mezclar(ms, pay([ev({ otrosUids: [B] })]));
  assert.equal(r.meetings, ms, 'ni cancelada ni duplicada');
});

test('PROPUESTA a ACEPTADA cambia confirmacion', () => {
  const r = mezclar([importada()], pay([ev({ estado: 'ACEPTADA' })]));
  assert.equal(r.meetings[0].confirmacion, 'ACEPTADA');
  assert.deepEqual(r.cambios.map(c => c.tipo), ['ACEPTADA']);
});

test('una lectura incompleta no cambia nada: ni cancela ni importa', () => {
  const ms = [importada(), importada({ outlookEventId: 'Z', id: 'outlook_Z' })];
  const r = mezclar(ms, pay([ev({ uid: 'NUEVO', fecha: iso(dia(4)) })], false));
  assert.equal(r.meetings, ms);
  assert.deepEqual(r.cambios, []);
  assert.equal(mezclar(ms, { error: 'x', completa: false, eventos: [] }).meetings, ms);
});

test('las reuniones sin outlookEventId no se tocan nunca', () => {
  const suya = { id: 'a1', title: 'Mia', date: iso(dia(3)), startTime: '16:00', endTime: '17:00', status: 'SCHEDULED' };
  const r = mezclar([suya], pay([]));
  assert.equal(r.meetings[0], suya);
  assert.equal(r.meetings, r.meetings);
  assert.equal(mezclar([suya], pay([ev({ uid: 'otro' })])).meetings[0], suya);
});

test('sin cambios devuelve la MISMA referencia del array', () => {
  const ms = [importada()];
  const r = mezclar(ms, pay([ev()]));
  assert.equal(r.meetings, ms);
  assert.deepEqual(r.cambios, []);
});

test('la alarma que pone la app lleva auto: true', () => {
  const a = _alarmaReunionGcal({ fromGcal: true, date: iso(dia(3)), startTime: '15:00' }, ahora);
  assert.equal(a.auto, true);
});
