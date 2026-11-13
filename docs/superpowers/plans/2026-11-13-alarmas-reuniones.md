# Alarmas en las reuniones de Google Calendar — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda reunión importada de Google Calendar traiga alarma y se vea, en el resumen del día y en la alarma, si está aceptada o propuesta.

**Architecture:** Tres funciones puras nuevas junto a `defaultAlarm` deciden qué alarma le toca a una reunión; `_gcalPull` las aplica sobre la lista entera de reuniones (las nuevas y las 12 ya importadas) dentro del `setData` que ya hace. La etiqueta de la alarma viaja en `alarm.label`, que `scheduleAlarms` ya mete en el cuerpo de la notificación vía `_notaAlarma`: no se toca el agendador.

**Tech Stack:** HTML de un archivo con React 18 compilado (`React.createElement`, sin JSX). Pruebas con `node --test tests/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-13-alarmas-reuniones-design.md`

## Global Constraints

- Archivo único: `LifeBusinessPlanner2026.html`. Sin JSX: `React.createElement`.
- `node --check` sobre el JS extraído después de cada patch, y `node --test tests/*.test.mjs` en verde antes de desplegar.
- **Nunca se pisa una alarma existente** (`m.alarm` con `datetime` ya puesto).
- Solo reuniones **futuras**: no se escribe una alarma con fecha pasada.
- Valores exactos: campo `confirmacion`, valores `'ACEPTADA'` y `'PROPUESTA'`. Etiquetas: `'Reunión aceptada'` y `'Reunión propuesta'`.
- Día entero (`startTime` y `endTime` ambos `'00:00'`): alarma a las **08:00 de ese día**, no 1 h antes.
- Despliegue a GitHub Pages desde `main` del repo `ibplanner`; subir `window.LBP_VERSION`.

## Review Focus

1. **Reunión sin hora o con hora inválida** (`startTime` vacío, `'25:99'`): no debe salir una alarma con `Invalid Date`. → Tarea 1.
2. **Reunión de hoy que empieza en menos de una hora:** la alarma de 1 h antes cae en el pasado; no se escribe. → Tarea 1.
3. **Reunión con `alarm.enabled === false` puesta a mano:** la apagó a propósito; no se vuelve a encender. → Tarea 1.
4. **Evento de día entero de hoy cuando ya pasaron las 08:00:** la alarma de las 08:00 cae en el pasado; no se escribe. → Tarea 1.
5. **Aviso al toque repetido:** la sincronización corre cada 15 minutos; si el aviso no se marca, suena cada 15 minutos. → Tarea 4.
6. **Idempotencia:** correr la pasada dos veces seguidas tiene que dar exactamente la misma lista, o cada sincronización de 15 min reescribiría los datos y dispararía sync en loop. → Tarea 2.

---

### Task 1: Las tres funciones que deciden la alarma

**Files:**
- Modify: `LifeBusinessPlanner2026.html` (insertar después de `defaultAlarm`, que termina en la línea 2914)
- Test: `tests/alarmas_reuniones.test.mjs` (crear)

**Interfaces:**
- Consumes: `defaultAlarm()` — devuelve `{enabled, datetime, recurrence, customInterval, customUnit, label, repeatCount, repeatInterval, repeatIntervals, sound, vibration}`.
- Produces:
  - `_esDiaEntero(m) -> boolean`
  - `_alarmaReunionGcal(m, ahoraMs) -> object|null` — el objeto de alarma listo para `m.alarm`, o `null` si no corresponde ninguna.
  - `_ponerAlarmasGcal(meetings, ahoraMs) -> array` — lista nueva; devuelve **la misma referencia** si no cambió nada.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `tests/alarmas_reuniones.test.mjs`, con el mismo patrón que `tests/aduana_limite.test.mjs`: extraer cada `function <nombre>(` del HTML por conteo de llaves y ejecutarla con `new Function`.

