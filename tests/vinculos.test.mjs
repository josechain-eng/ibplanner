// Vinculos dentro de una nota: un chip que lleva al item y una vuelta.
//
// Pepe, 25-nov-2026: "que la app nos deje poner como un link hacia la tarea,
// proyecto, reunion, otra nota, marketing, shipments... para ir ahi rapido a
// ver el detalle de ese punto y luego poder volver a la lista".
//
// El "ir" ya existia desde el 24-nov (_lbpIr, hecho para la notificacion y la
// busqueda): navega Y abre el item. Lo que falta y se prueba aca es (a) el chip
// dentro del contenido, (b) que su etiqueta siga siendo la de hoy aunque
// renombres la tarea, y (c) por donde se vuelve.
//
// La zona se fija en UTC: este Mac corre en America/La_Paz y una prueba de
// fechas que pasa solo por la zona del equipo no prueba nada.
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'LifeBusinessPlanner2026.html'), 'utf8');

function cuerpo(i, abre) {
  let nivel = 0;
  const cierra = abre === '[' ? ']' : '}';
  for (let j = html.indexOf(abre, i); j < html.length; j++) {
    if (html[j] === abre) nivel++;
    else if (html[j] === cierra && --nivel === 0) return html.slice(i, j + 1);
  }
  assert.fail('no cierra');
}
function fuenteWin(nombre) {
  const i = html.indexOf('window.' + nombre + ' = function');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i, '{') + ';\n';
}
function fuenteArr(nombre) {
  const i = html.indexOf('window.' + nombre + ' = [');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i, '[') + ';\n';
}
function fuenteObj(nombre) {
  const i = html.indexOf('window.' + nombre + ' = {');
  assert.ok(i > 0, 'no encuentro window.' + nombre);
  return cuerpo(i, '{') + ';\n';
}

const FUENTES = fuenteArr('_LBP_VINC_TIPOS') +
  fuenteObj('_LBP_IR_RUTAS') + fuenteObj('_LBP_IR_ABRE') +
  fuenteWin('_lbpVincEsc') + fuenteWin('_lbpVincNorm') +
  fuenteWin('_lbpVincTipo') + fuenteWin('_lbpVincEtiqueta') +
  fuenteWin('_lbpVincInterior') + fuenteWin('_lbpChipVinculo') +
  fuenteWin('_lbpIndiceVinculos') +
  fuenteWin('_lbpBuscarEnIndice') + fuenteWin('_lbpBuscarVinculables') +
  fuenteWin('_lbpPintarVinculos');

function ventana() {
  // _lbpIr despacha un evento y toca el DOM: se le dan dobles para poder
  // ejecutarlo de verdad en Node en vez de solo leer su codigo.
  const eventos = [];
  const win = new Function('registrarEvento', `
    var window = { dispatchEvent: function(e){ registrarEvento(e); },
                   addEventListener: function(){} };
    var Event = function(t){ this.type = t; };
    ${FUENTES}
    ${fuenteWin('_lbpIr')}
    window.__eventos = registrarEvento;
    return window;
  `)(function (e) { eventos.push(e && e.type); });
  win.__vistos = eventos;
  return win;
}

const W = ventana();

// Datos de la forma REAL del blob, verificada el 25-nov contra la nube:
// tasks/journal/meetings/transactions llevan `title`, projects/documents/
// campaigns/habits/clients llevan `name`, y los despachos (imports) no llevan
// ningun campo de titulo.
const DATOS = {
  tasks: [{ id: 't1', title: 'Sacar llave banco' }, { id: 't2', title: 'Pagar planos Chilli' }],
  projects: [{ id: 'p1', name: 'MANGO' }],
  goals: [],
  journal: [{ id: 'n1', title: 'Hablar con Abdallah', entryType: 'note' }],
  meetings: [{ id: 'm1', title: 'Sergio Rivero - Cumpleanos' }],
  documents: [{ id: 'd1', name: 'Banco Mama BofA' }],
  routines: [],
  habits: [],
  campaigns: [{ id: 'c1', name: 'Black Friday 2026' }],
  imports: [{ id: 'i1', clientId: 'cl1', season: 'Marzo 2026', dateDispatch: '2026-03-16' },
            { id: 'i2', clientId: 'cl1', season: '', dateDispatch: '2026-09-17' },
            { id: 'i3', clientId: 'noexiste', season: '', dateDispatch: '' }],
  clients: [{ id: 'cl1', name: 'Habib Rodriguez', businessName: 'Boss' },
            { id: 'cl2', name: 'AX' }],
  transactions: [{ id: 'x1', title: 'Cafe desayuno Ame VVI' }]
};

