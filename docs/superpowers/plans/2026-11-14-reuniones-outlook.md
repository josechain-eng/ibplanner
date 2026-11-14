# Reuniones de Outlook en LB Planner — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada reunión del calendario «Calendario» de Outlook, de hoy en adelante, entre sola a LB Planner con su hora exacta, su alarma, su cliente y la etiqueta aceptada/propuesta, y que siga los cambios (movida, cancelada, aceptada).

**Architecture:** Cadena de cuatro saltos copiada de la de Campañas, que ya está en producción: `bridge/reuniones.py` lee el calendario por AppleScript y publica el **estado completo** de los eventos futuros en `POST /ingest-reuniones` del worker del briefing (KV `ingest_reuniones`, reemplaza); ese worker avisa por push reusando `/push-campanas`; el worker de life-planner expone `GET /meeting-proposals` por service binding; y la app mezcla en `d.meetings` con una función pura, igual que `_gcalPull`. Ningún dato lo decide un modelo: todos salen de Outlook.

**Tech Stack:** Python 3 solo stdlib (launchd corre `/usr/bin/python3`), AppleScript vía `osascript`, Cloudflare Workers + KV, HTML de un solo archivo con React 18 compilado (`React.createElement`, sin JSX), pruebas con `node --test` y con `unittest` de Python.

**Spec:** `docs/superpowers/specs/2026-11-14-reuniones-outlook-design.md`

## Global Constraints

- `lbplanner/worker.js` es **ASCII puro**. Verificación: `LC_ALL=C grep -c '[^ -~]' worker.js` → `0`.
- En `Briefing Diario/worker.js`, los textos nuevos van **sin acentos ni eñes**, como el resto del archivo.
- `bridge/*.py`: **solo stdlib**. Nada de `requests`, `pip`, ni dependencias.
- En `bridge/`, el HTTP nuevo copia tal cual las cabeceras que ya arma `publish()`; si Cloudflare responde 403, pasar a `curl` por `subprocess`.
- Los cambios en `LifeBusinessPlanner2026.html` se hacen con **scripts de parcheo en Python por reemplazo de texto exacto**, nunca reescribiendo el archivo.
- Después de **cada** parche al HTML: extraer el JS y correr `node --check`. Si falla, revertir el parche.
- `Briefing Diario/wrangler.toml` conserva `crons = []`. `lbplanner/wrangler.toml` conserva `crons = ["* * * * *"]`.
- Los secretos son **secrets de Cloudflare**, nunca `[vars]`: `wrangler deploy` reemplaza el juego de vars con el del toml.
- Nunca `git add -A` en `lbplanner` (hay zips de más de 100 MB en `LBPlanner Backup/` que rompen el push).
- Hora local, nunca `toISOString()` para armar fechas: Bolivia es UTC-4 y correría 4 horas.

## Review Focus

Cinco clases de entrada que el diseño implica y que ninguna prueba de las tareas tocaría por sí sola. Cada una tiene su prueba asignada a la tarea que posee el código.

1. **Una lectura incompleta no puede cancelar nada.** Si Outlook está cerrado, el AppleScript falla o devuelve vacío, y «el UID no aparece» significaría «cancelaron todo». Es el peor daño posible de esta rama. → prueba en Tarea 1 (`leer()` marca `completa: False` y no publica) y en Tarea 5 (`completa: False` no cancela ninguna).
2. **Las reuniones que Pepe carga a mano no se tocan nunca.** No tienen `outlookEventId`; el camino de cancelación no puede alcanzarlas. → prueba en Tarea 5.
3. **Una reunión movida al pasado no puede recibir alarma.** El recálculo pasa por `_alarmaReunionGcal`, que ya rechaza fechas pasadas, pero el camino de «movida» la recalcula a mano. → prueba en Tarea 5.
4. **Un evento de día entero de Outlook** (`all day flag = true`) debe llevar la alarma de las 08:00 de la parte C, no una a las 23:00 del día anterior. → prueba en Tarea 5.
5. **Un ICS sin su línea ATTENDEE** debe caer al respaldo `free busy status` en vez de quedar sin etiqueta. → prueba en Tarea 1.

---

### Task 1: El puente lee el calendario

