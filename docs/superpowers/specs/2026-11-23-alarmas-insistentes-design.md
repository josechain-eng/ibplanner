# Alarmas insistentes para las tareas del correo — diseño

23-nov-2026. Diseño corto: todas las decisiones se tomaron en la conversación y
el trabajo son cuatro ediciones acotadas en `LifeBusinessPlanner2026.html`.

## Para qué, y por qué ahora

Pepe acepta una tarea propuesta del correo con el tilde, la alarma suena a las
9:40 del día hábil siguiente, y si ese día no la hace **nada vuelve a buscarlo**.
Se la olvida.

Lo importante: la app ya la muestra en **tres** lugares — el chip rojo
«N tasks overdue» arriba del Home, la ventana de Alertas («alarma de hace N días
sin completar») y la propia lista de tareas. El agujero no es de pantalla: es
que todo eso **solo existe si Pepe abre la app**. Lo único que lo busca a él
cuando no está mirando es la notificación, y suena una vez.

## Objetivos

1. Una tarea venida del correo, sin terminar, **vuelve a sonar cada 2 días
   hábiles** a su misma hora, hasta que la marque hecha.
2. Las que **ya aceptó** y siguen abiertas pasan a ese régimen solas, sin que
   tenga que tocar ninguna.
3. Alertas deja de esconder cosas: se pueden ver **todas** (hoy se ven 5, sin
   scroll) y se pueden despachar **sin salir de esa lista**.

## No objetivos

- No se toca la alarma de ninguna otra tarea, reunión, proyecto, meta ni hábito.
- No se toca el puente, ni `worker.js`, ni la tarjeta de propuestas.
- No se cambia el chip rojo del Home ni la lista de tareas: ya funcionan.
- No se cambian las reglas que deciden **qué** es una alerta (las seis que ya
  hay), salvo el límite de días. Esto es sobre poder verlas y despacharlas.

## Anti objetivos — qué haría fracasar esto aunque funcione

- **Que Pepe empiece a barrer notificaciones sin leerlas.** Si tiene 15 tareas
  del correo abiertas, son hasta 15 notificaciones cada 2 días. La defensa es el
  alcance acotado (solo las del correo, que son las que no decidió crear él) y
  que la cruz y el «hecho» las apagan en el acto.
- **Que una alarma suene un sábado.**
- **Que la conversión de las viejas duplique tareas, duplique notificaciones o
  pierda decisiones.**

## Restricciones

- Un solo archivo HTML con React **compilado** (`React.createElement`, sin JSX).
  Parches por reemplazo exacto de cadenas con Python y `node --check` después de
  cada uno.
- Hora local siempre; nunca `toISOString()` para un `YYYY-MM-DD` (Bolivia UTC-4).
- La repetición **tiene que salir de las funciones de fechas que ya existen**,
  `_futureOccurrences` y `_recentOccurrence`: de ahí comen los cuatro caminos
  que disparan una alarma (la nube, el chequeo local, el repechaje de
  «perdidas» y la cancelación al completar). Un tipo nuevo que solo entienda una
  de las cuatro produce alarmas fantasma o alarmas que no se apagan.

## Los caminos que se construyeron

1. **Tipo de repetición nuevo, «cada 2 días hábiles».** Elegido.
2. **Reusar `custom` con intervalo 2 y unidad días.** Cero código nuevo, pero
   cuenta días de calendario: cae en sábado, suena el fin de semana y de ahí en
   adelante alterna finde/semana para siempre. Descartado.
3. **Reusar `weekdays`.** Cero código nuevo y nunca cae en finde, pero suena
   **todos** los días hábiles. Más insistente de lo que Pepe pidió. Descartado.

## Las decisiones

- **`recurrence: 'weekdays2'`**, al lado de `'weekdays'`, con etiqueta
  `Every 2 weekdays` en el editor de alarmas (las etiquetas de ese selector
  están en inglés). Hay que agregarlo en cuatro lugares: `_futureOccurrences`,
  `_recentOccurrence`, `recurrenceLabels` y `REC_VALIDAS` (la lista blanca del
  camino por IA, que si no lo conoce lo descarta en silencio).
- **`alarm.datetime` NO se toca.** El identificador de la primera ocurrencia
  queda idéntico al que ya tenía la alarma de una sola vez, así que la
  conversión no duplica notificaciones ni revive la que ya sonó.