// ── El indice: ruta:id -> etiqueta de hoy ──────────────────────────────────

test('el indice cubre los 12 tipos que se pueden vincular', () => {
  const rutas = W._LBP_VINC_TIPOS.map((t) => t.ruta);
  assert.deepEqual(rutas.slice().sort(), [
    'campaigns', 'clients', 'documents', 'finance', 'goals', 'habits',
    'imports', 'journal', 'meetings', 'projects', 'routines', 'tasks'
  ], 'cambio la lista de tipos vinculables');
});

test('cada tipo vinculable es una ruta que el router conoce', () => {
  // Sin esto, _lbpIr rechaza el destino y el chip no hace nada al tocarlo.
  for (const t of W._LBP_VINC_TIPOS) {
    assert.ok(Object.prototype.hasOwnProperty.call(W._LBP_IR_RUTAS, t.ruta),
      'la ruta ' + t.ruta + ' no esta en _LBP_IR_RUTAS: el chip seria un boton muerto');
  }
});

test('el indice saca la etiqueta del campo real de cada lista', () => {
  const ix = W._lbpIndiceVinculos(DATOS);
  assert.equal(ix['tasks:t1'].etiqueta, 'Sacar llave banco');
  assert.equal(ix['projects:p1'].etiqueta, 'MANGO');
  assert.equal(ix['journal:n1'].etiqueta, 'Hablar con Abdallah');
  assert.equal(ix['meetings:m1'].etiqueta, 'Sergio Rivero - Cumpleanos');
  assert.equal(ix['documents:d1'].etiqueta, 'Banco Mama BofA');
  assert.equal(ix['campaigns:c1'].etiqueta, 'Black Friday 2026');
  assert.equal(ix['finance:x1'].etiqueta, 'Cafe desayuno Ame VVI');
});

test('la franquicia se muestra por su MARCA, no por el nombre del contacto', () => {
  // clients.name es la persona ("Habib Rodriguez") y businessName la marca
  // ("Boss"). En una nota de reunion lo util es la marca.
  const ix = W._lbpIndiceVinculos(DATOS);
  assert.equal(ix['clients:cl1'].etiqueta, 'Boss');
  assert.equal(ix['clients:cl2'].etiqueta, 'AX', 'sin businessName tiene que caer al name');
});

test('un despacho no tiene titulo: la etiqueta se arma con marca y temporada', () => {
  const ix = W._lbpIndiceVinculos(DATOS);
  assert.equal(ix['imports:i1'].etiqueta, 'Boss · Marzo 2026');
  assert.equal(ix['imports:i2'].etiqueta, 'Boss · 2026-09-17',
    'sin temporada tiene que usar la fecha de despacho');
  assert.equal(ix['imports:i3'].etiqueta, 'Despacho',
    'sin marca ni fecha igual tiene que decir algo');
});

test('un item sin id no entra al indice', () => {
  const ix = W._lbpIndiceVinculos({ tasks: [{ title: 'sin id' }, { id: 't9', title: 'con id' }] });
  assert.deepEqual(Object.keys(ix), ['tasks:t9']);
  assert.ok(!Object.keys(ix).some((k) => k.indexOf('undefined') >= 0));
});

test('el indice aguanta data vacia y listas que no existen', () => {
  assert.deepEqual(W._lbpIndiceVinculos(null), {});
  assert.deepEqual(W._lbpIndiceVinculos({}), {});
});

// ── El chip ────────────────────────────────────────────────────────────────