**Files:**
- Create: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/reuniones.py`
- Create: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/test_reuniones.py`
- Create: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/fixtures/ics_aceptada.txt`, `ics_sin_attendee.txt`, `ics_serie.txt`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CALENDARIO = "Calendario"` — nombre exacto del calendario a leer.
  - `MI_CORREO` — la casilla de Ventura, leída de una constante del módulo.
  - `CAL_SCRIPT: str` — el AppleScript, con `|~|` como separador de campos y `<<<EOR>>>` de registro (los títulos tienen barras: «PFC | Bolivia - Partnership»).
  - `desdoblar(ics: str) -> str` — deshace el plegado de líneas del ICS a los 75 caracteres (continuación que arranca con espacio o tab).
  - `uid_de(ics: str) -> str` — el `UID:` del ICS, ya desdoblado.
  - `estado_de(ics: str, free_busy: str, correo: str) -> str` — `'ACEPTADA' | 'PROPUESTA' | 'RECHAZADA'`.
  - `parse(raw: str) -> list[dict]` — registros con las claves `uid, titulo, fecha ('YYYY-MM-DD'), inicio ('HH:MM'), fin ('HH:MM'), diaEntero (bool), organizador, estado`.
  - `dedup(evs: list[dict]) -> list[dict]` — colapsa misma `fecha` + mismo `inicio` + título normalizado igual.
  - `leer(ahora: datetime | None = None) -> dict` — `{'completa': bool, 'ts': ISO, 'eventos': [...]}`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `test_reuniones.py`, con los ICS reales como fixtures (sacados de su Outlook; `ics_aceptada.txt` es el de «PFC | Bolivia - Partnership»):

```python
def test_desdoblar_une_la_continuacion()        # 'PARTSTAT' partido al medio queda entero
def test_uid_de_saca_el_uid_completo()          # == '040000008200E00074C5B7101A82E008000000001A07ED458373DD0100000000000000'
def test_estado_aceptada_por_partstat()         # PARTSTAT=ACCEPTED de SU linea -> 'ACEPTADA'
def test_estado_propuesta_por_needs_action()    # NEEDS-ACTION -> 'PROPUESTA'
def test_estado_rechazada_por_declined()        # DECLINED -> 'RECHAZADA'
def test_estado_sin_su_attendee_usa_free_busy() # ics_sin_attendee + 'busy' -> 'ACEPTADA'; + 'tentative' -> 'PROPUESTA'
def test_parse_rellena_el_cero_de_los_minutos() # AppleScript da '11:0' -> inicio == '11:00'
def test_parse_titulo_con_barras()              # 'PFC | Bolivia - Partnership' llega entero
def test_dedup_colapsa_las_dos_del_summit()     # mismo dia y hora, titulos normalizados iguales -> 1
def test_dedup_gana_la_aceptada()               # una ACEPTADA y una PROPUESTA -> queda la ACEPTADA
def test_dedup_empate_gana_el_uid_mas_chico()   # dos PROPUESTA -> el uid menor, sin importar el orden de entrada
def test_dedup_devuelve_los_uid_perdedores()    # el uid de la perdedora viaja igual, para no re-importarla
def test_rechazada_viaja_con_su_estado()        # el puente NO se la calla: manda estado 'RECHAZADA'
def test_leer_sin_outlook_marca_incompleta()    # osascript falla -> {'completa': False, 'eventos': []}
def test_parse_serie_no_entra()                 # ics_serie.txt (con RRULE) queda afuera
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd "/Users/josechain/Documents/Projects/Briefing Diario/bridge" && python3 -m unittest test_reuniones -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'reuniones'`

- [ ] **Step 3: Escribir `reuniones.py`**

El AppleScript filtra por `start time > (current date) - 1 * days` y manda el `icalendar data` completo solo de los que pasan ese filtro (medido: 3,6 s y 31 KB con 7 eventos). Dos trampas ya medidas que el código tiene que respetar:
- `offset of "UID:" in ics` **revienta con -1723** dentro del bloque `tell application "Microsoft Outlook"`: la extracción va en Python.
- El calendario se busca **por nombre** (`CALENDARIO`), nunca por índice: `calendar 2` hoy es «Calendario» pero el orden no está garantizado, y `calendar 4` es el calendario de Google, que **no** se debe leer (lo trae `_gcalPull` y duplicaría los cumpleaños).

Una serie se reconoce por `RRULE:` en el ICS desdoblado y queda afuera (está en los no objetivos del diseño).

