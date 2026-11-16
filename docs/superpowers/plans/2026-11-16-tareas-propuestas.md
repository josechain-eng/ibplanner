# Tareas propuestas de la semana — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada mañana LB Planner proponga tareas sacadas de los correos de los últimos ~10 días, con ✓/✗ por fila, y que lo confirmado entre como tarea del próximo día hábil con una alarma a las 9:40 (+5 min la siguiente).

**Architecture:** el puente de Outlook deja de perder el cuerpo del mensaje original de cada hilo; un endpoint nuevo del worker (`GET /task-proposals`) le pide al modelo los pendientes de Pepe y cachea la corrida del día en KV; la app filtra lo ya decidido, muestra la tarjeta y crea las tareas con la escalera de alarmas. La memoria de decisiones cuelga del hilo, no del texto del modelo.

**Tech Stack:** Python 3 stdlib (puente), Cloudflare Worker + KV (`worker.js`), HTML monolito con React 18 compilado (`React.createElement`, sin JSX), `node:test` para las pruebas de JS y `unittest` para las del puente.

**Spec:** `docs/superpowers/specs/2026-11-16-tareas-propuestas-design.md`

**Desviación del diseño, consciente:** el diseño dice que el `hiloId` es «el asunto normalizado del hilo» calculado por el worker. Este plan lo calcula en el worker **duplicando el regex de `normalize_subject` del puente** (una línea) en vez de hacer que el puente lo publique, para que funcione también con el payload que ya está en el KV. El riesgo (que las dos normalizaciones se separen) queda cubierto por una prueba con tabla de asuntos en la Tarea 2.

## Global Constraints

- `lbplanner/worker.js` es **ASCII puro**: `LC_ALL=C grep -c '[^ -~]' worker.js` tiene que dar `0`.
- El puente es **solo stdlib**: nada de dependencias nuevas.
- Fechas **siempre en hora local, nunca `toISOString()`** para un `YYYY-MM-DD` (Bolivia es UTC-4 y correría el día). Se usa `_fechaLocal(d)` / el patrón de `today()`.
- `node --check` sobre el JS extraído del HTML después de cada parche, y sobre `worker.js` después de cada cambio.
- `lbplanner/wrangler.toml` conserva `crons = ["* * * * *"]`; el del briefing conserva `crons = []`. Nada de secretos en `[vars]`.
- Nunca `git add -A` en `lbplanner` (hay zips >100 MB en `LBPlanner Backup/`; `.wrangler/` y `scratchpad/` están sucios a propósito). Se añaden archivos por nombre.
- `grep -c` sale con código 1 cuando no hay coincidencias: no encadenar con `&&` o el resto del comando no corre.
- En `_SYNC_LISTS` solo entran listas cuyos items tengan `id`.
- Los avisos push llevan el texto de SU función: una tarea propuesta no puede avisar como campaña.

## Review Focus

1. **El modelo devuelve un índice `[N]` que no existe** (o repite uno): el worker descarta esa propuesta y lo dice en `descartes`, no cae ni emite una propuesta sin origen. → prueba en Tarea 2.
2. **Un hilo cuyo asunto normalizado queda vacío** (`"(sin asunto)"`, `"Re:"` solo): el `hiloId` cae al `threadId` del mensaje, para que una ✗ no silencie correos sin relación entre sí. → prueba en Tarea 2.
3. **La misma propuesta confirmada en dos equipos**: `tareasDecididas` se deduplica por `id` y `_tpAplicar` no crea la tarea dos veces. → prueba en Tarea 3.
4. **`tareasDecididas` crece sin techo** y engorda un blob que ya pesa ~4,6 MB: se poda a los 180 días. → prueba en Tarea 3.
5. **El puente no corrió hoy** (payload viejo o vacío): la tarjeta dice que el correo está sin leer desde tal fecha, en vez de mostrar «no hay nada nuevo». → prueba en Tarea 2 (`ts` viejo viaja al cliente) y Tarea 4 (el texto).

---

### Task 1: El puente deja de perder el pedido original del hilo

**Files:**
- Modify: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/ventura_bridge.py:71` (`SNIPPET_CHARS`) y `:521-539` (`collapse_threads`)
- Test: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/test_hilos.py` (crear)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: cada hilo publicado en `POST /ingest-ventura` lleva, además de lo de hoy, `mensajes: [{"from": str, "date": str, "snippet": str}]` — **todos** los mensajes del hilo, del más nuevo al más viejo, tope `MENSAJES_POR_HILO = 6`. `snippet` y `msgCount` del hilo no cambian de significado.

