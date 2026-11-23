# Alarmas insistentes — decisiones y pendientes

Rama `alarmas-insistentes`, 23-nov-2026, fusionada a main como **v5.74**. Acá está
todo lo que decidí yo mientras se construía y todo lo que quedó sin hacer a
propósito. Nada de esto está en el código: si algo acá está mal, es acá donde se ve.

---

## Qué quedó andando

1. **La alarma insiste.** Una tarea venida del correo vuelve a sonar **cada 2 días
   hábiles** a su misma hora hasta que la marcás hecha. «Día hábil» ahora significa
   lo mismo en toda la app —ni sábado, ni domingo, **ni feriado**— porque hay una
   sola definición, `_lbpEsDiaHabil`, que usan tanto la fecha de la tarea como la
   repetición.
2. **Las que ya habías aceptado** pasaron solas a ese régimen, una vez por
   dispositivo.
3. **La ventana de Alertas**: el encabezado muestra el total y se toca para ver
   **todas**, con scroll, y ahí mismo se marcan hechas con un ✓ sin salir de la
   lista. El límite de «alarma de hace N días» subió de 14 a 60.

Suite: **440 pruebas en verde** (arrancó en 405 con 1 falla vieja).

---

## Tres defectos que encontraron los revisores, y que eran reales

Los tres son el mismo patrón, y vale la pena que lo sepas porque se va a repetir:
**código correcto sin ninguna prueba que lo sostenga**.

1. **Una prueba que no podía fallar por el caché.** Decía «un año sin feriados
   móviles no rompe», pero el caché por año ya estaba cargado por pruebas
   anteriores, así que el caso nunca se ejercitaba.
2. **Una prueba que no podía fallar por el fixture.** Decía «el tilde no resucita
   una tarea ya hecha», pero su tarea de ejemplo ni siquiera tenía alarma, así que
   la regla salía antes de llegar al chequeo que la prueba decía vigilar.
3. **La aritmética de «cada 2 días hábiles» sin red.** El revisor borró entera esa
   rama del código y **la suite siguió en verde**. En ese estado la función cae al
   paso de **un día de calendario** y puede devolver un sábado o un feriado justo
   dentro de la ventana en que la app dispara alarmas locales: una alarma un sábado,
   que es literalmente lo que el diseño decía que no podía pasar.

Los tres se arreglaron y los tres se verificaron **por mutación**: se rompe el
código a propósito, se confirma que la prueba ahora falla, y se revierte.

---

## Las decisiones que tomé en tu nombre

Cada una dice qué decidí y qué pasa si me equivoqué.

**1. La rama salió de main, no de `propuestas-marketing`.** Vos lo elegiste. *Si me
equivoqué:* para publicar las dos cosas juntas hace falta un merge más.

**2. Trabajé en una rama de este repo, no en un worktree aparte,** porque la
verificación en navegador necesita el servidor de `.claude/launch.json`, que vive
acá. *Si me equivoqué:* main queda expuesta si alguien la toca en paralelo; no hay
nadie más.

**3. La línea base del plan estaba mal y la corregí a mitad de camino.** Yo había
medido 430 pruebas en verde… en la otra rama. Sobre main eran **405 con 1 falla**,
y esa falla era vieja: una prueba exigía la versión 5.71 cuando el archivo decía
5.72 desde el commit de la v5.72. *Si me equivoqué:* nada, está medido en los dos
lados. **Dato para vos: la suite no estaba en verde en lo publicado.**

**4. Los conteos de pruebas son una baranda, no una meta.** Un implementador agregó
una prueba solo para llegar al número; la saqué. *Si me equivoqué:* una prueba menos
que no probaba nada pedido.

**5. El plan tenía un defecto de fechas que el implementador encontró bien.** Cuatro
pruebas le pasaban al motor una hora anterior a la de la alarma, y en ese caso el
motor devuelve la propia fecha base como primera ocurrencia. Corregí la hora de
referencia, no los valores esperados. *Si me equivoqué:* ninguno, es la semántica
real del motor.

**6. El plan decía «no hace falta bandera» para la conversión. Estaba mal.** Sin
marca, el efecto no convertía una vez: **imponía** la repetición para siempre y te
deshacía en el render siguiente cualquier vuelta a «una sola vez». *Si me
equivoqué:* perdías la posibilidad de elegir alarma única en esas tareas.