```js
const hoy = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const iso = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const ahora = hoy(9, 0).getTime();

test('una reunion con hora recibe la alarma una hora antes', () => {
  const a = _alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00', endTime:'16:00'}, ahora);
  assert.equal(a.enabled, true);
  assert.equal(a.datetime, iso(hoy(0,0)) + 'T14:00');
  assert.equal(a.label, 'Reunión aceptada');
  assert.equal(a.recurrence, 'once');
});

test('la alarma escala hasta la hora de la reunion', () => {
  const a = _alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}, ahora);
  // base en T-60, y los saltos la llevan a T-30, T-15 y T-5
  assert.deepEqual(a.repeatIntervals, [30, 45, 55]);
  assert.equal(a.repeatCount, 3);
});

test('el evento de dia entero escala como cualquier otra alarma', () => {
  const a = _alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'00:00', endTime:'00:00'}, hoy(6,0).getTime());
  assert.deepEqual(a.repeatIntervals, [5, 10], 'no hay hora a la que llegar: queda la escalada por defecto');
});

test('el evento de dia entero suena a las 8 de ese dia, no la noche anterior', () => {
  const m = {fromGcal:true, date:iso(hoy(0,0)), startTime:'00:00', endTime:'00:00'};
  assert.equal(_esDiaEntero(m), true);
  assert.equal(_alarmaReunionGcal(m, hoy(6,0).getTime()).datetime, iso(hoy(0,0)) + 'T08:00');
});

test('no se escribe una alarma que ya pasó', () => {
  // reunion de hoy 09:30 mirada a las 09:00: la de las 08:30 ya pasó
  assert.equal(_alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'09:30'}, ahora), null);
  // dia entero de hoy, mirado a las 10:00: las 08:00 ya pasaron
  assert.equal(_alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:'00:00', endTime:'00:00'}, hoy(10,0).getTime()), null);
});

test('hora vacia o inválida no genera alarma', () => {
  for (const t of ['', '25:99', 'manana', undefined]) {
    assert.equal(_alarmaReunionGcal({fromGcal:true, date:iso(hoy(0,0)), startTime:t}, ahora), null, 'con startTime=' + t);
  }
  assert.equal(_alarmaReunionGcal({fromGcal:true, date:'', startTime:'15:00'}, ahora), null);
});

test('no toca lo que no viene de Google ni lo que ya tiene alarma', () => {
  const base = {date:iso(hoy(0,0)), startTime:'15:00'};
  assert.equal(_alarmaReunionGcal(Object.assign({}, base), ahora), null, 'sin fromGcal');
  assert.equal(_alarmaReunionGcal(Object.assign({fromGcal:true, alarm:{enabled:true, datetime:'2026-01-01T10:00'}}, base), ahora), null);
  assert.equal(_alarmaReunionGcal(Object.assign({fromGcal:true, alarm:{enabled:false, datetime:'2026-01-01T10:00'}}, base), ahora), null, 'la apagó a propósito');
});

test('_ponerAlarmasGcal devuelve la MISMA lista si no hay nada que poner', () => {
  const l = [{id:'a', date:iso(hoy(0,0)), startTime:'15:00'}];
  assert.equal(_ponerAlarmasGcal(l, ahora), l);
});

test('_ponerAlarmasGcal solo cambia las que corresponden', () => {
  const l = [{id:'a', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}, {id:'b', date:iso(hoy(0,0)), startTime:'16:00'}];
  const r = _ponerAlarmasGcal(l, ahora);
  assert.notEqual(r, l);
  assert.equal(r[0].alarm.datetime, iso(hoy(0,0)) + 'T14:00');
  assert.equal(r[1].alarm, undefined);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: FAIL, «no encuentro function _esDiaEntero».

- [ ] **Step 3: Implementar las tres funciones**

En `LifeBusinessPlanner2026.html`, justo después de `defaultAlarm` (línea 2914), como declaraciones `function` (no `var`), para que estén izadas y el orden no importe:

- `_esDiaEntero(m)`: `true` cuando `startTime` y `endTime` son ambos `'00:00'`. Google manda esos eventos con `start.date` y sin `dateTime`, y el importador los deja así.
- `_alarmaReunionGcal(m, ahoraMs)`: devuelve `null` si no es `fromGcal`, si ya tiene `m.alarm.datetime`, si falta `date`, o si la hora no es `HH:MM` válida. Si es día entero, la alarma va a las `08:00` del mismo día; si no, a la hora de inicio menos 60 min. Devuelve `null` si ese instante es `<= ahoraMs`. El objeto sale de `defaultAlarm()` con `enabled: true`, `recurrence: 'once'`, `label: 'Reunión aceptada'` y `datetime` en `'YYYY-MM-DDTHH:MM'` **hora local** (no `toISOString`, que convierte a UTC y corre la hora 4 h en Bolivia).
  Para una reunión con hora, además `repeatIntervals: [30, 45, 55]` y `repeatCount: 3`: `scheduleAlarms` agenda cada salto como una alarma propia en la nube (línea 4353), así que partiendo de T−60 los avisos caen en **T−60, T−30, T−15 y T−5**. Esto reemplaza el segundo aviso a los 30 minutos que se había descartado: sale del mecanismo «escalante» que la app ya tiene, sin tocar el modelo ni el worker. El día entero se queda con el `[5, 10]` de `defaultAlarm`, porque no hay una hora a la que llegar.
- `_ponerAlarmasGcal(meetings, ahoraMs)`: recorre, pide la alarma de cada una y arma la lista nueva solo si alguna cambió; si no, devuelve el mismo array recibido.

Comentario arriba del bloque: por qué el día entero no lleva la de 1 h antes (sonaría a las 23:00 de la noche anterior) y por qué la fecha se arma a mano en vez de con `toISOString`.

**Desvío consciente del diseño.** El diseño dice que la alarma diga «Reunión aceptada — <título>». Poniéndolo en `alarm.label`, `scheduleAlarms` arma el cuerpo como **«<título> · Reunión aceptada»**, que es el formato que ya usan todas las demás alarmas de la app. Se deja así: es la misma información, y cambiar el orden obligaría a tocar el agendador, que dispara las alarmas de los diez módulos.

- [ ] **Step 4: Correr las pruebas**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: PASS, 9 pruebas.

- [ ] **Step 5: `node --check` y commit**

```bash
cd ~/lbplanner && python3 -c "
import io,re
h=io.open('LifeBusinessPlanner2026.html',encoding='utf-8').read()
b=re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', h, re.S)
io.open('scratchpad/app_extraido.js','w',encoding='utf-8').write('\n;\n'.join(b))
" && node --check scratchpad/app_extraido.js
git add LifeBusinessPlanner2026.html tests/alarmas_reuniones.test.mjs
git commit -m "Alarma de reuniones de Google: las tres funciones que deciden cuál va"
```

---

### Task 2: Aplicarlas al importar y rellenar las 12 que ya están

**Files:**
- Modify: `LifeBusinessPlanner2026.html:365-401` (`window._gcalPull`, dentro de `setDataFn`)
- Test: `tests/alarmas_reuniones.test.mjs` (agregar)

**Interfaces:**
- Consumes: `_ponerAlarmasGcal(meetings, ahoraMs)` de la Tarea 1.
- Produces: toda reunión importada lleva `confirmacion: 'ACEPTADA'`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('el importador marca ACEPTADA y aplica las alarmas sobre la lista entera', () => {
  const i = html.indexOf("window._gcalPull = function");
  const cuerpo = html.slice(i, html.indexOf("window.dispatchEvent(new Event('lbp_gcal_pulled'))", i));
  assert.ok(/confirmacion: 'ACEPTADA'/.test(cuerpo), 'el evento importado no se marca ACEPTADA');
  assert.ok(/_ponerAlarmasGcal\(existing/.test(cuerpo),
    'tiene que correr sobre la lista entera, no solo sobre las nuevas: las 12 ya importadas también necesitan alarma');
  assert.ok(cuerpo.indexOf('_ponerAlarmasGcal') > cuerpo.indexOf('existing.push'),
    'la pasada va DESPUÉS de agregar las nuevas');
});

test('la pasada es idempotente: correrla dos veces da la misma lista', () => {
  const l = [{id:'a', fromGcal:true, date:iso(hoy(0,0)), startTime:'15:00'}];
  const uno = _ponerAlarmasGcal(l, ahora);
  assert.equal(_ponerAlarmasGcal(uno, ahora), uno,
    'si no devuelve la misma referencia, cada sync de 15 min reescribe los datos');
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: FAIL en las dos pruebas nuevas.

- [ ] **Step 3: Modificar `_gcalPull`**

Dos cambios dentro del `setDataFn`:
1. En el objeto que hace `existing.push({...})`, agregar `confirmacion: 'ACEPTADA'` junto a `fromGcal: true`.
2. Después del `resp.items.forEach(...)` y antes del `return Object.assign({}, d, { meetings: existing })`, reemplazar `existing` por `_ponerAlarmasGcal(existing, Date.now())`.

- [ ] **Step 4: Correr las pruebas**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: PASS, 11 pruebas.

- [ ] **Step 5: `node --check` y commit**

```bash
git add LifeBusinessPlanner2026.html tests/alarmas_reuniones.test.mjs
git commit -m "Al sincronizar Google: marcar ACEPTADA y poner alarma, también a las ya importadas"
```

---

### Task 3: La etiqueta en el resumen del día

**Files:**
- Modify: `LifeBusinessPlanner2026.html:5088-5093` (tarjeta «📅 REUNIONES DE HOY» de `HomeScreen`)
- Test: `tests/alarmas_reuniones.test.mjs` (agregar)

**Interfaces:**
- Consumes: `m.confirmacion` (`'ACEPTADA'` | `'PROPUESTA'` | ausente).
- Produces: nada que use otra tarea.

- [ ] **Step 1: Escribir la prueba que falla**

```js
test('el resumen del dia aclara si la reunion es aceptada o propuesta', () => {
  const i = html.indexOf('\\uD83D\\uDCC5 REUNIONES DE HOY');
  const cuerpo = html.slice(i, i + 1800);
  assert.ok(/m\.confirmacion/.test(cuerpo), 'la tarjeta no mira el campo');
  assert.ok(cuerpo.includes('Propuesta') && cuerpo.includes('Aceptada'), 'faltan los dos textos');
});