- [ ] **Step 1: Escribir la prueba que falla** en `bridge/test_hilos.py`

```python
import unittest
import ventura_bridge as vb

def correo(subject, date, cuerpo, quien="a@x.com"):
    return {"threadId": "outlook-" + date, "subject": subject, "from": quien,
            "date": date, "to": "", "snippet": cuerpo, "attended": False,
            "link": "https://webmail.venturamall.bo", "msgCount": 1}

class Hilos(unittest.TestCase):
    def test_el_hilo_publica_todos_sus_mensajes(self):
        hilos = vb.collapse_threads([
            correo("Pago royalty", "2026-11-09T09:00:00", "Favor revisar el pago del royalty"),
            correo("RE: Pago royalty", "2026-11-12T15:00:00", "gracias"),
        ])
        self.assertEqual(len(hilos), 1)
        self.assertEqual(hilos[0]["snippet"], "gracias")          # el brief no cambia
        self.assertEqual(hilos[0]["msgCount"], 2)
        self.assertEqual([m["snippet"] for m in hilos[0]["mensajes"]],
                         ["gracias", "Favor revisar el pago del royalty"])

    def test_el_tope_por_hilo_deja_los_mas_nuevos(self):
        muchos = [correo("X", f"2026-11-{d:02d}T09:00:00", f"m{d}") for d in range(1, 10)]
        hilo = vb.collapse_threads(muchos)[0]
        self.assertEqual(len(hilo["mensajes"]), vb.MENSAJES_POR_HILO)
        self.assertEqual(hilo["mensajes"][0]["snippet"], "m9")

    def test_el_tope_de_cuerpo_es_1200(self):
        self.assertEqual(vb.SNIPPET_CHARS, 1200)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr la prueba y verla fallar**

Run: `cd "/Users/josechain/Documents/Projects/Briefing Diario/bridge" && python3 test_hilos.py`
Expected: FAIL — `KeyError: 'mensajes'` y `AttributeError`/`AssertionError` por `MENSAJES_POR_HILO` y `SNIPPET_CHARS`.

- [ ] **Step 3: Subir `SNIPPET_CHARS` a 1200 y añadir `MENSAJES_POR_HILO = 6`** junto a las constantes de `ventura_bridge.py:68-74`

El comentario tiene que decir por qué: `/email-actions` y `/task-proposals` ya le pasan al modelo `slice(0, 1200)`, así que 320 recortaba el pedido antes de que nadie lo pidiera.

- [ ] **Step 4: Hacer que `collapse_threads` publique `mensajes`** en `ventura_bridge.py:521`

Dentro del bucle que ya ordena cada grupo por fecha descendente, añadir al dict del hilo la lista de `{"from", "date", "snippet"}` de los primeros `MENSAJES_POR_HILO` del grupo ordenado. `snippet`/`msgCount` quedan como están: el briefing diario no lee `mensajes` y re-recorta a 300 (`Briefing Diario/worker.js:1039` y `:1085`), así que el cambio es aditivo.

- [ ] **Step 5: Correr las pruebas nuevas y las que ya había**

Run: `cd "/Users/josechain/Documents/Projects/Briefing Diario/bridge" && python3 test_hilos.py && python3 test_reuniones.py && python3 test_campanas.py`
Expected: PASS las tres (el briefing no cambia es lo que prueban las otras dos al seguir verdes).

- [ ] **Step 6: Medir el payload real** con Outlook abierto

Run: `cd "/Users/josechain/Documents/Projects/Briefing Diario/bridge" && python3 -c "import json, ventura_bridge as vb; ok, raw = vb.osa(vb.INBOX_SCRIPT); hilos = vb.collapse_threads(vb.parse_inbox(raw)) if ok else []; print(ok, len(hilos), len(json.dumps(hilos)))"`
Expected: `True`, la cantidad de hilos y el tamaño en bytes del JSON. Si pasa de **3 MB**, bajar `MENSAJES_POR_HILO` hasta que entre (el valor del KV admite 25 MB, pero el briefing guarda 300 hilos y el worker los baja completos). Si devuelve `False` porque Outlook está cerrado, saltear este paso y anotarlo en el ledger; el tope de 6 es el resguardo.

- [ ] **Step 7: Reinstalar el puente y commitear**

```bash
cd "/Users/josechain/Documents/Projects/Briefing Diario/bridge" && ./install.sh
```
Expected: el instalador copia `ventura_bridge`, `reuniones` y `campanas` a `~/Library/Application Support/BriefingBridge/`. Verificar con `grep -c MENSAJES_POR_HILO "$HOME/Library/Application Support/BriefingBridge/ventura_bridge.py"` → `1`. **Este directorio es el que corre launchd**; sin esta copia el cambio no corre nunca (ya pasó con campañas). El proyecto Briefing Diario no es un repo git: no hay commit acá, el paso de arriba es el «deploy».

---

### Task 2: `GET /task-proposals` — el modelo lee el correo y el día se cachea

**Files:**
- Modify: `lbplanner/worker.js` (endpoint nuevo junto a `/campaign-actions`, que termina en `:758`)
- Test: `lbplanner/tests/task_proposals.test.mjs` (crear)

**Interfaces:**
- Consumes: los hilos con `mensajes` de la Tarea 1 vía `GET /ventura-emails` del briefing (service binding `BRIEFING_SERVICE`, secreto `BRIEFING_KEY`).
- Produces: `GET /task-proposals?key=<syncKey>&days=10&refresh=1` → `200` con
  `{ ts, days, correos, analizados, propuestas: [{hiloId, titulo, remitente, asunto, fecha, cita, clienteSugerido}], descartes: [string], cacheada: boolean }`.
  En cualquier fallo devuelve `200` con `{error, propuestas: []}` (la app no se rompe). `hiloId` tiene la forma `'hilo:' + asunto normalizado`, o `'msg:' + threadId` si el asunto normalizado queda vacío.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/task_proposals.test.mjs`

