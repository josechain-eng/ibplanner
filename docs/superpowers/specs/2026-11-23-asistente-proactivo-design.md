# Asistente proactivo de LB Planner — diseño

23-nov-2026. Fase 1 del enfoque híbrido (ver **Enfoques**).

---

## Lo que se quiere y por qué

Pepe tiene hoy seis corrientes que le hablan de lo suyo: el briefing de las 8,
las tareas propuestas del correo, la ventana de Alertas, el aviso de Telegram de
las esperas, el tablero de tiendas y las alarmas. Su veredicto, textual:

- El briefing **«me ayuda más que todo por el tipo de cambio del día»** — es
  decir, la parte cara (el análisis con el modelo) no está ganándose el lugar.
- Las tareas propuestas del correo **«sí ayudan, bastante»**, porque agarran
  correos que no vio, se le olvidaron o le dio pereza convertir en tarea.
- La ventana de Alertas **se puede reemplazar**: «es algo similar, pero que
  utiliza más criterio, lógica, es más amplio» y, al leer también el correo,
  «tiene un mejor sentido de qué puede ser más urgente y/o importante y no
  simplemente hacer un listado de 30 tareas pendientes que lo más probable es no
  mire tampoco por ser muy largo».
- El aviso de Telegram de las esperas **«no ayuda mucho, podría ser
  suplantado»**.
- El tablero de tiendas **se queda**.

Entonces esto **no es un asistente más**: es uno que se come tres cosas —la
ventana de Alertas, el aviso de las esperas y el rol de análisis del briefing— y
deja en pie lo que gana: el tipo de cambio (una línea) y las propuestas del
correo.

El requisito central no es el formato, es la **selección**. La diferencia con
Alertas no es que sea más lindo: es que **se calla cuando no tiene nada que
valga la pena**, y que cuando habla eligió. Leer el correo es lo que se lo
permite: «vencida hace tres días» no dice nada por sí sola; «vencida hace tres
días *y* el cliente escribió ayer preguntando» sí.

---

## Objetivos

1. **Que no se le olvide lo pendiente**, sin convertirse en una lista que no mira.
2. **Que le facilite el trabajo**: cada cosa que diga trae el por qué y, cuando
   corresponde, qué hacer al respecto.
3. **Una sola superficie.** Lo que el asistente tiene que decir vive en un solo
   lugar de la app, no repartido en tres tarjetas.
4. **Habla a horario, con derecho a callarse**, y se saltea el horario solo para
   lo que no puede esperar. Decisión suya, 23-nov.
5. **Reemplazar, no sumar.** Al terminar la fase 1 hay menos cosas hablándole
   que antes, no más.

## No objetivos (fase 1)

- **No ejecuta acciones.** Propone; el botón que le pasa el trabajo a una sesión
  de Claude Code es la fase 2, y se diseña cuando se vea con qué ítems quiere
  ayuda de verdad.
- **No lee el RMS** ni toca el tablero de tiendas, que se queda como está.
- **No elige el momento solo.** Dos horarios fijos más las líneas duras. Nada de
  mirar su calendario para adivinar cuándo está disponible.
- **No reemplaza la tarjeta de tareas propuestas del correo**, que funciona.
- **No toca Fogo**, que va aparte de las tiendas por regla.

## Anti-objetivos (esto lo vuelve un fracaso aunque funcione)

- Que hable todos los días por obligación.
- Que muestre una lista de 20 o 30 cosas.
- Que afirme algo que no puede respaldar con una fecha, un número o el nombre de
  quien escribió. Inventar es peor que callarse.
- Que diga lo mismo que ya dice la tarjeta de tareas propuestas.
- Que mande un push un sábado por algo que puede esperar al lunes.
- Que, cuando el modelo o la nube fallen, la app se quede sin nada que mostrar.

---

## Restricciones

- **`worker.js` es ASCII puro.** El español se escribe sin tildes ni ñ. Un
  copy-paste al editor de Cloudflare corrompe los no-ASCII (ya pasó con los
  emojis del clima).
