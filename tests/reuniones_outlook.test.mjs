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

// Extrae un juego cualquiera de funciones del HTML y las devuelve ejecutables.
function traer(nom) {
  return new Function(prologo + nom.map(fuente).join('\n') + '\nreturn {' + nom.join(',') + '};')();
}

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
  assert.equal(r.cambios.length, 0);
  assert.equal(r.meetings.length, 1);
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

// ── correccion 1 (14-nov): correo personal no identifica a un cliente ──
test('un organizador en yahoo.com.mx no cae en el cliente cuyo contacto usa yahoo.com.mx', () => {
  const c = [{ id: 'kd', name: 'Kids Delux', contacts: [{ email: 'duena@yahoo.com.mx' }] }];
  assert.equal(_clienteDeOrganizador('alguien@yahoo.com.mx', c), null);
  for (const d of ['gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com',
    'proton.me', 'protonmail.com', 'msn.com', 'googlemail.com', 'yahoo.es', 'outlook.com.br']) {
    const cc = [{ id: 'z', name: 'Z', contacts: [{ email: 'q@' + d }] }];
    assert.equal(_clienteDeOrganizador('x@' + d, cc), null, d);
  }
});

test('el dominio de empresa de un contacto sigue identificando al cliente', () => {
  const c = [{ id: 'bo', name: 'Boss', contacts: [{ email: 'a@hugoboss.com' }] }, { id: 'hu', name: 'Hugo', contacts: [] }];
  assert.deepEqual(_clienteDeOrganizador('x@hugoboss.com', c), { id: 'bo', name: 'Boss' });
});

// ── correccion 2: la lista fija nunca pisa a los contactos ──
test('la red de seguridad por dominio usa los nombres reales y no pisa a los contactos', () => {
  const sin = [{ id: 'cb', name: 'Chillibeans', contacts: [] }];
  assert.deepEqual(_clienteDeOrganizador('x@chillibeans.com.br', sin), { id: 'cb', name: 'Chillibeans' });
  // un contacto de otro cliente con ese dominio gana sobre la lista fija
  const dos = [{ id: 'cb', name: 'Chillibeans', contacts: [] }, { id: 'o', name: 'Otro', contacts: [{ email: 'a@chillibeans.com.br' }] }];
  assert.equal(_clienteDeOrganizador('x@chillibeans.com.br', dos).id, 'o');
  // PF Chang's no es cliente
  assert.equal(_clienteDeOrganizador('x@pfchangs.com', clients), null);
});

// ── correccion 4: retitular tambien se avisa ──
test('un cambio de titulo aparece en cambios', () => {
  const r = mezclar([importada()], pay([ev({ titulo: 'Reunión Mensual (nueva agenda)' })]));
  assert.equal(r.meetings[0].title, 'Reunión Mensual (nueva agenda)');
  assert.deepEqual(r.cambios.map(c => c.tipo), ['RETITULADA']);
});

// ── ronda de correcciones 2 ──
const a1530 = (() => { const d = new Date(); d.setHours(15, 30, 0, 0); return d.getTime(); })();

test('aceptar una reunion cuando ya paso su T-60 conserva la alarma que la app puso', () => {
  const m = importada({ date: iso(dia(0)), startTime: '16:00', endTime: '16:30',
    alarm: { enabled: true, datetime: iso(dia(0)) + 'T15:00', auto: true, recurrence: 'once' } });
  const r = _mezclarOutlook([m], pay([ev({ fecha: iso(dia(0)), estado: 'ACEPTADA' })]), clients, {}, a1530);
  assert.equal(r.meetings[0].confirmacion, 'ACEPTADA');
  assert.equal(r.meetings[0].alarm.datetime, iso(dia(0)) + 'T15:00');
  assert.equal(r.meetings[0].alarm.auto, true);
});

test('una movida lleva en cambios la alarma vieja para cancelarla en la nube', () => {
  const m = importada();
  const vieja = m.alarm;
  const r = mezclar([m], pay([ev({ fecha: iso(dia(5)) })]));
  const c = r.cambios.find(x => x.tipo === 'MOVIDA');
  assert.equal(c.alarmaVieja, vieja);
  assert.notEqual(r.meetings[0].alarm.datetime, vieja.datetime);
});

test('una movida con alarma de Pepe no lleva alarmaVieja', () => {
  const suya = { enabled: true, datetime: iso(dia(3)) + 'T07:00', recurrence: 'once' };
  const r = mezclar([importada({ alarm: suya })], pay([ev({ fecha: iso(dia(5)) })]));
  assert.equal(r.cambios[0].alarmaVieja, undefined);
});

test('una movida al pasado con alarma de Pepe la conserva', () => {
  const suya = { enabled: true, datetime: iso(dia(3)) + 'T07:00', recurrence: 'once' };
  const r = mezclar([importada({ alarm: suya })], pay([ev({ fecha: iso(dia(0)), inicio: '09:30' })]));
  assert.equal(r.meetings[0].alarm, suya);
});

test('movida + retitulada + aceptada emite las tres entradas', () => {
  const r = mezclar([importada()], pay([ev({ fecha: iso(dia(5)), titulo: 'Otro nombre', estado: 'ACEPTADA' })]));
  assert.deepEqual(r.cambios.map(c => c.tipo).sort(), ['ACEPTADA', 'MOVIDA', 'RETITULADA']);
});

