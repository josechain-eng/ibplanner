// El detector y la vara del silencio del asistente proactivo. Son las tres
// funciones puras que deciden si suena el telefono; viven en worker.js y se
// extraen del TEXTO de worker.js (balanceando llaves, como feriados_moviles),
// asi la prueba corre el codigo real y worker.js no cambia de forma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El Worker de Cloudflare corre en UTC; las pruebas tambien, sea cual sea la zona
// de la maquina (aqui es America/La_Paz y ocultaria el bug de las horas sin zona).
// Hay una prueba abajo que falla si esta linea deja de tener efecto.
process.env.TZ = 'UTC';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'worker.js'), 'utf8');

function fuenteFuncion(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre + ' en worker.js');
  let nivel = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}' && --nivel === 0) return src.slice(i, j + 1);
  }
  assert.fail('no cierra ' + nombre);
}
// Desde el 26-nov el detector usa dos cosas de nivel de modulo: _msBolivia (la
// regla de fechas, compartida con _prioAbiertas) y PRIO_PESO (para no dejar caer
// una tarea prioritaria a "puede esperar").
function fuenteVar(nombre) {
  const i = src.indexOf('var ' + nombre + ' = {');
  assert.ok(i > 0, 'no encuentro var ' + nombre + ' en worker.js');
  return src.slice(i, src.indexOf('};', i) + 2);
}
const nombres = ['_msBolivia', '_asisDetectar', '_asisPasaLaVara', '_asisRecortar'];
const { _asisDetectar, _asisPasaLaVara, _asisRecortar } = new Function(
  fuenteVar('PRIO_PESO') + '\n' + nombres.map(fuenteFuncion).join('\n')
  + '\nreturn { _asisDetectar: _asisDetectar, _asisPasaLaVara: _asisPasaLaVara, _asisRecortar: _asisRecortar };'
)();

// La vara (martes 12:00 Bolivia = 16:00 UTC)
const MARTES = Date.UTC(2026, 10, 24, 16, 0);
const SABADO = Date.UTC(2026, 10, 28, 16, 0);
const it = (u) => ({ id: 'x' + Math.random(), urgencia: u });

test('un solo "ya" manda', () => assert.equal(_asisPasaLaVara([it('ya')], MARTES).manda, true));
test('dos "hoy" mandan', () => assert.equal(_asisPasaLaVara([it('hoy'), it('hoy')], MARTES).manda, true));
test('UN solo "hoy" NO manda', () => assert.equal(_asisPasaLaVara([it('hoy')], MARTES).manda, false));
test('tres "puede_esperar" NO mandan', () =>
  assert.equal(_asisPasaLaVara([it('puede_esperar'), it('puede_esperar'), it('puede_esperar')], MARTES).manda, false));
test('lista vacia NO manda', () => assert.equal(_asisPasaLaVara([], MARTES).manda, false));
test('sabado: dos "hoy" NO mandan', () => assert.equal(_asisPasaLaVara([it('hoy'), it('hoy')], SABADO).manda, false));
test('sabado: un "ya" SI manda', () => assert.equal(_asisPasaLaVara([it('ya')], SABADO).manda, true));
test('el tope es 5 y los "ya" quedan adelante', () => {
  const r = _asisRecortar([it('hoy'), it('hoy'), it('hoy'), it('hoy'), it('hoy'), it('ya')]);
  assert.equal(r.length, 5);
  assert.equal(r[0].urgencia, 'ya');
});

// El detector
test('aduana vencida sale primera y antes que una alarma vieja', () => {
  const data = { imports: [{ id: 'i1', limiteAduana: '2026-11-20', clientId: null }],
                 tasks: [{ id: 't1', title: 'T', status: 'INBOX',
                           alarm: { enabled: true, datetime: '2026-11-01T09:00' } }] };
  const s = _asisDetectar(data, MARTES);
  assert.equal(s[0].id, 'aduana_i1');
  assert.ok(s.some(x => x.id === 'stale_t1'));
});
test('una tarea DONE no genera senal', () => {
  const data = { tasks: [{ id: 't1', title: 'T', status: 'DONE',
                           alarm: { enabled: true, datetime: '2026-11-01T09:00' } }] };
  assert.equal(_asisDetectar(data, MARTES).length, 0);
});
test('un blob vacio o incompleto no explota', () => {
  assert.deepEqual(_asisDetectar({}, MARTES), []);
  assert.deepEqual(_asisDetectar(null, MARTES), []);
});
test('los ids son estables entre dos corridas', () => {
  const data = { imports: [{ id: 'i1', limiteAduana: '2026-11-25' }] };
  assert.deepEqual(_asisDetectar(data, MARTES).map(x => x.id),
                   _asisDetectar(data, MARTES + 1000).map(x => x.id));
});

