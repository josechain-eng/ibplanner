// La app del asistente proactivo (v5.75): la ventana, las decisiones por item y
// la tarjeta del Home.
//
// La zona se fija en UTC a proposito: este Mac corre en America/La_Paz y una
// prueba de fechas que pasa solo por la zona del equipo no prueba nada (una
// tarea anterior de este mismo plan dejo una guardia que no podia fallar porque
// la suite estaba sin fijar). Lo que SI necesita la zona de Bolivia --la
// comparacion local contra UTC-- se corre aparte, en un proceso hijo con
// TZ=America/La_Paz, porque dentro de UTC local y UTC son lo mismo y la
// diferencia seria invisible.
//
// React compilado no se monta en Node: las funciones puras se extraen y se
// ejecutan de verdad; del bloque del Home y de la ventana se afirma la
// estructura del codigo. El clic real y el scroll se miran en el navegador.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
function fuenteFn(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  return cuerpo(i) + '\n';
}
function fuenteWin(nombre) {
  const i = html.indexOf('window.' + nombre + ' = function');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i) + ';\n';
}
function fuenteObj(nombre) {
  const i = html.indexOf('window.' + nombre + ' = {');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i) + ';\n';
}

// Las fuentes que se ejecutan en este proceso Y en el hijo con TZ de Bolivia.
const FUENTES = fuenteFn('_fechaLocal') +
  fuenteObj('_LBP_ASIS_URG') + fuenteObj('_LBP_ASIS_RUTAS') + fuenteObj('_LBP_ASIS_DECISIONES') +
  fuenteWin('_lbpAsisUrg') + fuenteWin('_lbpAsisFrescos') +
  fuenteWin('_lbpAsisDecidir') + fuenteWin('_lbpAsisDestino');

const win = new Function('var window = {};\n' + FUENTES + 'return window;')();

// Corre una expresion con las mismas fuentes pero en hora de Bolivia.
function enLaPaz(expr) {
  const guion = 'var window = {};\n' + FUENTES +
    'process.stdout.write(JSON.stringify((function(){ ' + expr + ' })()));';
  return JSON.parse(execFileSync(process.execPath, ['-e', guion], {
    env: Object.assign({}, process.env, { TZ: 'America/La_Paz' }),
    encoding: 'utf8',
  }));
}

// ── Los tres trozos de render que se afirman por su texto ──────────────────
const b0 = html.indexOf('alertsVisible && ');
const b1 = html.indexOf('"Quick Actions"', b0);
const bloque = b0 > 0 && b1 > b0 ? html.slice(b0, b1) : '';
const v0 = html.indexOf('/*VENTANA_ALERTAS*/');
const v1 = html.indexOf('/*FIN_VENTANA_ALERTAS*/', v0);
const ventana = v0 > 0 && v1 > v0 ? html.slice(v0, v1) : '';
const t0 = html.indexOf('/*TARJETA_ASIS*/');
const t1 = html.indexOf('/*FIN_TARJETA_ASIS*/', t0);
const tarjeta = t0 > 0 && t1 > t0 ? html.slice(t0, t1) : '';
// Sin los comentarios: nombran lo que NO hay que hacer (toISOString) y un
// `assert.ok(!/.../)` sobre el texto crudo cazaria el comentario, no el codigo.
const tarjetaCodigo = tarjeta.replace(/^\s*\/\/.*$/gm, '');
// El encabezado de la tarjeta del Home, donde vive el titulo.
const e0 = html.indexOf("background:'rgba(156,104,214,.12)'");
const e1 = html.indexOf("brfOpen&&/*#__PURE__*/React.createElement(\"div\",{style:{padding:'0 14px 14px'}}", e0);
const encabezado = e0 > 0 && e1 > e0 ? html.slice(e0, e1) : '';

// ── La FILA de la ventana, renderizada de verdad ───────────────────────────
// React compilado no se monta en Node, pero `React.createElement` es una funcion
// como cualquier otra: la fila se extrae por sus marcas y se ejecuta con un
// createElement de mentira que devuelve el arbol como datos. Asi "un refId
// muerto no dibuja el tilde" se prueba por COMPORTAMIENTO y no por un regex
// sobre el JSX, que es exactamente el modo de falla que nombra el plan: el
// regex sigue verde aunque el tilde se dibuje siempre.
const f0 = html.indexOf('/*FILA_ASIS*/');
const f1 = html.indexOf('/*FIN_FILA_ASIS*/', f0);
assert.ok(f0 > 0 && f1 > f0, 'no encuentro la fila del asistente (/*FILA_ASIS*/)');
const fuenteFila = html.slice(f0 + '/*FILA_ASIS*/'.length, f1);

