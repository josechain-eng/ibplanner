# Asistente proactivo (fase 1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que LB Planner hable dos veces al día sólo cuando tiene algo que valga
la pena, con criterio sobre tareas, proyectos, despachos y correo, y que al
terminar haya menos cosas avisando que antes.

**Architecture:** Una pasada nueva en el cron del Worker `life-planner` junta
contexto (blob de la app + correo del puente + señales del vigilante + lo ya
decidido), pide al modelo **sólo JSON**, guarda el resultado en KV y manda push
únicamente si pasa una vara numérica. La app lee ese KV en el bloque y la
ventana que hoy ocupa Alertas, con `_lbpAlertas` intacto debajo como red. Al
final se apagan el push del briefing y cuatro notificaciones del cron que dicen
lo mismo.

**Tech Stack:** Cloudflare Workers + KV (plan gratuito), Web Push (VAPID),
Claude Opus 5 vía `callClaude`, HTML de una sola pieza con React compilado,
pruebas `node:test` en `.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-23-asistente-proactivo-design.md`

**Rama:** nueva desde `main`. (`propuestas-marketing` tiene tres commits de v5.73
sin fusionar; no es asunto de este plan.)

**Base medida en `main` el 23-nov-2026:** `node --test "tests/*.test.mjs"` →
**440 pasan, 0 fallan**. Cualquier número menor al terminar es una regresión.

## Global Constraints

- **`worker.js` es ASCII puro.** Español sin tildes ni ñ. Ya hay una prueba que
  lo vigila (`tests/respaldo_5am.test.mjs`, «worker.js sigue siendo ASCII puro»).
- **`wrangler.toml` conserva `crons = ["* * * * *"]`** y no declara `[vars]`.
  Todo lo sensible va como secret (`wrangler secret put`).
- **Jamás imprimir ni escribir una sync key** ni valor de secreto en código,
  pruebas, comentarios, logs o reportes.
- **El cron nunca llama `KV.list()`** (1.440 disparos/día contra 1.000 list/día).
- **Nada de `toISOString()` para una fecha `YYYY-MM-DD`.** Bolivia es UTC-4 todo
  el año. En el worker: `_hoyBolivia(now)`. En el HTML: fecha armada con
  `getFullYear/getMonth/getDate` locales.
- **Un tick del cron no hace dos cosas pesadas.** Las ventanas del asistente son
  12:20-12:22 y 22:10-22:12 UTC; el refresco del TC ocupa `mm < 5` y `mm 30-35`
  de cada hora, y el briefing 12:03-12:05.
- **Código de producción en el HTML: sólo `var`/`function`**, React sin JSX
  (`React.createElement`). Las pruebas son `.mjs` y pueden usar JS moderno.
- **`node --check` sobre el JS extraído después de cada parche del HTML**, y
  sobre `worker.js` después de cada cambio.
- **Comando de pruebas: `node --test "tests/*.test.mjs"` con las comillas.** Sin
  ellas node trata la carpeta como un archivo: 1 falla, 0 pasan.
- **`git add` por nombre, nunca `git add -A` ni `git add .`** (hay artefactos
  grandes ignorados y archivos sucios en `.wrangler/`).
- Los parches del HTML se hacen con scripts Python de reemplazo exacto en
  `scratchpad/`, que abortan si el texto buscado no aparece exactamente una vez.
- **La vara de verificación es la prueba por mutación:** cada regla nueva se
  comprueba rompiendo el código a propósito en una copia y confirmando que la
  prueba se pone roja. Una prueba que no puede fallar no prueba nada.

## Review Focus

1. **Dos disparos del cron en la misma ventana de 2 minutos** (Cloudflare pierde
   ~20% de los disparos, por eso la ventana es de 2): si la marca `asis_mark` se
   escribe *después* de la llamada al modelo, salen dos llamadas y dos push. La
   marca va antes. *Prueba en la Tarea 3.*
2. **Un ítem con `refId` que no existe en el blob** (el modelo lo inventó o la
   entidad se borró): la ventana no debe mostrar un ✓ que no cierra nada ni
   navegar a la nada. *Prueba en la Tarea 7.*
3. **`asis_senal` con basura o enorme** (lo escribe una sesión de fuera): no
   puede inflar la llamada ni tumbar la pasada. Tope de tamaño y validación de
   forma. *Prueba en la Tarea 3.*