test('el chip lleva la ruta, el id y es atomico en el editor', () => {
  const chip = W._lbpChipVinculo('tasks', 't1', W._lbpVincInterior('Sacar llave banco', '📋'));
  assert.match(chip, /data-ir="tasks"/);
  assert.match(chip, /data-ref="t1"/);
  assert.match(chip, /class="lbp-vinculo"/);
  // Sin contenteditable=false se puede escribir DENTRO del chip y el enlace
  // queda partido en dos. Es la misma razon por la que el checkbox lo lleva.
  assert.match(chip, /contenteditable="false"/);
  assert.ok(chip.indexOf('Sacar llave banco') > 0);
});

test('el chip escapa el titulo: una nota se pinta con innerHTML', () => {
  // RichContent usa dangerouslySetInnerHTML. Una tarea titulada con HTML no
  // puede convertirse en etiquetas al insertarla en la nota.
  const chip = W._lbpChipVinculo('tasks', 't1',
    W._lbpVincInterior('<img src=x onerror=alert(1)> & "ya"', ''));
  assert.ok(chip.indexOf('<img') < 0, 'metio una etiqueta img cruda en la nota');
  assert.ok(chip.indexOf('onerror') < 0 || chip.indexOf('&lt;img') > 0);
  assert.match(chip, /&amp;/);
});

test('el chip escapa tambien los atributos', () => {
  const chip = W._lbpChipVinculo('tasks', 'a" onclick="x', W._lbpVincInterior('t', ''));
  assert.ok(chip.indexOf('onclick="x') < 0, 'un id con comillas rompe el atributo');
});

// ── Pintar: la etiqueta de hoy, no la de cuando lo vinculaste ──────────────

test('si renombras la tarea, el chip muestra el nombre NUEVO', () => {
  const guardado = '<div>Ver ' +
    W._lbpChipVinculo('tasks', 't1', W._lbpVincInterior('Nombre VIEJO', '📋')) +
    ' antes del lunes</div>';
  const pintado = W._lbpPintarVinculos(guardado, W._lbpIndiceVinculos(DATOS));
  assert.ok(pintado.indexOf('Sacar llave banco') > 0, 'siguio mostrando el nombre viejo');
  assert.ok(pintado.indexOf('Nombre VIEJO') < 0);
  assert.ok(pintado.indexOf('antes del lunes') > 0, 'se comio el texto de alrededor');
});

test('pintar es idempotente: pintar lo pintado da lo mismo', () => {
  // Importa porque el innerHTML pintado se guarda si tildas un checkbox de la
  // nota. Si pintar no fuera idempotente, cada tilde ensuciaria el contenido.
  const ix = W._lbpIndiceVinculos(DATOS);
  const uno = W._lbpPintarVinculos(
    '<div>' + W._lbpChipVinculo('tasks', 't1', W._lbpVincInterior('viejo', '')) + '</div>', ix);
  const dos = W._lbpPintarVinculos(uno, ix);
  assert.equal(dos, uno);
  assert.equal(W._lbpPintarVinculos(dos, ix), uno);
});

test('si borraste el item, el chip lo dice y NO pierde el texto', () => {
  const ix = W._lbpIndiceVinculos(DATOS);
  const guardado = W._lbpChipVinculo('tasks', 'borrada',
    W._lbpVincInterior('Tarea que ya no esta', '📋'));
  const pintado = W._lbpPintarVinculos(guardado, ix);
  assert.match(pintado, /lbp-vinculo-roto/, 'no marco el vinculo roto');
  assert.ok(pintado.indexOf('Tarea que ya no esta') > 0,
    'perdio la etiqueta: la nota quedaria sin decir a que apuntaba');
});

test('pintar un vinculo roto tambien es idempotente', () => {
  const ix = W._lbpIndiceVinculos(DATOS);
  const uno = W._lbpPintarVinculos(
    W._lbpChipVinculo('tasks', 'borrada', W._lbpVincInterior('X', '')), ix);
  assert.equal(W._lbpPintarVinculos(uno, ix), uno);
});

test('el item vuelve a existir y el chip se cura solo', () => {
  const roto = W._lbpPintarVinculos(
    W._lbpChipVinculo('tasks', 't1', W._lbpVincInterior('X', '')), {});
  assert.match(roto, /lbp-vinculo-roto/);
  const curado = W._lbpPintarVinculos(roto, W._lbpIndiceVinculos(DATOS));
  assert.ok(curado.indexOf('lbp-vinculo-roto') < 0, 'quedo marcado como roto para siempre');
  assert.ok(curado.indexOf('Sacar llave banco') > 0);
});