Mismo arnés que `tests/campaign_actions.test.mjs` (copiar `cargar()` y `entorno()`), con dos añadidos: `ANTHROPIC_API_KEY: 'x'` y un `globalThis.fetch` de mentira que responde a `api.anthropic.com` con `{content:[{type:'text',text:JSON.stringify(RESPUESTA)}]}` y cuenta las llamadas. El KV falso guarda en un `Map` para que `put`/`get` se vean entre pedidos.

```js
const HILOS = [
  { threadId: 'outlook-1', subject: 'RE: Pago Royalty Fogo', from: 'Ana <ana@fogodechao.com>',
    date: '2026-11-09T09:00:00', snippet: 'gracias',
    mensajes: [{ from: 'Ana <ana@fogodechao.com>', date: '2026-11-09T09:00:00', snippet: 'gracias' },
               { from: 'Ana <ana@fogodechao.com>', date: '2026-11-06T09:00:00', snippet: 'Favor revisar el pago del royalty de octubre' }] },
  { threadId: 'outlook-2', subject: '(sin asunto)', from: 'Luis <luis@mango.com>',
    date: '2026-11-10T09:00:00', snippet: 'mandame el pedido' },
];
const RESPUESTA = { propuestas: [
  { correo: 1, titulo: 'Ver Pago Royalty Fogo', cita: 'Favor revisar el pago del royalty de octubre', cliente: 'Fogo' },
  { correo: 2, titulo: 'Mandar el pedido a Mango', cita: 'mandame el pedido', cliente: 'Mango' },
  { correo: 9, titulo: 'Inventada', cita: 'no existe', cliente: '' } ] };

test('el hiloId sale del asunto normalizado, no del modelo');        // → 'hilo:pago royalty fogo'
test('un asunto vacio cae al threadId');                             // → 'msg:outlook-2'
test('una propuesta con un correo que no existe se descarta');       // propuestas.length === 2 y descartes tiene 1
test('el cuerpo del modelo incluye el mensaje mas viejo del hilo');  // el prompt contiene 'royalty de octubre'
test('la segunda llamada del dia sale del cache y no llama al modelo'); // cacheada === true, llamadas al modelo === 1
test('refresh=1 vuelve a llamar al modelo');                         // llamadas === 2, cacheada === false
test('sin key valida no llama ni al briefing ni al modelo');         // error /key/i, llamadas === 0
test('el ts del briefing viaja al cliente');                         // body.ts === el ts del payload
```

