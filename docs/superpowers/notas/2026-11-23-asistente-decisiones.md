# Asistente proactivo (fase 1) — decisiones y residuos

Rama `asistente-proactivo`, 23-nov-2026. Siete tareas, 15 commits, la suite de
pruebas de 440 a 592. Acá está todo lo que decidí yo durante la ejecución y todo
lo que quedó sin hacer a propósito. Nada de esto está en el código: si algo acá
está mal, es acá donde se ve.

Plan: `docs/superpowers/plans/2026-11-23-asistente-proactivo.md`
Diseño aprobado: `docs/superpowers/specs/2026-11-23-asistente-proactivo-design.md`

---

## Lo que de verdad cambió para Pepe

- A las **8:20** y a las **18:10** (hora de Bolivia) el asistente mira tareas,
  proyectos, despachos, el correo de los últimos 7 días y las señales del
  vigilante de esperas, y le habla **sólo si pasa la vara**: al menos un ítem
  «ya», o dos «hoy». Nunca más de 5 guardados, nunca más de 3 en el push. Sábado
  y domingo, sólo los «ya».
- Cada hora, entre las 7 y las 21, un chequeo **sin modelo** (gratis) para dos
  cosas que no esperan: aduana a un día o menos, y un ítem que la pasada anterior
  marcó «ya» y sigue abierto.
- La **ventana de Alertas pasó a ser la del asistente**, con `_lbpAlertas`
  intacto debajo como red. Tres estados: con ítems, «al día», y sin entrada de
  hoy (ahí sí cae a la lista vieja).
- **El push del briefing de las 8:03 se apagó.** El tipo de cambio —lo único que
  Pepe valoraba de ahí— es la primera línea del asistente.

## Las 15 decisiones que tomé en su nombre

Cada una con por qué y qué pasa si me equivoqué.

**1. La siembra del tipo de cambio en el KV falso va al futuro lejano, no al
reloj fijo.** Mi instrucción original estaba mal: la prueba arma el KV *antes* de
fijar el reloj, así que sembrar `Date.now()` dejaba la entrada vieja y el cron
salía de verdad a internet (medido: 1.929 ms contra 2,6). *Si me equivoqué:* una
prueba que quiera ver el refresco del TC tiene que sembrar su propia entrada.

**2. `anthropicFalso` registra las URLs prohibidas, no alcanza con que lance.**
El `try/catch` del propio worker se traga el `AssertionError`. *Si me equivoqué:*
una afirmación de más en dos tareas.

**3. El detector asigna `urgencia` a TODOS los ítems, también en el camino sin
modelo.** Sin esto, el día que el modelo falla los ítems salen sin urgencia, la
vara no puede pasar nunca y el asistente queda mudo justo ese día.

**4. La regla «alarma de hoy sin completar» es `hoy`, no `puede_esperar`.** Mi
decisión 3 definió los umbrales sólo en días de aduana, así que ninguna otra
regla podía sonar: el camino sin modelo era «una alarma de aduana con cinco
adornos». Y esa alarma es literalmente la queja con la que arrancó todo esto.

**5. Las tres funciones de la vara son autocontenidas y la prueba las extrae del
FUENTE del worker.** La alternativa era agregarle exports al archivo de
producción para comodidad de las pruebas; ese worker a veces se despliega
pegándolo en el editor de Cloudflare.

**6. La aritmética de días hasta aduana va INLINE en el worker**, espejando
`_impDiasLimite` del HTML. Duplicación deliberada: el diseño aceptó dos
detectores. Misma situación que `_tpHiloId` contra `normalize_subject`.

**7. La pasada NO usa `_syncKeyValida`.** Llama `KV.list()`, y el cron jamás
puede hacerlo (1.440 disparos/día contra 1.000 list/día). Además no hay key que
validar: la pasada elige la llave ella misma. **En los endpoints sí se usa**,
que son camino de request.

**8. El push del asistente se registra en `push_log`.** El briefing tiene ese
registro porque en septiembre los push dejaron de llegar y no había forma de
distinguir un envío fallido de uno entregado. El asistente lo reemplaza.

**9. El SKILL.md del vigilante de esperas NO se tocó en la rama.** Reescribirlo
antes de que el endpoint exista en producción deja una ventana en la que postea
al vacío y Pepe se queda sin aviso por ningún canal. Va con el deploy.

**10. Se aceptó extraer `_asisEnviarPush` y `_asisBlobMasNuevo`** de código ya
revisado, para no agregar una TERCERA copia del bloque enviar+registrar+podar.
Extraer es mejor que copiar, y deja una sola regla de selección de llave.

