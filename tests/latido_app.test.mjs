// window._lbpLatido: que mande lo justo, con freno, y que el fallo de subida lo
// saltee. Se extrae la funcion REAL del HTML y se corre con dobles; no se
// comprueba la fuente con regex, que daria verde con la funcion rota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'LifeBusinessPlanner2026.html'), 'utf8');

// Cuerpo de `window.<nombre> = function ... };` por conteo de llaves.
function fuenteWindow(nombre) {
  const i = html.indexOf('window.' + nombre + ' = function');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  let nivel = 0;
  for (let j = html.indexOf('{', i); j < html.length; j++) {
    if (html[j] === '{') nivel++;
    else if (html[j] === '}' && --nivel === 0) return html.slice(i, j + 1) + ';\n';
  }
  assert.fail('no cierra ' + nombre);
}

// Monta _lbpLatido con localStorage, _workerFetch y _lbpEquipo falsos.
function montar(o) {
  const op = o || {};
  const guardado = Object.assign({ lbp_sync_key: 'k_uno', lbp_last_save: '1700000000000' }, op.store || {});
  const enviados = [];
  const win = { LBP_WORKER_URL: op.url === undefined ? 'https://w.test' : op.url };
  const localStorage = { getItem: (k) => (k in guardado ? guardado[k] : null) };
  const _workerFetch = (ruta, opts) => { enviados.push({ ruta, opts }); return Promise.resolve({ ok: true }); };
  const hacer = new Function('window', 'localStorage', '_workerFetch', 'Date',
    fuenteWindow('_lbpLatido') + 'return window._lbpLatido;');
  let ahora = op.ahora || 1700000100000;
  const reloj = { now: () => ahora };
  return {
    enviados, win, guardado,
    avanzar: (ms) => { ahora += ms; },
    latir: (forzar) => hacer(win, localStorage, _workerFetch, reloj)(forzar),
  };
}

const cuerpoDe = (e) => JSON.parse(e.opts.body);

test('manda la sync key, el equipo y el ultimo guardado, por POST a /latido', () => {
  const m = montar();
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  assert.equal(m.enviados.length, 1);
  assert.equal(m.enviados[0].ruta, '/latido');
  assert.equal(m.enviados[0].opts.method, 'POST');
  const c = cuerpoDe(m.enviados[0]);
  assert.equal(c.syncKey, 'k_uno');
  assert.equal(c.equipo, 'a1b2c3', 'manda el objeto entero en vez del id');
  assert.equal(c.lastSave, 1700000000000);
});

test('NO manda el blob: el cuerpo son unas decenas de bytes', () => {
  // La razon de existir del latido es no subir 4 MB para decir "estoy viva".
  const m = montar();
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  const bytes = Buffer.byteLength(m.enviados[0].opts.body);
  assert.ok(bytes < 300, 'el cuerpo del latido pesa ' + bytes + ' bytes');
  assert.deepEqual(Object.keys(cuerpoDe(m.enviados[0])).sort(), ['equipo', 'lastSave', 'syncKey']);
});

test('sin lastSave guardado manda 0, no null ni NaN', () => {
  const m = montar({ store: { lbp_last_save: null } });
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  assert.equal(cuerpoDe(m.enviados[0]).lastSave, 0);
});

test('el freno: dos latidos seguidos mandan uno solo', () => {
  const m = montar();
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  m.latir();
  assert.equal(m.enviados.length, 1, 'mando dos latidos seguidos');
});

test('pasados los 10 minutos vuelve a mandar', () => {
  const m = montar();
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  m.avanzar(11 * 60 * 1000);
  m.latir();
  assert.equal(m.enviados.length, 2);
});

test('forzar saltea el freno (lo usa el fallo de subida)', () => {
  const m = montar();
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  m.latir(true);
  assert.equal(m.enviados.length, 2, 'forzar no saltea el freno');
});

test('sin URL del worker no manda nada y no tira', () => {
  const m = montar({ url: '' });
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  assert.equal(m.enviados.length, 0);
});

test('sin sync key no manda nada', () => {
  const m = montar({ store: { lbp_sync_key: null } });
  m.win._lbpEquipo = () => ({ id: 'a1b2c3', nombre: 'Chrome en Mac' });
  m.latir();
  assert.equal(m.enviados.length, 0);
});

// ── Los puntos que la llaman ───────────────────────────────────────────────
// Un latido perfecto que nadie llama no sirve de nada, y los tres puntos no son
// extraibles como funcion: se comprueban sobre la fuente.

test('late al cargar, al volver al frente y cuando falla una subida', () => {
  const alCargar = html.match(/addEventListener\('load',[\s\S]{0,400}?\}\);/);
  assert.ok(alCargar, 'no encuentro el handler de load');
  assert.match(alCargar[0], /_lbpLatido\(true\)/, 'al cargar no late');

  const alVolver = html.match(/visibilityState === 'visible' && window\._cloudPull[\s\S]{0,400}?\}\);/);
  assert.ok(alVolver, 'no encuentro el handler de visible');
  assert.match(alVolver[0], /_lbpLatido\(\)/, 'al volver al frente no late');

  const alFallar = html.match(/\[LBP SYNC\] Push result[\s\S]{0,500}?\}\);/);
  assert.ok(alFallar, 'no encuentro el then del push');
  assert.match(alFallar[0], /!r\.ok[\s\S]{0,120}_lbpLatido\(true\)/, 'una subida fallida no late');
});
