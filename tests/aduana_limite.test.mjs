// Campos de aduana en el modulo Ship (5-nov-2026). El cuadro de
// desaduanizaciones de Pepe trae fecha limite, tributos Bs y bultos; el modulo
// no tenia donde guardarlos. El limite es el que cuesta plata, asi que ademas
// avisa en Home, por delante del resto (la lista se corta en 5).
// Las funciones no se leen como texto: se extraen y se ejecutan de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

// Saca una funcion declarada del HTML y la devuelve ejecutable.
function traer(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  assert.ok(i > 0, 'no encuentro function ' + nombre);
  let p = html.indexOf('{', i), nivel = 0, fin = -1;
  for (let j = p; j < html.length; j++) {
    if (html[j] === '{') nivel++;
    else if (html[j] === '}' && --nivel === 0) { fin = j + 1; break; }
  }
  assert.ok(fin > 0, 'no cierra ' + nombre);
  return new Function(html.slice(i, fin) + '; return ' + nombre + ';')();
}

const _impNum = traer('_impNum');
const _impDiasLimite = traer('_impDiasLimite');
const _impLimiteTexto = traer('_impLimiteTexto');
const _impLimiteColor = traer('_impLimiteColor');

test('_impNum entiende el punto de miles y la coma decimal', () => {
  assert.equal(_impNum('4640'), 4640);
  assert.equal(_impNum('14.341'), 14341, '"14.341" son catorce mil, no 14,341');
  assert.equal(_impNum('530.914'), 530914);
  assert.equal(_impNum('1.750.997'), 1750997);
  assert.equal(_impNum('1,600,000'), 1600000);
  assert.equal(_impNum('226121.7'), 226121.7, 'un punto con 1 digito sigue siendo decimal');
  assert.equal(_impNum(''), 0);
  assert.equal(_impNum(null), 0);
  assert.equal(_impNum(undefined), 0);
  assert.equal(_impNum('cualquier cosa'), 0);
  assert.equal(_impNum(3267), 3267);
});

test('los dias al limite se cuentan por dia calendario', () => {
  const hoyD = new Date();
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dia = (n) => iso(new Date(hoyD.getFullYear(), hoyD.getMonth(), hoyD.getDate() + n));
  assert.equal(_impDiasLimite({ limiteAduana: dia(0) }), 0, 'hoy es 0, no 1 ni -1');
  assert.equal(_impDiasLimite({ limiteAduana: dia(1) }), 1);
  assert.equal(_impDiasLimite({ limiteAduana: dia(-3) }), -3);
  assert.equal(_impDiasLimite({ limiteAduana: dia(30) }), 30);
});

test('un despacho cerrado o sin limite no cuenta', () => {
  assert.equal(_impDiasLimite({}), null);
  assert.equal(_impDiasLimite({ limiteAduana: '' }), null);
  assert.equal(_impDiasLimite(null), null);
  assert.equal(_impDiasLimite({ limiteAduana: '2026-11-06', status: 'RECIBIDO' }), null);
  assert.equal(_impDiasLimite({ limiteAduana: '2026-11-06', status: 'CANCELADO' }), null);
  assert.equal(_impDiasLimite({ limiteAduana: 'no-es-fecha' }), null);
});

test('el texto y el color dicen lo que pasa', () => {
  assert.equal(_impLimiteTexto(0), 'vence HOY');
  assert.equal(_impLimiteTexto(1), 'vence en 1 día');
  assert.equal(_impLimiteTexto(4), 'vence en 4 días');
  assert.equal(_impLimiteTexto(-1), 'VENCIDO hace 1 día');
  assert.equal(_impLimiteTexto(-3), 'VENCIDO hace 3 días');
  assert.equal(_impLimiteColor(-3), '#ef4444');
  assert.equal(_impLimiteColor(0), '#ef4444');
  assert.equal(_impLimiteColor(5), '#FF9800');
  assert.equal(_impLimiteColor(30), 'var(--text-dim)');
  assert.equal(_impLimiteColor(null), 'var(--text-dim)');
});

test('el formulario guarda los tres campos nuevos', () => {
  const f = html.match(/var emptyForm = \{clientId.*?\};/);
  assert.ok(f, 'no encuentro emptyForm');
  for (const campo of ['limiteAduana', 'tributos', 'bultos']) {
    assert.ok(f[0].includes(campo + ":''"), 'emptyForm no trae ' + campo);
  }
  assert.match(html, /'⏳ Límite en aduana'/, 'falta el campo de fecha limite en el modal');
  assert.match(html, /'🧳 Bultos'/, 'falta bultos en el modal');
  assert.match(html, /'🧾 Tributos Bs'/, 'falta tributos en el modal');
  for (const campo of ['limiteAduana', 'tributos', 'bultos']) {
    assert.ok(html.includes('{' + campo + ':e.target.value}'), 'el input de ' + campo + ' no escribe el estado');
  }
});

