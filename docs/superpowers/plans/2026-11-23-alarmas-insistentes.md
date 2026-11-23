# Alarmas insistentes para las tareas del correo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una tarea venida del correo vuelva a sonar cada 2 días hábiles hasta
que se marque hecha, y que la ventana de Alertas se pueda ver entera y despachar
sin salir de ella.

**Architecture:** Un tipo de repetición nuevo (`'weekdays2'`) dentro del motor de
fechas que ya existe, alimentado por una única definición compartida de «día
hábil» que también usa la elección de fecha de la tarea. Una función pura
convierte las tareas ya aceptadas. Las seis reglas de alerta se extraen del JSX a
una función pura, y una ventana nueva las lista todas.

**Tech Stack:** Un solo archivo HTML con React **compilado** (`React.createElement`,
sin JSX). Pruebas con `node:test` que **extraen las funciones del HTML** y las
corren con `new Function`. Parches por reemplazo exacto de cadenas con Python.

**Spec:** `docs/superpowers/specs/2026-11-23-alarmas-insistentes-design.md`

## Global Constraints

- Todo el código de producción va en `LifeBusinessPlanner2026.html`. `worker.js`,
  `wrangler.toml` y el puente **no se tocan**.
- React compilado: `React.createElement`, nunca JSX. Sin sintaxis que el archivo
  no use ya (sin `let`/`const`/arrow en el código de producción: el archivo usa
  `var` y `function`).
- Cada parche es un script Python de reemplazo exacto en `scratchpad/`, que
  aborta si el texto buscado no aparece **exactamente una vez**. Después de cada
  parche: `node --check` sobre el JS en línea extraído.
- Hora local siempre. **Nunca `toISOString()`** para obtener un `YYYY-MM-DD`
  (Bolivia es UTC-4 y daría el día anterior). Vale dentro de una prueba solo si
  compara instantes, no fechas.
- Comando de pruebas: `node --test "tests/*.test.mjs"` — con las comillas. Sin
  ellas, node trata `tests/` como un archivo de prueba y da 1 falla, 0 pases.
- **Línea base medida en esta rama: 405 pases, 1 falla.** La falla es vieja y es
  de main: `tests/tarjeta_propuestas.test.mjs:97` exige
  `window.LBP_VERSION = '5.71'` y el HTML dice `'5.72'` desde la v5.72, que subió
  la versión sin tocar esa aserción. **La Tarea 1 la corrige a `'5.72'`** para que
  la suite arranque en verde y las fallas posteriores sean señal de verdad; la
  Tarea 4 la mueve a `'5.74'` al subir la versión. Base en verde: **406 pases,
  0 fallas**.
- Los conteos de pases de cada tarea son una **baranda, no una meta**: están para
  detectar que algo se rompió o que falta una prueba. Nunca se agrega una prueba
  para llegar al número.
- `grep -c` sale con código 1 cuando cuenta cero, así que una cadena `cmd && cmd`
  se corta sola. Verificar con `grep -c ... || true` o con Python.
- No se toca `'weekdays'`, el tipo que ya existe: lo usan hábitos y metas.
- Tampoco se toca el selector de recurrencia del editor por IA
  (`LifeBusinessPlanner2026.html:18344`): es un camino de **creación** de
  borradores con `'once'` por defecto, no de edición de tareas migradas.
- No se imprime ni se escribe en ningún lado el valor de una clave de sincronización.

## Review Focus

Cinco cosas que el diseño implica, que ninguna prueba de las tareas de abajo
cubre por sí sola, y que son las que más probablemente muerdan. Cada una tiene su
prueba asignada a la tarea dueña del código.

1. **Una tarea migrada con `alarm.datetime` de hace meses.** `_recentOccurrence`
   avanza de a pasos con un tope de 20.000 iteraciones y `_futureOccurrences` con
   uno de 6.000: con paso de 2 días hábiles una base de hace un año son ~130
   pasos, pero hay que probarlo, no suponerlo. Esperado: devuelve un día hábil
   `<= ahora` y no se cuelga. → Tarea 1.
2. **Un año para el que `_LBP_FERIADOS_MOVILES` devuelve `[]`** (año inválido o
   ausente). Esperado: «día hábil» sigue contestando por fin de semana y
   feriados fijos, sin tirar excepción. → Tarea 1.
