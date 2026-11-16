# Las tareas de la semana salen del correo (propuestas con tilde o cruz)

16-nov-2026 · diseño · LB Planner

## Por qué

Pepe recibe los pedidos de trabajo por correo y los convierte en tareas a mano,
cuando se acuerda. Medido en sus datos del 16-nov: **138 tareas, 19 abiertas y
119 cerradas**, con títulos cortos y en su taquigrafía («Ver Pago Royalty Fogo»,
«Contestar Sergio AX Proveedores Posibles», «Seguimiento La Paz»). Mientras
tanto su bandeja tiene **106 hilos de los últimos 17 días** (31-oct al 16-nov)
ya ingeridos que nadie convierte en nada.

Lo que se pierde no es el correo: es el pedido que venía adentro y que no quedó
anotado en ningún lado.

## Lo que ya existe y no hay que volver a construir

- **El extractor.** `GET /email-actions` ya lee esos mismos correos y le pide a
  Claude acciones, acuerdos y pendientes **por franquicia**. En producción para
  el informe de actividades.
- **La tarjeta de confirmación.** El módulo de Campañas ya tiene una ventana de
  propuestas donde nada se escribe sin un click (`CampanasCorreo`, HTML:19266).
- **La cadena del correo.** Outlook → puente → KV → worker, corriendo sola.

## Alcance

**Objetivo:** que cada mañana Pepe vea **las tareas propuestas de la semana**
sacadas de sus correos de los últimos ~10 días; que acepte con tilde o descarte
con cruz; y que lo aceptado entre como tarea del **próximo día hábil** con una
alarma a las 9:40, +5 minutos por cada tarea siguiente de ese día.

**No objetivos:**
- **No se toca el informe de actividades.** Su instrucción dice textualmente
  «redactado para un informe ejecutivo al dueño»: descriptivo, por franquicia,
  qué pasó. Una lista de trabajo es lo contrario. Mezclarlas empeora las dos.
- No se contesta ningún correo ni se escribe nada hacia afuera.

**Anti objetivo:** que la ventana se vuelva un trámite. Si cada mañana propone
cuarenta «responder a fulano», Pepe deja de abrirla. Vale más corta y certera
que completa.

## Restricciones medidas

- **Hoy se guardan ~290 caracteres por correo** (`SNIPPET_CHARS = 320`). Y hay
  un desajuste: `/email-actions` ya le pasa al modelo `slice(0, 1200)`, o sea
  que la app pide 1.200 y recibe 290.
- **El puente colapsa los hilos antes de publicar** (`collapse_threads`,
  `ventura_bridge.py:521`): agrupa por asunto normalizado y **conserva solo el
  mensaje más nuevo**. Si el pedido llegó el lunes y el jueves alguien contestó
  «gracias», el cuerpo del lunes no se publica y subir el tope no lo rescata.
  Los «106» son hilos, no mensajes.
- **La marca de «ya respondido» no sirve**: 105 de 106 figuran sin responder
  (`sent_subjects()` recorre 400 mensajes al azar; bug documentado).
- **El texto que escribe el modelo cambia entre corridas.** Ya pasó con los
  nombres de las campañas. Ninguna memoria puede colgar de ese texto.
- **La alarma por defecto trae recordatorios a los +5 y +10** si no se cierra.
  Con la escalera de 5 minutos, ocho tareas serían hasta 24 avisos en 45 min.
- **Una sola llamada grande al modelo da 524 a los 2:06** en este worker; por
  eso `/campaign-actions` parte en tandas de 10 (`worker.js:729`).
- **El puente ingiere la bandeja una vez por día** (`should_run_now()` corta si
  ya corrió hoy), así que el KV no cambia entre aperturas de la app.
- Ninguna de sus 19 tareas abiertas tiene `clientId`.
- `worker.js` de life-planner es **ASCII puro**; el del briefing va sin acentos.

## Caminos considerados

- **A. Un modo nuevo en el extractor que ya existe + una tarjeta como la de
  Campañas. ← elegido.** La cadena está probada en producción. Lo nuevo de
  verdad es la memoria de decisiones y la escalera de alarmas.