4. **Entrada de hoy escrita por la pasada de la mañana cuando la de la tarde
   falla:** a las 20:00 la app mostraría ítems de la mañana como si fueran
   frescos. La entrada lleva `pasada` y la app muestra de cuándo es. *Prueba en
   la Tarea 7.*
5. **Un equipo con la app vieja sincronizando** (sin `asisDecididos`): el merge
   no puede borrar la lista ni revivir ítems ya decididos. *Prueba en la Tarea 7.*

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `tests/_arnes_cron.mjs` (nuevo, **no** `.test.mjs`) | cargar el worker real, KV falso, reloj fijo. Lo usan las tareas 2-6. |
| `worker.js` (modificar) | detector, vara, pasada, líneas duras, endpoints, compuertas del cron |
| `LifeBusinessPlanner2026.html` (modificar) | bloque y ventana del asistente, `asisDecididos`, fuente de la tarjeta |
| `tests/asistente_*.test.mjs` (nuevos, 7) | uno por tarea: arnes, vara, pasada, endpoints, lineas_duras, ventana, apagado |
| `docs/superpowers/notas/2026-11-23-asistente-decisiones.md` (nuevo) | decisiones y residuos, al cerrar |

---

### Task 1: El arnés del cron y el reloj

Sin esto, todas las pruebas de las tareas siguientes serían afirmaciones de
texto sobre `worker.js` en vez de ejecución real, y la vara del silencio es
exactamente el tipo de regla que un `grep` no prueba. Ninguna prueba del repo
llama hoy a `scheduled()` ni fija el reloj.

**Files:**
- Create: `tests/_arnes_cron.mjs`
- Test: `tests/asistente_arnes.test.mjs`

**Interfaces:**
- Produces:
  - `cargarWorker() -> Promise<module.default>` — escribe `worker.js` a un `.mjs`
    temporal único, lo importa con `?t=<now>` y lo borra. Mismo patrón que
    `tests/task_proposals.test.mjs:10-16`.
  - `kvFalso(entradas?: object) -> { get, put, delete, _map }` — `get` devuelve
    `string | null`, `put(k, v, opts?)`, `delete(k)`; `_map` para inspeccionar.
  - `envFalso(opts) -> object` — `{ LBP_KV, LBP_R2?, ANTHROPIC_API_KEY,
    BRIEFING_KEY, ASIS_KEY, BRIEFING_SERVICE? }`.
  - `conReloj(ms, fn) -> Promise<any>` — fija `Date.now` y restaura siempre, aun
    si `fn` lanza.
  - `anthropicFalso(respuestas) -> { llamadas, cuerpos, restaurar }` — reemplaza
    `globalThis.fetch`, **falla la prueba si se llama a cualquier host que no sea
    `api.anthropic.com`**, y devuelve las respuestas en orden.

- [ ] **Step 1: Escribir la prueba que falla**, en `tests/asistente_arnes.test.mjs`:

```js
test('el arnes dispara el respaldo de las 09:00 UTC y no a las 09:05', async () => {
  const w = await cargarWorker();
  const kv = kvFalso({ 'synckeys_registry': JSON.stringify(['k1']), 'data:k1': '{"tasks":[]}' });
  // 09:01 UTC -> respalda
  await conReloj(Date.UTC(2026, 10, 24, 9, 1), () => w.scheduled({}, envFalso({ LBP_KV: kv })));
  assert.ok([...kv._map.keys()].some(k => k.startsWith('backup:k1:')), 'no respaldo en su ventana');
  // 09:05 UTC, kv limpio -> no respalda (la ventana es mm < 3)
  const kv2 = kvFalso({ 'synckeys_registry': JSON.stringify(['k1']), 'data:k1': '{"tasks":[]}' });
  await conReloj(Date.UTC(2026, 10, 24, 9, 5), () => w.scheduled({}, envFalso({ LBP_KV: kv2 })));
  assert.ok(![...kv2._map.keys()].some(k => k.startsWith('backup:')), 'respaldo fuera de su ventana');
});

test('conReloj restaura Date.now aunque la funcion lance', async () => {
  const antes = Date.now;
  await assert.rejects(() => conReloj(0, () => { throw new Error('x'); }));
  assert.equal(Date.now, antes);
});

test('el arnes prohibe salir a la red', async () => {
  const a = anthropicFalso([]);
  try { await assert.rejects(() => fetch('https://example.com')); } finally { a.restaurar(); }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_arnes.test.mjs"`