test('dos clientes con el mismo dominio de contacto: no se resuelve ninguno, en cualquier orden', () => {
  const b = { id: 'b', name: 'Boss', contacts: [{ email: 'p@hugoboss.com' }] };
  const h = { id: 'h', name: 'Hugo', contacts: [{ email: 'p@hugoboss.com' }] };
  assert.equal(_clienteDeOrganizador('x@hugoboss.com', [b, h]), null);
  assert.equal(_clienteDeOrganizador('x@hugoboss.com', [h, b]), null);
});

test('un evento sin fecha valida no se importa ni se mueve', () => {
  for (const f of [undefined, '', '2026-1-5', 'manana']) {
    const r = mezclar([], pay([ev({ fecha: f })]));
    assert.equal(r.meetings.length, 0, String(f));
  }
  const ms = [importada()];
  assert.equal(mezclar(ms, pay([ev({ fecha: undefined })])).meetings, ms);
});

test('un tombstone con mas de 7 dias se re-sella mientras Outlook ofrezca el evento', () => {
  const id = 'outlook_' + UID.replace(/[^a-z0-9]/gi, '');
  const del = { [id]: ahora - 8 * 86400000, otro: 5 };
  const r = mezclar([], pay([ev()]), del);
  assert.equal(r.meetings.length, 0);
  assert.equal(r.deletedIds[id], ahora);
  assert.equal(r.deletedIds.otro, 5);
  assert.equal(del[id], ahora - 8 * 86400000, 'no muta el argumento');
  // y sobrevive a un pull con la marca vieja de la nube
  const nube = { [id]: ahora - 8 * 86400000 };
  assert.equal(mergeT(nube, r.deletedIds)[id], ahora);
  assert.equal(mergeT(r.deletedIds, nube)[id], ahora);
});

test('un tombstone de 7 dias o menos no se re-sella (no se empuja el blob cada hora)', () => {
  const id = 'outlook_' + UID.replace(/[^a-z0-9]/gi, '');
  for (const edad of [1000, 3 * 86400000, 7 * 86400000]) {
    const r = mezclar([], pay([ev()]), { [id]: ahora - edad });
    assert.equal(r.meetings.length, 0);
    assert.equal('deletedIds' in r, false, 'edad ' + edad);
  }
});

test('deletedIds solo aparece si hubo algo que re-sellar; nunca se devuelve {} por un undefined', () => {
  const ms = [importada()];
  for (const r of [mezclar(ms, pay([ev()])), mezclar(ms, pay([], false)), mezclar([], pay([ev()]), undefined),
    _mezclarOutlook(ms, pay([], false), clients, undefined, ahora), _mezclarOutlook(ms, null, clients, undefined, ahora)]) {
    assert.equal('deletedIds' in r, false);
  }
  // y con un tombstone de otra reunion que no esta en la lectura, tampoco
  assert.equal('deletedIds' in mezclar([], pay([ev()]), { outlook_otra: 1 }), false);
});

// ── el re-sellado tiene que sobrevivir a la sincronizacion ──
const { _mergeTombstones, _tombstonesCambiaron } = (() => {
  const w = new Function('var window = {};\n' + cuerpo(html.indexOf('window._mergeTombstones = function')) + ';\n' +
    cuerpo(html.indexOf('window._tombstonesCambiaron = function')) + ';\nreturn window;')();
  return w;
})();
const mergeT = _mergeTombstones, cambiaron = _tombstonesCambiaron;

test('un tombstone re-sellado en este dispositivo sobrevive a un pull con la marca vieja de la nube', () => {
  const local = { x: 2000, solo_local: 7 }, nube = { x: 1000, solo_nube: 9 };
  assert.deepEqual(mergeT(local, nube), { x: 2000, solo_local: 7, solo_nube: 9 });
  assert.deepEqual(mergeT(nube, local), { x: 2000, solo_local: 7, solo_nube: 9 });
  assert.deepEqual(mergeT(undefined, undefined), {});
});

test('un re-sellado (mismas claves, marca mas nueva) cuenta como cambio y dispara el push', () => {
  assert.equal(cambiaron({ x: 1000 }, { x: 2000 }), true);
  assert.equal(cambiaron({ x: 1000 }, { x: 1000 }), false);
  assert.equal(cambiaron({}, { x: 1 }), true);
  assert.equal(cambiaron(undefined, {}), false);
});

test('_mergeCloudData y el pull forzado usan la union por marca mas nueva', () => {
  assert.match(html, /var allDeleted = window\._mergeTombstones\(local\._deletedIds, cloud\._deletedIds\)/);
  assert.match(html, /var allDeleted = window\._mergeTombstones\(local\._deletedIds, json\.data\._deletedIds\)/);
  assert.match(html, /var changed = window\._tombstonesCambiaron\(base\._deletedIds, allDeleted\)/);
});

// ── Task 6: avisar los cambios y soltar las alarmas viejas ──
function entornoAvisos() {
  const store = {};
  const disparadas = [];
  const canceladas = [];
  const prologoAv = 'var localStorage = { getItem: function(k){ return k in store ? store[k] : null; },' +
    ' setItem: function(k, v){ store[k] = String(v); } };\n' +
    'var _fireNotification = function(t, c, tag){ disparadas.push({ titulo: t, cuerpo: c, tag: tag }); };\n' +
    'var window = { _cloudCancelAlarm: function(id){ canceladas.push(id); } };\n';
  const nom = ['_fechaLocal', '_esDiaEntero', '_futureOccurrences', '_cancelEntityCloudAlarms',
    '_avisarCambiosReunion', '_soltarAlarmasViejas'];
  const f = new Function('store', 'disparadas', 'canceladas',
    prologoAv + nom.map(fuente).join('\n') + '\nreturn {' + nom.join(',') + '};')(store, disparadas, canceladas);
  return Object.assign({ store, disparadas, canceladas }, f);
}
const reunion = (o = {}) => Object.assign({ id: 'outlook_x1', title: 'Reunión Mensual', date: iso(dia(0)), startTime: '16:00',
  endTime: '16:30', status: 'SCHEDULED' }, o);