test('los dos textos de la alarma existen', () => {
  assert.ok(html.includes("'Reunión aceptada'"));
  assert.ok(html.includes("'Reunión propuesta'"));
});
```

La segunda prueba obliga a dejar `'Reunión propuesta'` ya puesto, para que la parte B solo tenga que llenar el campo.

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: FAIL, «la tarjeta no mira el campo».

- [ ] **Step 3: Agregar el chip a la tarjeta**

Entre el `<span>` del título y el de `m.clientName`, un `<span>` condicionado a `m.confirmacion`: texto `'Propuesta'` en naranja (`#FF9800`) cuando vale `'PROPUESTA'`, `'Aceptada'` en verde (`#4CAF50`) cuando vale `'ACEPTADA'`, nada si el campo no está. Mismo tamaño y forma que el chip de la hora que ya está al principio de la fila (`fontSize:10`, `borderRadius:5`, `padding:'2px 6px'`, `flexShrink:0`).

El texto de la alarma no se toca: `scheduleAlarms` ya arma el cuerpo con `alarm.label` vía `_notaAlarma`, y la Tarea 1 lo puso en `'Reunión aceptada'`.

- [ ] **Step 4: Correr las pruebas**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: PASS, 13 pruebas.

- [ ] **Step 5: `node --check` y commit**