Expected: FAIL — no existe `tests/_arnes_cron.mjs`.

- [ ] **Step 3: Escribir `tests/_arnes_cron.mjs`** con las cinco funciones de
  Interfaces. El nombre **no** termina en `.test.mjs` a propósito: el comando de
  pruebas usa el glob `tests/*.test.mjs` y un ayudante no es una prueba.
  `scheduled` se exporta en `worker.js:47`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test "tests/asistente_arnes.test.mjs"`
Expected: PASS, 3 pruebas.

- [ ] **Step 5: Correr la suite entera**

Run: `node --test "tests/*.test.mjs"`
Expected: 0 fallan, y el total no baja de 440. (El conteo total es guardarrail,
nunca objetivo: un numero como meta invita a rellenar con pruebas que no prueban
nada.)

- [ ] **Step 6: Commit**

```bash
git add tests/_arnes_cron.mjs tests/asistente_arnes.test.mjs
git commit -m "Arnes de pruebas del cron: worker real, KV falso y reloj fijo"
```

---

### Task 2: El detector y la vara del silencio

Funciones puras, sin red ni KV. Es la regla que decide si el teléfono suena, así
que va sola y con red propia.

**Files:**
- Modify: `worker.js` (funciones nuevas antes de `scheduledHandler`, ~2258)
- Test: `tests/asistente_vara.test.mjs`

**Interfaces:**
- Consumes: el arnés de la Tarea 1.
- Produces:
  - `_asisDetectar(data, nowMs) -> [{ id, tipo, ruta, refId, texto, dias }]`
    Señales candidatas del blob. Las seis reglas de `_lbpAlertas`
    (`LifeBusinessPlanner2026.html:208`), que ya están escritas como datos puros:
    alarma de hoy sin completar, alarma de 1-60 días sin completar, reunión de
    ayer sin seguimiento, proyecto sin actividad >10 días, cliente >30 días sin
    reunión, y despacho con límite en aduana a ≤7 días. Las de aduana primero,
    por días ascendente. `id` estable y derivado de la entidad
    (`'aduana_' + imp.id`, `'stale_' + t.id`, …) para que `asis_dicho` y
    `asisDecididos` puedan referirlo.
  - `_asisPasaLaVara(items, nowMs) -> { manda: boolean, motivo: string }`
    `manda` es verdadero si hay ≥1 `urgencia === 'ya'`, o ≥2 `urgencia === 'hoy'`.
    Sábado y domingo en hora de Bolivia: **sólo** los `ya` cuentan. `motivo` es
    para el log, una línea.
  - `_asisRecortar(items) -> items.slice(0, 5)` — tope de 5, los `ya` primero.

- [ ] **Step 1: Escribir las pruebas que fallan**, en `tests/asistente_vara.test.mjs`:

```js
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
```

Las funciones se extraen de `worker.js` con el arnés (importar el módulo y
leerlas del export, o por extracción de fuente como hace
`tests/feriados_moviles.test.mjs`; el implementador elige, pero **tiene que ser
el código real de `worker.js`**, no una copia en la prueba).

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_vara.test.mjs"`
Expected: FAIL — las tres funciones no existen.

