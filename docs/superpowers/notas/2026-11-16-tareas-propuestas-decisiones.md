# Tareas propuestas de la semana — decisiones y pendientes

Rama `tareas-propuestas`, 16-nov-2026. Acá está todo lo que decidí yo mientras
se construía, y todo lo que quedó sin hacer a propósito. Nada de esto está en el
código: si algo acá está mal, es acá donde se ve.

---

## Decisiones que tomé en tu nombre

Cada una dice qué decidí, por qué, y qué pasa si me equivoqué.

**1. Trabajar en una rama de este repo, no en un worktree aparte.**
La mitad del trabajo (el puente) vive fuera del repo, en una carpeta que no es
git, y los deploys apuntan a producción igual. *Si me equivoqué:* la rama
principal queda expuesta si alguien la toca en paralelo; no hay nadie más.

**2. El comando de pruebas del plan estaba mal.** `node --test tests/` hace que
node trate la carpeta como si fuera un archivo de prueba: 1 falla, 0 pasan. El
real es `node --test "tests/*.test.mjs"`. *Si me equivoqué:* nada, está medido
en los dos sentidos.

**3. La poda de decisiones vive dentro del alta,** no en la tarjeta, así cada
escritura poda y deduplica sin que nadie se acuerde. *Si me equivoqué:* una
función más en el camino caliente, sobre una lista de cientos.

**4. La tarjeta lleva cuenta de las alarmas que ya asignó** en esa sesión y se
las pasa al alta. Sin eso, dos ✓ rápidos antes de que la pantalla se actualice
caían los dos a las 9:40. *Si me equivoqué:* dos tareas podrían sonar juntas.

**5. Cambié una prueba que se rompía sola.** Buscaba la palabra «campaña» en el
bloque de la tarjeta, y mis propios comentarios la nombran. Ahora verifica lo
que importa: que no aparezca el texto del aviso equivocado ni el endpoint de
campañas. *Si me equivoqué:* nada; esta función no manda ningún aviso.

**6. El puente no lo instaló el implementador, lo instalé yo** después de que su
revisión estuviera limpia. `install.sh` reemplaza el trabajo diario que corre
solo. *Si me equivoqué:* el puente tardaba un día más; no se perdía nada.

**7. Lo mismo con el deploy del worker y la prueba contra tu correo real:** los
corrí yo después de la revisión, porque cada corrida cuesta plata de verdad.

**8. El identificador de hilo copia el regex del puente sin recortar espacios
primero.** Medí el Python: `'  RV : X  '` da `'rv : x'`, no `'x'`, porque el
ancla ve el espacio. Mi tabla de pruebas original pedía lo contrario, para un
caso que no puede ocurrir porque el puente ya limpia el asunto. *Si me
equivoqué:* dos asuntos distintos podrían compartir identificador.

**9. La ventana de días entra en la clave del cache.** Contestar una pregunta de
30 días con la respuesta de 10 es una respuesta equivocada. *Si me equivoqué:*
una llamada más al modelo el día que cambies la ventana.

**10. Se extrajo solo el chequeo de clave, no la lectura del briefing.** El
chequeo es la parte crítica de seguridad y ya había una prueba por tabla que lo
cubría; la lectura del briefing devuelve formas de error distintas por endpoint,
así que unificarla forzaba una forma común en dos endpoints vivos a cambio de
poco. *Si me equivoqué:* esa lectura sigue triplicada.

**11. La lista de decisiones no usa marcas de borrado.** El revisor propuso
borrar la marca al registrar una decisión; verifiqué que no sirve, porque la
unión de marcas toma siempre el máximo por identificador y nunca deja
desaparecer una clave. En su lugar, deshacer reescribe la entrada como
«revocada». *Si me equivoqué:* el deshacer dejaría de propagarse entre equipos.

**12. Una sola ola de arreglo al final,** con los tres hallazgos importantes más
cuatro items que la revisión marcó como gratis y que caían en los mismos
archivos. *Si me equivoqué:* una ola más grande que el mínimo, en archivos que
ya se tocaban.

---