test('avisa una cancelada de hoy', () => {
  const e = entornoAvisos();
  const n = e._avisarCambiosReunion([{ tipo: 'CANCELADA', meeting: reunion({ status: 'CANCELLED' }) }], ahora);
  assert.equal(n, 1);
  assert.equal(e.disparadas.length, 1);
  assert.match(e.disparadas[0].titulo, /cancelada/i);
  assert.match(e.disparadas[0].cuerpo, /16:00/);
});

test('avisa una movida a mañana y una movida DESDE hoy (por la alarma vieja)', () => {
  const e = entornoAvisos();
  const nueva = reunion({ date: iso(dia(1)) });
  assert.equal(e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: nueva }], ahora), 1);
  const e2 = entornoAvisos();
  const lejos = reunion({ id: 'outlook_x2', date: iso(dia(9)) });
  assert.equal(e2._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: lejos, fechaVieja: iso(dia(0)), horaVieja: '16:00' }], ahora), 1);
  assert.match(e2.disparadas[0].cuerpo, /hoy 16:00/);
});

test('movida desde hoy con alarma PROPIA de Pepe (sin alarmaVieja) avisa y dice desde cuando', () => {
  const e = entornoAvisos();
  const lejos = reunion({ id: 'outlook_x3', date: iso(dia(7)), alarm: { datetime: iso(dia(0)) + 'T15:00', recurrence: 'once' } });
  const n = e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: lejos, fechaVieja: iso(dia(0)), horaVieja: '16:00' }], ahora);
  assert.equal(n, 1);
  assert.match(e.disparadas[0].cuerpo, /hoy 16:00/);
  assert.match(e.disparadas[0].cuerpo, new RegExp(iso(dia(7))));
});

test('movida lejos desde lejos no avisa', () => {
  const e = entornoAvisos();
  const m = reunion({ date: iso(dia(9)) });
  assert.equal(e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: m, fechaVieja: iso(dia(8)), horaVieja: '16:00' }], ahora), 0);
});

test('RETITULADA de hoy o mañana avisa con el titulo nuevo; una lejana no', () => {
  const e = entornoAvisos();
  const m = reunion({ title: 'Reunión Mensual - SE PASA A LAS 5' });
  assert.equal(e._avisarCambiosReunion([{ tipo: 'RETITULADA', meeting: m }], ahora), 1);
  assert.match(e.disparadas[0].cuerpo, /SE PASA A LAS 5/);
  const e2 = entornoAvisos();
  assert.equal(e2._avisarCambiosReunion([{ tipo: 'RETITULADA', meeting: reunion({ date: iso(dia(6)) }) }], ahora), 0);
});

test('movida y retitulada a la vez: un solo aviso', () => {
  const e = entornoAvisos();
  const m = reunion({ date: iso(dia(1)), title: 'Nuevo titulo' });
  const n = e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: m, fechaVieja: iso(dia(0)), horaVieja: '16:00' }, { tipo: 'RETITULADA', meeting: m }], ahora);
  assert.equal(n, 1);
});

test('el merge: MOVIDA lleva fechaVieja y horaVieja siempre; sin importar la alarma', () => {
  const m = Object.assign(_reunionDeOutlook(ev(), clients, ahora), { alarm: { enabled: true, datetime: iso(dia(3)) + 'T15:00', recurrence: 'once' } });
  const r = mezclar([m], pay([ev({ fecha: iso(dia(8)) })]));
  const mov = r.cambios.find(c => c.tipo === 'MOVIDA');
  assert.equal(mov.fechaVieja, iso(dia(3)));
  assert.equal(mov.horaVieja, '16:00');
  assert.equal(mov.alarmaVieja, undefined);
});

test('no avisa una cancelada de la semana que viene', () => {
  const e = entornoAvisos();
  const n = e._avisarCambiosReunion([{ tipo: 'CANCELADA', meeting: reunion({ date: iso(dia(6)), status: 'CANCELLED' }) }], ahora);
  assert.equal(n, 0);
  assert.equal(e.disparadas.length, 0);
});

test('no avisa de lo que no importa: NUEVA, ACEPTADA, ya empezada, dia entero', () => {
  const e = entornoAvisos();
  const m = reunion();
  const cambios = [{ tipo: 'NUEVA', meeting: m }, { tipo: 'ACEPTADA', meeting: m },
    { tipo: 'CANCELADA', meeting: reunion({ id: 'a', startTime: '08:00', status: 'CANCELLED' }) },
    { tipo: 'CANCELADA', meeting: reunion({ id: 'b', startTime: '00:00', endTime: '00:00', status: 'CANCELLED' }) }];
  assert.equal(e._avisarCambiosReunion(cambios, ahora), 0);
});

test('no repite el aviso del mismo cambio', () => {
  const e = entornoAvisos();
  const c = [{ tipo: 'CANCELADA', meeting: reunion({ status: 'CANCELLED' }) }];
  assert.equal(e._avisarCambiosReunion(c, ahora), 1);
  assert.equal(e._avisarCambiosReunion(c, ahora), 0);
  assert.equal(e.disparadas.length, 1);
});