function pintarFila(item, data) {
  const log = { completadas: [], decididas: [], vistas: [], navegadas: [], cerrada: 0 };
  const React = {
    createElement: function (tipo, props) {
      return { tipo: tipo, props: props || {}, hijos: Array.prototype.slice.call(arguments, 2) };
    },
  };
  const fila = new Function('window', 'React', 'data', 'completeTask', '_asisDecidir',
    'setViewTask', 'setAlertasTodas', 'navigate', 'return (' + fuenteFila + ');')(
    win, React, data || {},
    (id) => log.completadas.push(id),
    (id, d) => log.decididas.push([id, d]),
    (t) => log.vistas.push(t && t.id),
    (v) => { if (v === false) log.cerrada++; },
    (r) => log.navegadas.push(r));
  return { nodo: fila(item), log };
}
function recorrer(n, fn) {
  if (!n) return;
  if (Array.isArray(n)) { n.forEach((c) => recorrer(c, fn)); return; }
  if (typeof n !== 'object') return;
  fn(n);
  (n.hijos || []).forEach((c) => recorrer(c, fn));
}
const tilde = (nodo) => {
  let out = null;
  recorrer(nodo, (n) => { if (!out && n.props && n.props['aria-label']) out = n; });
  return out;
};
const botonConTexto = (nodo, texto) => {
  let out = null;
  recorrer(nodo, (n) => { if (!out && n.tipo === 'button' && n.hijos.indexOf(texto) >= 0) out = n; });
  return out;
};
const filaClicable = (nodo) => {
  // La zona de texto: el div con onClick que NO es un boton.
  let out = null;
  recorrer(nodo, (n) => { if (!out && n.tipo === 'div' && typeof n.props.onClick === 'function') out = n; });
  return out;
};

// ── Datos de prueba ────────────────────────────────────────────────────────
const AHORA = new Date(2026, 10, 23, 20, 0, 0).getTime();   // 23-nov 20:00 local
const GENERADO = new Date(2026, 10, 23, 18, 10, 0).getTime(); // pasada de la tarde
const ITEM = (o = {}) => Object.assign({
  id: 'aduana_i1', urgencia: 'hoy', titulo: 'Despacho CK vence el 25',
  porque: 'limite de aduana el 25-nov, faltan 2 dias', accion: 'pagar tributos',
  ruta: 'imports', refId: 'i1',
}, o);
const ENTRADA = (o = {}) => Object.assign({
  generado: GENERADO, pasada: 'tarde', cegado: false, sinModelo: false,
  tc: 11.8, summary: 'TC oficial: Bs 11.80', items: [ITEM(), ITEM({ id: 'stale_t1', ruta: 'tasks', refId: 't1' })],
}, o);

// ── 1. El bloque del Home ──────────────────────────────────────────────────
test('con entrada fresca el bloque dice Asistente; sin ella, Alertas', () => {
  assert.ok(bloque.length > 200, 'no se encontro el bloque de Alertas del Home');
  assert.equal(win._lbpAsisFrescos(ENTRADA(), AHORA, []).fresca, true);
  assert.equal(win._lbpAsisFrescos(null, AHORA, []).fresca, false,
    'sin entrada (sin worker, sin key o 404) el bloque no es del asistente');
  assert.equal(win._lbpAsisFrescos(ENTRADA({ items: [] }), AHORA, []).fresca, false,
    'una entrada sin items no tiene nada que decir');
  assert.match(bloque, /_lbpAsisFrescos/, 'el bloque tiene que preguntar por la entrada del asistente');
  assert.match(bloque, /window\._lbpAlertas/, 'el bloque cae a _lbpAlertas cuando no hay entrada fresca');
  // El encabezado del bloque se EVALUA, no se mira con un regex: son tres
  // estados y el texto de cada uno tiene que salir del estado que le toca.
  const mt = bloque.match(/var _tit=([\s\S]*?);\n/);
  assert.ok(mt, 'no encuentro el titulo del bloque');
  const tit = new Function('fr', '_alDia', 'filas', 'return (' + mt[1] + ');');
  assert.match(tit({ deHoy: true }, false, { length: 3 }), /Asistente \(3\)/, 'falta el titulo del asistente');
  assert.match(tit({ deHoy: true }, true, { length: 0 }), /Asistente/, 'el estado "al dia" sigue siendo del asistente');
  assert.ok(!/Alertas/.test(tit({ deHoy: true }, true, { length: 0 })),
    'con la entrada de hoy decidida entera el bloque NO puede decir Alertas');
  assert.match(tit({ deHoy: false }, false, { length: 7 }), /Alertas \(7\)/, 'falta el titulo de Alertas, que es la red');
});

test('la ✕ del bloque sigue siendo la misma (no se arregla ni se empeora aca)', () => {
  assert.match(bloque, /setAlertsVisible\(false\)/);
  assert.match(bloque, /setAlertasTodas\(true\)/, 'el encabezado sigue abriendo la ventana');
});