- **B. Un extractor nuevo, aparte.** Duplica lo caro que ya está resuelto.
- **C. Dentro del informe de actividades.** Arruina el informe para el dueño y
  la lista para Pepe.

## Qué se hace

1. **El puente deja de perder el pedido.** Dos cambios en `ventura_bridge.py`:
   - `SNIPPET_CHARS` 320 → **1.200** (lo que el consumidor ya pedía).
   - Cada hilo publica además `mensajes`: el cuerpo de **todos** los mensajes
     del hilo, no solo el más nuevo. `collapse_threads` sigue igual para el
     briefing diario, que no lee ese campo — el cambio es aditivo y no puede
     romperlo. **Sin esto, el pedido del lunes es invisible** y el punto no
     cumple lo que promete.
   - El payload crece de forma no medida todavía (los 106 son hilos): hay que
     medirlo al construir y, si hace falta, acotar `mensajes` a los últimos N
     por hilo.
2. **Modo nuevo: `GET /task-proposals?key=<syncKey>&days=10`.** Misma fuente,
   otra pregunta: **qué queda pendiente DE PEPE**, no qué pasó. Una línea por
   pendiente, imperativa, en su taquigrafía — sus 138 tareas van como ejemplos
   de estilo. Por propuesta devuelve: título, `hiloId`, de qué correo salió
   (remitente, asunto, fecha), una **cita textual** que lo justifica, y el
   cliente que el modelo haya creído ver (informativo, ver punto 6).
   - **`hiloId` lo calcula el worker**, no el modelo: es el asunto normalizado
     del hilo, que es la clave con la que el puente agrupa y lo único estable
     cuando llega una respuesta nueva. El worker mapea el índice `[N]` del
     prompt al correo real y emite la clave él mismo.
   - **Se le pasan las tareas que ya existen** (las 19 abiertas y las cerradas
     de 60 días, solo títulos) para que diga «ya está cubierto». Eso es la
     segunda línea de defensa, no la primera: la primera es el punto 4.
   - En tandas, como `/campaign-actions`, para no comerse el 524.
3. **La corrida del día se cachea.** El resultado se guarda en KV con la fecha;
   mientras el puente no vuelva a ingerir (una vez al día), todas las aperturas
   y todos los equipos ven **la misma lista con los mismos `hiloId`**. Un botón
   «volver a leer» fuerza una corrida nueva. Sin esto, la tarjeta en el Home
   dispara una llamada al modelo sobre ~100 correos **en cada apertura y en cada
   equipo**.
4. **Tres estados por fila, no dos.** Cada fila tiene **✓ y ✗** como botones
   propios, y la fila que Pepe no toca **queda pendiente para mañana**:
   - **✓** crea la tarea y graba la decisión.
   - **✗** graba la decisión y no vuelve nunca.
   - **sin tocar** no graba nada.
   Esto **no** copia el patrón de Campañas (checkbox + un botón Guardar), a
   propósito: ahí lo destildado significa «no esta vez». Acá significaría
   «nunca más», y el primer día —que va a ser largo— un Guardar mataría treinta
   propuestas que todavía no leyó. Una pantalla chica lista lo descartado y
   permite deshacer.
5. **La memoria cuelga del hilo, no del texto.** Lista propia
   `tareasDecididas` con la forma `{ id: <hiloId>, decision: 'ok'|'no', ts }`
   en `_SYNC_LISTS` — **lista de objetos con `id`**, porque el merge filtra por
   `id` y una lista de textos sueltos se borraría entera.
   - Se graban **las dos** decisiones, no solo la cruz. Que lo aceptado no
     vuelva mañana no puede depender de que el modelo reconozca el título: eso
     es el mismo juicio sobre texto del que esta misma sección desconfía.
   - **Filtra la app, no el worker.** El worker tendría que bajar el blob de
     4,6 MB para saberlo, que es justo el costo que el punto 3 evita; y la app
     tiene el estado bueno aunque el celular venga atrasado.
   - **Consecuencia que Pepe tiene que conocer:** la cruz silencia **el hilo**,
     no esa redacción. Si ese mismo hilo después trae un pedido distinto, no se
     va a proponer. Es lo que él pidió («no vuelven a aparecer») llevado a algo
     estable; si molesta, se revisa.
