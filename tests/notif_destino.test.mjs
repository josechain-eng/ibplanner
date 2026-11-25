// Ir al ITEM, no a la pantalla. Dos quejas de Pepe el 24-nov-2026:
//   "si le doy click a la notificacion solo me lleva a la app y nada mas"
//   "le doy click al resultado de la busqueda y me lleva a la ventana de tareas,
//    no a la tarea en si"
//
// Las dos son el mismo hueco: la app sabia ir a una PANTALLA. Y el mecanismo
// para abrir un item YA EXISTIA --window._lbpPendingEdit = {type, id}, que cada
// pantalla consume al montarse-- pero solo lo usaban los gestos del Home. No
// habia que inventar nada: habia que usarlo desde la busqueda y desde el aviso.
//
// El contrato de un destino es `ir = {ruta, refId}`, y viaja
// alarma -> KV -> push -> service worker -> app.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'LifeBusinessPlanner2026.html'), 'utf8');

// ── Un service worker de mentira ───────────────────────────────────────────
function cargarSW(opts) {
  const o = opts || {};
  const mostradas = [], abiertas = [], enfocadas = [], mensajes = [];
  const clientes = (o.clientes || []).map((c, i) => ({
    id: 'c' + i,
    focus: async () => { enfocadas.push(i); return c; },
    postMessage: (m) => mensajes.push(m),
  }));
  const listeners = {};
  const self = {
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    registration: {
      scope: 'https://app.test/',
      showNotification: async (titulo, op) => { mostradas.push({ titulo, op }); },
      getNotifications: async () => [],
    },
    clients: {
      matchAll: async () => clientes,
      openWindow: async (u) => { abiertas.push(String(u)); return clientes[0] || null; },
      claim: async () => {},
    },
    skipWaiting: () => {},
    location: { href: 'https://app.test/sw.js' },
  };
  const caches = {
    open: async () => ({ put: async () => {}, match: async () => null, keys: async () => [],
                         add: async () => {}, addAll: async () => {}, delete: async () => true }),
    keys: async () => [], match: async () => null, delete: async () => true,
  };
  new Function('self', 'caches', 'fetch', 'Request', 'Response', 'clients', SW)(
    self, caches, async () => new Response(''), Request, Response, self.clients);
  const disparar = async (tipo, ev) => {
    const esperas = [];
    const e = Object.assign({ waitUntil: (p) => esperas.push(p) }, ev);
    for (const f of (listeners[tipo] || [])) await f(e);
    await Promise.all(esperas);
  };
  return { mostradas, abiertas, enfocadas, mensajes, disparar };
}

const clic = (ir, extra) => Object.assign(
  { notification: { close() {}, tag: 'lbp_t1_123', data: ir === undefined ? {} : { ir } } }, extra || {});

// ── 1. El service worker: a donde manda el click ───────────────────────────

test('con la app abierta, le dice a donde ir en vez de solo enfocar', async () => {
  const sw = cargarSW({ clientes: [{}] });
  await sw.disparar('notificationclick', clic({ ruta: 'tasks', refId: 't1' }));
  assert.equal(sw.enfocadas.length, 1, 'no enfoco la ventana abierta');
  assert.deepEqual(sw.mensajes.filter((m) => m && m.type === 'LBP_IR'),
    [{ type: 'LBP_IR', ir: { ruta: 'tasks', refId: 't1' } }],
    'enfoco la app pero no le dijo a donde ir: es justo lo que reporto Pepe');
  assert.deepEqual(sw.abiertas, [], 'abrio una ventana nueva teniendo una abierta');
});

test('con la app cerrada, la abre con el destino en la URL', async () => {
  const sw = cargarSW({ clientes: [] });
  await sw.disparar('notificationclick', clic({ ruta: 'tasks', refId: 't1' }));
  assert.equal(sw.abiertas.length, 1);
  const u = new URL(sw.abiertas[0]);
  assert.equal(u.searchParams.get('ir'), 'tasks');
  assert.equal(u.searchParams.get('ref'), 't1');
});