**11. `sinModelo` NO vuelve falsa la frescura de la entrada.** El diseño decía
que cayera a `_lbpAlertas`; esa frase se escribió antes de que la pasada
existiera en esta forma. Hoy los ítems de un día sin modelo vienen del detector
CON urgencia y CON las exclusiones aplicadas, mientras `_lbpAlertas` son las seis
reglas crudas: caer ahí mostraría más y peor.

**12. La tarjeta del Home titula según el origen de lo que pinta.** Acá ganó el
diseño sobre el plan, por la vía barata: cambia el título, no el renderizador.

**13. Tres estados, no dos: «sin entrada de hoy» y «entrada de hoy, nada
pendiente» son distintos.** Mi definición original tenía dos, así que tildar el
último ítem tiraba la ventana a la lista vieja — justo cuando Pepe acababa de
limpiarla.

**14. El bug del `now` indefinido NO se arregla.** `sendSmartNotif` usa `now`
sin declararlo (verificado: cero declaraciones, ocho usos), así que
`meeting_followup`, `stale_alarms`, `project_health` y `client_health` venían
lanzando un `ReferenceError` tragado y **nunca enviaron nada**. Es código que
ahora quedó oscuro; arreglarlo reviviría lo que Pepe eligió apagar. **Lo que sí
se hizo: el comentario de esas cuatro compuertas dice que restaurarlas exige
arreglar el `now` primero.** La del briefing sí se restaura con una línea.

**15. Una aduana VENCIDA avisa una vez por pasada** hasta que se reciba o se
decida. Una multa cuesta plata y la válvula de escape existe (el «listo / no me
interesa» lo calla).

## Lo que encontraron las revisiones, y vale recordar

- **Tres pruebas que no podían fallar**, cada una atrapada en revisión: el
  guardia de red (borrándolo la prueba seguía verde, porque lo que fallaba era
  la cola vacía); el filtro de tareas completadas de la regla «alarma de hoy»
  (la prueba usaba una alarma de 23 días, así que sólo ejercitaba la otra regla);
  y el guardia de zona horaria, **inerte en la Mac de Pepe** porque su Mac ya
  está en hora de Bolivia — bajo UTC, que es donde corre el Worker, fallaba.
- **El reloj fijo no alcanzaba:** `conReloj` reemplazaba `Date.now`, pero
  `new Date()` sin argumentos no pasa por ahí. Hay diez de esos en el worker.
- **Cuatro horas de corrimiento:** la app guarda `alarm.datetime` sin zona y el
  navegador la lee en hora local; el Worker corre en UTC. Sin la corrección,
  TODAS las alarmas del asistente salían corridas cuatro horas.
- **El saneador de la salida del modelo no tenía ni una prueba hostil:** se
  podían borrar cuatro de sus defensas sin que nada se quejara, y una ruta
  arbitraria del modelo llegaba a la navegación de la app.
- **La pasada de la tarde borraba la lista de la mañana** si el blob pasaba de
  18 h: escribía una entrada vacía sobre la misma clave sin leer antes.
- **El camino sin modelo ignoraba las decisiones de Pepe**, así que un ítem que
  él había descartado reaparecía y podía sonar.
- **La forma de carga que documentaba el plan era incompatible con el lector**:
  los objetos `{que, detalle, desde}` habrían llegado al modelo como
  `[object Object]`, con la señal viéndose sana y aportando nada.
- **Capacidad nueva del repo:** las pruebas del HTML eran todas estructurales
  (regex sobre el fuente). Ahora hay un arnés que **renderiza** un bloque de JSX
  con un `React.createElement` falso y recorre el árbol, así que el cableado se
  prueba por comportamiento. Se usó para el tilde, los botones de decisión y el
  subtítulo.

## Lo que encontro la revision final de rama (y no una lectura del codigo)

El revisor de rama no leyo el diff y opino: **simulo un dia entero**, corriendo el
cron minuto por minuto y desencriptando cada push. Asi aparecieron las dos cosas
que siete revisiones de tarea no podian ver, porque las dos viven en la costura
entre dos tareas.

**CRITICO — el dia de datos viejos el asistente mentia con seguridad.** Con el
blob de la nube de mas de 18 h la pasada hacia lo correcto (no llamar al modelo),
pero el aviso de «DATOS VIEJOS» quedaba SOLO dentro del texto de `summary`, sin
bandera en la entrada. Resultado en pantalla: «Asistente — al dia» y «ya
decidiste todo lo de hoy» — habiendo decidido nada. Y peor: en ese estado
suprimia `_lbpAlertas`, que corre sobre el blob LOCAL, que esta fresco. Eran las
dos mitades de la falla imperdonable a la vez. Causa: mi decision 13 escribio la
regla demasiado ancha. **Arreglado:** la entrada lleva `datosViejos`, esa entrada
ya no gobierna la superficie, y la red local toma el lugar. La razon de que eso
sea lo correcto y no una perdida: si el blob de la nube esta viejo es porque el
equipo con los datos frescos no los subio, asi que la vista local es la mas
confiable. Ningun `ya` se pierde: siguen en KV y la regla dura los lee sin mirar
la bandera (verificado en el codigo, `worker.js:2737-2742`).