test('pintar NO toca los checkboxes ni el resto de la nota', () => {
  // Las notas de Pepe son checklists de 24 y 59 puntos: si pintar les mueve
  // una coma, se rompe lo que ya funciona.
  const cb = '<input type="checkbox" contenteditable="false" style="position: absolute; ' +
    'left: 0px; top: 3px; width: 15px; height: 15px; accent-color: rgb(156, 104, 214); ' +
    'cursor: pointer;">';
  const nota = '<div><b>Ventas al momento</b></div><ul class="rte-checklist">' +
    '<li>' + cb + '&nbsp;Ver el tablero</li>' +
    '<li>' + cb + '&nbsp;Cerrar el mes</li></ul>';
  assert.equal(W._lbpPintarVinculos(nota, W._lbpIndiceVinculos(DATOS)), nota);
});

test('pintar aguanta una nota sin vinculos, vacia o nula', () => {
  const ix = W._lbpIndiceVinculos(DATOS);
  assert.equal(W._lbpPintarVinculos('', ix), '');
  assert.equal(W._lbpPintarVinculos(null, ix), null);
  assert.equal(W._lbpPintarVinculos('<div>texto</div>', ix), '<div>texto</div>');
});

test('pinta varios chips en la misma nota', () => {
  const ix = W._lbpIndiceVinculos(DATOS);
  const nota = W._lbpChipVinculo('tasks', 't1', W._lbpVincInterior('a', '')) + ' y ' +
               W._lbpChipVinculo('projects', 'p1', W._lbpVincInterior('b', '')) + ' y ' +
               W._lbpChipVinculo('imports', 'i1', W._lbpVincInterior('c', ''));
  const p = W._lbpPintarVinculos(nota, ix);
  assert.ok(p.indexOf('Sacar llave banco') > 0);
  assert.ok(p.indexOf('MANGO') > 0);
  assert.ok(p.indexOf('Boss · Marzo 2026') > 0);
});

// ── El buscador del chip ───────────────────────────────────────────────────

test('busca por pedazo del titulo, sin importar mayusculas ni tildes', () => {
  const r = W._lbpBuscarVinculables(DATOS, 'planos', 20);
  assert.equal(r.length, 1);
  assert.equal(r[0].refId, 't2');
  assert.equal(r[0].ruta, 'tasks');
  assert.ok(W._lbpBuscarVinculables(DATOS, 'LLAVE', 20).some((x) => x.refId === 't1'),
    'no encontro en mayusculas');
  assert.ok(W._lbpBuscarVinculables(DATOS, 'cumpleanos', 20).some((x) => x.refId === 'm1'));
  assert.ok(W._lbpBuscarVinculables(DATOS, 'cumpleaños', 20).some((x) => x.refId === 'm1'),
    'buscar con tilde/enie tiene que encontrar lo mismo');
});

test('el buscador dice de que tipo es cada resultado', () => {
  const r = W._lbpBuscarVinculables(DATOS, 'mango', 20);
  assert.ok(r.length >= 1);
  assert.equal(r[0].nombre, 'Proyecto');
  assert.ok(r[0].icono);
});

test('el buscador encuentra un despacho por su marca', () => {
  const r = W._lbpBuscarVinculables(DATOS, 'boss', 20);
  assert.ok(r.some((x) => x.ruta === 'imports'), 'no encontro el despacho de Boss');
});

test('el buscador respeta el tope', () => {
  const muchas = { tasks: [] };
  for (let i = 0; i < 80; i++) muchas.tasks.push({ id: 't' + i, title: 'cosa ' + i });
  assert.equal(W._lbpBuscarVinculables(muchas, 'cosa', 25).length, 25);
});

test('una busqueda vacia no devuelve las 300 cosas', () => {
  const r = W._lbpBuscarVinculables(DATOS, '', 25);
  assert.ok(r.length <= 25);
});

// ── Ir y volver ────────────────────────────────────────────────────────────

test('_lbpIr sigue rechazando una ruta que no existe', () => {
  const w = ventana();
  assert.equal(w._lbpIr({ ruta: 'inventada', refId: 'x' }), false);
  assert.deepEqual(w.__vistos, [], 'navego a una ruta que el router no conoce');
});