test('sin destino se porta como siempre: abre la app y ya', async () => {
  // Compatibilidad: las alarmas que ya estan en el KV no llevan `ir`.
  const sw = cargarSW({ clientes: [] });
  await sw.disparar('notificationclick', clic(undefined));
  assert.equal(sw.abiertas.length, 1);
  assert.equal(new URL(sw.abiertas[0]).searchParams.get('ir'), null);
});

test('una ruta con forma rara no se mete en la URL', async () => {
  // El payload del push entra por la red: lo que venga ahi no puede terminar
  // pegado en la URL sin pasar por un filtro.
  const sw = cargarSW({ clientes: [] });
  await sw.disparar('notificationclick', clic({ ruta: 'javascript:alert(1)', refId: 'x' }));
  assert.equal(new URL(sw.abiertas[0]).searchParams.get('ir'), null, 'acepto una ruta con forma rara');
});

test('el boton Dismiss no abre ni avisa nada', async () => {
  const sw = cargarSW({ clientes: [] });
  await sw.disparar('notificationclick', clic({ ruta: 'tasks' }, { action: 'dismiss' }));
  assert.deepEqual(sw.abiertas, []);
  assert.deepEqual(sw.mensajes, []);
});

test('el push guarda el destino en la notificacion que muestra', async () => {
  const sw = cargarSW({ clientes: [] });
  await sw.disparar('push', { data: { json: () => ({ title: 'T', body: 'B', alarmId: 'a1',
    ir: { ruta: 'meetings', refId: 'm1' } }) } });
  assert.equal(sw.mostradas.length, 1);
  assert.deepEqual(sw.mostradas[0].op.data.ir, { ruta: 'meetings', refId: 'm1' },
    'el push trajo destino y la notificacion lo perdio');
});

test('la notificacion local (SHOW_NOTIFICATION) tambien lo guarda', async () => {
  const sw = cargarSW({ clientes: [] });
  await sw.disparar('message', { data: { type: 'SHOW_NOTIFICATION', title: 'T', body: 'B',
    tag: 'lbp_x', ir: { ruta: 'tasks', refId: 't9' } }, source: null });
  assert.equal(sw.mostradas.length, 1);
  assert.deepEqual(sw.mostradas[0].op.data.ir, { ruta: 'tasks', refId: 't9' });
});

// ── 2. La app: que hace con el destino ─────────────────────────────────────

function fuenteWindow(nombre) {
  const i = HTML.indexOf('window.' + nombre + ' = function');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  let nivel = 0;
  for (let j = HTML.indexOf('{', i); j < HTML.length; j++) {
    if (HTML[j] === '{') nivel++;
    else if (HTML[j] === '}' && --nivel === 0) return HTML.slice(i, j + 1) + ';\n';
  }
  assert.fail('no cierra ' + nombre);
}

function montar() {
  const tablas = HTML.match(/window\._LBP_IR_RUTAS = \{[^}]*\};/)[0]
    + HTML.match(/window\._LBP_IR_ABRE = \{[^}]*\};/)[0];
  const win = {};
  const eventos = [];
  win.dispatchEvent = (e) => { eventos.push(e.type); return true; };
  win.Event = class { constructor(t) { this.type = t; } };
  const ir = new Function('window', tablas + fuenteWindow('_lbpIr') + 'return window._lbpIr;')(win);
  return { win, eventos, ir };
}

test('abre el ITEM, no solo la pantalla, con el mecanismo que ya existia', () => {
  const m = montar();
  assert.equal(m.ir({ ruta: 'tasks', refId: 't1' }), true);
  assert.deepEqual(m.win._lbpPendingEdit, { type: 'tasks', id: 't1' },
    'navego a la pantalla pero no abrio la tarea');
  assert.deepEqual(m.win._lbpIrPendiente, { ruta: 'tasks', refId: 't1' });
  assert.deepEqual(m.eventos, ['lbp_ir']);
});