La tabla del `hiloId` va en la misma prueba del primer `test`, para que una deriva contra `normalize_subject` del puente salte acá:

```js
for (const [asunto, esperado] of [['Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                  ['RE: Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                  ['Fwd: Pago Royalty Fogo', 'hilo:pago royalty fogo'],
                                  ['  RV : Pago Royalty Fogo  ', 'hilo:pago royalty fogo']]) { /* ... */ }
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `cd /Users/josechain/lbplanner && node --test tests/task_proposals.test.mjs`
Expected: FAIL — el endpoint no existe, la respuesta trae `propuestas: []`.

- [ ] **Step 3: Implementar el endpoint en `worker.js`**, inmediatamente después del bloque de `/campaign-actions` (`:758`)

Reusa, tal cual, tres cosas que ya están en el archivo: la validación de la key por nombre EXACTO de `data:<syncKey>` con `list({prefix, limit:1})` (`:476-480`); la lectura del briefing con `BRIEFING_SERVICE` y caída a `fetch` (`:486-499`); y el reparto en tandas con `Promise.all` de `/campaign-actions` (`:729-745`), con `POR_TANDA = 10`.

Lo propio de este endpoint:

- `function _tpHiloId(subject, threadId)`: `'hilo:' + String(subject||'').toLowerCase().replace(/^(re|res|fwd|rv)\s*:\s*/i,'').trim()`, y si eso queda vacío o es `'(sin asunto)'`, `'msg:' + threadId`. Es el espejo de `normalize_subject` del puente (`ventura_bridge.py:171`).
- Contexto al modelo: una entrada por hilo con `[N]`, fecha, remitente, asunto y **todos** los `mensajes` del hilo del más viejo al más nuevo (`slice(0, 1200)` cada uno), cayendo a `snippet` si el hilo no trae `mensajes` (payload viejo). El modelo responde solo `{"propuestas":[{"correo":N,"titulo":"...","cita":"...","cliente":"..."}]}`.
- Prompt del sistema, constante `TP_SP` junto a `CAMP_SP`: **qué queda pendiente DE PEPE**, una línea imperativa por pendiente, en su taquigrafía, con los títulos de sus tareas abiertas y de las cerradas de los últimos 60 días como ejemplos de estilo **y** como lista de lo ya cubierto; nada de newsletters ni avisos automáticos; si un correo no deja ningún pendiente suyo, omitirlo.
- Los títulos de tareas salen del blob `data:<syncKey>` que ya se baja para los clientes, filtrando por `createdAt`/`dueDate` de los últimos 60 días, solo `title`.
- El worker mapea `propuesta.correo` → el hilo real. Índice fuera de rango o repetido: fuera, y una línea en `descartes`.
- Cache: clave `'tprop:' + syncKey + ':' + _hoyBolivia()`, `put` con `expirationTtl: 172800`. Con `refresh=1` no se lee el cache y se sobreescribe. La respuesta cacheada va idéntica más `cacheada: true`.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd /Users/josechain/lbplanner && node --test tests/task_proposals.test.mjs`
Expected: PASS las 8.

- [ ] **Step 5: Verificar ASCII y sintaxis**

Run: `cd /Users/josechain/lbplanner && node --check worker.js; LC_ALL=C grep -c '[^ -~]' worker.js`
Expected: sin salida de `node --check`, y `0` del grep.

- [ ] **Step 6: Desplegar y probar contra el correo de verdad**

```bash
cd /Users/josechain/lbplanner && grep -n 'crons' wrangler.toml && npx wrangler deploy
```
Expected: `crons = ["* * * * *"]` presente antes de desplegar, y el deploy OK.
Después: `curl -s "https://life-planner.josechain.workers.dev/task-proposals?key=<syncKey>&days=10" | head -c 2000`
Expected: `propuestas` con títulos y citas reales. **No imprimir ningún secreto en el reporte.**

- [ ] **Step 7: Commit**

```bash
cd /Users/josechain/lbplanner && git add worker.js tests/task_proposals.test.mjs && git commit -m "task-proposals: los pendientes de Pepe salen del correo, con el dia cacheado"
```

---

### Task 3: Las funciones puras de la app — día hábil, escalera, memoria y alta