// ── 2. La fecha, en hora local ─────────────────────────────────────────────
test('la fecha de la entrada se compara en hora LOCAL, no UTC', () => {
  // 23-nov 19:00 Bolivia = 23:00 UTC del 23. "Ahora" 21:00 Bolivia = 01:00 UTC del 24.
  // En hora local los dos instantes son del 23: la entrada de la pasada de la
  // tarde es de HOY. En UTC caen en dias distintos, y la ventana se vaciaria
  // cada noche justo despues de la pasada de las 18:10 --sin que se vea por que--
  // cayendo a la lista vieja de Alertas. La tarjeta del briefing arrastra este
  // mismo bug (HTML:5518, toISOString) y no hay que copiarlo.
  const gen = Date.UTC(2026, 10, 23, 23, 0, 0);
  const ahora = Date.UTC(2026, 10, 24, 1, 0, 0);
  const dias = enLaPaz('return [new Date(' + gen + ').toISOString().slice(0,10),' +
    ' new Date(' + ahora + ').toISOString().slice(0,10)];');
  assert.notEqual(dias[0], dias[1],
    'si este par de instantes cayera en el mismo dia UTC la prueba no probaria nada');
  const r = enLaPaz('return window._lbpAsisFrescos({generado:' + gen + ',pasada:"tarde",' +
    'items:[{id:"a",urgencia:"hoy",titulo:"x",porque:"y"}]}, ' + ahora + ', []);');
  assert.equal(r.fresca, true,
    'a las 21:00 de Bolivia la entrada de las 19:00 del mismo dia sigue siendo de hoy');
  assert.equal(r.de, '19:00', 'la hora se muestra en hora local, no en UTC');
});

test('una entrada de ayer no es fresca', () => {
  const ayer = new Date(2026, 10, 22, 18, 10, 0).getTime();
  assert.equal(win._lbpAsisFrescos(ENTRADA({ generado: ayer }), AHORA, []).fresca, false);
});

test('una entrada sin generado, o con basura, no es fresca', () => {
  assert.equal(win._lbpAsisFrescos(ENTRADA({ generado: undefined }), AHORA, []).fresca, false);
  assert.equal(win._lbpAsisFrescos(ENTRADA({ generado: 'manana' }), AHORA, []).fresca, false);
});

test('la tarjeta pide /asistente con la fecha local y cae a /briefing-ai', () => {
  assert.ok(tarjeta.length > 100, 'no se encontro el useEffect de la tarjeta');
  assert.ok(!/toISOString/.test(tarjetaCodigo),
    'toISOString() pide la fecha de manana despues de las 20:00 de Bolivia y no vuelve nada');
  assert.match(tarjetaCodigo, /_fechaLocal\(new Date\(\)\)/);
  assert.match(tarjetaCodigo, /\/asistente\?key=/);
  assert.match(tarjetaCodigo, /\/briefing-ai\?key=/, 'sin entrada del asistente la tarjeta cae al briefing');
  assert.ok(tarjetaCodigo.indexOf('/asistente?key=') < tarjetaCodigo.indexOf('/briefing-ai?key='),
    'el asistente va primero y el briefing es la red, no al revez');
});

test('el titulo de la tarjeta dice de donde salio lo que pinta', () => {
  // La tarjeta rendea brfData.summary, que puede venir del asistente o del
  // briefing viejo. Decir "Briefing del dia" sobre el summary del asistente
  // confunde al unico que la mira. El titulo sale del ORIGEN de brfData, no de
  // un estado aparte, asi no se puede desincronizar de lo que se esta pintando.
  assert.ok(encabezado.length > 200, 'no se encontro el encabezado de la tarjeta');
  const m = encabezado.match(/\(brfData&&brfData\._asis\)\?\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/);
  assert.ok(m, 'el titulo tiene que elegirse por brfData._asis');
  const titulo = new Function('brfData', 'return (brfData&&brfData._asis)?' + m[1] + ':' + m[2] + ';');
  const delAsis = titulo({ summary: 'TC oficial: Bs 11.80', generated: GENERADO, _asis: true });
  const delBrief = titulo({ summary: 'VENCIDAS: 3', generated: GENERADO });
  assert.match(delAsis, /Asistente/);
  assert.ok(!/Briefing/.test(delAsis), 'con datos del asistente no puede decir Briefing');
  assert.match(delBrief, /Briefing/, 'cuando cae al briefing el titulo vuelve a ser el de siempre');
  assert.ok(!/Asistente/.test(delBrief));
  assert.match(titulo(null), /Briefing/, 'sin datos todavia, el titulo de siempre');
});

test('la marca de origen la pone SOLO la rama del asistente', () => {
  const iA = tarjetaCodigo.indexOf('/asistente?key=');
  const iB = tarjetaCodigo.indexOf('/briefing-ai?key=');
  assert.ok(iA > 0 && iB > iA);
  assert.match(tarjetaCodigo.slice(iA, iB), /setBrfData\(\{[^}]*_asis:true[^}]*\}\)/,
    'la rama del asistente tiene que marcar el origen');
  assert.ok(!/_asis/.test(tarjetaCodigo.slice(iB)),
    'la rama del briefing no puede marcar la tarjeta como del asistente');
});