test('sin refId navega igual, sin abrir nada', () => {
  const m = montar();
  assert.equal(m.ir({ ruta: 'tasks' }), true);
  assert.equal(m.win._lbpPendingEdit, undefined);
  assert.deepEqual(m.win._lbpIrPendiente, { ruta: 'tasks', refId: '' });
});

test('una pantalla que no sabe abrir el item solo navega', () => {
  // Una ruta valida que NO consume _lbpPendingEdit no tiene que recibirlo:
  // seria basura que nadie limpia.
  // El 25-nov este caso dejo de ser `clients`: con los vinculos en las notas,
  // franquicias, campanas, despachos y finanzas pasaron a abrir la fila. El que
  // queda es `marketing`, y no por pereza: data.marketingStrategy es UN objeto
  // con pestanas, no una lista de filas, asi que no hay item que abrir.
  const m = montar();
  assert.equal(m.ir({ ruta: 'marketing', refId: 'x1' }), true);
  assert.equal(m.win._lbpPendingEdit, undefined);
  assert.deepEqual(m.win._lbpIrPendiente, { ruta: 'marketing', refId: 'x1' });
});

test('una ruta que no existe no navega a ningun lado', () => {
  // navigate('') deja la app EN BLANCO, y la ruta puede venir de la red.
  for (const malo of [{ ruta: 'no-existe', refId: 'x' }, { ruta: '' }, {}, null]) {
    const m = montar();
    assert.equal(m.ir(malo), false, 'acepto ' + JSON.stringify(malo));
    assert.equal(m.win._lbpIrPendiente, undefined);
    assert.deepEqual(m.eventos, []);
  }
});

test('las rutas del mapa son pantallas que el router conoce', () => {
  const router = new Set([...HTML.matchAll(/case '([a-zA-Z]+)':/g)].map((x) => x[1]));
  const rutas = [...HTML.match(/window\._LBP_IR_RUTAS = \{([^}]*)\}/)[1].matchAll(/([a-zA-Z]+)\s*:/g)].map((x) => x[1]);
  assert.ok(rutas.length >= 8, 'el mapa quedo casi vacio: ' + rutas.length);
  for (const r of rutas) assert.ok(router.has(r), 'ruta que el router no conoce: ' + r);
  const abre = [...HTML.match(/window\._LBP_IR_ABRE = \{([^}]*)\}/)[1].matchAll(/([a-zA-Z]+)\s*:/g)].map((x) => x[1]);
  for (const r of abre) {
    assert.ok(rutas.includes(r), r + ' abre item pero no es ruta valida');
    assert.ok(HTML.includes("pe.type === '" + r + "'"), 'ninguna pantalla consume _lbpPendingEdit de tipo ' + r);
  }
});

// ── 3. Las dos puertas de entrada y los dos que lo usan ────────────────────