- **`wrangler.toml` debe conservar `crons = ["* * * * *"]`** y no declarar
  `[vars]`: un deploy reemplaza el conjunto de vars y borra las del dashboard.
  Todo lo sensible va como **secret**.
- **Jamás imprimir ni escribir una sync key** ni ningún valor de secreto en
  código, pruebas, comentarios, logs o reportes.
- **El cron nunca llama `KV.list()`.** 1.440 disparos/día contra un límite de
  1.000 list/día. Se usa `synckeys_registry`.
- **Nada de `toISOString()` para una fecha `YYYY-MM-DD`.** Bolivia es UTC-4 todo
  el año; ya existen `_hoyBolivia()` y `_ultHabilBolivia()`.
- **Un tick del cron no puede hacer dos cosas pesadas.** Está documentado dos
  veces en este repo: el briefing moría cuando compartía invocación con el
  refresco del tipo de cambio. El asistente corre en su propia ventana de
  minutos, lejos del refresco del TC (`mm < 5` y `mm 30-35` de cada hora) y del
  briefing (12:03-12:05 UTC).
- **El worker no puede leer Outlook ni el RMS.** El correo le llega sólo por lo
  que el puente ya publicó: `BRIEFING_SERVICE` →
  `GET /ventura-emails?key=BRIEFING_KEY` → KV `ingest_ventura`. El puente corre
  en la Mac, con Outlook abierto.
- **El worker no manda Telegram.** El canal del asistente es el Web Push que ya
  funciona (VAPID, `sendPush`).
- El HTML usa React compilado (`React.createElement`, sin JSX) y en código de
  producción sólo `var`/`function`. Las pruebas son `.mjs` y pueden usar JS
  moderno.
- Las pruebas se corren con `node --test "tests/*.test.mjs"` **con las comillas**.
- `node --check` sobre el JS extraído después de cada parche.

---

## Enfoques considerados

**A. Todo dentro del Worker `life-planner`.** Una pasada nueva en el cron que
junta contexto, hace una llamada al modelo, guarda el resultado en KV y manda
push sólo si pasa la vara. Barato (una llamada por corrida), corre con la Mac
apagada, vive donde ya están los datos y el push. No puede actuar ni salir a
buscar un dato que le falte.

**B. Una sesión de Claude Code agendada dos veces al día.** El máximo de
criterio y la única que ejecuta de verdad: lee correo, RMS, archivos, y además
de avisar hace. Cuesta bastante más por corrida, necesita la Mac prendida para
el RMS y Outlook, y dos horarios fijos no atrapan el «cruzó la línea» del martes
a las 11. Es, además, la forma del aviso de Telegram que él ya dijo que no le
sirve.

**C. Híbrido (elegido).** La parte continua y barata la hace el Worker, igual
que en A. Cada ítem puede llevar después un botón que convierte ese ítem en un
encargo para una sesión de Claude Code. Barato donde tiene que ser continuo,
potente donde tiene que pensar, y la ayuda con la acción aparece cuando él la
pide — que es como ya funcionan el tilde/cruz y la tarjeta de confirmación de
campañas.

**Descartado: la IA del chat de la app (`/chat`).** Requiere que él entre y
pregunte, y el punto de esto es que hable sin que lo busquen.

**Elegido C, y su fase 1 es exactamente A.** Si se decide parar después de la
fase 1, queda algo entero funcionando, no la mitad de algo. El botón de la fase
2 no se diseña todavía.

---

## Cómo funciona

### Las dos pasadas y el chequeo horario

Tres momentos, todos dentro de `scheduledHandler`:

| Cuándo | UTC | Bolivia | Qué hace | Cuesta |
|---|---|---|---|---|
| Pasada de la mañana | 12:20-12:22 | 8:20 | contexto + modelo + push condicional | 1 llamada |
| Pasada de la tarde | 22:10-22:12 | 18:10 | igual | 1 llamada |
| Chequeo de líneas duras | `mm = 15` de cada hora | — | sin modelo, sólo dos reglas | gratis |