test('_lbpIr guarda de donde vengo para poder volver', () => {
  const w = ventana();
  const ok = w._lbpIr({ ruta: 'tasks', refId: 't1' },
    { ruta: 'journal', refId: 'n1', etiqueta: 'Hablar con Abdallah' });
  assert.equal(ok, true);
  assert.deepEqual(w._lbpVolver, { ruta: 'journal', refId: 'n1', etiqueta: 'Hablar con Abdallah' });
  assert.deepEqual(w._lbpPendingEdit, { type: 'tasks', id: 't1' }, 'no abre el item');
});

test('sin origen no queda ninguna vuelta colgada', () => {
  // La notificacion y la busqueda llaman a _lbpIr sin origen: ahi no hay a
  // donde volver y la franja no tiene que aparecer.
  const w = ventana();
  w._lbpVolver = { ruta: 'journal', refId: 'viejo' };
  w._lbpIr({ ruta: 'tasks', refId: 't1' });
  assert.equal(w._lbpVolver, null, 'dejo una vuelta vieja que llevaria a otra parte');
});

test('un origen con ruta invalida no se guarda', () => {
  const w = ventana();
  w._lbpIr({ ruta: 'tasks', refId: 't1' }, { ruta: 'inventada', refId: 'z' });
  assert.equal(w._lbpVolver, null);
});

test('volver al mismo lugar no se guarda como vuelta', () => {
  // Tocar un chip que apunta a la nota donde ya estas no tiene que dejar una
  // franja "volver a esta misma nota".
  const w = ventana();
  w._lbpIr({ ruta: 'journal', refId: 'n1' }, { ruta: 'journal', refId: 'n1', etiqueta: 'A' });
  assert.equal(w._lbpVolver, null);
});

// ── Estructura: lo que no se puede ejecutar en Node ────────────────────────

test('RichContent pinta los vinculos antes de mostrar la nota', () => {
  const i = html.indexOf('var RichContent = function RichContent');
  assert.ok(i > 0);
  const bloque = html.slice(i, i + 2600);
  assert.match(bloque, /_lbpPintarVinculos/,
    'RichContent muestra el html guardado sin pintar: los chips quedarian con el nombre viejo');
});