test('la app escucha al service worker y lee el destino de la URL al abrir', () => {
  assert.match(HTML, /addEventListener\('message'[\s\S]{0,500}LBP_IR[\s\S]{0,300}_lbpIr/,
    'la app no escucha el mensaje LBP_IR del service worker');
  assert.match(HTML, /URLSearchParams[\s\S]{0,500}_lbpIr\(/,
    'la app no lee ?ir= al abrirse desde una notificacion');
});

test('el resultado de la busqueda abre el item', () => {
  // La queja: "me lleva a la ventana de tareas y no a la tarea en si".
  const i = HTML.indexOf('var SearchScreen');
  const j = HTML.indexOf('var SyncSettingsButton', i);
  const cuerpo = HTML.slice(i, j);
  assert.match(cuerpo, /_lbpPendingEdit\s*=\s*\{\s*type:\s*r\.route,\s*id:\s*r\.id\s*\}/,
    'el resultado de la busqueda sigue navegando solo a la pantalla');
});

test('la alarma viaja con su destino, a la nube y al service worker', () => {
  assert.match(HTML, /_cloudScheduleAlarm\([^)]*_ir\b/, '_cloudScheduleAlarm no recibe el destino');
  assert.match(HTML, /_postAlarmToSW\([^)]*_ir\b/, '_postAlarmToSW no recibe el destino');
});

test('el cron manda el destino en el push de la alarma', () => {
  const worker = fs.readFileSync(path.join(RAIZ, 'worker.js'), 'utf8');
  assert.match(worker, /sendPush\(sub, \{ title: alarm\.title[^}]*ir: alarm\.ir/,
    'el worker guarda el destino pero no lo manda en el push');
});

test('la app NAVEGA cuando llega un destino, no solo lo guarda', () => {
  // El eslabon que se puede olvidar: _lbpIr deja el destino puesto y dispara
  // 'lbp_ir', pero si nadie lo escucha no pasa nada. Ademas tiene que mirar el
  // pendiente AL MONTAR: abierta desde la notificacion, el evento se disparo
  // antes de que React existiera.
  const i = HTML.indexOf("var navigate = useCallback");
  assert.ok(i > 0, 'no encuentro navigate');
  const cerca = HTML.slice(i, i + 1200);
  assert.match(cerca, /addEventListener\('lbp_ir'/, 'nadie escucha el destino: la app no navega');
  assert.match(cerca, /_lbpIrPendiente[\s\S]{0,200}navigate\(/, 'escucha pero no navega');
  assert.match(cerca, /window\.addEventListener\('lbp_ir', aplicar\);\s*\n\s*aplicar\(\);/,
    'no mira el destino al montar: el que llega desde la notificacion se pierde');
});

test('la alarma CALCULA su destino con el tipo y el id, no lo manda vacio', () => {
  // Sin esto, pasar `_ir` a todos lados y que siempre valga null daria verde.
  const m = HTML.match(/var _ir = \(_rutaIr[^\n]*/);
  assert.ok(m, 'no encuentro el calculo del destino de la alarma');
  assert.match(m[0], /entity\.id/, 'el destino de la alarma no lleva el id del item');
  assert.match(HTML, /var _rutaIr = window\._LBP_ALARMA_RUTA\[type\]/, 'la ruta no sale del mapa');
});

test('la cola local y el disparo con la app abierta tambien lo llevan', () => {
  // La repesca "(Missed)" sale de lbp_pending_alarms: es la que mas se ve.
  assert.match(HTML, /pending\.push\(\{[^}]*ir: ir \|\| null\}\)/, 'la cola local pierde el destino');
  assert.match(HTML, /type:'SCHEDULE_ALARM'[^}]*ir:ir\|\|null/, 'el timer del service worker lo pierde');
  assert.match(HTML, /type:'SHOW_NOTIFICATION'[^}]*ir:ir\|\|null/, 'la notificacion local lo pierde');
  assert.match(HTML, /var _irEnVivo = \(window\._LBP_ALARMA_RUTA\[key\] && entity\.id\)/,
    'el disparo con la app abierta no calcula destino');
});

test('las puertas de entrada corren DESPUES de que _lbpIr existe', () => {
  // Encontrado en el navegador, no por las pruebas: estaban en un <script>
  // anterior, window._lbpIr era undefined y el try/catch se tragaba el error.
  // La app abria en el Dashboard como si no hubiera pasado nada.
  const def = HTML.indexOf('window._lbpIr = function');
  const url = HTML.indexOf("_lbpQS.get('ir')");
  const msg = HTML.indexOf("d.type === 'LBP_IR'");
  assert.ok(def > 0 && url > 0 && msg > 0);
  assert.ok(url > def, 'la lectura de ?ir= corre antes de que _lbpIr exista');
  assert.ok(msg > def, 'el listener del service worker se registra antes de que _lbpIr exista');
});