3. **El cruce de año.** Las ocurrencias de fin de diciembre tienen que mirar los
   feriados **del año siguiente** (Año Nuevo, y en enero el Carnaval móvil, que
   cambia de fecha cada año). → Tarea 1.
4. **`_lbpAlertas` con un `data` incompleto** (`{}`, o listas en `undefined`,
   como queda un dispositivo nuevo antes del primer pull). Esperado: devuelve
   `[]`, no tira. → Tarea 3.
5. **El ✓ de la ventana sobre una tarea que otro dispositivo ya marcó hecha.**
   Esperado: no la resucita, no la duplica y la alerta desaparece. → Tarea 4.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `LifeBusinessPlanner2026.html` | Todo el código de producción. Cuatro zonas: el motor de fechas (~4984-5044), el editor de alarmas (~3730), el alta de tareas propuestas (~3659) y `HomeScreen` (~5273-6010). |
| `tests/repeticion_habiles2.test.mjs` | **Nuevo.** El día hábil compartido y el tipo `'weekdays2'`. |
| `tests/migracion_alarmas_correo.test.mjs` | **Nuevo.** La conversión de las ya aceptadas. |
| `tests/alertas.test.mjs` | **Nuevo.** Las seis reglas como función pura, el orden y el límite de días. |
| `tests/ventana_alertas.test.mjs` | **Nuevo.** Que la ventana esté montada, liste todas y lleve el ✓. |
| `scratchpad/patch_*.py` | Los parches. No se commitean (`scratchpad/` está ignorado). |

---

### Task 1: El día hábil compartido y la repetición «cada 2 días hábiles»

**Files:**
- Modify: `LifeBusinessPlanner2026.html` — nueva `window._lbpEsDiaHabil` junto a
  `window._LBP_FERIADOS_MOVILES`; `_futureOccurrences:4984-5008`;
  `_recentOccurrence:5010-5044`; `recurrenceLabels:3730-3737`;
  `REC_VALIDAS:18167`; `_tpProximoDiaHabil` (refactor); `_tpAplicar:3659`
- Test: `tests/repeticion_habiles2.test.mjs`

**Interfaces:**
- Produces:
  - `window._lbpEsDiaHabil(d: Date) -> boolean` — `false` si es sábado, domingo o
    feriado boliviano (los `cat:'feriado'` de `_LBP_EVENTS` más
    `_LBP_FERIADOS_MOVILES(d.getFullYear())`). Cachea la lista por año.
  - `recurrence: 'weekdays2'`, entendido por `_futureOccurrences` y
    `_recentOccurrence`, con etiqueta `Every 2 weekdays`.
- Consumes: `window._LBP_EVENTS`, `window._LBP_FERIADOS_MOVILES(anio)`.

- [ ] **Step 1: Escribir las pruebas que fallan, en `tests/repeticion_habiles2.test.mjs`**

Copiar el arnés de `tests/feriados_moviles.test.mjs:13-37` (`cuerpo`,
`fuenteWindow`, el corte de `_LBP_EVENTS` hasta el primer `\n  ];`) y agregar
`fuente(nombre)` como en `tests/tareas_propuestas.test.mjs:21-25` para las
funciones declaradas como `function nombre(`. Extraer:
`_LBP_FERIADOS_MOVILES`, `_lbpEsDiaHabil`, `_futureOccurrences`,
`_recentOccurrence`, `_tpProximoDiaHabil`.

Las fechas de abajo están **medidas**, no supuestas (Pascua 2027 = 28-mar;
Carnaval 2027 = 8 y 9 de febrero):