// ── 3. refId que no existe ─────────────────────────────────────────────────
test('un item con refId que no existe no muestra el tilde ni navega a la nada', () => {
  const d = { tasks: [{ id: 't1', title: 'Llamar a aduana' }] };
  const viva = win._lbpAsisDestino({ ruta: 'tasks', refId: 't1' }, d);
  assert.equal(viva.tarea && viva.tarea.id, 't1');
  const muerta = win._lbpAsisDestino({ ruta: 'tasks', refId: 'borrada_ayer' }, d);
  assert.equal(muerta.tarea, null, 'sin entidad no hay tilde: cerraria nada');
  assert.equal(muerta.ruta, 'tasks', 'la pantalla existe aunque el id ya no');
});

test('sin ruta, o con una ruta fuera de la lista blanca, no se navega', () => {
  const d = { tasks: [{ id: 't1' }] };
  assert.equal(win._lbpAsisDestino({ ruta: '', refId: 't1' }, d).ruta, '');
  assert.equal(win._lbpAsisDestino({ ruta: 'finance', refId: '' }, d).ruta, '',
    'el worker deja la ruta en blanco si no esta en la lista; una entrada vieja de KV puede traer otra cosa');
  assert.equal(win._lbpAsisDestino({ ruta: 'constructor', refId: '' }, d).ruta, '',
    'las claves heredadas del prototipo no son rutas');
  assert.equal(win._lbpAsisDestino(null, null).ruta, '');
});

// ── La fila, por comportamiento (no por regex) ─────────────────────────────
const DATA_FILA = { tasks: [{ id: 't1', title: 'Llamar a aduana', status: 'TODO' }] };

test('la fila NO dibuja el tilde cuando el refId no resuelve una tarea', () => {
  assert.ok(ventana.length > 200, 'no se encontro la ventana');
  const viva = pintarFila(ITEM({ id: 'a', ruta: 'tasks', refId: 't1' }), DATA_FILA);
  assert.ok(tilde(viva.nodo), 'con la tarea viva el tilde tiene que estar');
  const muerta = pintarFila(ITEM({ id: 'b', ruta: 'tasks', refId: 'borrada_ayer' }), DATA_FILA);
  assert.equal(tilde(muerta.nodo), null, 'un tilde que no cierra nada no se dibuja');
  const sinRuta = pintarFila(ITEM({ id: 'c', ruta: '', refId: 't1' }), DATA_FILA);
  assert.equal(tilde(sinRuta.nodo), null);
  const otraRuta = pintarFila(ITEM({ id: 'd', ruta: 'imports', refId: 'i1' }), DATA_FILA);
  assert.equal(tilde(otraRuta.nodo), null, 'un despacho no se cierra con completeTask');
});

test('el tilde de la fila cierra la tarea, graba listo y no cierra la ventana', () => {
  const r = pintarFila(ITEM({ id: 'a', ruta: 'tasks', refId: 't1' }), DATA_FILA);
  tilde(r.nodo).props.onClick();
  assert.deepEqual(r.log.completadas, ['t1']);
  assert.deepEqual(r.log.decididas, [['a', 'listo']]);
  assert.equal(r.log.cerrada, 0, 'el tilde no puede cerrar la ventana');
});

test('la fila con tarea no repite el boton de Listo', () => {
  const conTarea = pintarFila(ITEM({ id: 'a', ruta: 'tasks', refId: 't1' }), DATA_FILA);
  assert.equal(botonConTexto(conTarea.nodo, '✓ Listo'), null,
    'el tilde YA es el listo: el boton seria el mismo gesto dos veces');
  const sinTarea = pintarFila(ITEM({ id: 'b', ruta: '', refId: '' }), DATA_FILA);
  assert.ok(botonConTexto(sinTarea.nodo, '✓ Listo'), 'sin tilde tiene que haber boton de Listo');
});

test('los botones de la fila deciden sin cerrar la ventana', () => {
  const a = pintarFila(ITEM({ id: 'x', ruta: '', refId: '' }), DATA_FILA);
  botonConTexto(a.nodo, '✓ Listo').props.onClick();
  assert.deepEqual(a.log.decididas, [['x', 'listo']]);
  assert.equal(a.log.cerrada, 0);
  const b = pintarFila(ITEM({ id: 'y', ruta: '', refId: '' }), DATA_FILA);
  botonConTexto(b.nodo, 'No me interesa').props.onClick();
  assert.deepEqual(b.log.decididas, [['y', 'no']]);
  assert.equal(b.log.cerrada, 0);
});