**Cuatro push por dia para un solo despacho**, dos de ellos a cinco minutos. La
pasada y el chequeo horario implementaban cada uno «avisar una vez por pasada»
sin compartir la marca, y la compuerta horaria caia cinco minutos ANTES de cada
pasada. **Arreglado:** la pasada marca lo que empujo y la compuerta se movio al
minuto 40. Bajo de 4 a 3; el par de cinco minutos desaparecio.

**Y un defecto de plan que vale mas que los dos:** el tipo de cambio dejaba de
llegar por push. Es lo UNICO que Pepe dijo que valoraba del briefing. Ahora se
antepone a todos los avisos del asistente — pero el asistente solo habla cuando
pasa la vara, asi que **ya no hay un aviso diario del TC**. Decision abierta: si
Pepe lo quiere de vuelta como push propio, es agregarlo; conviene decidirlo
despues de una semana de uso.

## Residuos conocidos, todos adjudicados

- **Dos push a 40 minutos** si algo cruza la linea dura entre las 7:00 y las
  8:20 (el chequeo de 7:40 y la pasada de 8:20). No se llevo a cero porque la
  alternativa —que la vara ignore lo ya avisado— deja muda a la pasada en un dia
  cuyo unico urgente se flageo temprano, y ahi se pierde la lista curada entera.
  **Revisar tras una semana de uso real.**
- **La llave elegida se cachea sin comparar frescura:** si la llave guardada deja
  de sincronizar y otra empieza, el chequeo horario sigue con la guardada hasta
  que la proxima pasada la reescriba (maximo 12 h). Nunca da una respuesta
  equivocada con seguridad: o el blob sigue dentro de la ventana de 18 h, o el
  guardia de 18 h calla al chequeo.
- **La poda de `asisDecididos` es «mejor esfuerzo» por equipo:** la lista esta en
  `_SYNC_LISTS`, que une por id, asi que un equipo con una decision de 181 dias
  puede re-agregar lo que otro acaba de podar. Es identico a `tareasDecididas`,
  cuyo patron se reuso a proposito.
- **La poda de suscripciones muertas puede revivir una** si fallan dos equipos en
  la misma pasada, y ~20 lineas de enviar+registrar+podar existen en dos lugares.
  Van juntas: el helper compartido arregla la poda en un solo lugar. **A
  proposito NO se hizo en esta rama:** el helper se extrajo a mitad de ejecucion
  y tocarlo otra vez en la misma ola que el arreglo critico era de mas riesgo que
  valor. Dejar correr una semana y hacerlo como cambio propio.

## Pendientes con fecha

- **Al desplegar:** `npx wrangler secret list --name life-planner` ANTES de
  `npx wrangler deploy` (un deploy reemplaza las vars por las del toml y ya borró
  dos secretos una vez), confirmar que el toml conserva `crons = ["* * * * *"]`,
  y poner el secreto nuevo: `npx wrangler secret put ASIS_KEY` (**lo hace Pepe**).
- **Después del deploy:** `GET /force-asistente?key=&pasada=manana` para probar
  en vivo sin esperar el horario. Es también el único camino que ejercita de
  verdad el `fetch → setAsisEntrada` de la app.
- **Después del deploy:** reescribir el SKILL.md del vigilante de esperas para
  que postee a `/asistente/senal` leyendo `ASIS_KEY` del Keychain, en vez de
  avisar por Telegram.
- **Probar en workerd**, no sólo con Node: las pruebas de Node no ven lo que
  falla dentro del Worker.
- **Ya, y viene de antes de esta rama:** el worker `life-planner` tiene un
  secreto cuyo **nombre** es el **valor** de una API key de OpenAI
  (`sk-proj-…`). Rotar en OpenAI y borrarlo.

---

# Apéndice del 24-nov-2026: el latido (v5.76)

Esto se escribió **después de desplegar la v5.75 y verla funcionar en vivo**, y
corrige un defecto de diseño que el despliegue dejó a la vista.

## Lo que se vio

Forzando la pasada real: `blob de la app del 2026-11-23: sin modelo y sin push`.
Pepe abrió la app dos veces, con recarga dura, y el blob **siguió marcado el día
anterior**. Medido: `_cloudSaveTime` quedó en `23-nov 12:14`.