// --- Pruebas agregadas: lo que el brief no fija y alguien puede romper ---
const aduana = (lim, extra) => Object.assign({ id: 'i', limiteAduana: lim }, extra || {});
const urg = (data, ahora) => _asisDetectar(data, ahora || MARTES).map(x => x.urgencia);

test('urgencia de aduana: <=1 dia "ya", <=7 "hoy", mas lejos no es senal', () => {
  // MARTES 24-nov Bolivia. 20-nov = vencido; 24 = hoy (0); 25 = 1; 26 = 2; 1-dic = 7; 2-dic = 8.
  assert.deepEqual(urg({ imports: [aduana('2026-11-20')] }), ['ya']);
  assert.deepEqual(urg({ imports: [aduana('2026-11-24')] }), ['ya']);
  assert.deepEqual(urg({ imports: [aduana('2026-11-25')] }), ['ya']);
  assert.deepEqual(urg({ imports: [aduana('2026-11-26')] }), ['hoy']);
  assert.deepEqual(urg({ imports: [aduana('2026-12-01')] }), ['hoy']);
  assert.deepEqual(urg({ imports: [aduana('2026-12-02')] }), []);
});
test('los dias de aduana cuentan en dia calendario de Bolivia, no en horas', () => {
  // 23:30 Bolivia del 24-nov = 03:30 UTC del 25. Para Bolivia hoy sigue siendo 24.
  const tarde = Date.UTC(2026, 10, 25, 3, 30);
  const s = _asisDetectar({ imports: [aduana('2026-11-25')] }, tarde);
  assert.equal(s[0].dias, 1);
  const madrugada = Date.UTC(2026, 10, 24, 4, 30); // 00:30 Bolivia del 24
  assert.equal(_asisDetectar({ imports: [aduana('2026-11-25')] }, madrugada)[0].dias, 1);
});
test('despacho RECIBIDO o CANCELADO no genera senal', () => {
  assert.equal(_asisDetectar({ imports: [aduana('2026-11-20', { status: 'RECIBIDO' })] }, MARTES).length, 0);
  assert.equal(_asisDetectar({ imports: [aduana('2026-11-20', { status: 'CANCELADO' })] }, MARTES).length, 0);
});
test('las aduanas salen por dias ascendente, adelante de todo lo demas', () => {
  const data = {
    imports: [aduana('2026-11-28', { id: 'b' }), aduana('2026-11-20', { id: 'a' }), aduana('2026-11-25', { id: 'c' })],
    tasks: [{ id: 't1', title: 'T', status: 'INBOX', alarm: { enabled: true, datetime: '2026-11-01T09:00' } }],
  };
  assert.deepEqual(_asisDetectar(data, MARTES).map(x => x.id),
    ['aduana_a', 'aduana_c', 'aduana_b', 'stale_t1']);
});
test('una senal que no es de aduana es "puede_esperar" y trae el contrato completo', () => {
  const s = _asisDetectar({ tasks: [{ id: 't1', title: 'Pagar', status: 'INBOX',
    alarm: { enabled: true, datetime: '2026-11-01T09:00' } }] }, MARTES);
  assert.equal(s.length, 1);
  assert.deepEqual(Object.keys(s[0]).sort(), ['dias', 'id', 'refId', 'ruta', 'texto', 'tipo', 'urgencia']);
  assert.equal(s[0].urgencia, 'puede_esperar');
  assert.equal(s[0].refId, 't1');
  assert.equal(s[0].dias, 23);
});
test('alarma de hoy sin completar -> today_; de hace 1-60 dias -> stale_; de 61 -> nada', () => {
  const t = (id, dt) => ({ id, title: 'T', status: 'INBOX', alarm: { enabled: true, datetime: dt } });
  const ids = (d) => _asisDetectar({ tasks: [d] }, MARTES).map(x => x.id);
  assert.deepEqual(ids(t('a', '2026-11-24T08:00')), ['today_a']);   // 4h antes, hoy
  assert.deepEqual(ids(t('b', '2026-11-23T08:00')), ['stale_b']);   // 1 dia
  assert.deepEqual(ids(t('c', '2026-09-25T08:00')), ['stale_c']);   // 60 dias
  assert.deepEqual(ids(t('d', '2026-09-24T08:00')), []);            // 61 dias
  assert.deepEqual(ids(t('e', '2026-11-24T14:00')), []);            // 14:00 Bolivia = 18:00 UTC: aun no suena
  assert.deepEqual(ids({ ...t('f', '2026-11-23T08:00'), alarm: { enabled: false, datetime: '2026-11-23T08:00' } }), []);
});
test('reunion de ayer sin tareas posteriores -> followup_; con una tarea creada despues, no', () => {
  const m = { id: 'm1', title: 'Reunion', date: '2026-11-23', startTime: '10:00' };
  assert.deepEqual(_asisDetectar({ meetings: [m] }, MARTES).map(x => x.id), ['followup_m1']);
  const despues = Date.UTC(2026, 10, 23, 18, 0); // 14:00 Bolivia, despues de las 10:00
  assert.deepEqual(_asisDetectar({ meetings: [m], tasks: [{ id: 'z', title: 'Z', status: 'DONE', createdAt: despues }] }, MARTES), []);
  assert.deepEqual(_asisDetectar({ meetings: [{ ...m, date: '2026-11-22' }] }, MARTES), []);
});
test('proyecto sin actividad >10 dias -> proj_; en pausa o reciente no', () => {
  const hace = (d) => MARTES - d * 86400000;
  const ids = (p) => _asisDetectar({ projects: [p] }, MARTES).map(x => x.id);
  assert.deepEqual(ids({ id: 'p1', name: 'P', status: 'ACTIVE', updatedAt: hace(11) }), ['proj_p1']);
  assert.deepEqual(ids({ id: 'p1', name: 'P', status: 'ACTIVE', updatedAt: hace(10) }), []);
  assert.deepEqual(ids({ id: 'p1', name: 'P', status: 'ON_HOLD', updatedAt: hace(40) }), []);
});
test('cliente activo >30 dias sin reunion -> client_; inactivo o con reunion reciente no', () => {
  const hace = (d) => MARTES - d * 86400000;
  const ids = (d) => _asisDetectar(d, MARTES).map(x => x.id);
  assert.deepEqual(ids({ clients: [{ id: 'c1', name: 'C', status: 'ACTIVE', createdAt: hace(31) }] }), ['client_c1']);
  assert.deepEqual(ids({ clients: [{ id: 'c1', name: 'C', status: 'LEAD', createdAt: hace(90) }] }), []);
  assert.deepEqual(ids({ clients: [{ id: 'c1', name: 'C', status: 'ACTIVE', createdAt: hace(90) }],
                         meetings: [{ id: 'm', clientId: 'c1', date: '2026-11-10' }] }), []);
});
test('la vara dice por que (motivo no vacio) y el recorte no muta ni pierde el orden', () => {
  assert.ok(_asisPasaLaVara([], MARTES).motivo.length > 0);
  assert.ok(_asisPasaLaVara([it('ya')], MARTES).motivo.length > 0);
  const entrada = [{ id: 'a', urgencia: 'puede_esperar' }, { id: 'b', urgencia: 'ya' }, { id: 'c', urgencia: 'hoy' }];
  const r = _asisRecortar(entrada);
  assert.deepEqual(r.map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(entrada.map(x => x.id), ['a', 'b', 'c']);
});
test('el fin de semana se mide en hora de Bolivia, no en UTC', () => {
  const dos = [it('hoy'), it('hoy')];
  const viernes22 = Date.UTC(2026, 10, 28, 2, 0);  // vie 27-nov 22:00 Bolivia = sab 02:00 UTC
  const domingo22 = Date.UTC(2026, 10, 30, 2, 0);  // dom 29-nov 22:00 Bolivia = lun 02:00 UTC
  assert.equal(_asisPasaLaVara(dos, viernes22).manda, true);
  assert.equal(_asisPasaLaVara(dos, domingo22).manda, false);
});
test('la zona de la prueba es UTC de verdad (si no, la prueba de horas sin zona no prueba nada)', () => {
  assert.equal(new Date('2026-11-24T14:00').toISOString(), '2026-11-24T14:00:00.000Z');
});
test('una tarea DONE con alarma de HOY no genera senal (regla 1a)', () => {
  const data = { tasks: [{ id: 't1', title: 'T', status: 'DONE', alarm: { enabled: true, datetime: '2026-11-24T08:00' } }] };
  assert.deepEqual(_asisDetectar(data, MARTES), []);
});
test('la alarma de hoy sin completar es "hoy": una sola no manda, dos si', () => {
  const t = (id) => ({ id, title: 'T', status: 'INBOX', alarm: { enabled: true, datetime: '2026-11-24T08:00' } });
  const uno = _asisDetectar({ tasks: [t('a')] }, MARTES);
  assert.deepEqual(uno.map(x => [x.id, x.urgencia]), [['today_a', 'hoy']]);
  assert.equal(_asisPasaLaVara(uno, MARTES).manda, false);
  const dos = _asisDetectar({ tasks: [t('a'), t('b')] }, MARTES);
  assert.equal(_asisPasaLaVara(dos, MARTES).manda, true);
});

// --- #9: los dos datos que el detector del worker perdio contra _lbpAlertas ---
test('la linea de aduana lleva los tributos en Bs, como _lbpAlertas', () => {
  // El numero es lo que le da un "porque" verificable a un item de aduana, y
  // viaja ademas en el cuerpo del push de la regla dura. _lbpAlertas lo pone
  // (' · Bs ' + tributos) y el detector del worker lo habia perdido.
  const s = _asisDetectar({ imports: [{ id: 'i1', limiteAduana: '2026-11-25', tributos: '14.341' }] }, MARTES);
  assert.ok(s[0].texto.includes('Bs 14.341'), 'falta la cifra de tributos: ' + s[0].texto);
  assert.ok(s[0].texto.indexOf('aduana') < s[0].texto.indexOf('Bs'), 'la cifra va al final de la linea');
  // 14.341 es catorce mil trescientos cuarenta y uno, no catorce con 341: el
  // punto seguido de tres digitos es separador de miles (la misma regla de _impNum).
  const n = _asisDetectar({ imports: [{ id: 'i1', limiteAduana: '2026-11-25', tributos: 2500 }] }, MARTES);
  assert.ok(n[0].texto.includes('Bs 2.500'), 'un numero suelto tambien se agrupa: ' + n[0].texto);
  // Sin tributos (o en cero) no se escribe un "Bs" vacio.
  [undefined, '', 0, 'nada'].forEach(function (t) {
    const v = _asisDetectar({ imports: [{ id: 'i1', limiteAduana: '2026-11-25', tributos: t }] }, MARTES);
    assert.ok(!/Bs/.test(v[0].texto), 'con tributos ' + JSON.stringify(t) + ' no va ningun Bs');
  });
});

test('la alarma de hoy dice hace cuantas horas sono, como _lbpAlertas', () => {
  // MARTES = 12:00 de Bolivia. Una alarma de las 8:00 sono hace 4 horas.
  const t = (dt) => ({ id: 'a', title: 'Pagar Mango', status: 'INBOX', alarm: { enabled: true, datetime: dt } });
  const s = _asisDetectar({ tasks: [t('2026-11-24T08:00')] }, MARTES);
  assert.ok(s[0].texto.includes('(hace 4h)'), 'falta el "(hace Nh)": ' + s[0].texto);
  assert.ok(s[0].texto.includes('sin completar'), 'y el resto de la linea sigue igual');
  // Menos de una hora: no se inventa un "(hace 0h)".
  const r = _asisDetectar({ tasks: [t('2026-11-24T11:30')] }, MARTES);
  assert.ok(!/hace/.test(r[0].texto), 'con media hora no se escribe "(hace 0h)": ' + r[0].texto);
});