test('el clic en el texto abre la tarea, navega, o no hace nada', () => {
  const conTarea = pintarFila(ITEM({ id: 'a', ruta: 'tasks', refId: 't1' }), DATA_FILA);
  filaClicable(conTarea.nodo).props.onClick();
  assert.deepEqual(conTarea.log.vistas, ['t1']);
  assert.deepEqual(conTarea.log.navegadas, []);
  assert.equal(conTarea.log.cerrada, 0, 'abrir la tarea no cierra la ventana');

  const conRuta = pintarFila(ITEM({ id: 'b', ruta: 'imports', refId: 'i1' }), DATA_FILA);
  filaClicable(conRuta.nodo).props.onClick();
  assert.deepEqual(conRuta.log.navegadas, ['imports']);
  assert.equal(conRuta.log.cerrada, 1, 'al navegar si se cierra');

  const muerta = pintarFila(ITEM({ id: 'c', ruta: '', refId: 'lo_que_sea' }), DATA_FILA);
  filaClicable(muerta.nodo).props.onClick();
  assert.deepEqual(muerta.log.navegadas, [], 'sin ruta no se navega a la nada');
  assert.deepEqual(muerta.log.vistas, []);
  assert.equal(muerta.log.cerrada, 0);
});

// ── 4 y 5. Las decisiones ──────────────────────────────────────────────────
test('marcar listo saca el item de la ventana sin cerrarla', () => {
  const e = ENTRADA();
  assert.equal(win._lbpAsisFrescos(e, AHORA, undefined).items.length, 2);
  const d = win._lbpAsisDecidir({}, 'aduana_i1', 'listo');
  const fr = win._lbpAsisFrescos(e, AHORA, d.asisDecididos);
  assert.deepEqual(fr.items.map((x) => x.id), ['stale_t1']);
  assert.equal(fr.fresca, true, 'con un item en pie la ventana sigue siendo del asistente');
  assert.match(ventana, /_asisDecidir\(.*'listo'\)/, 'falta el boton de listo');
  assert.ok(!/_asisDecidir\([^)]*\); *setAlertasTodas\(false\)/.test(ventana),
    'decidir no puede cerrar la ventana');
});

test('"no me interesa" escribe decision:"no" y el item no vuelve', () => {
  const e = ENTRADA();
  const d = win._lbpAsisDecidir({}, 'aduana_i1', 'no');
  assert.deepEqual(d.asisDecididos.map((x) => [x.id, x.decision]), [['aduana_i1', 'no']]);
  assert.ok(d.asisDecididos[0].ts > 0, 'la decision lleva marca de tiempo');
  assert.equal(win._lbpAsisFrescos(e, AHORA, d.asisDecididos).items.some((x) => x.id === 'aduana_i1'),
    false, 'un item descartado no vuelve en la proxima lectura de la misma entrada');
  assert.match(ventana, /_asisDecidir\(.*'no'\)/, 'falta el boton de no me interesa');
});

test('deshacer escribe revocada y el item vuelve a estar pendiente', () => {
  const e = ENTRADA();
  const d1 = win._lbpAsisDecidir({}, 'aduana_i1', 'no');
  const d2 = win._lbpAsisDecidir(d1, 'aduana_i1', 'revocada');
  assert.deepEqual(d2.asisDecididos.map((x) => x.decision), ['revocada'],
    'una sola entrada por id: la revocada REEMPLAZA, no se suma');
  assert.equal(win._lbpAsisFrescos(e, AHORA, d2.asisDecididos).items.length, 2,
    'el worker ya trata revocada como sin decidir; la app tiene que hacer lo mismo');
});

test('decidir no toca el blob de entrada', () => {
  const d0 = { asisDecididos: [] };
  win._lbpAsisDecidir(d0, 'aduana_i1', 'listo');
  assert.equal(d0.asisDecididos.length, 0);
});

test('una decision inventada no pisa la que ya habia', () => {
  const d = win._lbpAsisDecidir({ asisDecididos: [{ id: 'a', decision: 'no', ts: 1 }] }, 'a', 'quiza');
  assert.deepEqual(d.asisDecididos.map((x) => x.decision), ['no']);
});

// ── La linea dura: asisDecididos SIEMPRE array ─────────────────────────────
test('asisDecididos sale array pase lo que pase en el blob', () => {
  // El chequeo horario del worker hace .forEach sobre esta lista con solo
  // `|| []` de proteccion (worker.js:2596 y 2736). Un objeto o un texto ahi
  // lo hace tirar, y su propio try/catch se traga el chequeo entero EN SILENCIO.
  [undefined, null, '', 'x', 0, 7, {}, { a: 1 }, true].forEach(function (mal) {
    const d = win._lbpAsisDecidir({ asisDecididos: mal }, 'a', 'listo');
    assert.ok(Array.isArray(d.asisDecididos),
      'con ' + JSON.stringify(mal) + ' en el blob la lista tiene que salir array');
  });
  assert.ok(Array.isArray(win._lbpAsisDecidir({}, '', 'listo').asisDecididos),
    'sin id tampoco se devuelve otra cosa');
  assert.ok(Array.isArray(win._lbpAsisDecidir(null, 'a', 'mala').asisDecididos));
});