**El puente no filtra por estado.** Una `RECHAZADA` viaja con su estado y es la app la que decide: si nunca entró, no entra; si ya estaba, queda cancelada. Si el puente la callara, el camino de cancelación de la Tarea 5 la vería como «el organizador la canceló», que es otra cosa.

- [ ] **Step 4: Correr y ver que pasan**

Run: `python3 -m unittest test_reuniones -v`
Expected: PASS, 15 pruebas

- [ ] **Step 5: Probar contra el Outlook de verdad**

Run: `python3 -c "import reuniones,json; print(json.dumps(reuniones.leer(), ensure_ascii=False, indent=1)[:1500])"`
Expected: `completa: true` y entre los eventos, «Reunión Mensual Bolivia» el 2026-12-02 a las `16:00`, estado `PROPUESTA`, organizador `ana.cardona@chillibeans.com.br`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/josechain/Documents/Projects/Briefing Diario"
git add bridge/reuniones.py bridge/test_reuniones.py bridge/fixtures/
git commit -m "Leer el calendario de Outlook: reuniones futuras con estado de respuesta"
```

---

### Task 2: El puente lo publica cada hora

**Files:**
- Modify: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/ventura_bridge.py`
- Modify: `/Users/josechain/Documents/Projects/Briefing Diario/bridge/test_reuniones.py`

**Interfaces:**
- Consumes: `reuniones.leer()` de la Tarea 1.
- Produces:
  - `REUNIONES_URL` — `https://briefing-diario-pepe.josechain.workers.dev/ingest-reuniones`
  - `REUNIONES_CADA = 3600` — segundos entre lecturas (decisión de Pepe: una vez por hora).
  - `toca_reuniones(state: dict, ahora: float) -> bool` — función pura, para poder probarla.
  - `correr_reuniones(forzar: bool = False, dry_run: bool = False) -> None`

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_toca_reuniones_la_primera_vez()         # sin 'reuniones_ultimo' -> True
def test_no_toca_antes_de_la_hora()              # hace 59 min -> False
def test_toca_pasada_la_hora()                   # hace 61 min -> True
def test_toca_aunque_el_brief_de_hoy_ya_corrio() # last_success_date == hoy -> True  (el candado del brief NO lo frena)
```

La cuarta es la que importa: hoy `should_run_now()` corta en seco cuando el brief del día ya salió, y por eso una invitación de las 10 de la mañana se vería a la mañana siguiente.

- [ ] **Step 2: Correr y ver que fallan**

Run: `python3 -m unittest test_reuniones -v`
Expected: FAIL — `AttributeError: module 'ventura_bridge' has no attribute 'toca_reuniones'`

- [ ] **Step 3: Implementar en `ventura_bridge.py`**

- `correr_reuniones()` entero dentro de un `try` propio, con el mismo comentario de intención que `correr_campanas()`: que esto falle **no** puede tumbar el brief diario.
- Publica `{'completa': ..., 'ts': ..., 'eventos': [...]}` con el secreto del Keychain, igual que `publish()`.
- **No publica nada si `completa` es `False`** (Review Focus 1).
- `--dry-run` **se respeta**: imprime lo que leyó y no publica. (El camino `--campanas` ignora el flag y el 9-nov publicó y mandó 4 push sin querer; no repetir el error.)
- Llamada nueva en `main()`, **antes** del candado del brief y de los `sys.exit` tempranos:

```python
if args.reuniones:
    correr_reuniones(forzar=True, dry_run=args.dry_run)
    print("[puente] --reuniones: no toque el brief diario")
    return
if args.auto and not args.force:
    correr_reuniones(dry_run=args.dry_run)
if args.auto and not args.force and not should_run_now():
    return