La causa está en la app y es deliberada: el efecto del store que sube el blob
**se saltea el primer montaje** (si no, abrir la app con `localStorage` vacío
pisaría la copia de la nube con `INITIAL_DATA`) y también se saltea las
actualizaciones que vienen de una bajada. O sea: **el blob se sube sólo cuando
Pepe edita algo.** Abrir la app no lo mueve.

## Por qué importa

`ASIS_BLOB_VIEJO_MS` (18 h) se escribió para detectar que **la sincronización se
rompió** — el caso real de la v5.06, donde `sendBeacon` con tope de 64 KB contra
un blob de 4 MB dejó el blob congelado seis días sin que nadie lo notara. Pero
medía otra cosa: la hora del último guardado. Y esa hora se mueve con las
ediciones, no con el uso.

Dos consecuencias, las dos malas:

1. **Un día sin editar calla al asistente.** Un fin de semana, un día de viaje, o
   simplemente una mañana cuya última edición fue antes de las 14:20 del día
   anterior. Y el blob de ayer, si no editó nada, es un retrato **correcto**.
2. **Una subida fallida con blob reciente no se detectaba.** Blob de 2 h + push
   roto = el asistente hablaba sobre datos a los que les faltaban las ediciones
   de la última hora, con total confianza. Es exactamente el fallo que la guardia
   decía cubrir, y no cubría.

## La decisión

**La app manda un latido** (`POST /latido`): unas decenas de bytes, nunca el
blob, con `{syncKey, equipo, lastSave}`, donde `lastSave` es `lbp_last_save` —
la hora del último guardado **intentado**. El worker cruza ese número con el
`_cloudSaveTime` que tiene en la nube, y así separa tres casos que antes eran uno:

| Qué pasó | Cómo se ve | Qué hace |
|---|---|---|
| No editó nada | blob viejo, equipo vivo, `lastSave <= blob` | **corre**: el blob es correcto |
| No abrió la app | blob viejo, ningún equipo vivo | se calla: nadie puede certificarlo |
| Guardó y no subió | `lastSave > blob` + tolerancia | se calla **y lo dice** |

La regla es **monótona** respecto de la vieja: con blob fresco y nada pendiente
nunca se calla, así que el latido sólo puede destrabar casos, nunca trabarlos.
Eso es a propósito: un cambio que pudiera callar al asistente en casos nuevos
sería peor que el problema que arregla.

Se late **al cargar, al volver al frente** (con freno de 10 min) **y al fallar una
subida** (forzado, sin freno). Ese tercer punto es el que vuelve precisa la
detección: sin él, el `lastSave` guardado sería el del último latido y no el del
guardado que falló.

## Decisiones con su costo si están mal

- **`lastSave` es la hora del último guardado intentado, no un contador de
  ediciones.** La app ya la escribe (`lbp_last_save`), y vale exactamente el
  `_cloudSaveTime` que se estampa en el blob: iguales = la nube tiene todo.
  *Si está mal:* un cambio de esa semántica en la app rompe la detección en
  silencio. Hay prueba que fija la correspondencia.
- **Tolerancia de 3 minutos.** La app escribe `lbp_last_save` al **editar**,
  antes del debounce de 2 s y del POST. *Si está mal (muy baja):* editar un
  minuto antes de la pasada la callaría. Probado por mutación.
- **Un equipo sin señales en 3 días se olvida**, al leer y al guardar.
  *Si está mal:* un equipo retirado con una subida fallida dejaría al asistente
  callado **para siempre** diciendo «hay cambios sin subir». Es el peor fallo
  posible de este cambio y por eso tiene dos guardias y dos pruebas.
- **Un `lastSave` más de 5 min en el futuro se descarta.** *Si está mal:* un reloj
  adelantado produce el mismo silencio permanente.
- **Sin registro de latido se usa la regla vieja.** Compatibilidad: un equipo con
  la app vieja no late. *Si está mal:* nada; es el comportamiento de ayer.
- **El chequeo horario usa la misma función.** *Si está mal:* las dos superficies
  discreparían y una línea dura sonaría sobre datos que la pasada rechazó.

## Verificación

15 pruebas nuevas del worker + 10 de la app (657 en total, 0 fallas). **Las 15
mutaciones** —una por rama: pendiente ignorado, app viva ignorada, equipo dormido
contado, sin tolerancia, sin tope de futuro, chequeo con la regla vieja, endpoint
sin validar la key, y 7 de la app— ponen la suite en rojo. La suscripción de push
de las pruebas usa una llave ECDH **real**: con bytes inventados el cifrado falla,
el worker se traga el error y «no sonó» daba verde por la razón equivocada. Se
encontró así, antes de implementar.