test('las entradas malformadas del blob no sobreviven a una decision', () => {
  const d = win._lbpAsisDecidir({ asisDecididos: [null, { decision: 'no' }, { id: 'b', decision: 'no', ts: 2 }] },
    'a', 'listo');
  assert.deepEqual(d.asisDecididos.map((x) => x.id).sort(), ['a', 'b']);
});

// ── 6 y 7. _SYNC_LISTS y las lapidas ───────────────────────────────────────
test('asisDecididos esta en _SYNC_LISTS', () => {
  const i = html.indexOf('var _SYNC_LISTS = [');
  assert.ok(i > 0, 'no encuentro _SYNC_LISTS');
  assert.ok(html.slice(i, html.indexOf('];', i)).includes("'asisDecididos'"),
    "sin esto la lista entera gana del lado con la marca mas nueva y las decisiones del otro equipo se pierden");
});

test('asisDecididos NO usa marcas de borrado', () => {
  // Con lapida, _mergeTombstones toma el maximo por id y nunca deja desaparecer
  // la clave: la decision SIGUIENTE sobre ese id se perdia 30 dias. Es lo medido
  // en tareasDecididas, no una teoria. Deshacer escribe 'revocada'.
  const fuente = fuenteWin('_lbpAsisDecidir');
  assert.ok(!/_deletedIds|_lbpRecordDel/.test(fuente),
    'decidir no puede sellar una lapida');
  assert.ok(!/_lbpRecordDel/.test(ventana), 'la ventana del asistente no borra por lapida');
  const d = win._lbpAsisDecidir({ _deletedIds: { otro: 123 } }, 'a', 'no');
  assert.deepEqual(d._deletedIds, { otro: 123 }, 'las lapidas ajenas quedan como estaban');
});

// ── 8. Un equipo con la version vieja ──────────────────────────────────────
function entornoMerge() {
  const store = {};
  const pro = 'var localStorage = { getItem: function(k){ return k in store ? store[k] : null; },' +
    ' setItem: function(k, v){ store[k] = String(v); } };\n' +
    'var window = {};\n';
  const listas = html.match(/var _SYNC_LISTS = \[[\s\S]*?\];/);
  assert.ok(listas, 'no encuentro _SYNC_LISTS');
  const fuentes = listas[0] + '\n' +
    ['_pruneTombstones', '_mergeTombstones', '_tombstonesCambiaron'].map(fuenteWin).join('') +
    fuenteFn('_itemsContentDiffer') + fuenteFn('_mergeCloudData');
  const f = new Function('store', pro + fuentes + '\nreturn _mergeCloudData;')(store);
  return { store, merge: f };
}

test('un equipo sin asisDecididos no borra la lista del otro', () => {
  const dec = [{ id: 'a', decision: 'listo', ts: 100 }, { id: 'b', decision: 'no', ts: 200 },
    { id: 'c', decision: 'revocada', ts: 300 }];
  const nube = () => ({ _cloudSaveTime: 5000, asisDecididos: dec.map((x) => Object.assign({}, x)) });
  const viejo = () => ({ tasks: [] }); // v5.74: la clave no existe
  const e = entornoMerge();

  e.store['lbp_last_save'] = '9000'; // el equipo viejo es el mas nuevo
  const m1 = e.merge(viejo(), nube());
  assert.deepEqual((m1.asisDecididos || []).map((x) => x.id), ['a', 'b', 'c'],
    'el equipo viejo no puede borrar las decisiones que subio el otro');

  e.store['lbp_last_save'] = '1000'; // la nube es la mas nueva
  const m2 = e.merge(viejo(), nube());
  assert.deepEqual((m2.asisDecididos || []).map((x) => x.id), ['a', 'b', 'c']);
});

test('el equipo viejo tampoco revive una decision revocada', () => {
  const e = entornoMerge();
  e.store['lbp_last_save'] = '9000';
  const local = { asisDecididos: [{ id: 'a', decision: 'revocada', ts: 900, updatedAt: 9000 }] };
  const nube = { _cloudSaveTime: 5000, asisDecididos: [{ id: 'a', decision: 'no', ts: 100, updatedAt: 5000 }] };
  const m = e.merge(local, nube);
  assert.deepEqual(m.asisDecididos.map((x) => x.decision), ['revocada'],
    'gana la marca por item mas nueva, no la lista entera');
});