- [ ] **Step 3: Implementar las tres funciones en `worker.js`.** El día de la
  semana en Bolivia sale de `new Date(nowMs - 4*3600*1000).getUTCDay()`; los
  feriados no hacen falta para esta regla porque un feriado con fecha de aduana
  encima sigue siendo un `ya`. Los días hasta el límite de aduana se calculan
  igual que `_impDiasLimite` (`LifeBusinessPlanner2026.html:20156`): esa es la
  definición que ya usa la app.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test "tests/asistente_vara.test.mjs"`
Expected: PASS, 12 pruebas.

- [ ] **Step 5: Prueba por mutación de la vara**

Sobre una copia en `scratchpad/`, cambiar `>= 2` por `>= 1` en la regla de los
`hoy` y correr la prueba. Expected: FALLA «UN solo "hoy" NO manda». Restaurar.
Repetir quitando la rama del fin de semana. Expected: FALLA «sabado: dos "hoy"
NO mandan».

- [ ] **Step 6: Commit**

```bash
git add worker.js tests/asistente_vara.test.mjs
git commit -m "Detector de senales y vara del silencio del asistente"
```

---

### Task 3: La pasada completa

**Files:**
- Modify: `worker.js` (`correrAsistente` + dos compuertas en `scheduledHandler`)
- Test: `tests/asistente_pasada.test.mjs`

**Interfaces:**
- Consumes: `_asisDetectar`, `_asisPasaLaVara`, `_asisRecortar` (Tarea 2);
  `callClaude(env, messages, system, maxTokens)` (`worker.js:1510`);
  `_hoyBolivia(now)`; `_syncKeyValida(env, syncKey)` (`worker.js:1252`);
  `sendPush(sub, payload)`.
- Produces:
  - `correrAsistente(env, pasada, nowMs) -> Promise<{ok, items, cegado, sinModelo, motivo}>`
    `pasada` es `'manana'` o `'tarde'`.
  - KV `asis:<syncKey>:<fecha>` = `{ generado, pasada, items, cegado, sinModelo,
    tc, summary }`, TTL 48 h. **Cada ítem lleva siempre `urgencia`**, incluso en
    el camino `sinModelo`, donde la asigna el detector: aduana a ≤1 día → `'ya'`;
    aduana a ≤7 días → `'hoy'`; el resto → `'puede_esperar'`. Sin esto, el día que
    el modelo falla los ítems no tienen `urgencia`, la vara no puede pasar nunca
    —quedaría mudo justo ese día— y la regla (b) de la Tarea 5 no tiene qué leer. `summary` es texto: primera línea el TC, después una
    línea por ítem — es lo que la tarjeta de la app ya sabe pintar
    (`LifeBusinessPlanner2026.html:5837-5854`).
  - KV `asis_mark:<syncKey>:<fecha>:<pasada>`, TTL 3 días.
  - Compuertas: `utcH === 12 && utcM >= 20 && utcM < 22` → `'manana'`;
    `utcH === 22 && utcM >= 10 && utcM < 12` → `'tarde'`.

El orden dentro de `correrAsistente`, que es donde está casi toda la decisión:

1. Elegir **una** sync key: la del blob con `_cloudSaveTime` más nuevo del
   registro. Misma lógica que `/briefing` (`worker.js:1035-1062`), reutilizada.
2. Si el blob tiene más de **18 h**, escribir la entrada con el aviso de datos
   viejos y **volver sin llamar al modelo ni mandar push**.
3. **Escribir `asis_mark` ANTES de llamar al modelo** (Review Focus 1).
4. Detectar señales del blob.
5. Leer el correo: `BRIEFING_SERVICE` → `/ventura-emails?key=BRIEFING_KEY`,
   ventana 7 días, tope **25 hilos**, **sólo el mensaje más nuevo de cada uno
   recortado a 400 caracteres**. Si falla o el `ts` del puente tiene más de 36 h:
   `cegado = true` y una línea «sin correo de hoy — abri Outlook».
6. Leer `asis_senal` (tope **4 KB**; si no parsea o pasa el tope, se ignora en
   silencio y se anota en el resultado).
7. Armar la exclusión: los `hiloId` de `data.tareasDecididas` con decisión `ok` o
   `no` (no `revocada`), y los ids de `asisDecididos`. El prompt los lista y
   prohíbe hablar de ellos.
8. Una llamada a `callClaude` pidiendo **sólo JSON** con la forma del diseño.
9. Parsear. Si no parsea: `sinModelo = true` y se guardan las señales del
   detector sin texto del modelo.
10. Vara, recorte, escritura en KV, y push sólo si la vara lo permite (máximo 3
    ítems en el cuerpo).
11. Marcar como consumidas las señales usadas.

- [ ] **Step 1: Escribir las pruebas que fallan**, en `tests/asistente_pasada.test.mjs`:

```js
test('con el blob de hace 3 dias NO llama al modelo ni manda push', async () => {
  // _cloudSaveTime de hace 72h. Expected: 0 llamadas al modelo, 0 push,
  // y la entrada de KV dice que los datos son viejos.
});
test('la marca se escribe ANTES de llamar al modelo', async () => {
  // El fetch falso de Anthropic verifica que asis_mark ya este en el KV
  // cuando lo llaman. Sin esto, dos disparos de la misma ventana = dos llamadas.
});
test('dos disparos en la misma ventana = UNA llamada al modelo', async () => {
  // scheduled() a 12:20 y a 12:21 con el mismo KV.
});
test('JSON que no parsea: sinModelo y la lista del detector', async () => {
  // El modelo devuelve "lo siento, no puedo". Expected: sinModelo === true,
  // items.length === señales del detector, y NO se inventa texto.
});
test('en sinModelo los items igual llevan urgencia y la vara puede pasar', async () => {
  // Aduana a 1 dia + JSON roto. Expected: items[0].urgencia === 'ya' y SALE push.
  // Sin esto, el dia que falla el modelo el asistente queda mudo.
});
test('si no se puede leer el correo queda cegado y lo dice', async () => {
  // BRIEFING_SERVICE devuelve 500.
});
test('el correo del puente de hace 40h tambien deja cegado', async () => {});
test('manda 25 hilos, no 40, y un solo mensaje por hilo', async () => {
  // Se inspecciona el cuerpo que recibio Anthropic.
});
test('una sola llamada al modelo por pasada', async () => {});
test('con 4 sync keys en el registro corre para la del blob mas fresco', async () => {
  // Expected: 1 llamada al modelo, y el push sale a las subs de esa llave.
});
test('un hilo ya decidido en tareasDecididas no puede entrar al prompt', async () => {});
test('asis_senal con basura no tumba la pasada', async () => {
  // '{{{' y un payload de 1MB. Expected: la pasada termina ok.
});
test('si la vara no se pasa: escribe en KV y NO manda push', async () => {
  // Un solo "hoy". Expected: 0 push, pero asis:<key>:<fecha> existe.
});
test('la senal usada queda marcada como consumida', async () => {});
test('el cuerpo del push lleva como maximo 3 items aunque se guarden 5', async () => {
  // 5 items con urgencia "ya". Expected: la entrada de KV tiene 5, el payload
  // del push nombra 3.
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_pasada.test.mjs"`
Expected: FAIL — `correrAsistente` no existe.

- [ ] **Step 3: Implementar `correrAsistente` y sus dos compuertas** siguiendo
  los once pasos de arriba. El prompt del sistema lleva la frase que este repo
  usa en todos los prompts, «USA SOLO datos reales, NO inventes», y exige que
  cada ítem traiga un `porque` con fecha, número o nombre de quien escribió; un
  `porque` vacío o genérico descalifica el ítem. `thinking: {type:'disabled'}`
  lo pone ya `callClaude`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test "tests/asistente_pasada.test.mjs"`
Expected: PASS, 15 pruebas.

- [ ] **Step 5: Prueba por mutación de los dos puntos que más cuestan**

Mover la escritura de `asis_mark` a después de la llamada al modelo.
Expected: FALLA «la marca se escribe ANTES». Restaurar.
Subir el umbral del blob viejo de 18 h a 999 h.
Expected: FALLA «con el blob de hace 3 dias NO llama al modelo». Restaurar.

- [ ] **Step 6: `node --check worker.js` y la suite entera**

Run: `node --check worker.js && node --test "tests/*.test.mjs"`
Expected: sin salida del check; 0 fallan, y el total no baja de 440.

- [ ] **Step 7: Commit**

```bash
git add worker.js tests/asistente_pasada.test.mjs
git commit -m "Pasada del asistente: contexto, JSON del modelo, KV y push condicional"
```

---

### Task 4: Endpoints y la señal del vigilante

**Files:**
- Modify: `worker.js` (tres rutas, junto a `/briefing-ai` en ~928)
- Modify: `~/.claude/scheduled-tasks/vigilar-respuestas-cj-fourthwall/SKILL.md` (fuera del repo)
- Test: `tests/asistente_endpoints.test.mjs`

**Interfaces:**
- Consumes: `correrAsistente` (Tarea 3), `_syncKeyValida`, `json(obj, status)`.
- Produces:
  - `GET /asistente?key=&date=` → `{ ready, entrada }` o `{ ready:false }`.
    Espejo de `/briefing-ai` (`worker.js:928-937`). Valida la key **antes** de
    cualquier lectura.
  - `GET /force-asistente?key=&pasada=` → borra `asis_mark` del día y corre.
    Espejo de `/force-smart` (`worker.js:344`).
  - `POST /asistente/senal` con cabecera `X-Asis-Key: <ASIS_KEY>` y cuerpo
    `{ hallazgos: [{ que, detalle, desde }] }` → escribe `asis_senal`, TTL 72 h,
    tope 4 KB. Sin sync key en el cuerpo: hay un solo usuario y la clave es única.

- [ ] **Step 1: Escribir las pruebas que fallan**, en `tests/asistente_endpoints.test.mjs`:

```js
test('GET /asistente sin key da error y NO lee KV', async () => {});
test('GET /asistente con key invalida da error', async () => {
  // Fallar cerrado: si el KV lanza, tampoco pasa.
});
test('GET /asistente con entrada de hoy la devuelve', async () => {});
test('POST /asistente/senal sin el secreto da 401', async () => {});
test('POST /asistente/senal con el secreto correcto escribe asis_senal', async () => {});
test('POST /asistente/senal de 1MB se rechaza sin escribir', async () => {});
test('la respuesta de /asistente nunca contiene la sync key', async () => {
  // Afirmacion directa sobre el cuerpo serializado.
});
test('GET /force-asistente borra la marca del dia y corre', async () => {});

Y **agregar `/asistente` a la tabla de `tests/endpoints_key_valida.test.mjs:54-56`**,
que es la prueba que ya vigila que los otros cuatro endpoints fallen cerrado con
una key invalida. Dejar el nuevo afuera es un hueco de seguridad silencioso.
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_endpoints.test.mjs"`
Expected: FAIL — las rutas no existen.

- [ ] **Step 3: Implementar las tres rutas en `worker.js`.**

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test "tests/asistente_endpoints.test.mjs"`
Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit del worker**

```bash
git add worker.js tests/asistente_endpoints.test.mjs
git commit -m "Endpoints del asistente: lectura, forzado y senal del vigilante"
```

- [ ] **Step 6: Editar el SKILL.md del vigilante** para que, en vez de
  `~/.rms/scripts/avisar_pepe.py`, haga el POST a `/asistente/senal` leyendo
  `ASIS_KEY` del Keychain (mismo patrón que el puente de Ventura, que guarda
  `briefing-ingest-secret`). El archivo está fuera del repo y no se commitea
  acá; **el secreto no se escribe en ningún archivo**.

---

### Task 5: El chequeo horario de líneas duras

**Files:**
- Modify: `worker.js` (`_asisLineasDuras` + una compuerta)
- Test: `tests/asistente_lineas_duras.test.mjs`

**Interfaces:**
- Consumes: `_asisDetectar` (Tarea 2), el KV `asis:` de la Tarea 3.
- Produces:
  - `_asisLineasDuras(env, nowMs) -> Promise<{ dichos: string[] }>`
    Dos reglas y sólo dos: (a) un despacho con `_impDiasLimite <= 1`; (b) un ítem
    que la última pasada marcó `ya` y sigue sin decidir en `asisDecididos`.
    **`asisDecididos` todavía no existe cuando se hace esta tarea** — la crea la
    Tarea 6 — así que una lista ausente se trata como «ninguno decidido», y la
    prueba del ítem marcado listo siembra la lista a mano en el blob falso.
  - Compuerta: `utcM >= 15 && utcM < 17`, **y** la hora de Bolivia entre 7 y 21
    inclusive. Sin modelo: no llama a `callClaude`.
  - Dedup: `asis_dicho:<itemId>:<fecha>:<pasada>`, TTL 3 días.

- [ ] **Step 1: Escribir las pruebas que fallan**:

```js
test('aduana que vence manana dispara a las 10:15 Bolivia', async () => {});
test('a las 00:15 Bolivia NO dispara nada', async () => {
  // Sin la franja, un "ya" de las 18:10 pierde su marca a medianoche y vuelve.
});
test('a las 22:15 Bolivia NO dispara nada', async () => {});
test('el chequeo horario NUNCA llama al modelo', async () => {
  // anthropicFalso falla la prueba si lo llaman.
});
test('un item ya dicho en esta pasada no se repite', async () => {});
test('un item dicho en la pasada de la manana SI puede decirse en la de la tarde', async () => {});
test('un item que el usuario marco listo no se repite', async () => {});
test('aduana a 5 dias no dispara en el chequeo horario', async () => {
  // El detector la ve (<=7), la linea dura no (<=1).
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_lineas_duras.test.mjs"`
Expected: FAIL.

- [ ] **Step 3: Implementar `_asisLineasDuras` y su compuerta.**

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test "tests/asistente_lineas_duras.test.mjs"`
Expected: PASS, 8 pruebas.

- [ ] **Step 5: Prueba por mutación de la franja**

Quitar la condición de las 7-21. Expected: FALLA «a las 00:15 Bolivia NO dispara
nada». Restaurar.

- [ ] **Step 6: Commit**

```bash
git add worker.js tests/asistente_lineas_duras.test.mjs
git commit -m "Chequeo horario de lineas duras, sin modelo y solo de 7 a 21"
```

---

### Task 6: La app — ventana, decisiones y tarjeta

**Files:**
- Modify: `LifeBusinessPlanner2026.html` (bloque ~6022, ventana ~6444,
  `_SYNC_LISTS` ~1146, `useEffect` de la tarjeta ~5514)
- Create: `scratchpad/patch_asistente_app.py`
- Test: `tests/asistente_ventana.test.mjs`

**Interfaces:**
- Consumes: `GET /asistente` (Tarea 4), `_lbpAlertas(data, nowMs)`,
  `completeTask(id)`, `setViewTask`, `navigate`, `Modal`.
- Produces:
  - `window._lbpAsisFrescos(entrada, nowMs) -> { items, fresca: boolean, de: string }`
    `fresca` es falso si la entrada no es de hoy (fecha **local**, no UTC) o si
    no tiene ítems. `de` es la hora de `generado`, para que la ventana diga de
    cuándo es (Review Focus 4).
  - `window._lbpAsisDecidir(data, itemId, decision) -> data` nueva —
    `decision` es `'listo' | 'no' | 'revocada'`. Escribe en `data.asisDecididos`
    con la forma `{id, decision, ts}`.
  - `'asisDecididos'` agregado a `_SYNC_LISTS`, **sin lápidas**, por el mismo
    motivo ya medido que `tareasDecididas`: con lápida, la decisión siguiente
    sobre ese id se perdía 30 días.
  - `window.LBP_VERSION = '5.75'`.

- [ ] **Step 1: Escribir las pruebas que fallan**, en `tests/asistente_ventana.test.mjs`:

```js
test('con entrada fresca el bloque dice Asistente; sin ella, Alertas', () => {});
test('la fecha de la entrada se compara en hora LOCAL, no UTC', () => {
  // A las 21:00 de Bolivia, toISOString() ya es manana: la tarjeta del briefing
  // tiene este bug (HTML:5518) y no hay que copiarlo.
});
test('un item con refId que no existe no muestra el tilde ni navega a la nada', () => {});
test('marcar listo saca el item de la ventana sin cerrarla', () => {});
test('"no me interesa" escribe decision:"no" y el item no vuelve', () => {});
test('asisDecididos esta en _SYNC_LISTS', () => {});
test('asisDecididos NO usa marcas de borrado', () => {});
test('un equipo sin asisDecididos no borra la lista del otro', () => {
  // Blob local sin la clave + blob de la nube con 3 decisiones.
});
test('la ventana dice de cuando es la entrada', () => {});
test('sin worker ni key, la ventana sigue mostrando _lbpAlertas', () => {});
test('_lbpAlertas no cambio', () => {
  // Afirmacion de que la funcion sigue byte a byte igual: es la red.
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_ventana.test.mjs"`
Expected: FAIL.

- [ ] **Step 3: Escribir y aplicar `scratchpad/patch_asistente_app.py`** con los
  reemplazos exactos. El bloque y la ventana leen el asistente cuando hay entrada
  fresca y caen a `_lbpAlertas` cuando no. **`_lbpAlertas` no se toca.** El
  `useEffect` de la tarjeta (~5514) pide `/asistente` primero y cae a
  `/briefing-ai`, con la fecha armada en hora local; el renderizador de ~5837 ya
  pinta `summary` como líneas, así que no se reescribe.

- [ ] **Step 4: `node --check` sobre el JS extraído**

Expected: sin errores.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `node --test "tests/asistente_ventana.test.mjs"`
Expected: PASS, 11 pruebas.

- [ ] **Step 6: Verificar en un navegador real** con datos sembrados
  desechables, en `localhost` (origen distinto del publicado), limpiando el
  `localStorage` al terminar: entrada fresca → el bloque dice Asistente; sin
  entrada → dice Alertas; la ventana hace scroll; el tilde y el «no me interesa»
  sacan el ítem sin cerrar la ventana; sin scroll horizontal a 375 px.

- [ ] **Step 7: Commit**

```bash
git add LifeBusinessPlanner2026.html tests/asistente_ventana.test.mjs
git commit -m "v5.75: ventana del asistente con _lbpAlertas de red, y decisiones por item"
```

---

### Task 7: Apagar el briefing y las cuatro notificaciones

Va **última** a propósito: lo viejo se apaga cuando lo nuevo ya está probado.

**Files:**
- Modify: `worker.js` (cinco compuertas en `scheduledHandler`, ~2438-2467)
- Modify: las pruebas existentes que afirmen esas compuertas
- Test: `tests/asistente_apagado.test.mjs`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: cinco compuertas comentadas con el motivo, y los generadores
  intactos en el archivo para poder volver con una línea.

Se apagan: `briefing` (12:03), `meeting_followup` (13:00), `stale_alarms`
(14:00), `project_health` y `client_health` (lunes 13:45).
**Siguen encendidas a propósito:** `deadlines` (21:00), que mira hacia adelante
y es lo único de las candidatas que da algo que el asistente todavía no da; y
`habits` (01:00) y `weekly` (sábado 15:00), que son de otro tema.

- [ ] **Step 1: Escribir las pruebas que fallan**:

```js
test('a las 12:03 UTC ya NO se genera el briefing', async () => {
  // 0 llamadas al modelo, y no se escribe briefing_ai:<key>:<fecha>.
});
test('a las 13:00 UTC ya NO sale el seguimiento de reuniones', async () => {});
test('a las 14:00 UTC L-V ya NO salen las alarmas viejas', async () => {});
test('el lunes 13:45 UTC ya NO sale salud de proyectos ni de clientes', async () => {});
test('deadlines a las 21:00 UTC SIGUE funcionando', async () => {});
test('habits a las 01:00 y weekly el sabado SIGUEN funcionando', async () => {});
test('el generador del briefing sigue en el archivo', () => {
  // Para poder volver atras con una linea.
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test "tests/asistente_apagado.test.mjs"`
Expected: FAIL — las cinco siguen encendidas.

- [ ] **Step 3: Comentar las cinco compuertas**, cada una con el motivo y la
  fecha. **Ninguna prueba del repo afirma el horario de estas cinco** (verificado
  por grep el 23-nov), así que no hay pruebas existentes que ajustar: no salgas a
  buscarlas. Si aparece una, se cambia para afirmar que la compuerta está
  apagada, no se borra.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test "tests/asistente_apagado.test.mjs"`
Expected: PASS, 7 pruebas.

- [ ] **Step 5: `node --check` y la suite entera**

Run: `node --check worker.js && node --test "tests/*.test.mjs"`
Expected: 0 fallan, y el total **no baja de 440**.

- [ ] **Step 6: Commit**

```bash
git add worker.js tests/asistente_apagado.test.mjs
git commit -m "Apagar el briefing y las 4 notificaciones que repiten al asistente"
```

---

## Al cerrar la rama

- Desplegar el worker: `npx wrangler deploy` **después** de verificar
  `npx wrangler secret list --name life-planner` (un deploy reemplaza las vars
  por las del toml) y de confirmar que el toml conserva
  `crons = ["* * * * *"]`.
- Poner el secret nuevo: `npx wrangler secret put ASIS_KEY` — **lo hace Pepe**.
- Probar en vivo con `GET /force-asistente?key=&pasada=manana` antes de esperar
  el horario.
- Probar el worker en **workerd**, no sólo con Node: las pruebas de Node no ven
  lo que falla dentro del Worker.
- Escribir `docs/superpowers/notas/2026-11-23-asistente-decisiones.md` con las
  decisiones tomadas durante la ejecución y los residuos.