**Files:**
- Modify: `lbplanner/LifeBusinessPlanner2026.html` — `_SYNC_LISTS` (`:979-993`) y un bloque nuevo de funciones `window._tp*` junto a las de reuniones de Outlook (después de `_soltarAlarmasViejas`, antes de `tomorrowStr` en `:3508`)
- Test: `lbplanner/tests/tareas_propuestas.test.mjs` (crear)

**Interfaces:**
- Consumes: `propuestas` de la Tarea 2; `_clienteDeOrganizador(organizador, clients) -> {id, name} | null` (`:3132`); `window._LBP_EVENTS` (`:102`); `uid()` (`:2103`).
- Produces, todas declaradas como `window._tpX = function(...) {` ... `\n};\n` para que el arnés de pruebas las pueda extraer:
  - `window._tpProximoDiaHabil(ymd) -> 'YYYY-MM-DD'` — el primer día **estrictamente posterior** a `ymd` que no es sábado, domingo ni `cat:'feriado'` de `window._LBP_EVENTS` (mes/día, cualquier año).
  - `window._tpHoraAlarma(data, ymd, extra) -> 'YYYY-MM-DDTHH:MM'` — el primer hueco libre de la escalera 09:40, 09:45, 09:50… de ese día, mirando las alarmas habilitadas de `data.tasks` y los datetimes de `extra` (array, lo asignado en esta misma tanda).
  - `window._tpFiltrar(propuestas, decididas) -> propuestas` — saca las que ya tienen decisión.
  - `window._tpAplicar(data, decisiones) -> { tasks, tareasDecididas, res }` — `decisiones` es `[{propuesta, decision:'ok'|'no'}]`; `res` es `{creadas, descartadas, detalle: [string]}`.
  - `window._tpPodarDecididas(decididas) -> decididas` — deduplica por `id` (gana el `ts` más nuevo) y tira lo de más de 180 días.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/tareas_propuestas.test.mjs`

Arnés: el `cuerpo()`/`fuente()`/`traer()` de `tests/reuniones_outlook.test.mjs:12-37` (copiarlo), que extrae por llaves balanceadas y necesita `window._LBP_EVENTS`, `window._LBP_CLIENT_ALIASES`, `window._detectClientId`, `_clienteDeOrganizador` y `uid` en el prólogo.

```js
const P = (over) => Object.assign({ hiloId: 'hilo:pago royalty fogo', titulo: 'Ver Pago Royalty Fogo',
  remitente: 'Ana <ana@fogodechao.com>', asunto: 'RE: Pago Royalty Fogo', fecha: '2026-11-09',
  cita: 'Favor revisar el pago del royalty de octubre', clienteSugerido: 'Fogo' }, over || {});

test('un viernes cae en lunes', () => assert.equal(_tpProximoDiaHabil('2026-11-20'), '2026-11-23'));
test('salta el feriado de Navidad', () => assert.equal(_tpProximoDiaHabil('2025-12-24'), '2025-12-26'));
test('feriado pegado al fin de semana cae en lunes', () => assert.equal(_tpProximoDiaHabil('2026-12-24'), '2026-12-28'));

test('la escalera arranca 09:40 y suma 5', () => {
  const d = { tasks: [] };
  assert.equal(_tpHoraAlarma(d, '2026-11-17', []), '2026-11-17T09:40');
  assert.equal(_tpHoraAlarma(d, '2026-11-17', ['2026-11-17T09:40']), '2026-11-17T09:45');
  assert.equal(_tpHoraAlarma(d, '2026-11-17', ['2026-11-17T09:40', '2026-11-17T09:45']), '2026-11-17T09:50');
});
test('cuenta las alarmas que ya estan puestas ese dia, no la tanda', () => {
  const d = { tasks: [{ id: 't1', alarm: { enabled: true, datetime: '2026-11-17T09:40' } }] };
  assert.equal(_tpHoraAlarma(d, '2026-11-17', []), '2026-11-17T09:45');
});
test('una alarma apagada no ocupa lugar');            // enabled:false → sigue dando 09:40
test('estas alarmas no llevan recordatorios');        // repeatIntervals === null && repeatCount === 0
test('lo descartado no vuelve');                      // _tpFiltrar tras un 'no'
test('lo aceptado tampoco vuelve');                   // _tpFiltrar tras un 'ok'
test('la fila sin tocar si vuelve');                  // la propuesta que no entro en `decisiones`
test('la misma propuesta confirmada dos veces crea una sola tarea');  // Review Focus 3
test('una decision de hace 200 dias se poda');        // Review Focus 4
test('un dominio ambiguo deja clientId vacio');       // dos clients con el mismo dominio → clientId === ''
test('un correo gratuito deja clientId vacio');       // ana@gmail.com → clientId === ''
test('la cita y el correo de origen quedan en la descripcion');
test('la fecha limite que menciona el correo no pisa el dueDate');   // dueDate === proximo dia habil
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `cd /Users/josechain/lbplanner && node --test tests/tareas_propuestas.test.mjs`
Expected: FAIL — `no encuentro window._tpProximoDiaHabil`.