test('el CSV se lleva las tres columnas, en el mismo orden que las filas', () => {
  const h = html.match(/var headers = \['Franquicia'.*?\];/)[0];
  const r = html.match(/return \[c\?\(c\.businessName\|\|c\.name\):'',imp\.season.*?\];/)[0];
  // El .replace(/,/g,';') de las observaciones mete dos comas que no son
  // separadores de columna: se saca antes de contar.
  const cols = (s) => s.replace(/\.replace\(\/,\/g,';'\)/, '').split(',').length;
  assert.equal(cols(h), cols(r), 'cabeceras y filas no coinciden');
  assert.equal(cols(h), 14, 'tienen que ser 14 columnas');
  for (const col of ['Límite Aduana', 'Tributos Bs', 'Bultos']) assert.ok(h.includes(col), 'falta columna ' + col);
  assert.ok(r.indexOf('imp.limiteAduana') < r.indexOf('imp.tributos'), 'limite va antes de tributos');
  assert.ok(r.indexOf('imp.tributos') < r.indexOf('imp.bultos'), 'tributos va antes de bultos');
});

test('el aviso de aduana va por delante en Home', () => {
  const i = html.indexOf("var _adu=[];");
  assert.ok(i > 0, 'no encuentro el bloque de avisos de aduana');
  assert.ok(html.includes('alerts=_adu.concat(alerts);'),
    'los avisos de aduana tienen que ir ADELANTE: la lista se corta en 5');
  const corte = html.indexOf('alerts.slice(0,5)');
  assert.ok(corte > i, 'el bloque tiene que estar antes del corte');
  assert.ok(html.includes("if(d===null||d>7)return;"), 'el aviso tiene que mirar solo los proximos 7 dias');
});

test('el resumen Por Marca ya no suma con Number()', () => {
  const i = html.indexOf('var byBrand = {};');
  const cuerpo = html.slice(i, i + 900);
  assert.ok(cuerpo.includes('_impNum(imp.amount)'), 'el monto sigue con Number()');
  assert.ok(cuerpo.includes('_impNum(imp.items)'), 'las prendas siguen con Number()');
  assert.ok(cuerpo.includes('_impNum(imp.tributos)'), 'no suma tributos');
  assert.ok(!/Number\(imp\.(amount|items)\|\|0\)/.test(cuerpo), 'quedo un Number(imp...) sin cambiar');
});

test('la tarjeta muestra el limite, los bultos y los tributos', () => {
  const i = html.indexOf("' prendas')");
  const cuerpo = html.slice(i - 900, i + 900);
  assert.ok(cuerpo.includes('Límite en aduana'), 'la tarjeta no muestra el limite');
  assert.ok(cuerpo.includes('bultos'), 'la tarjeta no muestra los bultos');
  assert.ok(cuerpo.includes('Tributos Bs'), 'la tarjeta no muestra los tributos');
  assert.ok(cuerpo.includes('_impNum(imp.items)'), 'la tarjeta sigue con Number() en prendas');
});

test('la IA de logistica y el informe ven el limite', () => {
  assert.match(html, /LIMITE EN ADUANA:/, 'la IA no recibe la fecha limite');
  assert.match(html, /ADUANA ' \+ _impLimiteTexto\(dLim\)\.toUpperCase\(\)/, 'el informe no marca lo que vence');
});

test('la version subio a 5.66', () => {
  assert.match(html, /window\.LBP_VERSION = '5\.66';/);
});

// Los despachos no se sincronizaban por item: 'imports' no estaba en
// _SYNC_LISTS, asi que el merge tomaba la lista entera del lado con la marca de
// tiempo mas nueva y el otro lado perdia lo suyo. Si esto se rompe, cargar un
// despacho en la Mac puede borrar el que se cargo en el telefono.
// El bloque lleva comentarios que nombran listas entre comillas, asi que hay
// que sacarlos antes de leer los nombres de verdad.
function listasSync() {
  const m = html.match(/var _SYNC_LISTS = \[([\s\S]*?)\];/);
  assert.ok(m, 'no encuentro _SYNC_LISTS');
  const sinComentarios = m[1].replace(/\/\/[^\n]*/g, '');
  return [...sinComentarios.matchAll(/'([a-zA-Z]+)'/g)].map(x => x[1]);
}

test('imports entra en el merge por item', () => {
  assert.ok(listasSync().includes('imports'), "'imports' tiene que estar en _SYNC_LISTS");
});

// El merge filtra por `id`: una lista de texto suelto se borraria entera.
test('las listas de texto suelto quedan fuera del merge', () => {
  const listas = listasSync();
  for (const k of ['finCategories', 'docCategories']) {
    assert.ok(!listas.includes(k), k + ' es una lista de strings: el merge la borraria');
  }
});