```js
const fmt = (ms) => { const d = new Date(ms);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
// `fmt` usa componentes locales a propósito: toISOString() daría el día anterior.

test('el dia habil excluye finde, feriado fijo y feriado movil', () => {
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 23, 12)), true);   // lunes
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 28, 12)), false);  // sabado
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 29, 12)), false);  // domingo
  assert.equal(win._lbpEsDiaHabil(new Date(2026, 11, 25, 12)), false);  // Navidad
  assert.equal(win._lbpEsDiaHabil(new Date(2027, 1, 9, 12)), false);    // Carnaval 2027
  assert.equal(win._lbpEsDiaHabil(new Date(2027, 1, 16, 12)), true);    // martes comun
});

test('weekdays2 avanza dos dias habiles', () => {
  const occ = win._futureOccurrences('2026-11-23T09:40:00', 'weekdays2', {}, new Date(2026,10,23,9,0).getTime());
  assert.deepEqual(occ.slice(0, 5).map(fmt),
    ['2026-11-25','2026-11-27','2026-12-01','2026-12-03','2026-12-07']);
});

test('weekdays2 saltea Carnaval', () => {
  const occ = win._futureOccurrences('2027-02-04T09:40:00', 'weekdays2', {}, new Date(2027,1,4,9,0).getTime());
  assert.deepEqual(occ.slice(0, 3).map(fmt), ['2027-02-10','2027-02-12','2027-02-16']);
});

test('weekdays2 cruza el ano mirando los feriados del ano nuevo', () => {
  // 1-ene es feriado fijo y cae viernes: el primer habil de 2027 es el lunes 4.
  const occ = win._futureOccurrences('2026-12-29T09:40:00', 'weekdays2', {}, new Date(2026,11,29,9,0).getTime());
  assert.deepEqual(occ.slice(0, 3).map(fmt), ['2026-12-31','2027-01-05','2027-01-07']);
});

test('ninguna ocurrencia cae en dia no habil', () => {
  const occ = win._futureOccurrences('2026-11-23T09:40:00', 'weekdays2', {}, new Date(2026,10,23,9,0).getTime());
  assert.ok(occ.length >= 15, 'esperaba al menos 15 ocurrencias en el horizonte de 60 dias');
  for (const ms of occ) assert.equal(win._lbpEsDiaHabil(new Date(ms)), true, fmt(ms));
});

test('una base de hace un ano no cuelga y da un dia habil pasado', () => {
  const ahora = new Date(2026, 10, 23, 12).getTime();
  const t = win._recentOccurrence('2025-11-24T09:40:00', 'weekdays2', {}, ahora);
  assert.ok(t <= ahora);
  assert.equal(win._lbpEsDiaHabil(new Date(t)), true);
});

test('un ano sin feriados moviles no rompe el dia habil', () => {
  const guardado = win._LBP_FERIADOS_MOVILES;
  win._LBP_FERIADOS_MOVILES = function() { return []; };
  try {
    assert.equal(win._lbpEsDiaHabil(new Date(2026, 11, 25, 12)), false); // el fijo sigue
    assert.equal(win._lbpEsDiaHabil(new Date(2026, 10, 28, 12)), false); // el sabado sigue
  } finally { win._LBP_FERIADOS_MOVILES = guardado; }
});

test('weekdays NO cambio: sigue cayendo en feriado', () => {
  // El refactor no puede haberle agregado feriados al tipo viejo, que usan
  // habitos y metas. Navidad 2026 es viernes: 'weekdays' tiene que incluirla.
  const occ = win._futureOccurrences('2026-12-21T09:40:00', 'weekdays', {}, new Date(2026,11,21,9,0).getTime());
  assert.ok(occ.map(fmt).includes('2026-12-25'), 'weekdays dejo de incluir Navidad');
});

test('una base de dias atras no queda dentro de la ventana de repesca', () => {
  // El diseno afirma que convertir no provoca avalancha de avisos: las ventanas
  // locales son de 5 y 15 min, asi que la ultima ocurrencia tiene que quedar
  // MUY lejos de ahora. Esto fija esa afirmacion.
  const ahora = new Date(2026, 10, 23, 12).getTime();
  const t = win._recentOccurrence('2026-11-16T09:40:00', 'weekdays2', {}, ahora);
  assert.ok(ahora - t > 15 * 60 * 1000, 'caeria dentro de la repesca y avisaria de golpe');
});

test('el tipo nuevo esta en el editor y en la lista blanca', () => {
  assert.match(html, /weekdays2: 'Every 2 weekdays'/);
  assert.match(html, /REC_VALIDAS = \[[^\]]*'weekdays2'/);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test "tests/repeticion_habiles2.test.mjs"`
Expected: FAIL — `no encuentro window._lbpEsDiaHabil`.

- [ ] **Step 3: Agregar `window._lbpEsDiaHabil(d)`** inmediatamente después del
cierre de `window._LBP_FERIADOS_MOVILES`

La lista de feriados de un año se arma una vez y se guarda en un objeto cache
fuera de la función, igual que hace `_tpProximoDiaHabil` hoy con su `cache`
local.

- [ ] **Step 4: Refactorizar `_tpProximoDiaHabil` para que use `_lbpEsDiaHabil`**