- [ ] **Step 3: Implementar las cinco funciones** con un script de parcheo en `scratchpad/` (reemplazo de cadena exacta, como el resto del proyecto)

La tarea que crea `_tpAplicar` por cada `'ok'`:

```js
{ id: uid(), title: p.titulo, description: <cita + «De: remitente · asunto · fecha»>,
  status: 'INBOX', priority: 'MEDIUM', dueDate: <_tpProximoDiaHabil(hoy)>,
  clientId: (_clienteDeOrganizador(p.remitente, data.clients) || {}).id || '',
  category: 'Work', tags: ['Correo'], createdAt: Date.now(),
  alarm: { enabled: true, datetime: <_tpHoraAlarma(...)>, recurrence: 'once',
           customInterval: 1, customUnit: 'days', label: 'Tarea propuesta',
           repeatCount: 0, repeatInterval: 5, repeatIntervals: null,
           sound: 'bell', vibration: 'long' } }
```

Las dos decisiones se graban: `{ id: p.hiloId, decision: 'ok'|'no', ts: Date.now() }`. `clienteSugerido` **no** decide nada; solo se muestra. Nada de `toISOString()` para `dueDate` ni para el `datetime`.

- [ ] **Step 4: Añadir `'tareasDecididas'` a `_SYNC_LISTS`** (`:979-993`), con un comentario de una línea: es una lista de objetos con `id`, que es la condición que el merge exige.

- [ ] **Step 5: Verificar sintaxis y correr toda la suite**

Run: `cd /Users/josechain/lbplanner && node --test tests/`
Expected: PASS todo, incluidas las 24 pruebas que ya existían.

- [ ] **Step 6: Commit**

```bash
cd /Users/josechain/lbplanner && git add LifeBusinessPlanner2026.html tests/tareas_propuestas.test.mjs && git commit -m "Tareas propuestas: dia habil, escalera de alarmas y memoria por hilo"
```

---

### Task 4: La tarjeta con ✓ y ✗, en el Home

**Files:**
- Modify: `lbplanner/LifeBusinessPlanner2026.html` — componente nuevo `TareasPropuestas` junto a `CampanasCorreo` (`:19266`), su montaje en `HomeScreen` (`:5082`, después de la tarjeta «🌅 Briefing del día» de `:5544`) y `window.LBP_VERSION` (`:25`)
- Test: `lbplanner/tests/tarjeta_propuestas.test.mjs` (crear)

**Interfaces:**
- Consumes: `window._tpFiltrar`, `window._tpAplicar`, `window._tpPodarDecididas` (Tarea 3) y `GET /task-proposals` (Tarea 2).
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/tarjeta_propuestas.test.mjs`

Son pruebas de texto sobre el HTML publicado (el patrón de `tests/botones_tarjeta.test.mjs` y `tests/nombre_equipo.test.mjs`): la UI de React compilado no se monta en Node, así que lo que se fija acá son los invariantes que ya se rompieron antes en este proyecto.

```js
test('la tarjeta se llama «las tareas propuestas de la semana»');  // el titulo exacto esta en el HTML
test('no hay un boton Guardar que decida por las filas sin tocar'); // el bloque de TareasPropuestas no trae /Guardar/
test('cada fila tiene su propio ✓ y su propia ✗');                  // dos onClick por fila
test('el aviso dice tareas, no campanas');                          // el bloque no contiene /Campana/i
test('hay un boton para volver a leer que pasa refresh=1');
test('hay una pantalla de lo descartado con deshacer');
test('cuando el correo esta viejo la tarjeta lo dice');             // usa `ts` y el texto nombra la fecha
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `cd /Users/josechain/lbplanner && node --test tests/tarjeta_propuestas.test.mjs`
Expected: FAIL — no existe el componente.