```bash
git add LifeBusinessPlanner2026.html tests/alarmas_reuniones.test.mjs
git commit -m "Resumen del dia: chip de reunion aceptada o propuesta"
```

---

### Task 4: Avisar al toque cuando ya no llega el recordatorio del día anterior

**Files:**
- Modify: `LifeBusinessPlanner2026.html` (junto a las funciones de la Tarea 1, y la llamada dentro de `window._gcalPull`)
- Test: `tests/alarmas_reuniones.test.mjs` (agregar)

**Interfaces:**
- Consumes: `_fireNotification(title, body, tag, vibration)` (línea 4123).
- Produces: `_reunionesParaAvisarYa(meetings, ahoraMs) -> array` y `_avisarReunionesNuevas(meetings, ahoraMs) -> number` (cuántas avisó).

El worker ya manda un push por reunión a las **17:00 de Bolivia** mirando las de mañana (`sendSmartNotif(..., 'deadlines', ...)`, worker.js:2185). Esta tarea tapa solo el agujero de lo que entra después de esa hora.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('solo avisa al toque lo que ya no alcanza el recordatorio de las 17:00', () => {
  const hoyIso = iso(hoy(0,0));
  const manIso = iso(new Date(hoy(0,0).getTime() + 86400000));
  const pasado = iso(new Date(hoy(0,0).getTime() + 3*86400000));
  const r = (l, ms) => _reunionesParaAvisarYa(l, ms).map(x => x.id);
  // a las 9 de la manana
  assert.deepEqual(r([{id:'hoy', date:hoyIso, startTime:'15:00'}], hoy(9,0).getTime()), ['hoy']);
  assert.deepEqual(r([{id:'man', date:manIso, startTime:'10:00'}], hoy(9,0).getTime()), [],
    'manana antes de las 17:00 lo cubre el push del worker');
  // a las 18, el push de las 17:00 ya paso
  assert.deepEqual(r([{id:'man', date:manIso, startTime:'10:00'}], hoy(18,0).getTime()), ['man']);
  assert.deepEqual(r([{id:'lejos', date:pasado, startTime:'10:00'}], hoy(18,0).getTime()), []);
});