test('movida otra vez a otra hora avisa de nuevo (es otro cambio)', () => {
  const e = entornoAvisos();
  e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: reunion({ startTime: '16:00' }) }], ahora);
  const n = e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: reunion({ startTime: '17:00' }) }], ahora);
  assert.equal(n, 1);
});

test('limpia de la marca los cambios de reuniones que ya no existen', () => {
  const e = entornoAvisos();
  e._avisarCambiosReunion([{ tipo: 'CANCELADA', meeting: reunion({ id: 'viva', status: 'CANCELLED' }) },
    { tipo: 'CANCELADA', meeting: reunion({ id: 'muerta', status: 'CANCELLED' }) }], ahora);
  assert.equal(JSON.parse(e.store.lbp_cambios_avisados).length, 2);
  e._avisarCambiosReunion([], ahora, [{ id: 'viva' }]);
  const marca = JSON.parse(e.store.lbp_cambios_avisados);
  assert.equal(marca.length, 1);
  assert.match(marca[0], /viva/);
});

test('una marca corrupta en localStorage no rompe el aviso', () => {
  const e = entornoAvisos();
  e.store.lbp_cambios_avisados = '{no es json';
  assert.equal(e._avisarCambiosReunion([{ tipo: 'CANCELADA', meeting: reunion({ status: 'CANCELLED' }) }], ahora), 1);
});

test('MOVIDA con alarmaVieja cancela en la nube el id base y sus repeticiones', () => {
  const e = entornoAvisos();
  const vieja = { enabled: true, datetime: iso(dia(3)) + 'T15:00', recurrence: 'once', repeatIntervals: [30, 45, 55], auto: true };
  const nueva = reunion({ date: iso(dia(5)), alarm: { datetime: iso(dia(5)) + 'T15:00', recurrence: 'once' } });
  e._soltarAlarmasViejas([{ tipo: 'MOVIDA', meeting: nueva, alarmaVieja: vieja }]);
  const ms = new Date(vieja.datetime).getTime();
  assert.deepEqual(e.canceladas.sort(), [
    'outlook_x1_' + ms, 'outlook_x1_' + ms + '_r1', 'outlook_x1_' + ms + '_r2', 'outlook_x1_' + ms + '_r3'].sort());
});

test('no cancela la alarma vieja si la nueva cae en el mismo instante (seria el mismo id)', () => {
  const e = entornoAvisos();
  const dt = iso(dia(3)) + 'T15:00';
  const m = reunion({ alarm: { datetime: dt, recurrence: 'once' } });
  e._soltarAlarmasViejas([{ tipo: 'MOVIDA', meeting: m, alarmaVieja: { datetime: dt, recurrence: 'once' } }]);
  assert.equal(e.canceladas.length, 0);
});

test('sin alarmaVieja, o en otros tipos, no se cancela nada', () => {
  const e = entornoAvisos();
  e._soltarAlarmasViejas([{ tipo: 'MOVIDA', meeting: reunion() }, { tipo: 'NUEVA', meeting: reunion() },
    { tipo: 'CANCELADA', meeting: reunion() }, { tipo: 'RETITULADA', meeting: reunion() }, { tipo: 'ACEPTADA', meeting: reunion() }]);
  assert.equal(e.canceladas.length, 0);
});

test('una cancelada conserva datetime y repeatIntervals: scheduleAlarms puede limpiar la nube', () => {
  const alarma = { enabled: true, datetime: iso(dia(3)) + 'T15:00', recurrence: 'once', repeatIntervals: [30, 45, 55], auto: true };
  const m = Object.assign(reunion({ date: iso(dia(3)) }), { outlookEventId: UID, alarm: alarma });
  const r = mezclar([m], pay([]));
  const c = r.meetings[0];
  assert.equal(c.status, 'CANCELLED');
  assert.equal(c.alarm.enabled, false);
  assert.equal(c.alarm.datetime, alarma.datetime);
  assert.deepEqual(c.alarm.repeatIntervals, [30, 45, 55]);
  // y scheduleAlarms la lleva por la rama de "terminada" a _cancelEntityCloudAlarms
  const sa = html.slice(html.indexOf('var scheduleAlarms = function'), html.indexOf('var scheduleAlarms = function') + 1200);
  assert.match(sa, /entity\.status === 'CANCELLED'[\s\S]*_cancelEntityCloudAlarms\(entity, alarm\)/);
});