Queda una sola definición de «día hábil» en el archivo. Las pruebas de
`tests/feriados_moviles.test.mjs` (2026 y 2027, con y sin Carnaval) son las que
prueban que el refactor no cambió el comportamiento: tienen que seguir pasando
sin tocarlas.

- [ ] **Step 5: Agregar `'weekdays2'` al motor de fechas**

Cuatro puntos, todos en el patrón que ya existe para `'weekdays'`:
- `_futureOccurrences`, dentro de `step()` (junto a la rama de `:4996`): avanzar
  **dos** veces al siguiente día hábil.
- `_futureOccurrences`, la normalización previa (junto a `:5004`): si la base cae
  en día no hábil, correrla al siguiente hábil. Ojo: la rama de `'weekdays'` usa
  el chequeo de fin de semana y debe **quedar como está**; `'weekdays2'` usa
  `_lbpEsDiaHabil`.
- `_recentOccurrence`: `'weekdays2'` va por el camino de pasos (el de
  `monthly`/`weekdays`, `:5031-5038`), nunca por `stepMs`, y con la misma
  normalización previa.
- `recurrenceLabels:3735` y `REC_VALIDAS:18167`.

- [ ] **Step 6: `_tpAplicar:3659` → `recurrence: 'weekdays2'`**

La aserción de que la tarea nace con la repetición va en
`tests/tareas_propuestas.test.mjs`, **no** en el archivo nuevo: ese ya tiene el
`montar()` que fabrica una propuesta decidida `'ok'` y ya ejercita `_tpAplicar`.
Agregar ahí `assert.equal(creada.alarm.recurrence, 'weekdays2')` sobre la tarea
que devuelve el alta, dentro de la prueba que ya revisa la forma de la tarea
creada.

- [ ] **Step 7: Corregir la falla vieja de main**

`tests/tarjeta_propuestas.test.mjs:97` pasa a exigir `'5.72'`, que es la versión
real de esta rama. Es una aserción de guardia que quedó atrás cuando la v5.72
subió la versión; sin arreglarla, las cuatro tareas corren con una falla conocida
y el «0 fallas» no prueba nada.

- [ ] **Step 8: Correr las pruebas nuevas y la suite entera**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, con **al menos 416** pases y 0 fallas (406 en verde + las 10 del archivo nuevo). La aserción agregada en `tareas_propuestas` va dentro de una prueba que ya existe, no suma una prueba nueva.

- [ ] **Step 9: Commit**

```bash
git add tests/repeticion_habiles2.test.mjs tests/tareas_propuestas.test.mjs \
        tests/feriados_moviles.test.mjs tests/tarjeta_propuestas.test.mjs \
        LifeBusinessPlanner2026.html
git commit -m "Repeticion cada 2 dias habiles, con una sola definicion de dia habil"
```

---

### Task 2: La conversión de las tareas ya aceptadas

**Files:**
- Modify: `LifeBusinessPlanner2026.html` — nueva `window._lbpMigrarAlarmasCorreo`
  junto a `_lbpEsDiaHabil`; nuevo `useEffect` en `App` (después del efecto
  `onCloudSync`, ~`:20944`)
- Test: `tests/migracion_alarmas_correo.test.mjs`

**Interfaces:**
- Consumes: `recurrence: 'weekdays2'` (Tarea 1).
- Produces: `window._lbpMigrarAlarmasCorreo(tasks: Array) -> { tasks: Array, cambiadas: Number }`

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
const base = (over) => Object.assign({
  id: 't1', title: 'Pagar royalty', status: 'INBOX', tags: ['Correo'],
  alarm: { enabled: true, datetime: '2026-11-20T09:40:00', recurrence: 'once' }
}, over);

test('convierte la tarea del correo sin terminar', () => {
  const r = win._lbpMigrarAlarmasCorreo([base()]);
  assert.equal(r.cambiadas, 1);
  assert.equal(r.tasks[0].alarm.recurrence, 'weekdays2');
  assert.equal(r.tasks[0].alarm.datetime, '2026-11-20T09:40:00'); // la base NO se toca
});

test('es idempotente: la segunda pasada no cambia nada', () => {
  const r1 = win._lbpMigrarAlarmasCorreo([base()]);
  const r2 = win._lbpMigrarAlarmasCorreo(r1.tasks);
  assert.equal(r2.cambiadas, 0);
  assert.equal(r2.tasks, r1.tasks, 'sin cambios tiene que devolver el MISMO array');
});