6. **Lo confirmado entra como tarea** con la forma que la app ya usa
   (`title, description, status: 'INBOX', priority, dueDate, clientId,
   category: 'Work', tags, alarm, id, createdAt`), más:
   - **`dueDate` = el próximo día hábil, siempre.** Es lo que Pepe pidió
     («ponela para el día siguiente»). Si el correo menciona una fecha límite,
     va **en la descripción**, no en `dueDate`: inventar un vencimiento distinto
     del que él pidió es peor que no tener ninguno. El «próximo día hábil»
     saltea sábados, domingos **y feriados de Bolivia**, que la app ya conoce
     (`window._LBP_EVENTS`).
   - **`clientId` lo resuelve el dominio del remitente**, con la regla de las
     reuniones (`_clienteDeOrganizador`): el correo gratuito no identifica
     marca y un dominio ambiguo no resuelve. El nombre de cliente que devuelva
     el modelo es **solo informativo** y nunca decide: el match por nombre ya
     archivó mal (`ax-logistica.com` → AX) y `clientId` es un hecho de registro
     que alimenta la ficha de la marca, la Vista 360° y el informe al dueño.
     Mejor vacío que en la marca equivocada.
   - La cita y el correo de origen van en `description`.
7. **La escalera de alarmas.** La primera tarea confirmada para esa fecha suena
   a las **9:40**; cada siguiente, +5 minutos. **Sin escalada**: una alarma, un
   toque (`repeatIntervals: null`, `repeatCount: 0`).
   - El lugar en la escalera se cuenta sobre **las alarmas que ya existen para
     esa fecha**, no sobre la tanda. Si confirma dos veces en el día, o una
     tanda en la Mac y otra en el celular, dos tareas no pueden sonar juntas a
     las 9:40.

## Decisiones mías, para que las revise

- **Subir 320 → 1.200 y publicar los mensajes del hilo.** Sin lo segundo, lo
  primero no alcanza.
- **No tocar el informe de actividades.**
- **La memoria cuelga del hilo**, y se graban las dos decisiones.
- **La cruz silencia el hilo entero** (consecuencia explícita arriba).
- **Tres estados, con ✓ y ✗ propios**: lo no tocado sobrevive al día.
- **Cachear la corrida del día**, con botón de releer.
- **`dueDate` siempre el próximo día hábil**, feriados incluidos; la fecha que
  diga el correo va en la descripción.
- **El dominio manda para el cliente**; el modelo no decide.
- **Sin escalada en estas alarmas**, y la escalera cuenta sobre lo ya puesto.

## Lo que queda a criterio de quien lo construya

- La redacción exacta de la instrucción al modelo y el tamaño de las tandas.
- Cuántos mensajes por hilo se publican si el payload se va de las manos.
- El orden de las filas y dónde cae la tarjeta dentro del resumen del día.

## Cómo se prueba que quedó bien

- `node --test tests/*.test.mjs` en verde, con pruebas nuevas de: una propuesta
  descartada no vuelve; una **aceptada** tampoco; una fila sin tocar sí vuelve;
  la escalera da 9:40 / 9:45 / 9:50 contando sobre las alarmas que ya existen
  ese día; ninguna de esas alarmas lleva recordatorios; un viernes cae en lunes
  y un 24-dic cae en el 26; un dominio ambiguo deja `clientId` vacío.
- Pruebas del puente en verde con el tope nuevo y con los mensajes del hilo, y
  una que compruebe que el briefing diario no cambia.
- En el sitio publicado, en celular y computadora: la ventana con sus filas,
  una ✓ y una ✗, las dos tareas creadas con alarmas a las 9:40 y 9:45 del
  próximo día hábil, y la descartada ausente al volver a abrir.