test('_outlookPull y su gancho en la app: al montar, cada hora, con la clave de sync', () => {
  assert.match(html, /window\._outlookPull = function/);
  const pull = cuerpo(html.indexOf('window._outlookPull = function'));
  assert.match(pull, /meeting-proposals\?key=' \+ encodeURIComponent\(/);
  assert.match(pull, /completa !== true/);
  assert.match(pull, /_mergeTombstones\(d\._deletedIds, /);
  assert.match(pull, /_soltarAlarmasViejas/);
  assert.match(html, /setInterval\(doPullOutlook, 60 \* 60 \* 1000\)/);
  assert.match(html, /LBP_VERSION = '5\.69'/);
});

// ── C1 (revision de rama): una reunion CANCELADA tiene que VERSE cancelada ──
// Medido: `todayMeetings` filtraba solo por fecha y `MeetCard` nunca miraba
// `status`, asi que una reunion que el organizador cancelo seguia en «REUNIONES
// DE HOY» con su chip verde «Aceptada», seguia contando en el KPI y era igual a
// las vivas en la lista. Solo su alarma callaba. El diseno eligio «marcar, no
// borrar» para que la vea, y el aviso de una cancelacion de pasado manana se
// callo con el argumento de que «el chip ya lo muestra»: no lo mostraba.
test('el chip de una cancelada dice Cancelada y manda sobre el estado de respuesta', () => {
  const { _chipReunion } = traer(['_reunionCancelada', '_chipReunion']);
  const c = _chipReunion({ status: 'CANCELLED', confirmacion: 'ACEPTADA' });
  assert.equal(c.texto, 'Cancelada');
  assert.equal(c.color, '#F44336');
  assert.equal(_chipReunion({ status: 'SCHEDULED', confirmacion: 'ACEPTADA' }).texto, 'Aceptada');
  assert.equal(_chipReunion({ status: 'SCHEDULED', confirmacion: 'PROPUESTA' }).texto, 'Propuesta');
  // Una reunion que Pepe escribio a mano no lleva chip: no tiene estado de respuesta.
  assert.equal(_chipReunion({ status: 'SCHEDULED' }), null);
  // Pero si la cancelo, el chip rojo igual: lo que importa es que se vea.
  assert.equal(_chipReunion({ status: 'CANCELLED' }).texto, 'Cancelada');
  assert.equal(_chipReunion(null), null);
});

test('una cancelada no cuenta en el KPI de Reuniones de hoy, pero sigue en la lista', () => {
  // La lista sigue mostrandola (el diseno eligio marcar, no borrar); el numero no
  // la cuenta, porque es una cifra que Pepe lee.
  assert.match(html, /var todayMeetings = \(data\.meetings \|\| \[\]\)\.filter\(function\(m\) \{ return m\.date === todayStr; \}\);/);
  assert.match(html, /var todayMeetingsVivas = todayMeetings\.filter\(function\(m\) \{ return !_reunionCancelada\(m\); \}\);/);
  assert.match(html, /'Reuniones','\\uD83D\\uDCC5','#9C68D6',todayMeetingsVivas\.length/);
});

test('la tarjeta de reuniones y REUNIONES DE HOY marcan la cancelada', () => {
  // MeetCard: el titulo tachado y el chip.
  const card = html.slice(html.indexOf('var MeetCard = function MeetCard('), html.indexOf('var _spmeetings = useSortPref'));
  assert.match(card, /_reunionCancelada\(m\)/, 'MeetCard no mira si esta cancelada');
  assert.match(card, /textDecoration: *_reunionCancelada\(m\) *\? *'line-through' *: *'none'/, 'el titulo no se tacha');
  assert.match(card, /_chipReunion\(m\)/, 'la tarjeta no muestra el chip');
  // «REUNIONES DE HOY»: el chip sale de _chipReunion y el titulo se tacha.
  // En el HTML el emoji va escapado como texto (\\uXXXX), no como caracter.
  const hoy = html.slice(html.indexOf('\\uD83D\\uDCC5 REUNIONES DE HOY'), html.indexOf('\\uD83D\\uDCCB TAREAS PARA HOY'));
  assert.match(hoy, /_chipReunion\(m\)/, 'la fila de hoy no usa el chip comun');
  assert.match(hoy, /line-through/, 'la fila de hoy no tacha el titulo de una cancelada');
  assert.ok(!/m\.confirmacion==='PROPUESTA'\?'Propuesta':'Aceptada'/.test(hoy),
            'quedo el chip viejo, que ignora status');
});

// ── I1 (revision de rama): la marca `auto` no sobrevive a una edicion suya ──
// La restriccion dura del diseno: «las alarmas que puso el a mano no se tocan
// nunca». AlarmPanel.update esparcia la alarma existente en cada cambio de
// campo, asi que `auto: true` quedaba pegado, y el merge solo preguntaba por
// `auto === true` antes de recalcularla. Medido: una alarma automatica que el
// APAGO volvia encendida con solo que Outlook retitulara la reunion, y una que
// el RE-HORARIO a las 08:00 volvia a T-60 al moverse la reunion.
function traerUpdate() {
  const i = html.indexOf('var update = function update(patch) {');
  assert.ok(i > 0, 'no encuentro AlarmPanel.update');
  const src = cuerpo(i + 'var update = '.length);
  return new Function('alarm', 'patch',
    'var _objectSpread = Object.assign;\n' +
    'var onChange = function(a) { return a; };\n' +
    'var update = ' + src + ';\n' +
    'return update(patch);');
}

test('tocar un campo de la alarma la deja de marcar como automatica', () => {
  const update = traerUpdate();
  const auto = { enabled: true, datetime: '2026-12-02T15:00', recurrence: 'once', auto: true };
  assert.equal(update(auto, { enabled: false }).auto, false, 'apagarla no borro la marca');
  assert.equal(update(auto, { datetime: '2026-12-02T08:00' }).auto, false, 're-horarearla no borro la marca');
  // Los demas modulos nunca leen `auto`: agregarla no les cambia nada.
  assert.equal(update(auto, { enabled: false }).datetime, '2026-12-02T15:00');
});

test('una alarma automatica que Pepe APAGO no vuelve encendida cuando Outlook retitula', () => {
  const update = traerUpdate();
  const base = _reunionDeOutlook(ev(), clients, ahora);
  assert.equal(base.alarm.auto, true);
  // Pepe abre el panel y la apaga: eso es lo que guarda la app.
  const suya = Object.assign({}, base, { alarm: update(base.alarm, { enabled: false }) });
  const r = mezclar([suya], pay([ev({ titulo: 'Reunión Mensual (SE PASA A LAS 5)' })]));
  const m = r.meetings[0];
  assert.equal(m.title, 'Reunión Mensual (SE PASA A LAS 5)', 'el retitulo tiene que entrar igual');
  assert.equal(m.alarm.enabled, false, 'la alarma que Pepe apago volvio a encenderse');
});

test('una alarma automatica que Pepe RE-HORARIO no se resetea a T-60 cuando la reunion se mueve', () => {
  const update = traerUpdate();
  const base = _reunionDeOutlook(ev(), clients, ahora);
  const suya = Object.assign({}, base, { alarm: update(base.alarm, { datetime: iso(dia(3)) + 'T08:00' }) });
  const r = mezclar([suya], pay([ev({ inicio: '18:00', fin: '18:30' })]));
  const m = r.meetings[0];
  assert.equal(m.startTime, '18:00', 'la reunion tiene que moverse igual');
  assert.equal(m.alarm.datetime, iso(dia(3)) + 'T08:00', 'le pisaron la hora que el eligio');
  // Y no se le pide a la nube que suelte una alarma que es de el.
  assert.equal(r.cambios.filter(c => c.tipo === 'MOVIDA')[0].alarmaVieja, undefined);
});

test('dato viejo: una alarma con auto:true pero apagada se trata como suya', () => {
  // En su telefono ya hay alarmas automaticas que apago ANTES de este arreglo:
  // les quedo `auto: true`. `enabled === false` tambien es una decision suya.
  const base = _reunionDeOutlook(ev(), clients, ahora);
  const vieja = Object.assign({}, base, { alarm: Object.assign({}, base.alarm, { enabled: false }) });
  const r = mezclar([vieja], pay([ev({ inicio: '18:00', fin: '18:30' })]));
  assert.equal(r.meetings[0].alarm.enabled, false, 'se encendio sola');
  assert.equal(r.meetings[0].alarm.datetime, base.alarm.datetime, 'le movio la hora');
});

test('las 12 alarmas del 13-nov (sin clave auto) siguen intactas', () => {
  const base = _reunionDeOutlook(ev(), clients, ahora);
  const sinMarca = { enabled: true, datetime: iso(dia(3)) + 'T10:00', recurrence: 'once' };
  const m = Object.assign({}, base, { alarm: sinMarca });
  const r = mezclar([m], pay([ev({ inicio: '18:00' })]));
  assert.deepEqual(r.meetings[0].alarm, sinMarca);
});

// ── I5 (revision de rama): un cambio real se tiraba a la basura cada hora ───
// _outlookPull salia temprano si `cambios` venia vacio, pero el merge avisa que
// cambio algo devolviendo un array NUEVO, y hay un camino que actualiza la
// reunion sin emitir ninguna entrada en `cambios`: `conf !== m.confirmacion`
// cuando no es una subida a ACEPTADA. Eso es justo lo que produce Outlook
// cuando una respuesta se retira o se resetea: el chip se quedaba en «Aceptada»
// y el recalculo se perdia, hora tras hora, para siempre.
function entornoPull(datos, payload) {
  const marcas = { setData: [], soltadas: null, avisadas: null, url: null };
  const nom = ['defaultAlarm', '_fechaLocal', '_esDiaEntero', '_alarmaReunionGcal',
    '_clienteDeOrganizador', '_reunionDeOutlook', '_mezclarOutlook'];
  const pullSrc = cuerpo(html.indexOf('window._outlookPull = function') + 'window._outlookPull = '.length);
  const cabeza =
    'var localStorage = { getItem: function(){ return "lbp_prueba"; } };\n' +
    'var window = { LBP_WORKER_URL: "http://w", _getDataGlobal: function(){ return datos; },\n' +
    '  _mergeTombstones: function(a, b){ return Object.assign({}, a, b); } };\n' +
    alias + ';\n' + detect + ';\n' +
    'var fetch = function(u){ marcas.url = u; return Promise.resolve({ ok: true, json: function(){ return Promise.resolve(payload); } }); };\n' +
    'var _soltarAlarmasViejas = function(c){ marcas.soltadas = c; };\n' +
    'var _avisarCambiosReunion = function(c){ marcas.avisadas = c; };\n' +
    'var _avisarReunionesNuevas = function(){};\n';
  const pull = new Function('datos', 'payload', 'marcas',
    cabeza + nom.map(fuente).join('\n') +
    '\nreturn (' + pullSrc + ')(function(fn){ marcas.setData.push(fn(datos)); });')(datos, payload, marcas);
  return { pull, marcas };
}

test('una respuesta retirada (ACEPTADA a PROPUESTA) se guarda, no se tira cada hora', async () => {
  const ya = Object.assign(_reunionDeOutlook(ev({ estado: 'ACEPTADA' }), clients, ahora), { confirmacion: 'ACEPTADA' });
  // El merge ya hace lo suyo: array nuevo, pero sin ninguna entrada en cambios.
  const r = mezclar([ya], pay([ev({ estado: 'PROPUESTA' })]));
  assert.notEqual(r.meetings, [ya], 'el merge tiene que devolver otro array');
  assert.equal(r.meetings[0].confirmacion, 'PROPUESTA');
  assert.deepEqual(r.cambios, [], 'este camino no emite cambios: de ahi el bug');
  // Y _outlookPull tiene que guardarlo igual.
  const datos = { meetings: [ya], clients: clients, _deletedIds: {} };
  const e = entornoPull(datos, pay([ev({ estado: 'PROPUESTA' })]));
  await e.pull;
  assert.equal(e.marcas.setData.length, 1, 'no llamo a setData: el chip se queda en Aceptada');
  assert.equal(e.marcas.setData[0].meetings[0].confirmacion, 'PROPUESTA');
});

test('sin ningun cambio _outlookPull no toca setData (no empuja el blob de 4 MB cada hora)', async () => {
  const ya = _reunionDeOutlook(ev(), clients, ahora);
  const datos = { meetings: [ya], clients: clients, _deletedIds: {} };
  const e = entornoPull(datos, pay([ev()]));
  await e.pull;
  assert.equal(e.marcas.setData.length, 0);
  assert.match(e.marcas.url, /\/meeting-proposals\?key=lbp_prueba/);
});

test('una lectura incompleta no llama a setData', async () => {
  const datos = { meetings: [], clients: clients, _deletedIds: {} };
  const e = entornoPull(datos, pay([ev()], false));
  await e.pull;
  assert.equal(e.marcas.setData.length, 0);
});

test('una reunion nueva sigue guardandose y avisandose', async () => {
  const datos = { meetings: [], clients: clients, _deletedIds: {} };
  const e = entornoPull(datos, pay([ev()]));
  const cambios = await e.pull;
  assert.equal(e.marcas.setData.length, 1);
  assert.equal(e.marcas.setData[0].meetings.length, 1);
  assert.deepEqual(cambios.map(c => c.tipo), ['NUEVA']);
  assert.deepEqual(e.marcas.avisadas.map(c => c.tipo), ['NUEVA']);
});

// ── I6 (revision de rama): una reunion que solo se alarga no «se movio» ─────
// El merge mete `endTime` dentro de `movida`, asi que un organizador que
// extiende la reunion de 16:30 a 17:30 producia el push «Reunión movida — de
// hoy 16:00 a hoy 16:00». Texto sin sentido en el unico canal del que depende
// toda la credibilidad de esto. La alarma no se toca (el instante no cambio):
// lo unico que sobra es el aviso.
test('alargar una reunion actualiza endTime pero NO avisa que se movio', () => {
  const e = entornoAvisos();
  const n = e._avisarCambiosReunion([{
    tipo: 'MOVIDA', meeting: reunion({ endTime: '17:30' }),
    fechaVieja: iso(dia(0)), horaVieja: '16:00'
  }], ahora);
  assert.equal(n, 0, 'avisaria «de hoy 16:00 a hoy 16:00»');
  assert.equal(e.disparadas.length, 0);
});

test('el registro de una reunion alargada SI se actualiza (solo el aviso se calla)', () => {
  const m = Object.assign(reunion({ date: iso(dia(3)), endTime: '16:30' }), { outlookEventId: UID });
  const r = mezclar([m], pay([ev({ fin: '17:30' })]));
  assert.equal(r.meetings[0].endTime, '17:30');
  const mov = r.cambios.filter(c => c.tipo === 'MOVIDA')[0];
  assert.ok(mov, 'el merge sigue emitiendo MOVIDA: el aviso es quien decide');
  assert.equal(mov.fechaVieja, iso(dia(3)));
  assert.equal(mov.horaVieja, '16:00');
});

test('una movida de verdad (otra hora, o otro dia) sigue avisando', () => {
  const e = entornoAvisos();
  assert.equal(e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: reunion({ startTime: '17:00' }),
    fechaVieja: iso(dia(0)), horaVieja: '16:00' }], ahora), 1);
  const e2 = entornoAvisos();
  assert.equal(e2._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: reunion({ date: iso(dia(1)) }),
    fechaVieja: iso(dia(0)), horaVieja: '16:00' }], ahora), 1);
});