```

Y `ap.add_argument("--reuniones", action="store_true", ...)`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `python3 -m unittest test_reuniones -v`
Expected: PASS, 19 pruebas

- [ ] **Step 5: Probar el camino a mano sin publicar**

Run: `python3 ventura_bridge.py --reuniones --dry-run`
Expected: lista los eventos futuros y termina con que no publicó nada. **Verificar a mano que el KV no cambió** (`/reuniones-correo` sigue devolviendo lo de antes o vacío).

- [ ] **Step 6: Commit**

```bash
git add bridge/ventura_bridge.py bridge/test_reuniones.py
git commit -m "Publicar las reuniones cada hora, con candado propio y --reuniones"
```

---

### Task 3: El worker del briefing las recibe y avisa

**Files:**
- Modify: `/Users/josechain/Documents/Projects/Briefing Diario/worker.js` (junto a `/ingest-campanas`, línea ~188)
- Create: `/Users/josechain/Documents/Projects/Briefing Diario/test_worker_reuniones.mjs`

**Interfaces:**
- Consumes: el cuerpo que publica la Tarea 2.
- Produces:
  - `POST /ingest-reuniones` — exige `Bearer INGEST_SECRET`; **reemplaza** `ingest_reuniones` en KV (al revés que campañas, que acumula: si acumulara, un UID cancelado quedaría para siempre y la cancelación nunca se vería). Rechaza con 400 un cuerpo con `completa !== true`. Avisa por `env.LBP_SERVICE` → `/push-campanas` solo cuando hay novedad respecto del juego de UID guardado antes, y cuenta el resultado del aviso en la respuesta.
  - `GET /reuniones-correo?key=<INGEST_SECRET>` — devuelve el JSON guardado o `{"ts":null,"completa":false,"eventos":[]}`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```javascript
test('ingest-reuniones sin Bearer devuelve 401')
test('ingest-reuniones con completa:false devuelve 400 y no escribe el KV')
test('ingest-reuniones reemplaza, no acumula')      // 2 UID y despues 1 -> queda 1
test('ingest-reuniones avisa solo si hay un UID nuevo')
test('reuniones-correo sin key devuelve 401')
test('reuniones-correo devuelve lo guardado')
```

Seguir el patrón de `test_worker_campanas.mjs`, con KV y `LBP_SERVICE` falsos.

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd "/Users/josechain/Documents/Projects/Briefing Diario" && node --test test_worker_reuniones.mjs`
Expected: FAIL — las rutas devuelven 404

- [ ] **Step 3: Implementar los dos endpoints**

Textos nuevos sin acentos ni eñes, como el resto del archivo.

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --test test_worker_reuniones.mjs`
Expected: PASS, 6 pruebas

- [ ] **Step 5: Desplegar y probar de punta a punta**

```bash
npx wrangler deploy
```
Después, desde el puente: `python3 bridge/ventura_bridge.py --reuniones`
Expected: la respuesta del worker dice cuántos eventos guardó y el resultado del aviso; `GET /reuniones-correo?key=…` devuelve «Reunión Mensual Bolivia» del 2-dic.

- [ ] **Step 6: Commit**

```bash
git add worker.js test_worker_reuniones.mjs
git commit -m "Endpoints de reuniones: ingesta que reemplaza y lectura por binding"
```

---

### Task 4: El worker de LB Planner las expone

**Files:**
- Modify: `/Users/josechain/lbplanner/worker.js` (junto a `/campaign-actions`, línea ~558)
- Create: `/Users/josechain/lbplanner/tests/meeting_proposals.test.mjs`

**Interfaces:**
- Consumes: `GET /reuniones-correo` de la Tarea 3.
- Produces: `GET /meeting-proposals?key=<syncKey>` → `{ ts, completa, eventos: [...] }`. Es un proxy: **no llama a ningún modelo**. Usa `env.BRIEFING_SERVICE` y cae a `fetch` público solo si no hay binding, igual que `/campaign-actions`. Sin `BRIEFING_KEY`, devuelve 200 con `{ error, completa: false, eventos: [] }` para que la app no se rompa.

- [ ] **Step 1: Escribir la prueba que falla**

```javascript
test('meeting-proposals sin key devuelve el error en 200')
test('meeting-proposals usa el service binding cuando existe')
test('meeting-proposals propaga completa:false cuando el briefing no tiene nada')
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd /Users/josechain/lbplanner && node --test tests/meeting_proposals.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implementar el endpoint**

- [ ] **Step 4: Correr, y verificar el ASCII**

Run: `node --test tests/meeting_proposals.test.mjs && LC_ALL=C grep -c '[^ -~]' worker.js`
Expected: PASS y `0`

- [ ] **Step 5: Desplegar y probar**

Run: `npx wrangler deploy && curl -s "https://life-planner.josechain.workers.dev/meeting-proposals?key=lbp_0mnvmyv9uh8wciya" | head -c 400`
Expected: `completa: true` y el evento del 2-dic.