Las ventanas son de 2 minutos porque Cloudflare pierde ~20% de los disparos del
cron sin dejar rastro; una marca por pasada y por día evita que dos disparos de
la misma ventana corran dos veces.

La mañana va a las 8:20 y no a las 8:00 por dos razones: el tick de 12:00
refresca el tipo de cambio y el de 12:03 genera el briefing, y la lección
documentada de este repo es que juntar dos cosas pesadas en una invocación mata
la segunda.

### El chequeo de líneas duras (sin modelo)

Sólo dos reglas, y a propósito sólo dos:

1. Un despacho cuyo **límite en aduana es hoy o mañana** (`_impDiasLimite <= 1`).
2. Un ítem que **la última pasada marcó `ya`** y que sigue abierto.

Cualquier regla más es invención.

**Sólo entre las 7:00 y las 21:00 de Bolivia.** Corre en `mm = 15` de cada hora,
pero fuera de esa franja no habla: sin la franja, un `ya` de la pasada de las
18:10 pierde su marca a medianoche y la regla 2 lo manda de nuevo a las 00:15.

El dedup de la regla 2 es **por ítem y por pasada**, no por día: por día, un
`ya` sin entidad detrás vuelve a sonar todas las mañanas para siempre. Marca:
`asis_dicho:<itemId>:<fecha>:<pasada>`.

### Lo que ve el modelo

Cuatro entradas, todas existentes:

1. **El blob de la app** (`data:<syncKey>`): tareas, proyectos, reuniones,
   clientes, despachos. De ahí sale el detector barato — las mismas señales que
   hoy calcula `_lbpAlertas`, pero computadas en el worker.
2. **El correo** de los últimos 7 días por `BRIEFING_SERVICE`, tope **25 hilos**
   y **sólo el mensaje más nuevo de cada uno, recortado a 400 caracteres**. Es el
   mismo camino que usa `/task-proposals`, pero no el mismo cuerpo: ése manda
   todos los mensajes del hilo a 1.200 caracteres y por eso parte en tandas de 10
   (una sola llamada grande a este worker ya dio un 524, está escrito en
   `worker.js:798`). Acá importa la recencia y la urgencia, no la cobertura, así
   que 25 hilos recortados entran en **una** llamada.
3. **Las esperas** (ver abajo).
4. **El tipo de cambio** de `dailyinfo_v2`, que viaja como la primera línea y no
   pasa por el modelo.
5. **Lo que Pepe ya decidió**, como lista de exclusión: `data.tareasDecididas`
   del blob (decisiones por `hiloId`, `ok` / `no` / `revocada`). El asistente
   **no puede hablar de un hilo ya decidido**. Sin esto levantaría correos que él
   descartó a mano, que es peor que repetirse: es desoír.

**Si el blob de la app viene viejo** —`_cloudSaveTime` de hace más de 18 h— el
asistente **no llama al modelo y no manda push**. Escribe una entrada que dice
«los datos de la app son del <fecha>; abrí la app para sincronizar» y nada más.
En este repo el blob estuvo congelado seis días sin que nadie lo notara (v5.06,
`sendBeacon` de 64 KB contra un blob de 4 MB); con datos de hace tres días el
asistente afirmaría «vencida hace tres días» sobre tareas ya cerradas, que es
justo el anti-objetivo de afirmar lo que no se puede respaldar — y sería en la
primera semana, con el briefing ya apagado y sin con qué comparar.

**Si el correo no se puede leer o viene viejo** (el `ts` del puente con más de
36 h), el asistente se marca `cegado: true` y lo dice en una línea: «sin correo
de hoy — abrí Outlook». Él ya sabe que ese día va a ser más tonto; lo que no
puede pasar es que no se note.

### Lo que devuelve el modelo: JSON, no prosa

El briefing actual tiene ~150 líneas de cirugía con expresiones regulares sobre
el texto del modelo —quitar encabezados, rescatar secciones que a veces aparecen
y a veces no, rearmar las vencidas a mano porque el modelo las reformulaba— y
esa es exactamente la evidencia de que pedir prosa con formato no funciona.

El asistente pide **sólo JSON**:

```
{ "items": [ { "id": "<estable>", "urgencia": "ya|hoy|puede_esperar",
               "titulo": "<una linea>", "porque": "<una linea con el dato>",
               "accion": "<que hacer, una linea o vacio>",
               "ruta": "tasks|projects|meetings|clients|imports",
               "refId": "<id de la entidad, si hay>" } ] }
```

`porque` es el campo que justifica todo el diseño: tiene que nombrar la fecha,
el número o quién escribió. Un `porque` vacío o genérico descalifica el ítem.

**Si el JSON no parsea**, no se inventa nada: se guarda la lista del detector
barato sin texto del modelo, marcada `sinModelo: true`. Degrada a lo que la
ventana de Alertas ya hacía.

### La vara del silencio, como número

- Manda push si hay **al menos un `ya`**, o **al menos dos `hoy`**.
- Nunca más de **5 ítems** guardados; nunca más de **3** en el cuerpo del push.
- Si nada pasa la vara: **escribe la entrada en KV y no manda nada**. La ventana
  tiene contenido si él la abre; el teléfono no suena.
- Un sábado o domingo, sólo los `ya` pasan. Existe `_lbpEsDiaHabil` en la app;
  en el worker se resuelve con el día de la semana en hora de Bolivia (los
  feriados no hacen falta para esta regla: un feriado con una fecha de aduana
  encima sigue siendo un `ya`).

### Cómo se cierra un ítem

El ✓ sirve cuando el ítem apunta a una tarea. Pero el ejemplo que justifica todo
el diseño —«vencida hace tres días *y* el cliente escribió ayer»— y todo lo que
venga del correo o de las esperas puede no tener entidad detrás. Para esos no hay
nada que tildar, y la regla dura 2 no tendría forma de saber que el ítem se
cerró.

Cada ítem lleva **«listo»** y **«no me interesa»** en la ventana, y la decisión
va al blob en una lista nueva, `asisDecididos`, con la misma forma que
`tareasDecididas`: `{id, decision: 'listo'|'no', ts}`, dentro de `_SYNC_LISTS`,
**sin lápidas** (`_deletedIds`) y por el mismo motivo ya medido: con lápida, la
decisión siguiente sobre ese id se perdía 30 días. Deshacer escribe
`decision:'revocada'`. Va al blob y no a KV para que la decisión viaje entre el
celular y la Mac.

### Para cuántas sync keys corre

El registro tiene **cuatro** sync keys (verificado el 23-nov). El cron las
recorre todas, así que sin un filtro serían ocho llamadas a Opus 5 por día y
push del asistente a dispositivos que ya no son los de Pepe.

**El asistente corre para UNA sola: la del blob más fresco.** Es exactamente la
lógica que `/briefing` ya usa (`worker.js:1035-1062`), así que se reutiliza, no
se inventa. El push sale sólo a las suscripciones de esa llave.

### Dónde vive y dónde habla

- **KV:** `asis:<syncKey>:<fecha>` con `{ generado, pasada, items, cegado,
  sinModelo, tc }`, TTL 48 h. Las marcas: `asis_mark:<syncKey>:<fecha>:<pasada>`
  y `asis_dicho:<itemId>:<fecha>:<pasada>` (sin sync key: hay un solo
  usuario, y el dedup tiene que ser por PASADA y no por dia, o un `ya` sin
  entidad detras vuelve a sonar todas las mananas para siempre).
- **Endpoint:** `GET /asistente?key=&date=` espejo de `/briefing-ai`. Valida la
  key con `_syncKeyValida` antes de cualquier lectura.
- **Forzado:** `GET /force-asistente?key=&pasada=` para probar sin esperar el
  horario, igual que `/force-smart`. Borra la marca del día y corre.
- **En la app:** la **ventana de Alertas pasa a ser la ventana del asistente**.
  Si hay entrada fresca del asistente para hoy, muestra sus ítems (título, por
  qué, acción, y el ✓ en el lugar cuando el ítem apunta a una tarea). Si no hay
  —sin worker, sin key, entrada vieja o `sinModelo`— cae a `_lbpAlertas`, que no
  se toca. Una sola superficie, con degradación.