test('una alargada que ADEMAS se retitulo avisa el retitulo', () => {
  // El aviso de RETITULADA se callaba cuando habia una MOVIDA del mismo id,
  // porque «el aviso de movida ya trae el titulo». Si la movida no avisa, el
  // retitulo tiene que salir: es el cambio que Pepe tiene que ver.
  const e = entornoAvisos();
  const m = reunion({ endTime: '17:30', title: 'Reunión Mensual (SE PASA A LAS 5)' });
  const n = e._avisarCambiosReunion([
    { tipo: 'MOVIDA', meeting: m, fechaVieja: iso(dia(0)), horaVieja: '16:00' },
    { tipo: 'RETITULADA', meeting: m }
  ], ahora);
  assert.equal(n, 1);
  assert.match(e.disparadas[0].titulo, /retitulada/i);
});

// ── #22 (revision de rama): una etiqueta por tipo de cambio ────────────────
// Con `'lbp_cambio_' + m.id`, una MOVIDA leida a las 09:00 y una CANCELADA
// leida a las 10:00 se reemplazaban en la bandeja del telefono y solo
// sobrevivia la ultima.
test('la etiqueta del aviso lleva el tipo: una movida y una cancelada no se tapan', () => {
  const e = entornoAvisos();
  e._avisarCambiosReunion([{ tipo: 'MOVIDA', meeting: reunion({ startTime: '17:00' }),
    fechaVieja: iso(dia(0)), horaVieja: '16:00' }], ahora);
  e._avisarCambiosReunion([{ tipo: 'CANCELADA', meeting: reunion({ startTime: '17:00', status: 'CANCELLED' }) }], ahora);
  assert.equal(e.disparadas.length, 2);
  assert.notEqual(e.disparadas[0].tag, e.disparadas[1].tag);
  assert.match(e.disparadas[0].tag, /MOVIDA/);
  assert.match(e.disparadas[1].tag, /CANCELADA/);
  assert.ok(e.disparadas.every(d => d.tag.indexOf('outlook_x1') >= 0), 'la etiqueta tiene que seguir llevando el id');
});