// ── 9. De cuando es la entrada ─────────────────────────────────────────────
test('la ventana dice de cuando es la entrada', () => {
  const fr = win._lbpAsisFrescos(ENTRADA(), AHORA, []);
  assert.equal(fr.de, '18:10', 'la hora de generado, para que no parezca recien hecha');
  // El subtitulo de la ventana se arma y se EVALUA, no se mira con un regex.
  const mp = ventana.match(/var _pas=([\s\S]*?);\n/);
  const ms = ventana.match(/var _subt=([\s\S]*?);\n/);
  assert.ok(mp && ms, 'no encuentro el subtitulo de la ventana');
  const subt = new Function('fr', 'asisEntrada', 'var _pas=' + mp[1] + '; return (' + ms[1] + ');');
  assert.equal(subt({ de: '18:10' }, { pasada: 'tarde', tc: 11.8 }),
    'Pasada de la tarde · 18:10 · TC Bs 11.80');
  assert.equal(subt({ de: '06:12' }, { pasada: 'manana', tc: null }),
    'Pasada de la mañana · 06:12',
    'una entrada de la manana no se puede leer a las 20:00 como recien hecha');
  assert.ok(!/18:10/.test(subt({ de: '' }, { pasada: 'tarde', tc: 11.8 })));
});

// ── El tercer estado: la entrada de hoy, ya decidida entera ────────────────
test('decidir el ULTIMO item deja el estado "al dia", no la lista vieja', () => {
  // Con dos estados, `fresca` caia a falso al decidir el ultimo y el bloque y la
  // ventana volvian a _lbpAlertas: la lista cruda de treinta, justo cuando Pepe
  // termino de despejar el asistente. `deHoy` es el tercer estado.
  const e = ENTRADA();
  let d = {};
  e.items.forEach(function (it) { d = win._lbpAsisDecidir(d, it.id, 'listo'); });
  const fr = win._lbpAsisFrescos(e, AHORA, d.asisDecididos);
  assert.deepEqual(fr.items, [], 'no queda nada pendiente');
  assert.equal(fr.fresca, false);
  assert.equal(fr.deHoy, true, 'la entrada SIGUE siendo la de hoy: no se cae a Alertas');
  assert.equal(fr.de, '18:10', 'y sigue sabiendo de cuando es');
});

test('sin entrada de hoy, deHoy es falso y recien ahi manda _lbpAlertas', () => {
  const ayer = new Date(2026, 10, 22, 18, 10, 0).getTime();
  assert.equal(win._lbpAsisFrescos(null, AHORA, []).deHoy, false);
  assert.equal(win._lbpAsisFrescos({ ready: false }, AHORA, []).deHoy, false);
  assert.equal(win._lbpAsisFrescos(ENTRADA({ generado: ayer }), AHORA, []).deHoy, false);
  assert.equal(win._lbpAsisFrescos(ENTRADA({ generado: 'manana' }), AHORA, []).deHoy, false);
  // Una entrada de hoy que el asistente guardo SIN items tampoco es Alertas:
  // significa que no encontro nada, no que no haya entrada.
  assert.equal(win._lbpAsisFrescos(ENTRADA({ items: [] }), AHORA, []).deHoy, true);
});

test('el bloque "al dia" ni siquiera consulta _lbpAlertas', () => {
  // La cabeza del bloque (de que lista salen las filas y si hay que esconderlo)
  // se extrae y se EJECUTA: asi "con todo decidido no se cae a la lista cruda"
  // es una medicion, no un regex. Si _lbpAlertas se llegara a llamar, se nota.
  const m = bloque.match(/var filas=([\s\S]*?)\n      var _bg=/);
  assert.ok(m, 'no encuentro la cabeza del bloque');
  const alertasCrudas = [{ id: 'a1', icon: '!', msg: 'una de treinta', color: '#f00', route: 'tasks' }];
  let consultada = 0;
  const ventanilla = {
    _lbpAsisUrg: win._lbpAsisUrg,
    _lbpAlertas: function () { consultada++; return alertasCrudas; },
  };
  const cabeza = new Function('window', 'fr', 'data', '_ahora',
    'var filas=' + m[1] + '\nreturn {filas:filas, alDia:_alDia};');
  const correr = (fr) => { consultada = 0; return { r: cabeza(ventanilla, fr, {}, AHORA), consultada }; };

  const conItems = correr({ deHoy: true, items: [ITEM(), ITEM({ id: 'b' })] });
  assert.equal(conItems.r.filas.length, 2);
  assert.equal(conItems.r.alDia, false);
  assert.equal(conItems.consultada, 0, 'con items del asistente no se mira _lbpAlertas');

  const alDia = correr({ deHoy: true, items: [] });
  assert.notEqual(alDia.r, null, 'el estado "al dia" NO esconde el bloque');
  assert.deepEqual(alDia.r.filas, []);
  assert.equal(alDia.r.alDia, true);
  assert.equal(alDia.consultada, 0,
    'con la entrada de hoy decidida entera NO se puede volver a la lista cruda de treinta');

  const red = correr({ deHoy: false, items: [] });
  assert.equal(red.consultada, 1, 'sin entrada de hoy si manda _lbpAlertas');
  assert.deepEqual(red.r.filas.map((f) => f.texto), ['una de treinta']);
  assert.equal(red.r.alDia, false);

  alertasCrudas.length = 0;
  assert.equal(cabeza(ventanilla, { deHoy: false, items: [] }, {}, AHORA), null,
    'sin entrada y sin alertas el bloque no se pinta');
});