## Dos residuos que dejo escritos, no asumidos

**La escalera de alarmas se calcula con los datos locales.** Dos equipos usados
dentro de un mismo viaje de sincronización eligen los dos las 9:40. El uso
normal no lo toca, pero el diseño nombraba explícitamente «una tanda en la Mac y
otra en el celular», así que conviene saberlo.

**El informe de actividades sí cambió, para bien.** El plan decía que no se
tocaba «por omisión». No es cierto: al subir el tope del cuerpo a 1.200, el
informe pasa a recibir hasta 1.200 caracteres por correo en vez de ~290. Es la
mejora que el diseño pedía, pero la frase del plan era inexacta y ya la corregí.

---

## Pendientes, ninguno bloquea

La revisión final los triagó uno por uno y ninguno llega a la vara de fusionar.

**Vale la pena hacerlos pronto, son de a tres líneas:**
- El resumen del desplegable dice «Descartado por la validación» pero también
  lista fallos de tanda; el texto queda corto.
- Faltan pruebas de los caminos de fallo del endpoint y del tope de días.
- La prueba que verifica dónde está montada la tarjeta usa una distancia mágica
  de 1.200 caracteres: va a fallar con cualquier cambio al briefing.

**Reales pero acotados:**
- «Más viejos» y «más recientes» asumen que el puente publica del más nuevo al
  más viejo; el worker no lo ordena ni lo verifica.
- La poda de decisiones no deja marca, así que una entrada podada vuelve desde
  un equipo que todavía no podó. Inofensivo: una entrada vieja solo mantiene
  callado un hilo que ya era viejo.
- La escalera tope a las 23:55 puede devolver un horario ya ocupado. Hacen falta
  168 alarmas el mismo día.
- El mensaje de confirmación se calcula de la pantalla y la escritura de los
  datos frescos. Si entra una sincronización justo en el medio, el mensaje puede
  decir «Creada» cuando ya estaba decidida. No corrompe nada.
- Confirmar la misma propuesta en dos equipos sin sincronizar deja una sola
  decisión pero **dos tareas**, porque cada una nace con identificador propio.
- `/campaign-actions` y `/email-actions` comparten un hueco preexistente: si el
  briefing devuelve nulo, sale un error 500 en vez de un mensaje.
- Un comentario del puente cita el número de recorte del briefing; ya se
  corrigió a 250, pero el dato correcto es que la función es `fetchIngestedVentura`.

**Nada que hacer, anotado para que no se vuelva a investigar:**
- Un hilo sin identificador y sin asunto daría `msg:undefined`; el puente no
  puede producirlo.
- Un `ts` que no sea ISO se trataría como correo fresco; el worker siempre
  escribe ISO.
- Las entradas «revocada» quedan hasta la poda de 180 días: 95 bytes cada una.
- La tarea creada no trae `estimatedHours`, `projectId` ni `attachments`, igual
  que las otras cinco funciones de la app que crean tareas desde texto.

---

## Dos cosas con fecha, fuera de esta rama

**Enero 2027 — los feriados móviles.** `window._LBP_EVENTS` tiene Carnaval el
16-17 de febrero, Viernes Santo el 3 de abril y Corpus el 4 de junio: son las
fechas de 2026. En 2027 Carnaval cae el 8-9 de febrero y Viernes Santo el 26 de
marzo. Desde enero, la app va a saltear dos días hábiles cualquiera y **no** va
a saltear los feriados de verdad — y la tarjeta del día va a mostrar mal esas
fechas el mismo día. Es dato preexistente de la app, no lo introdujo esta rama.

**Ya — la clave de OpenAI mal pegada.** El worker `life-planner` tiene cuatro
secretos y el **nombre** de uno de ellos es el **valor** de una API key de
OpenAI (empieza con `sk-proj-`). Alguien la pegó en el casillero del nombre en
lugar del valor. Los nombres de los secretos se ven en listados, en el panel de
Cloudflare y en salidas de deploy. Hay que **rotarla en OpenAI y borrar ese
secreto**. No lo toqué: borrar es irreversible y rotar es en tu cuenta.