test('tocar el chip en la vista de lectura llama a _lbpIr', () => {
  const i = html.indexOf('var RichContent = function RichContent');
  const bloque = html.slice(i, i + 2600);
  assert.match(bloque, /lbp-vinculo/);
  assert.match(bloque, /_lbpIr\(/, 'el chip no navega a ningun lado');
});

test('el chip se puede tocar aunque la nota no tenga checkboxes', () => {
  // El onClick de RichContent existia SOLO si llegaba onToggle (era para los
  // checkboxes). Una nota sin checkboxes no recibe onToggle y el chip quedaria
  // muerto.
  const i = html.indexOf('var RichContent = function RichContent');
  const bloque = html.slice(i, i + 2600);
  assert.ok(!/onClick:\s*onToggle\s*\?/.test(bloque),
    'el onClick sigue condicionado a onToggle: sin checkboxes el vinculo no responde');
});

test('la barra del editor tiene el boton de vincular', () => {
  const i = html.indexOf('className: "rte-toolbar"');
  assert.ok(i > 0);
  const barra = html.slice(i, html.indexOf('className: "rte-body"', i));
  assert.match(barra, /_lbpAbrirVinculador|vincPick/,
    'no hay boton para insertar un vinculo en la barra del editor');
});

test('hay estilo para el chip y para el chip roto', () => {
  assert.match(html, /\.lbp-vinculo\s*\{/, 'el chip no tiene estilo: seria texto suelto');
  assert.match(html, /\.lbp-vinculo-roto/);
});

test('un chip que parte en dos renglones no queda cortado', () => {
  // Visto en el navegador a 375 px el 25-nov: "MANGO VENTURA SUR" parte en dos
  // y sin box-decoration-break la pildora queda abierta por la mitad.
  const i = html.indexOf('.lbp-vinculo {');
  assert.match(html.slice(i, i + 700), /box-decoration-break:\s*clone/);
});

test('el chip no se pega a la palabra de antes', () => {
  // Visto en el navegador el 25-nov: el espacio normal al final de un nodo de
  // texto se colapsa contra el elemento que sigue y quedaba "Coordinar con[chip]".
  const i = html.indexOf('var _insertarVinculo = function');
  assert.ok(i > 0, 'no encuentro la insercion del chip');
  const bloque = html.slice(i, i + 1800);
  assert.match(bloque, /_antes/, 'no calcula el espacio de adelante');
  assert.match(bloque, /insertHTML', false, _antes \+ chip/,
    'inserta el chip sin el espacio duro de adelante');
});

test('las 5 pantallas nuevas saben ABRIR el item, no solo la pantalla', () => {
  // Pepe pidio "completo de una": campanas, despachos, franquicias y finanzas
  // tienen que abrir la fila, no dejarte en la lista.
  for (const ruta of ['campaigns', 'imports', 'clients', 'finance']) {
    assert.ok(Object.prototype.hasOwnProperty.call(W._LBP_IR_ABRE, ruta),
      ruta + ' no esta en _LBP_IR_ABRE: el vinculo dejaria a Pepe en la pantalla');
  }
});

test('cada pantalla que promete abrir el item consume _lbpPendingEdit', () => {
  // Estar en _LBP_IR_ABRE sin consumir el pendiente es peor que no estar: deja
  // basura en window que nadie limpia y el item no se abre igual.
  const pantallas = {
    tasks: 'TasksScreen', projects: 'ProjectsScreen', goals: 'GoalsScreen',
    journal: 'JournalScreen', meetings: 'MeetingsScreen', documents: 'DocumentsScreen',
    routines: 'RoutinesScreen', habits: 'HabitsScreen',
    campaigns: 'CampaignsScreen', imports: 'ImportsScreen',
    clients: 'ClientsScreen', finance: 'FinanceScreen'
  };
  for (const ruta of Object.keys(W._LBP_IR_ABRE)) {
    const comp = pantallas[ruta];
    assert.ok(comp, 'ruta ' + ruta + ' en _LBP_IR_ABRE sin pantalla conocida en esta prueba');
    const i = html.indexOf('var ' + comp + ' = function');
    assert.ok(i > 0, 'no encuentro ' + comp);
    const cuerpoComp = html.slice(i, html.indexOf('\nvar ', i + 10));
    assert.match(cuerpoComp, new RegExp("_lbpPendingEdit[\\s\\S]{0,400}'" + ruta + "'"),
      comp + ' no consume _lbpPendingEdit para ' + ruta);
  }
});

test('la franja de volver existe y usa _lbpVolver', () => {
  assert.match(html, /_lbpVolver/, 'no hay nada que lea la vuelta');
  const i = html.indexOf('lbp-volver');
  assert.ok(i > 0, 'no hay franja de volver en la interfaz');
});

test('en la vista la pildora va en el renglon, no en una columna aparte', () => {
  // 25-nov, celular de Pepe: al abrir la nota los vinculos salian como una
  // columna angosta con el texto partido al medio ("Man / go"); en la PC,
  // despegados contra el margen derecho. En el editor se veian bien, y por eso
  // parecia que se "arreglaban" al volver de la tarea.
  // Causa: `.rte-render .rte-checklist li` era display:flex, asi que CADA
  // <span> del vinculo se volvia un item flex -- una columna propia -- en vez
  // de texto corrido. El editor (.rte-body) usa display:block con el checkbox
  // absoluto y nunca tuvo el problema. Las dos vistas usan el mismo molde.
  const regla = (sel) => {
    const i = html.indexOf(sel + ' {');
    assert.ok(i > 0, 'no encuentro la regla ' + sel);
    return html.slice(i, html.indexOf('}', i));
  };
  const vista = regla('.rte-render .rte-checklist li');
  assert.ok(!/display\s*:\s*flex/.test(vista),
    'el <li> de la vista volvio a ser flex: cada pildora seria una columna');
  assert.match(vista, /display\s*:\s*block/, 'el <li> de la vista no es block');
  const caja = regla('.rte-render .rte-checklist li input[type=checkbox]');
  assert.match(caja, /position\s*:\s*absolute/,
    'sin el checkbox absoluto el texto se le encima');
});