// ── I7 (revision de rama): el dominio no puede inventar la franquicia ──────
// `dominio.split('.')[0]` entraba a window._detectClientId, cuyo match
// `\bNAME\b` toma `-` y los digitos como limite de palabra: `ax-logistica.com`
// caia en AX y `ck-partners.com` en CK. Y los nombres de los CONTACTOS tambien
// son candidatos. `clientId` manda la ficha de la marca, la Vista 360° y el
// informe semanal: una reunion archivada en la franquicia equivocada se lee
// como un hecho en el registro de esa marca.
const clientesMarcas = [
  { id: 'ax', name: 'Armani Exchange', businessName: 'AX', contacts: [] },
  { id: 'ck', name: 'Calvin Klein', businessName: 'CK', contacts: [{ name: 'Habib Rodriguez', email: 'habib@calvinklein.com' }] },
  { id: 'mg', name: 'Mango', businessName: 'Mango', contacts: [] }
];
const cliente = (correo, lista) => _clienteDeOrganizador(correo, lista || clientesMarcas);

test('un dominio que solo CONTIENE la sigla no resuelve ninguna franquicia', () => {
  assert.equal(cliente('x@ax-logistica.com'), null, 'ax-logistica.com cayo en AX');
  assert.equal(cliente('x@ck-partners.com'), null, 'ck-partners.com cayo en CK');
  assert.equal(cliente('x@ax.systems'), null);
  // Y tampoco por el nombre de una persona metido en el dominio.
  assert.equal(cliente('x@habib-consulting.com'), null, 'el nombre de un contacto resolvio el cliente');
});