### Las tres cosas que reemplaza

1. **El push del briefing de las 8:03 se apaga.** El generador queda en el
   archivo, con su compuerta comentada y el motivo escrito, para poder volver
   atrás con una línea. El tipo de cambio —lo único que él valora de ahí— pasa a
   ser la primera línea del asistente. La tarjeta del briefing en el Home se
   reemplaza por la del asistente.
2. **La ventana de Alertas** deja de ser una lista de todo y pasa a mostrar lo
   que el asistente eligió, con `_lbpAlertas` como red.
3. **El aviso de Telegram de las esperas.** El vigilante
   (`vigilar-respuestas-cj-fourthwall`, 08:05/14:05/20:05, lee Gmail y Chrome
   desde la Mac) **no se reconstruye**: no se puede: el worker no ve Gmail ni
   Chrome. Lo que cambia es su salida: en vez de mandar Telegram, hace
   `POST /asistente/senal` con sus hallazgos, que caen en `asis_senal`
   (TTL 72 h) y entran como tercera entrada del modelo. Así el asistente es el
   único que habla.

   Tres cosas que esto define:
   - **La llave es un secret nuevo, `ASIS_KEY`**, no la sync key y no
     `BRIEFING_KEY`. No la sync key porque la restricción es no escribirla en
     ningún lado, y esa sesión tendría que leerla de alguna parte; no
     `BRIEFING_KEY` porque es el secreto de ingesta del briefing y reusarlo
     ensancha su alcance. La sesión lo lee del Keychain, igual que el puente de
     Ventura lee `briefing-ingest-secret`. La señal no lleva sync key: hay un
     solo usuario y `asis_senal` es una clave única.
   - **El vigilante sí se toca, y entra en la fase 1.** No es un script: es una
     sesión agendada con su `SKILL.md`
     (`~/.claude/scheduled-tasks/vigilar-respuestas-cj-fourthwall/`). Hay que
     editar ese SKILL.md para que, en vez de `avisar_pepe.py`, haga el POST. Si
     queda afuera, el camino de las esperas nace muerto y uno de los tres
     reemplazos no ocurre.
   - **La pasada que usa una señal la marca consumida.** El vigilante sólo avisa
     cuando hay algo nuevo y el TTL es de 72 h: sin consumo explícito, el
     asistente repetiría el mismo hallazgo tres días seguidos.

### Las cuatro notificaciones que se apagan además

En el mismo cron hay **ocho** tipos de push programado. Cuatro dicen lo que va a
decir el asistente, y se apagan en esta misma versión (decisión de Pepe,
23-nov):

| Qué | Cuándo (Bolivia) | Qué dice hoy |
|---|---|---|
| `meeting_followup` | todos los días 9:00 | un push **por cada** reunión de los últimos 14 días sin seguimiento |
| `stale_alarms` | L-V 10:00 | la regla 1b de `_lbpAlertas` |
| `project_health` | lunes 9:45 | la regla 3 de `_lbpAlertas` |
| `client_health` | lunes 9:45 | la regla 4 de `_lbpAlertas` |

La primera es la lista larga que el anti-objetivo prohíbe, repartida en pushes
separados, 40 minutos después de que hable el asistente.

**Se quedan tres a propósito:** `deadlines` (17:00) porque mira hacia adelante
—lo que vence mañana— y no es un recordatorio de algo viejo: es lo único de las
cinco candidatas que da algo que el asistente todavía no da; y `habits` (21:00)
y `weekly` (sábado 11:00), que son de otro tema.

Igual que con el briefing, los generadores quedan en el archivo con la compuerta
comentada y el motivo escrito, para poder volver atrás con una línea. Hay que
revisar qué pruebas existentes dejan de aplicar.

### Costo