- [ ] **Step 3: Implementar `TareasPropuestas`**

Estructura y estilos calcados de `CampanasCorreo` (`:19266-19400`): estados `fase`/`lote`/`err`/`hecho`, `traer()` con `localStorage.getItem('lbp_sync_key')` y `window.LBP_WORKER_URL`, `useEffect(traer, [])`, y el mismo `React.createElement` sin JSX.

Lo que **no** se copia, a propósito: no hay checkbox ni botón Guardar. Cada fila tiene `✓` y `✗` propios que aplican esa sola fila al toque (`_tpAplicar` con una decisión y `setData`), y la fila que Pepe no toca no graba nada y vuelve mañana. Es la diferencia que el diseño pide: acá destildar significaría «nunca más», y un Guardar el primer día mataría treinta propuestas sin leer.

Además: título «🗂 Las tareas propuestas de la semana»; `window._tpFiltrar(res.propuestas, data.tareasDecididas)` antes de mostrar; cada fila muestra título, remitente, asunto, fecha y la cita; un botón «↻ volver a leer» que llama con `refresh=1`; una pantalla chica que lista `tareasDecididas` con `decision:'no'` y permite deshacer (saca esa entrada de la lista); y si `lote.ts` es de hace más de 24 h, una línea que diga desde cuándo el correo está sin leer en vez de «sin novedades».

- [ ] **Step 4: Montar la tarjeta en `HomeScreen`** después de la tarjeta del briefing (`:5544`), colapsable, con el conteo de propuestas pendientes en la cabecera. Se muestra **todos los días**, aunque se llame «de la semana».

- [ ] **Step 5: Subir la versión** a `5.71` en `window.LBP_VERSION` (`:25`)

- [ ] **Step 6: Verificar sintaxis y correr toda la suite**

Run: `cd /Users/josechain/lbplanner && node --test tests/`
Expected: PASS todo.

- [ ] **Step 7: Commit y publicar**

```bash
cd /Users/josechain/lbplanner && git add LifeBusinessPlanner2026.html tests/tarjeta_propuestas.test.mjs && git commit -m "v5.71 - la tarjeta de tareas propuestas de la semana" && git push
```

- [ ] **Step 8: Probar en el sitio publicado, en celular y computadora**

Abrir `https://josechain-eng.github.io/ibplanner/LifeBusinessPlanner2026.html` en el navegador (375 px y 1200 px), con la consola abierta. Comprobar: la tarjeta con sus filas; una ✓ y una ✗; las dos tareas creadas con alarma a las 09:40 y 09:45 del próximo día hábil; la descartada ausente al recargar; y **cero errores en la consola**.
Expected: una captura de cada ancho y el listado de la consola limpio. Si el shell cacheado sirve la versión anterior, dos recargas (el service worker es stale-while-revalidate).

---

## Autorrevisión

**Cobertura del diseño:** punto 1 → Tarea 1. Punto 2 → Tarea 2 (pasos 3 y 6). Punto 3 (cache del día) → Tarea 2 (paso 3) con su prueba. Punto 4 (tres estados) → Tarea 4 (paso 3) con dos pruebas. Punto 5 (memoria por hilo, las dos decisiones, filtra la app) → Tarea 3. Punto 6 (forma de la tarea, día hábil, dominio manda) → Tarea 3. Punto 7 (escalera sin escalada) → Tarea 3. «No tocar el informe de actividades» se cumple por omisión: ninguna tarea toca `/email-actions` ni `_buildWeeklyReport`.

**Review Focus:** las cinco líneas tienen prueba — 1 y 2 en la Tarea 2 (paso 1), 3 y 4 en la Tarea 3 (paso 1), 5 en la Tarea 2 (`ts` viaja) y en la Tarea 4 (el texto).

**Consistencia de nombres:** `hiloId`, `propuestas`, `descartes`, `cacheada` viajan igual del worker (Tarea 2) a las funciones (Tarea 3) y a la tarjeta (Tarea 4); `tareasDecididas` tiene la misma forma `{id, decision, ts}` en `_SYNC_LISTS`, en `_tpFiltrar`, en `_tpAplicar` y en `_tpPodarDecididas`.

**Lo que queda a criterio del que lo construya:** la redacción exacta de `TP_SP`, el orden de las filas, el texto de los chips y el lugar fino de la tarjeta dentro del Home.