- **La marca para saber qué tarea vino del correo es `tags` con `'Correo'`.**
  Verificado: esa cadena aparece **una sola vez** en todo el archivo, en
  `_tpAplicar`. Ninguna otra función etiqueta así.
- **La conversión de las viejas** pasa a `'weekdays2'` toda tarea que cumpla las
  cuatro condiciones a la vez: etiqueta `'Correo'`, no `DONE`/`CANCELLED`/
  `ARCHIVED`, `alarm.enabled`, y `alarm.recurrence === 'once'`. Es idempotente
  por construcción: después de correr no queda ninguna en `'once'`.
- **No va a haber avalancha de avisos al convertir.** Las ventanas locales de
  repechaje son de 5 y 15 minutos, así que una tarea cuya última ocurrencia fue
  ayer no suena al abrir la app; la próxima es el día hábil que toque, a su hora.
- **Alertas gana una ventana propia, y es la pieza que Pepe pidió.** El bloque
  del Home sigue mostrando 5 renglones (el Home tiene que quedar corto), pero el
  encabezado pasa a ser tocable: abre una ventana que muestra **todas** las
  alertas, con scroll. Dos cosas que hoy están mal y esto arregla: el bloque
  corta en 5 **sin scroll**, así que de 12 alertas Pepe ve 5 y no sabe que hay
  7 más; y tocar un renglón lo manda a la lista de tareas, donde la tarea queda
  **mezclada con todas las demás**, que es lo contrario de enfocarse.
- **Dentro de esa ventana se puede trabajar, no solo mirar.** Las alertas que
  son tareas llevan un **✓ para marcarlas hechas en el lugar**, y la alerta
  desaparece de la lista en el acto (la alarma ya se cancela sola al completar:
  eso está escrito). Tocar el texto sigue abriendo la tarea. Las alertas que no
  son tareas (aduana, proyectos, clientes, seguimiento de reuniones) mantienen el
  comportamiento de hoy: llevan a su pantalla. *Decisión mía*, y es la que hace
  que la ventana sirva para «enfocarme solo en esas»: una lista que solo se mira
  obliga a salir de ella para hacer cualquier cosa.
- **El orden no cambia:** los vencimientos de aduana siguen yendo adelante, en
  el bloque y en la ventana. Ese orden se decidió a propósito — una multa pesa
  más que una alarma vieja.
- **El límite de 14 días sube a 60, no se elimina** — *decisión mía*: una tarea
  abierta hace tres meses no es una tarea olvidada, es una que Pepe decidió no
  hacer, y su lugar es la lista, no una alerta.
- **«Día hábil» quiere decir lo mismo acá que en el resto de la app: ni sábado,
  ni domingo, ni feriado boliviano.** El motor de repeticiones que ya existe
  solo saltea sábados y domingos, así que `'weekdays2'` tiene que consultar la
  **misma** fuente de feriados que usa `_tpProximoDiaHabil` para elegir la fecha
  de la tarea: `_LBP_EVENTS` (los fijos, `cat:'feriado'`) más
  `_LBP_FERIADOS_MOVILES(año)` (Carnaval, Viernes Santo y Corpus, calculados
  desde la Pascua). Si no, la fecha de la tarea saltea Carnaval pero la alarma
  suena el martes de Carnaval a las 9:40, que es justo la incoherencia que
  irrita. Cuesta un paso más en dos funciones; se paga.
- **`'weekdays'`, el tipo que ya existía, no se toca:** lo usan los hábitos y
  las metas, y cambiarle el significado a «también saltea feriados» sería
  modificar alarmas que Pepe no pidió tocar.
- **El chip del Home y la ✕ de Alertas no se tocan.**

## Lo que queda a criterio de quien lo construya

- Dónde exactamente se engancha la conversión en el arranque, y cómo se asegura
  de correr una sola vez por carga.
- Si la ventana de todas las alertas es una pantalla o un modal, y el texto de
  lo que abre el encabezado.
- Cómo se consulta la lista de feriados dentro del paso de fechas sin recalcular
  el año en cada iteración.
- Los casos de prueba del tipo nuevo, que son los que importan: que nunca caiga
  en sábado, domingo ni feriado; que cuente dos días **hábiles** y no dos de
  calendario, cruzando un fin de semana y cruzando Carnaval; que la cancelación
  al completar borre todas las ocurrencias futuras; y que la conversión de las
  viejas sea idempotente.