**7. Elegí el corte por fecha sobre el marcador sincronizado.** La marca de «ya
convertí» es por dispositivo, y eso abría un agujero con tus dos equipos: la Mac
convierte, vos ponés una en «una sola vez», el Samsung abre por primera vez y la
reconvierte y la empuja. Ahora **nunca se convierte una tarea que tocaste después
de que salió la v5.74**. La alternativa prolija —un marcador dentro de los datos
sincronizados— toca el código de fusión, que es compartido y delicado. *Si me
equivoqué:* una tarea que nadie migró y que editaste después del 23-nov no se
convierte nunca. Es angosto: la conversión corre al primer arranque.

**8. No ejecuté yo una edición que a un subagente le habían denegado por permisos.**
Se la devolví autorizada por requisitos para que la intentara en su propio contexto.
*Si me equivoqué:* una vuelta más de despacho. Rodear una denegación de permisos no
es una opción.

**9. Subí a la ola de arreglo dos cosas que el revisor había graduado «puede salir
así»:** el ✓ pasó de 30×30 a 44×44 y ganó nombre accesible. Son dos líneas sin
riesgo y el camino de recuperación de un toque accidental era «andá a la lista y
buscala», que es justo la fricción que esta función existe para sacar.

**10. No toqué la ✕ del bloque de Alertas,** porque el diseño lo decía explícito.
Ver el pendiente de abajo.

**11. No hice el refactor que unificaría las dos copias del paso de «2 días
hábiles».** Es la pieza más delicada de la rama y la ola ya le estaba agregando las
pruebas; cambiar las dos cosas a la vez era cambiar dos cosas a la vez. *Si me
equivoqué:* las dos copias pueden derivar en el futuro.

**12. Dejé `_impDiasLimite` leyendo el reloj real.** Para el Home da lo mismo;
volverlo puro exige tocar un helper compartido. *Si me equivoqué:* la regla de
aduana no se puede probar contra un reloj fijo.

**13. Descarté por inspección, no por omisión,** el riesgo de que el selector de
recurrencia del asistente por voz pisara una tarea ya convertida: ese formulario
solo **crea** borradores, nunca carga una tarea existente. Anotado para que nadie lo
vuelva a investigar.

---

## Pendientes, ninguno bloquea

**El que más conviene mirar:**
- **La ✕ del bloque de Alertas es una trampa.** Si la tocás, perdés la única entrada
  a la ventana nueva hasta recargar la app. No lo toqué porque el diseño decía que
  no, pero decime y lo cambio: la ✕ podría dejar una línea tocable en vez de
  esconder todo.

**Reales pero acotados:**
- Si abrís la app **sin conexión**, la conversión se marca como hecha contra lo que
  haya en el teléfono; una tarea del correo que baje después desde la nube seguiría
  sonando una sola vez.
- Si el navegador no puede escribir la marca (cupo lleno, ventana privada vieja), la
  conversión vuelve a correr en ese caso angosto.
- La escalera de horarios (9:40, 9:45, 9:50) ya solo vale el día que nace la tarea.
  Si una tarea convertida cae el mismo día que una nueva, las dos suenan 9:40. No se
  pisan ni se pierden: son avisos distintos.
- Las dos copias del paso de «2 días hábiles» son idénticas por inspección, no por
  construcción.

**Nada que hacer, anotado para que no se vuelva a investigar:**
- `_LBP_EVENTS` no tiene el 22 de enero (Día del Estado Plurinacional). Es un hueco
  de datos que ya existía y que afecta igual a la fecha de la tarea; cambio aparte.
- Las reglas de alerta excluyen `DONE` pero no `CANCELLED` ni `ARCHIVED`. Venía así.
- El horizonte de ocurrencias es de 60 días: si no abrís la app en dos meses, se
  agota. Cada apertura lo re-extiende. Venía así.

---

## Una cosa con fecha, fuera de esta rama

**Ya — la clave de OpenAI mal pegada.** El worker `life-planner` tiene cuatro
secretos y el **nombre** de uno de ellos es el **valor** de una API key de OpenAI
(empieza con `sk-proj-`). Alguien la pegó en el casillero del nombre en lugar del
valor. Los nombres de los secretos se ven en listados, en el panel de Cloudflare y
en salidas de deploy. Hay que **rotarla en OpenAI y borrar ese secreto**. No lo
toqué: borrar es irreversible y rotar es en tu cuenta.