test('el bloque y la ventana se ramifican por deHoy, no por fresca', () => {
  assert.match(bloque, /if\(!fr\.deHoy&&!filas\.length\)return null;/,
    'con la entrada de hoy decidida entera el bloque no puede caer a _lbpAlertas');
  assert.match(bloque, /var filas=fr\.deHoy/);
  assert.match(bloque, /al d[ií]a/, 'falta el estado "al dia" en el bloque');
  assert.match(ventana, /if\(fr\.deHoy\)\{/,
    'la ventana tiene que entrar en la rama del asistente aunque no queden items');
  assert.match(ventana, /var _alDia=!fr\.items\.length;/);
  assert.match(ventana, /Nada pendiente/, 'falta el mensaje de "al dia" en la ventana');
  // El subtitulo (con el TC) se pinta ANTES de la bifurcacion lista/al dia, asi
  // que el tipo de cambio --lo unico que Pepe valora de aca-- no se pierde.
  assert.ok(ventana.indexOf('_subt)') < ventana.indexOf('_alDia?'),
    'la linea del TC tiene que seguir estando en el estado "al dia"');
});

// ── 10 y 11. La red ────────────────────────────────────────────────────────
test('sin worker ni key, la ventana sigue mostrando _lbpAlertas', () => {
  assert.equal(win._lbpAsisFrescos(null, AHORA, []).fresca, false);
  assert.equal(win._lbpAsisFrescos({ ready: false }, AHORA, []).fresca, false);
  assert.match(ventana, /window\._lbpAlertas/, 'la ventana conserva _lbpAlertas como red');
  assert.match(ventana, /completeTask\(/, 'y el tilde de la rama de Alertas sigue ahi');
});

test('los botones de decision son tocables con el dedo', () => {
  // El tilde de la ventana de Alertas ya esta en 44: los de decision siguen el
  // mismo minimo, que es lo que se toca con el pulgar en el telefono.
  const botones = ventana.match(/minHeight: *(\d+)/g) || [];
  assert.ok(botones.length >= 3, 'esperaba al menos el tilde y los dos botones, hay ' + botones.length);
  botones.forEach((b) => assert.ok(Number(b.split(':')[1]) >= 44, b + ' queda por debajo de 44 px'));
});

test('la ventana del asistente hace scroll igual que la de Alertas', () => {
  const ocurrencias = (ventana.match(/overflowY: *'auto'/g) || []).length;
  assert.ok(ocurrencias >= 2, 'las dos ramas de la ventana tienen que hacer scroll, hay ' + ocurrencias);
});

test('_lbpAlertas no cambio', () => {
  // Es la red: si no hay worker, no hay key o la entrada es vieja, la ventana
  // muestra esto. El hash es byte a byte de la funcion entera.
  const fuente = fuenteWin('_lbpAlertas');
  const sha = crypto.createHash('sha256').update(fuente, 'utf8').digest('hex');
  assert.equal(sha, '370e932038a09d3c13b3a11063ea8d2cc0e57875c0d3a260ce8297c172d0181b',
    'window._lbpAlertas tiene que quedar intacta en esta tarea');
});

// ── Varios ─────────────────────────────────────────────────────────────────
test('la version sube a 5.75', () => {
  assert.match(html, /window\.LBP_VERSION = '5\.75'/);
});

test('una urgencia que no existe se pinta igual que puede_esperar', () => {
  const lento = win._lbpAsisUrg('puede_esperar');
  assert.notEqual(win._lbpAsisUrg('ya').c, lento.c,
    'un "ya" no se puede ver igual que algo que puede esperar');
  assert.notEqual(win._lbpAsisUrg('hoy').c, lento.c);
  ['', null, undefined, 'urgentisimo', 'constructor', 'toString'].forEach(function (mal) {
    assert.equal(win._lbpAsisUrg(mal).c, lento.c,
      JSON.stringify(mal) + ' tiene que caer en puede_esperar, no reventar ni colarse como "ya"');
  });
  assert.match(ventana, /_lbpAsisUrg/, 'la ventana pinta la urgencia con el mismo cuadro');
  assert.match(bloque, /_lbpAsisUrg/);
});

test('un item sin titulo no se pinta', () => {
  const e = ENTRADA({ items: [{ id: 'x', urgencia: 'ya', titulo: '   ', porque: 'p' }, ITEM()] });
  assert.deepEqual(win._lbpAsisFrescos(e, AHORA, []).items.map((x) => x.id), ['aduana_i1']);
});

test('un item sin id no se pinta: no habria con que decidirlo', () => {
  const e = ENTRADA({ items: [{ urgencia: 'ya', titulo: 'sin id', porque: 'p' }, ITEM()] });
  assert.deepEqual(win._lbpAsisFrescos(e, AHORA, []).items.map((x) => x.id), ['aduana_i1']);
});
