# Alarmas automáticas en las reuniones que entran solas (parte C)

13-nov-2026 · diseño corto · LB Planner

## Por qué

Pepe se entera de las reuniones encima de la hora o tarde. Dos casos, en sus
palabras: «me avisaron esta mañana para esta tarde y no vi los correos» y «me
avisaron la semana pasada para esta semana y me olvidé agendar».

Medido en sus datos del 13-nov: **las 12 reuniones que entran desde Google
Calendar están sin alarma. Las 32 que carga a mano, 25 sí la tienen.** O sea
que todo lo que entra automático entra mudo. Eso cubre el segundo caso: aceptó
la invitación, quedó en el calendario, y nada le avisó.

## Alcance

**Objetivo:** que toda reunión que entre sola traiga alarma, y que en el
resumen del día y en la alarma se vea si es una reunión **aceptada** o
**propuesta**.

**No objetivo:** leer el correo. Eso es la parte B, que va después y usará el
mismo campo y la misma etiqueta que deja esta.

**Anti objetivo:** que le suene una alarma que no sirve. Una alarma al pedo a
las 11 de la noche hace que deje de confiar en todas las demás, y entonces
esto empeora el problema en vez de arreglarlo.

## Restricciones

- El correo de Ventura solo se puede leer con Outlook abierto en la Mac
  (SmarterMail no da IMAP cifrado). No afecta a C, manda en B.
- La sincronización con Google trae eventos de día entero con `start.date` y
  sin hora; en la app quedan como `startTime` y `endTime` en `'00:00'`.
- Las alarmas ya existentes no se tocan: son de él.

## Caminos considerados

- **A. Leer el correo y pedir confirmación con una tarjeta.** Reusa el camino
  de Campañas, que ya está probado, y nada se escribe sin un click. Se
  descartó como primer paso porque si no tilda, no hay alarma — y no tildar es
  exactamente lo que ya le pasa.
- **B. Leer el correo y crear la reunión sola, con su alarma.** Es lo que
  resuelve el caso de «me avisaron esta mañana». Queda para después.
- **C. No tocar el correo: alarma a todo lo que entra. ← elegido para ahora.**
  Es una tarde de trabajo, riesgo casi nulo, y tapa el caso de lo que sí llegó
  al calendario. Pepe eligió C y después B, para construir B sabiendo ya cómo
  le suenan estas alarmas.

## Qué se hace

1. **Alarma 1 hora antes** en cada reunión importada de Google Calendar
   (`fromGcal`), al sincronizar.
   - Solo en reuniones **futuras**. Nada de alarmas con fecha pasada.
   - **Nunca se pisa una alarma existente.**
   - Vale también para las 12 que ya están importadas: la próxima
     sincronización les pone la suya.
2. **Campo nuevo `confirmacion`**, con dos valores: `ACEPTADA` | `PROPUESTA`.
   - En C, todo lo que viene de Google entra como `ACEPTADA`: si está en su
     calendario, la aceptó.
   - Las que carga a mano quedan sin el campo y se ven igual que hoy.
   - B llenará `PROPUESTA` sin tocar nada más.
3. **Se ve en los dos lugares que pidió Pepe:**
   - en «📅 REUNIONES DE HOY» del resumen del día, como etiqueta al lado del
     título;
   - en el texto de la alarma: «Reunión aceptada — <título>».

## Decisiones mías, para que las revise

- **Los eventos de día entero no llevan alarma 1 hora antes**, porque empiezan
  a las 00:00 y sonaría a las 23:00 de la noche anterior. Les pongo **una sola
  alarma a las 8:00 de ese día**. Los tres que vienen son cumpleaños y un
  aniversario; un pitido a las 11 de la noche es justo la alarma al pedo del
  anti objetivo.
- La etiqueta de `ACEPTADA` se muestra aunque hoy sean todas aceptadas. Es
  redundante por ahora y deja de serlo con B.

## Lo que queda a criterio de quien lo construya

Dónde y con qué forma exacta va la etiqueta en la tarjeta del resumen del día.

## Cómo se prueba que quedó bien

- `node --test tests/*.test.mjs` en verde, con pruebas nuevas de: alarma solo a
  futuras, no pisar alarmas existentes, día entero a las 8:00, y `confirmacion`
  en ACEPTADA al importar.
- En el sitio publicado, en celular y computadora: una reunión de Google con su
  alarma y su etiqueta en el resumen del día.