Dos llamadas a Opus 5 por día **para una sola sync key** (la del blob más
fresco), de unos 8k tokens de entrada —25 hilos recortados, no 40 completos— y
~700 de salida: del orden de **3 dólares al mes**. Hoy el briefing hace una, así
que el neto es **una llamada más por día**. Los chequeos horarios no llaman al
modelo: son gratis. Las escrituras en KV suben en unas 10 al día, muy lejos del
límite de 1.000.

---

## Qué queda para quien lo construya

- La forma exacta del prompt del sistema y del usuario. El requisito es que pida
  JSON válido y nada más, que prohíba inventar («USA SOLO datos reales, NO
  inventes» es la frase que este repo ya usa en todos los prompts) y que exija
  `porque` con dato verificable.
- El detector del worker: qué señales del blob entran y con qué umbrales. Punto
  de partida natural: las seis reglas de `_lbpAlertas`
  (`LifeBusinessPlanner2026.html:208`), que ya están escritas como datos puros.
- La redacción del cuerpo del push a partir de los ítems.
- El diseño visual de la tarjeta y la ventana, dentro del estilo que ya tiene la
  app.
- Las pruebas. La vara de este proyecto es **probar por mutación**: una prueba
  que no puede fallar no prueba nada, así que cada regla nueva se verifica
  rompiendo el código a propósito en una copia y confirmando que la prueba se
  pone roja. Lo que no se puede dejar sin red: la vara del silencio (que con
  cero `ya` y un solo `hoy` NO manda push), el fin de semana, el JSON que no
  parsea, el tope de 5, la ventana de minutos del cron, y el camino `cegado`.
- Probar el worker en **workerd**, no sólo con Node: las pruebas de Node no ven
  lo que falla dentro del Worker.

**Una trampa heredada que no hay que copiar:** la tarjeta del briefing pide el
día con `new Date().toISOString().slice(0,10)`
(`LifeBusinessPlanner2026.html:5518`), o sea la fecha UTC. Después de las 20:00
de Bolivia eso ya es «mañana». Una tarjeta del asistente copiada de ahí quedaría
vacía todas las noches justo después de la pasada de las 18:10, y caería a
`_lbpAlertas` sin que se entienda por qué. La fecha se arma con hora local,
también del lado del HTML.

---

## Decisiones tomadas en su nombre, con lo que cuestan si están mal

| Decisión | Si me equivoqué |
|---|---|
| Mañana 8:20, no 8:00 | el asistente llega 20 minutos después de que mira el teléfono |
| Apagar el push del briefing en la misma versión | si el asistente decepciona, hay un día sin briefing hasta volver la compuerta |
| JSON en vez de prosa | si el modelo falla seguido, muchos días en `sinModelo` |
| Vara: un `ya` o dos `hoy` | habla menos de lo que él querría, o más |
| Tope de 40 hilos de correo | un correo importante del día 8 queda afuera |
| Dos reglas duras y no más | algo urgente que no es aduana espera a la próxima pasada |
| `_lbpAlertas` no se toca, queda de red | dos detectores que pueden divergir; el de la app sólo se ve cuando el asistente falta |
| Las esperas siguen en la Mac | con la Mac apagada, esa entrada no se actualiza |
| 25 hilos con el mensaje más nuevo a 400 caracteres | un pedido que está en la respuesta larga y no en el último mensaje se pierde |
| Blob de más de 18 h: no llama al modelo ni manda push | un día con la app sin abrir, el asistente no habla aunque tuviera algo |
| Chequeo duro sólo 7:00-21:00 | una fecha de aduana que se cruza a las 22:00 espera a la mañana |
| «listo / no me interesa» en el blob, no en KV | una lista más en `_SYNC_LISTS`, que es superficie de sincronización |
| Corre sólo para la sync key del blob más fresco | si usa un equipo que no sincronizó, el asistente mira los datos del otro |
| Secret nuevo `ASIS_KEY` para la señal | un secreto más que configurar a mano |
| Editar el SKILL.md del vigilante entra en la fase 1 | la fase 1 se hace un poco más larga |
| Se apagan 4 de las 8 notificaciones del cron, y `deadlines` se queda | si el asistente no cubre bien el seguimiento de reuniones, se pierde ese aviso hasta volver la compuerta |