- [ ] **Step 6: Commit**

```bash
git add worker.js tests/meeting_proposals.test.mjs
git commit -m "GET /meeting-proposals: las reuniones de Outlook para la app"
```

---

### Task 5: La app las importa y sigue los cambios

**Files:**
- Modify: `/Users/josechain/lbplanner/LifeBusinessPlanner2026.html` — insertar después de `_normalizarGcal` (línea ~3060, antes de `var tomorrowStr`)
- Create: `/Users/josechain/lbplanner/tests/reuniones_outlook.test.mjs`

**Interfaces:**
- Consumes: `_alarmaReunionGcal`, `_esDiaEntero`, `_fechaLocal` (parte C); `window._detectClientId(text, clients)` (línea 514); los tombstones `d._deletedIds` + `window._lbpRecordDel`.
- Produces, todas funciones puras sobre el array de reuniones:
  - `_clienteDeOrganizador(organizador, clients) -> {id, name} | null` — primero por el dominio contra `(c.contacts||[]).map(x => x.email)`, después por `_detectClientId` sobre el nombre del dominio. `DOMINIOS_CLIENTE` mapea a mano los que no están en los contactos: `mango.com`, `hugoboss.com`, `chillibeans.com.br`, `pfcb.com`, `pfchangs.com`.
  - `_reunionDeOutlook(ev, clients, ahoraMs) -> object` — la reunión nueva, con `id: 'outlook_' + uid.replace(/[^a-z0-9]/gi,'')`, `outlookEventId: uid`, `fromGcal: false`, `confirmacion`, `clientId`, `clientName`, `status: 'SCHEDULED'`, e `isOnline` verdadero cuando el título o la ubicación mencionan Teams, Meet o Zoom.
  - `_mezclarOutlook(meetings, payload, clients, deletedIds, ahoraMs) -> { meetings, cambios }` — el corazón. `cambios` es la lista de `{tipo:'NUEVA'|'MOVIDA'|'CANCELADA'|'ACEPTADA', meeting}` para que la Tarea 6 avise. Devuelve **la misma referencia** de `meetings` si nada cambió, como hace `_normalizarGcal`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `tests/reuniones_outlook.test.mjs`, con el mismo arnés de `tests/alarmas_reuniones.test.mjs` (extrae las funciones del HTML contando llaves y las evalúa juntas con `traer([...])`):

```javascript
// importar
test('una reunion nueva entra con su etiqueta y su alarma a T-60')
test('una ACEPTADA entra con confirmacion ACEPTADA y la otra con PROPUESTA')
test('una RECHAZADA no entra')
test('una RECHAZADA ya importada queda CANCELLED y sin alarma')
test('el cliente sale del dominio del organizador')        // chillibeans.com.br -> id de Chillibeans
test('sin dominio conocido, clientId y clientName quedan vacios')
test('una reunion ya importada no se duplica')             // mismo outlookEventId -> no crece
test('una que Pepe borro no vuelve')                       // _deletedIds[id] presente -> no entra
// seguir los cambios
test('una movida cambia fecha y hora')
test('una movida recalcula la alarma automatica')           // alarm.auto === true -> nueva hora
test('una movida NO toca la alarma que puso Pepe')          // alarm sin auto -> intacta
test('una movida al pasado no deja alarma')                 // Review Focus 3
test('la que desaparecio de Outlook queda CANCELLED y sin alarma')
test('NEEDS-ACTION a ACCEPTED cambia confirmacion')
test('una lectura incompleta no cancela ninguna')           // Review Focus 1
test('las reuniones sin outlookEventId no se tocan nunca')  // Review Focus 2
test('un evento de dia entero lleva la alarma de las 08:00') // Review Focus 4
test('sin cambios devuelve la MISMA referencia del array')
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd /Users/josechain/lbplanner && node --test tests/reuniones_outlook.test.mjs`
Expected: FAIL — las funciones no existen

- [ ] **Step 3: Marcar las alarmas que pone la app**

En `_alarmaReunionGcal`, agregar `a.auto = true` al objeto que devuelve. Una alarma **sin** la marca se trata como puesta por Pepe y no se toca nunca — incluidas las 12 que puso la parte C el 13-nov.

- [ ] **Step 4: Escribir las tres funciones**