test('la lista exacta DOMINIOS_CLIENTE sigue resolviendo', () => {
  const c = cliente('laura@mango.com');
  assert.ok(c, 'mango.com tiene que seguir cayendo en Mango');
  assert.equal(c.id, 'mg');
});

test('el dominio exacto de un contacto sigue resolviendo', () => {
  const c = cliente('otra.persona@calvinklein.com');
  assert.ok(c);
  assert.equal(c.id, 'ck');
});

test('_clienteDeOrganizador ya no parte el dominio en pedazos', () => {
  // Sin los comentarios: el comentario del arreglo nombra el termino viejo.
  const src = fuente('_clienteDeOrganizador').split('\n')
    .filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.ok(!/dominio\.split\('\.'\)/.test(src), "quedo el termino dominio.split('.')[0]");
});

// ── I4 (revision de rama): esto SOLO LEE, no escribe en Google Calendar ────
// _gcalFlushPushQueue auto-sincroniza toda reunion sin `gcalEventId`, y lo
// llama el callback del token. Las reuniones importadas de Outlook no tienen
// `gcalEventId`, asi que la proxima vez que un token de Google quedara vivo se
// iban a CREAR en su calendario personal de Google: una escritura a un sistema
// externo que nadie pidio, en un diseno cuyo alcance dice «esto solo lee». Las
// de dia entero ademas irian con start === end.
function flushGcal(meetings) {
  const empujadas = [];
  const src = cuerpo(html.indexOf('window._gcalFlushPushQueue = function') + 'window._gcalFlushPushQueue = '.length);
  new Function('meetings', 'empujadas',
    'var console = { log: function(){} };\n' +
    'var setTimeout = function(fn){ fn(); };\n' +   // el retardo de 1,5 s se corre al toque
    'var window = { _gcalPushQueue: [], _getDataGlobal: function(){ return { meetings: meetings }; },\n' +
    '  _gcalPush: function(m){ empujadas.push(m.id); } };\n' +
    'var flush = ' + src + ';\n' +
    'window._gcalFlushPushQueue = flush;\n' +
    'flush();')(meetings, empujadas);
  return empujadas;
}

test('una reunion importada de Outlook no se auto-sincroniza a Google Calendar', () => {
  const deOutlook = _reunionDeOutlook(ev(), clients, ahora);
  const aMano = { id: 'man1', title: 'Reunión a mano', date: iso(dia(2)), startTime: '10:00', endTime: '11:00', status: 'SCHEDULED' };
  const empujadas = flushGcal([deOutlook, aMano]);
  assert.deepEqual(empujadas, ['man1'], 'se iba a crear la de Outlook en su Google Calendar');
});

test('la auto-sincronizacion sigue salteando las ya sincronizadas y las canceladas', () => {
  assert.deepEqual(flushGcal([{ id: 'a', gcalEventId: 'g1' }]), []);
  assert.deepEqual(flushGcal([{ id: 'b', status: 'CANCELLED' }]), []);
  assert.deepEqual(flushGcal([{ id: 'c' }]), ['c']);
});

test('el boton "Mandar a Google Calendar" de la tarjeta sigue existiendo', () => {
  // Que la auto-sincronizacion no las toque no quiere decir que Pepe no pueda
  // mandar una a mano: ese camino es una decision suya y tiene que seguir.
  const card = html.slice(html.indexOf('var MeetCard = function MeetCard('), html.indexOf('var _spmeetings = useSortPref'));
  assert.match(card, /'Mandar a Google Calendar'/);
  assert.match(card, /if\(window\._gcalPush\)window\._gcalPush\(m\);/);
});