test('no avisa de una reunion que ya empezo', () => {
  assert.deepEqual(_reunionesParaAvisarYa([{id:'x', date:iso(hoy(0,0)), startTime:'08:00'}], hoy(9,0).getTime()), []);
});

test('no repite el aviso de la misma reunion', () => {
  const l = [{id:'u', date:iso(hoy(0,0)), startTime:'15:00', title:'Con Mango'}];
  const avisos = [];
  global.__avisar = (t, b) => avisos.push(t + '|' + b);
  assert.equal(_avisarReunionesNuevas(l, hoy(9,0).getTime()), 1);
  assert.equal(_avisarReunionesNuevas(l, hoy(9,5).getTime()), 0, 'la segunda vez no avisa');
  assert.equal(avisos.length, 1);
});
```

Para la tercera prueba hace falta un `localStorage` de mentira y un espía de `_fireNotification`; armarlos en el `new Function` que extrae las funciones, igual que se extraen las puras.

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: FAIL, «no encuentro function _reunionesParaAvisarYa».

- [ ] **Step 3: Implementar las dos funciones**

- `_reunionesParaAvisarYa(meetings, ahoraMs)`: devuelve las reuniones cuyo inicio es **posterior a `ahoraMs`** y que caen en la ventana sin cobertura: la fecha es hoy, o es mañana y la hora local de `ahoraMs` ya pasó las 17:00. Descarta las que no tienen fecha u hora válida (misma validación que `_alarmaReunionGcal`).
- `_avisarReunionesNuevas(meetings, ahoraMs)`: por cada una de las anteriores cuyo `id` no esté en `localStorage['lbp_reuniones_avisadas']`, llama a `_fireNotification` con título `'Reunión ' + hora + ' — ' + título` y cuerpo según `confirmacion` (`'Reunión propuesta, confirmá si va'` o `'Reunión aceptada'`), guarda el `id` y devuelve cuántas avisó. La lista guardada se poda dejando solo los `id` de reuniones que siguen en la lista, para que no crezca para siempre.

Comentario arriba: por qué la ventana es esa y no «cualquier reunión nueva» (el push de las 17:00 del worker ya cubre el resto; avisar de más es el anti objetivo del diseño).

- [ ] **Step 4: Llamarla al sincronizar**

En `window._gcalPull`, después de que `setDataFn` devuelve la lista nueva, llamar a `_avisarReunionesNuevas(existing, Date.now())`. No dentro del reductor de `setData`: ese puede correr dos veces y mandaría el aviso duplicado.

- [ ] **Step 5: Correr las pruebas y commit**

Run: `node --test tests/alarmas_reuniones.test.mjs`
Expected: PASS, 16 pruebas.

```bash
git add LifeBusinessPlanner2026.html tests/alarmas_reuniones.test.mjs
git commit -m "Avisar al toque la reunion que entra despues del recordatorio de las 17:00"
```

---

### Task 5: Publicar y verificar en el sitio real

**Files:**
- Modify: `LifeBusinessPlanner2026.html:25` (`window.LBP_VERSION`)

- [ ] **Step 1: Subir la versión a `'5.67'`**

- [ ] **Step 2: Suite completa en verde**

Run: `node --test tests/*.test.mjs`
Expected: PASS, 0 fail. Si alguna prueba vieja busca `className: "acciones"` o la versión exacta, es una falla falsa: arreglar el matcher, no el código.

- [ ] **Step 3: Commit y push**

```bash
git add LifeBusinessPlanner2026.html docs/superpowers
git commit -m "v5.67 — alarmas y etiqueta en las reuniones de Google Calendar"
git push origin main
```

Si GitHub rechaza con `commit_refs_rules`, es un error transitorio suyo: reintentar.

- [ ] **Step 4: Verificar el artefacto publicado**

Run: `curl -s "https://josechain-eng.github.io/ibplanner/LifeBusinessPlanner2026.html?cb=$RANDOM" | grep -c "_ponerAlarmasGcal"`
Expected: ≥ 1, y `LBP_VERSION = '5.67'`.

- [ ] **Step 5: Mirarlo funcionando, en celular y computadora**

En el sitio publicado, con datos sembrados en `localStorage` (sin clave de sincronización real): una reunión `fromGcal` de hoy más tarde y un evento de día entero. Verificar en 375 px y 1200 px que la de hoy sale en «REUNIONES DE HOY» con el chip **Aceptada**, y que su `alarm.datetime` es la hora de inicio menos una hora. Limpiar el `localStorage` al terminar.