test('no toca lo que no corresponde', () => {
  for (const t of [
    base({ status: 'DONE' }), base({ status: 'CANCELLED' }), base({ status: 'ARCHIVED' }),
    base({ tags: ['Trabajo'] }), base({ tags: undefined }),
    base({ alarm: { enabled: false, datetime: '2026-11-20T09:40:00', recurrence: 'once' } }),
    base({ alarm: { enabled: true, datetime: '2026-11-20T09:40:00', recurrence: 'daily' } }),
    base({ alarm: null }),
  ]) assert.equal(win._lbpMigrarAlarmasCorreo([t]).cambiadas, 0, JSON.stringify(t.alarm) + ' ' + t.status);
});

test('no inventa updatedAt: lo sella el camino de sincronizacion', () => {
  const r = win._lbpMigrarAlarmasCorreo([base()]);
  assert.equal('updatedAt' in r.tasks[0], false);
});

test('una lista vacia o ausente no rompe', () => {
  assert.equal(win._lbpMigrarAlarmasCorreo([]).cambiadas, 0);
  assert.equal(win._lbpMigrarAlarmasCorreo(undefined).cambiadas, 0);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test "tests/migracion_alarmas_correo.test.mjs"`
Expected: FAIL — `no encuentro window._lbpMigrarAlarmasCorreo`.

- [ ] **Step 3: Implementar `window._lbpMigrarAlarmasCorreo(tasks)`**

Las cuatro condiciones, todas a la vez: `tags` es un array que contiene
`'Correo'`; `status` no es `DONE`/`CANCELLED`/`ARCHIVED`; `alarm` existe con
`enabled` y `datetime`; y `(alarm.recurrence || 'once') === 'once'`.

Dos cosas que la firma no decide y el diseño sí:
- La tarea cambiada es un objeto nuevo con un `alarm` nuevo construido con
  `Object.assign({}, t.alarm, { recurrence: 'weekdays2' })`. Preservar el orden
  de las claves importa: `_itemsContentDiffer` compara con `JSON.stringify`.
- **No tocar `updatedAt`.** `_stampUpdatedAt:1085` ya sella cualquier item cuyo
  contenido difiera del de la nube, y `alarm.recurrence` es contenido. Sellarlo a
  mano no agrega nada y pisa la marca real de edición.

- [ ] **Step 4: Engancharla en `App`**

Un `useEffect` que depende de `data.tasks`, llama a la función y hace `setData`
**solo si `cambiadas > 0`**. La convención «misma referencia = nada cambió» es la
que ya usa `_mergeCloudData`, documentada en `:1535-1537`, y es lo que hace que el
efecto converja en una pasada.

**El efecto tiene que correr una sola vez por dispositivo, y hay que anotarlo.**
Sin marca no es una conversión: es una imposición permanente. El efecto volvería a
correr en cada cambio de `data.tasks` y, si el usuario le pone «una sola vez» a la
alarma de una de esas tareas, se la revierte en el render siguiente. El diseño dice
lo contrario — que la alarma aparece en el editor y se puede cambiar o apagar tarea
por tarea — así que la permanencia es un defecto, no una decisión.

La marca va en `localStorage`, con clave `lbp_migr_alarmas_correo`: es una pasada
local por dispositivo, y la función es idempotente, así que no importa que cada
dispositivo haga la suya. **No va en los datos sincronizados**, que exigirían una
clave de sincronización nueva y pensar lápidas.

Y la marca **no se puede poner antes de haber visto los datos de verdad**: en el
primer render, antes de que termine la bajada de la nube, `data.tasks` puede venir
vacío; si el efecto se marcara ahí, las tareas que llegan después nunca se
convertirían. Por eso el efecto espera con
`if (!window._lbpCloudPullDone && localStorage.getItem('lbp_worker_url')) return;`
— que se lee «si la nube está configurada y su primera bajada no terminó, esperá».
`window._lbpCloudPullDone` se pone en `true` en todos los caminos de la bajada
(éxito, «no hay datos todavía», dispositivo nuevo y error de red); está en
`:1545`.

- [ ] **Step 5: Correr la suite**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, al menos **421** pases, 0 fallas.

- [ ] **Step 6: Commit**

```bash
git add tests/migracion_alarmas_correo.test.mjs LifeBusinessPlanner2026.html
git commit -m "Las tareas del correo ya aceptadas pasan a la repeticion, una sola vez"
```

---

### Task 3: Las seis reglas de alerta, como función pura

**Files:**
- Modify: `LifeBusinessPlanner2026.html` — nueva `window._lbpAlertas` junto a
  `_lbpMigrarAlarmasCorreo`; el bloque de Alertas de `HomeScreen:5914-6008` pasa
  a renderizar desde ella
- Test: `tests/alertas.test.mjs`

**Interfaces:**
- Produces: `window._lbpAlertas(data: Object, nowMs: Number) -> Array<{id, icon, color, msg, route, taskId}>`
  - Ya viene ordenado: primero las de aduana por días ascendente, después el
    resto en el orden de las reglas. `taskId` solo en las dos reglas de tarea;
    en las demás, ausente. Sin closures: `route` es el nombre de pantalla que
    hoy pasa `navigate(...)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Las seis reglas son las que ya están en `:5918-5988`; la función las traslada sin
cambiarlas, salvo el límite de días. Pruebas:

```js
test('data incompleto no rompe', () => {
  assert.deepEqual(win._lbpAlertas({}, Date.now()), []);
  assert.deepEqual(win._lbpAlertas({ tasks: undefined, imports: undefined }, Date.now()), []);
});

test('alarma de hoy sin completar', () => {
  const a = win._lbpAlertas({ tasks: [tarea({ alarmHace: 3 * 3600000 })] }, ahora);
  assert.equal(a.length, 1);
  assert.equal(a[0].route, 'tasks');
  assert.equal(a[0].taskId, 't1');
  assert.match(a[0].msg, /alarma de hoy/);
});

test('la tarea hecha no alerta', () => {
  assert.deepEqual(win._lbpAlertas({ tasks: [tarea({ alarmHace: 3 * 3600000, status: 'DONE' })] }, ahora), []);
});

test('el limite de dias sube a 60', () => {
  assert.equal(win._lbpAlertas({ tasks: [tarea({ diasHace: 20 })] }, ahora).length, 1,
    'a los 20 dias hoy desaparece; tiene que seguir');
  assert.equal(win._lbpAlertas({ tasks: [tarea({ diasHace: 59 })] }, ahora).length, 1);
  assert.equal(win._lbpAlertas({ tasks: [tarea({ diasHace: 61 })] }, ahora).length, 0);
});

test('las SEIS reglas siguen alcanzables', () => {
  // El traslado del JSX a la funcion no puede perder una regla en el camino.
  // Un fixture que dispare las seis, y se exige un id de cada prefijo.
  const ids = win._lbpAlertas(fixtureSeisReglas, ahora).map((a) => a.id);
  for (const pre of ['today_', 'stale_', 'followup_', 'proj_', 'client_', 'aduana_'])
    assert.ok(ids.some((id) => id.indexOf(pre) === 0), 'falta la regla ' + pre);
});

test('aduana va adelante de las tareas, y la mas urgente primero', () => {
  const a = win._lbpAlertas({ tasks: [tarea({ diasHace: 2 }), tarea({ diasHace: 3, id: 't2' })],
                              imports: [imp({ dias: 5 }), imp({ dias: 1, id: 'i2' })],
                              clients: [] }, ahora);
  assert.match(a[0].id, /^aduana_i2$/);
  assert.match(a[1].id, /^aduana_/);
  assert.equal(a[2].route, 'tasks');
});
```

Los ayudantes `tarea({...})`, `imp({...})` y el `fixtureSeisReglas` los escribe
quien implementa: tienen que producir la forma mínima que cada regla lee
(`status`, `alarm`; para aduana lo que `_impDiasLimite` necesita; para las
reglas 2, 3 y 4 una reunión de ayer sin tareas posteriores, un proyecto sin
actividad en más de 10 días y un cliente activo sin reunión en más de 30).

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test "tests/alertas.test.mjs"`
Expected: FAIL — `no encuentro window._lbpAlertas`.

- [ ] **Step 3: Implementar `window._lbpAlertas(data, nowMs)`**

Trasladar las seis reglas tal cual, cambiando `action: function(){navigate('x');}`
por `route: 'x'` y agregando `taskId` en las dos de tarea. El único cambio de
comportamiento es el límite de la regla 1b: `days >= 1 && days <= 60`.

- [ ] **Step 4: Hacer que el bloque del Home renderice desde la función**

El bloque sigue mostrando `slice(0, 5)` y el `onClick` de cada fila se construye
en el render a partir de `route`. Aduana sigue adelante porque la función ya lo
devuelve ordenado. El contador del encabezado pasa a ser el **total**, no los 5
que se ven: `'🚨 Alertas (' + todas.length + ')'`.

- [ ] **Step 5: Correr la suite**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, al menos **427** pases, 0 fallas.

- [ ] **Step 6: Commit**

```bash
git add tests/alertas.test.mjs LifeBusinessPlanner2026.html
git commit -m "Las reglas de alerta salen del JSX a una funcion pura, y el limite sube a 60 dias"
```

---

### Task 4: La ventana con todas las alertas, y el ✓ en el lugar

**Files:**
- Modify: `LifeBusinessPlanner2026.html` — `HomeScreen`: estado nuevo junto a
  `alertsVisible:5365`, encabezado del bloque de Alertas (`:5995`), componente de
  la ventana; `window.LBP_VERSION:25`
- Test: `tests/ventana_alertas.test.mjs`

**Interfaces:**
- Consumes: `window._lbpAlertas(data, nowMs)` (Tarea 3); `completeTask(id)`, que
  **ya existe** en `HomeScreen:5307` y pone `status:'DONE'` y `completedAt`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Esta tarea es de interfaz, así que las pruebas son estructurales sobre el bloque
extraído del HTML. `bloque` (el bloque de Alertas del Home) y `ventana` (el
componente nuevo) se extraen igual que en `tests/tarjeta_propuestas.test.mjs`:
buscar la cadena donde arranca y tomar el cuerpo balanceado por llaves con
`cuerpo(i)`. Aserciones:

```js
test('el encabezado de Alertas abre la ventana', () => {
  assert.match(bloque, /setAlertasTodas\(true\)/);
});
test('la ventana lista TODAS, no un recorte', () => {
  assert.ok(!/slice\(0, *5\)/.test(ventana), 'la ventana no puede recortar');
  assert.match(ventana, /overflowY: *'auto'/);
});
test('las alertas de tarea llevan el tilde y usan completeTask', () => {
  assert.match(ventana, /completeTask\(/);
  assert.match(ventana, /taskId/);
});
test('las que no son tarea siguen navegando', () => {
  assert.match(ventana, /navigate\(/);
});
test('el tilde no resucita una tarea ya hecha', () => {
  // completeTask mapea por id y pone DONE: aplicarla dos veces da el mismo estado
  const una = [{ id: 't1', status: 'DONE', completedAt: 111 }];
  assert.equal(win._lbpAlertas({ tasks: una }, Date.now()).length, 0);
});
test('la version subio', () => {
  assert.match(html, /window\.LBP_VERSION = '5\.74'/);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test "tests/ventana_alertas.test.mjs"`
Expected: FAIL — no existe `setAlertasTodas`.

- [ ] **Step 3: Construir la ventana**

Un estado `alertasTodas` (booleano) en `HomeScreen`, el encabezado del bloque
tocable (que lo abre), y un contenedor desplazable que mapea **todas** las
alertas de `_lbpAlertas`. Las filas con `taskId` llevan un ✓ que llama
`completeTask(taskId)` y nada más: la alerta se va sola en el próximo render
porque la regla exige `status !== 'DONE'`. Las filas sin `taskId` navegan a su
`route` y cierran la ventana. La ✕ que ya existe no se toca.

Seguir el estilo visual de los modales que ya hay en el archivo; no introducir
librería ni patrón nuevo.

- [ ] **Step 4: Subir la versión a `5.74`** en `window.LBP_VERSION:25`

- [ ] **Step 5: Correr la suite y el chequeo de sintaxis**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS, al menos **433** pases, 0 fallas.

- [ ] **Step 6: Verificar en el navegador**

Levantar el servidor local (`lbplanner`, puerto 8777, ya está en
`.claude/launch.json` — **no sobrescribir ese archivo**) y comprobar, con una
clave de sincronización descartable para no escribir en los datos reales:
el contador del encabezado muestra el total; la ventana abre, tiene scroll con
más de 5 alertas y el ✓ saca la fila. Si los cambios no aparecen, es el service
worker sirviendo el HTML viejo: desregistrarlo, borrar los caches y recargar con
un parámetro nuevo en la URL.

- [ ] **Step 7: Commit**

```bash
git add tests/ventana_alertas.test.mjs LifeBusinessPlanner2026.html
git commit -m "v5.74: ventana con todas las alertas, con scroll y tilde en el lugar"
```