Reglas que las pruebas no determinan solas:
- **Cancelada** = la reunión tiene `outlookEventId`, el payload es `completa: true`, el UID **no** está en `payload.eventos`, y la reunión era futura (`date >= hoy`). Las pasadas no se tocan.
- **Borrada por Pepe** = el UID **sí** está en `payload.eventos` pero su `id` está en `deletedIds`. No se recrea. Esa es toda la diferencia con una cancelación, y por eso no hace falta una lista nueva: los tombstones ya existen, ya se sincronizan (`_mergeCloudData` los combina de los dos lados) y ya se podan a los 30 días.
- **Rechazada** (`estado === 'RECHAZADA'`) = no se crea; y si ya estaba importada, queda `CANCELLED` y sin alarma, por el mismo camino que una cancelada.
- Al recalcular la alarma de una movida, **borrar `alarm` antes** de llamar a `_alarmaReunionGcal`: la función se niega a tocar una reunión que ya tiene `alarm.datetime`.

- [ ] **Step 5: Correr y verificar la sintaxis**

Run: `node --test tests/reuniones_outlook.test.mjs && node --test tests/*.test.mjs`
Expected: PASS las 18 nuevas, y la suite entera en verde (incluidas las 25 de `alarmas_reuniones`, que el cambio del paso 3 toca)

- [ ] **Step 6: Commit**

```bash
cd /Users/josechain/lbplanner
git add LifeBusinessPlanner2026.html tests/reuniones_outlook.test.mjs
git commit -m "Mezclar las reuniones de Outlook y seguir sus cambios"
```

---

### Task 6: Engancharla, avisar los cambios y publicar

**Files:**
- Modify: `/Users/josechain/lbplanner/LifeBusinessPlanner2026.html`
- Modify: `/Users/josechain/lbplanner/tests/reuniones_outlook.test.mjs`

**Interfaces:**
- Consumes: `_mezclarOutlook` (Tarea 5), `GET /meeting-proposals` (Tarea 4), `_fireNotification`, `_avisarReunionesNuevas` (parte C).
- Produces:
  - `window._outlookPull(setDataFn)` — pide `/meeting-proposals?key=<syncKey>`, mezcla, y devuelve los `cambios`. Modelado sobre `window._gcalPull` (línea 357).
  - `_avisarCambiosReunion(cambios, ahoraMs) -> number` — avisa en el momento los cambios de reuniones de **hoy o mañana**, con marca en `localStorage` (`lbp_cambios_avisados`) para no repetir, igual que `_avisarReunionesNuevas`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```javascript
test('avisa una cancelada de hoy')
test('no avisa una cancelada de la semana que viene')   // el chip ya lo muestra; un push es ruido (anti objetivo)
test('no repite el aviso del mismo cambio')
test('limpia de la marca los cambios de reuniones que ya no existen')
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/reuniones_outlook.test.mjs`
Expected: FAIL — `_avisarCambiosReunion` no existe

- [ ] **Step 3: Escribir `_avisarCambiosReunion` y `window._outlookPull`**

- [ ] **Step 4: Engancharla al ciclo de la app**

En el `useEffect` del intervalo de Google (línea ~20095), agregar un intervalo propio de **una hora** y una llamada al montar. A diferencia de `_gcalPull`, esta **sí** corre al abrir: no necesita token de Google ni dispara ninguna pantalla de login.

- [ ] **Step 5: Subir la versión**

`window.LBP_VERSION = '5.69'` (línea 25).

- [ ] **Step 6: Correr la suite entera y verificar la sintaxis**

Run: `node --test tests/*.test.mjs` y extraer el JS del HTML + `node --check`
Expected: todo en verde

- [ ] **Step 7: Commit y publicar**

```bash
git add LifeBusinessPlanner2026.html tests/reuniones_outlook.test.mjs
git commit -m "v5.69 - las reuniones de Outlook entran solas y siguen sus cambios"
git push
```

- [ ] **Step 8: Verificar en el sitio publicado**

En el sitio real, en celular (375 px) y computadora (1200 px), con el service worker desregistrado y las cachés borradas:
Expected: la **Reunión Mensual Bolivia del 2-dic 16:00** aparece con chip «Propuesta», cliente Chillibeans y alarma a las 15:00. Y la **Reunión Internacional Franquiciados Diciembre del 10-dic 15:00** igual, con su alarma a las 14:00.
