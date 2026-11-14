# Las reuniones de trabajo entran solas desde Outlook (parte B)

14-nov-2026 · diseño · LB Planner

## Por qué

Pepe se entera de las reuniones encima de la hora, o no se entera. La parte C
(v5.68, 13-nov) le puso alarma a todo lo que entra desde Google Calendar. Pero
al medirlo con sus datos del 14-nov quedó claro que eso no toca el problema:

- **De las 44 reuniones de la app, las 12 que entran de Google son todas
  cumpleaños y aniversarios.** Ni una de trabajo.
- Las 32 de trabajo las escribió a mano, y varias sin hora y sin alarma
  (Chili Beans 9-oct, Armani 19-oct, Sergio Bernal 29-oct).
- **Mientras tanto, en el Outlook de la Mac hay un calendario con 86 reuniones
  de trabajo que la app nunca vio.** Entre ellas «Meeting Ventura Mall» de Hugo
  Boss, «REVISIÓN FACTURACIÓN BOLIVIA» de Mango y «PFC | Bolivia -
  Partnership». Las dos próximas: **Reunión Mensual Bolivia, 2-dic 16:00** y
  **Reunión Internacional Franquiciados Diciembre, 10-dic 15:00**.

Su calendario de trabajo no llega a la app. Eso es el agujero.

## Lo que se midió en su Outlook el 14-nov

Todo esto se probó corriendo AppleScript contra su Outlook abierto, no es
suposición:

- La cuenta de Ventura es **IMAP** (no hay cuenta Exchange). Las invitaciones
  caen en el calendario local llamado **«Calendario»**: 86 eventos, los 86 con
  organizador — o sea que **todo lo que hay ahí es una invitación de otro**, él
  no crea eventos en ese calendario.
- **Las invitaciones entran solas**, sin que él acepte nada: 77 de las 86 nunca
  las respondió y están igual en el calendario.
- **Outlook ya convierte el huso horario.** La de PF Chang's, que en el correo
  decía «4:30 pm EST», está en el calendario a las **17:30**.
  **Ojo: eso vale para `start time` de AppleScript, NO para el `DTSTART` del
  ICS**, que viene en el huso del organizador (se vio un
  `TZID="US Mountain Standard Time":20260714T080000` para un evento que
  AppleScript da a las 11:00). La hora sale siempre de `start time`.
- Se puede distinguir aceptada de propuesta por **dos caminos que coincidieron
  en los 7 eventos probados**: `free busy status` (`busy` vs `tentative`) y, en
  `icalendar data`, el `PARTSTAT` de la línea ATTENDEE de
  `jchain@venturamall.bo` (`ACCEPTED` vs `NEEDS-ACTION`).
- Leer el calendario entero más el `icalendar data` de los eventos futuros
  tarda **3,6 segundos** y devuelve 31 KB.
- **De los 86, solo 2 son series que se repiten** (`is recurring = true`), y
  las dos ya vencieron. AppleScript devuelve una serie como **un único evento
  en la fecha en que arrancó**, con el `RRULE` adentro y **un solo UID para
  toda la serie**.
- **Pepe confirmó el 14-nov: a las invitaciones que no responde va igual, casi
  siempre.** Por eso entran todas, no solo las aceptadas.

## Alcance

**Objetivo:** que cada reunión del calendario de Outlook, de hoy en adelante,
aparezca en LB Planner con su hora exacta, su alarma y la etiqueta que diga si
está **aceptada** o **propuesta**, y que **siga los cambios**: si la mueven, se
mueve; si la cancelan, deja de sonar; si él la acepta, cambia la etiqueta.

**No objetivos:**
- **Las series que se repiten no entran** (decisión de Pepe, 14-nov). Outlook
  las devuelve como un solo evento en su fecha de arranque, así que una serie
  semanal arrancada en septiembre tiene el arranque en el pasado y el filtro de
  «hoy en adelante» la descarta entera. En sus datos son 2 de 86 y las dos ya
  vencieron. Si alguna marca le arma una reunión que se repite, se retoma: hay
  que expandir el `RRULE` y la clave de duplicados pasa a ser UID + fecha de la
  ocurrencia.
- Leer el texto de los correos para sacar reuniones de ahí. Se evaluó y se
  descartó (ver Caminos).
- Traer el historial. Solo de hoy en adelante.
- Escribir en el calendario de Outlook. Esto solo lee.

**Anti objetivo:** que le suene una alarma que no sirve, o que aparezca una
reunión que no existe. Una alarma al pedo hace que deje de confiar en todas las
demás. De acá sale la decisión de seguir los cambios: una alarma de una reunión
cancelada es el peor resultado posible de este trabajo.

## Restricciones

- **Solo se puede leer con Outlook abierto en la Mac**, igual que las campañas.
  Si Outlook está cerrado tres días, lo de esos tres días entra cuando lo abra —
  y si algo era para el día anterior, llega tarde igual. No hay forma de
  saltearla sin que Ventura habilite otra vía.
- **Y la alarma solo llega a la nube con la app abierta.** `scheduleAlarms`
  corre cuando cambian los datos en la app; con la app cerrada, la reunión
  queda esperando. Por eso hay un empujón al ingerir (ver Qué se hace, 7).
- El calendario `josechain@gmail.com` también está dentro de Outlook, con 1.262
  eventos. **Ese no se lee**: es el mismo que `_gcalPull` ya trae, y leerlo
  duplicaría los cumpleaños. Tampoco se lee «Festivos en Bolivia» (299).
- El worker `worker.js` de life-planner es **ASCII puro**.
- **Las alarmas que puso él a mano no se tocan nunca**, ni cuando la reunión se
  mueve. Son de él.
- Un POST a `/sync` reemplaza el blob entero, así que esto **no escribe por el
  worker**: la app mezcla, como ya hace con Google.

## Caminos considerados

- **1. Leer el calendario de Outlook. ← elegido.** Datos exactos: hora ya
  convertida, organizador, estado de respuesta. Sin modelo, sin adivinar. Trae
  exactamente las reuniones que él tiene.
- **2. Leer el texto del correo con el modelo** (era la «parte B» del diseño
  del 13-nov). Se descartó como primer paso al medirlo: en las invitaciones de
  Teams —que son las que importan— **el cuerpo del correo no dice ni la fecha
  ni la hora**; lo que llega es el bloque «Microsoft Teams meeting / Join /
  Meeting ID / Passcode». Además hoy el puente manda solo 320 caracteres de
  cuerpo, las marcas escriben en su propio horario y hay correos trampa que
  hablan de una reunión sin serlo («gestionar la reunión con el equipo de
  OVS»). Sigue sirviendo para lo que viaja solo como texto («Se fija fecha para
  la evaluación: martes 17/11/26 a hrs. 17:00»), y por eso queda anotado, no
  tirado.
- **3. Tarjeta de confirmación**, como las campañas. Se descartó por lo mismo
  que el 13-nov: si no tilda, no hay alarma, y no tildar es exactamente lo que
  ya le pasa. Acá además los datos son exactos: no es el modelo el que los
  inventa, es Outlook el que los sabe.

## Qué se hace

**La cadena,** copiada de la que ya funciona para las campañas:

```
Outlook (calendario "Calendario")
  → bridge/reuniones.py            (AppleScript + armado del registro)
  → POST /ingest-reuniones         (worker del briefing, KV, ESTADO COMPLETO)
  → GET  /reuniones-correo         (mismo secreto)
  → GET  /meeting-proposals        (worker de life-planner, por service binding)
  → la app mezcla en d.meetings    (igual que _gcalPull)
```

1. **El puente lee el calendario una vez por hora** (decisión de Pepe,
   14-nov), con Outlook abierto, y además a mano con `--reuniones`.
   **Va en su propio candado, separado del candado del briefing diario**: hoy
   `should_run_now()` corta en seco cuando `last_success_date` es de hoy, así
   que «la misma corrida» sería una sola lectura por día y una invitación de
   las 10 de la mañana se vería a la mañana siguiente — el problema original
   sin resolver. El estado va en una clave propia del archivo de estado
   (`reuniones_ultimo`), y la lectura corre antes de los cortes tempranos de
   `main()`.
2. **Manda el estado completo**, no solo lo nuevo: de cada evento con inicio de
   hoy en adelante, UID, título, fecha, hora de inicio y de fin, día entero
   sí/no, organizador y estado de respuesta, más la marca de que la lectura fue
   completa. Eso es lo que permite notar una cancelación: si un UID que la app
   ya tiene **no aparece** en una lectura completa y fresca, el organizador la
   sacó del calendario.
   - `/ingest-reuniones` **reemplaza** el registro de la última lectura (al
     revés que `/ingest-campanas`, que acumula). Si acumulara, un UID cancelado
     quedaría ahí para siempre y la cancelación nunca se vería.
3. **El estado sale del `PARTSTAT`** de su propia línea ATTENDEE, con
   `free busy status` como respaldo cuando el ICS no trae su línea:
   - `ACCEPTED` → `confirmacion: 'ACEPTADA'`
   - `DECLINED` → **no entra**. Si la rechazó, no va.
   - cualquier otro (`NEEDS-ACTION`, `TENTATIVE`) → `confirmacion: 'PROPUESTA'`
4. **La app la crea** con la misma forma que usa el importador de Google, más:
   - `outlookEventId`: el UID del ICS. Es la clave para no duplicar.
   - `clientId` **y** `clientName`: el cliente se resuelve desde el dominio del
     organizador (`mango.com` → Mango, `hugoboss.com` → Boss,
     `chillibeans.com.br` → Chillibeans, `pfcb.com`/`pfchangs.com` → PF
     Chang's), cruzado también contra los correos de los contactos que ya
     tienen los clientes. **`clientId` es el que importa**: la ficha de cada
     marca, la Vista 360° y el informe semanal filtran por él, y `clientName`
     no lo escribe nada hoy. Sin coincidencia, los dos quedan vacíos.
   - `fromGcal` queda en `false`: no vino de Google.
5. **La alarma y la etiqueta se heredan de la parte C.** `_alarmaReunionGcal` y
   `_avisarReunionesNuevas` ya aceptan `fromGcal || confirmacion`, así que una
   reunión con `confirmacion` recibe sola la cadena de avisos (al toque si ya
   es tarde, y después T−60, T−30, T−15 y T−5) y el chip
   «Propuesta»/«Aceptada» en «📅 REUNIONES DE HOY». Verificado contra el
   archivo publicado el 13-nov.
   - **Cambio necesario en la parte C:** la alarma que pone la app se marca con
     `auto: true`. Sin esa marca no hay forma de distinguir una alarma puesta
     por la app de una puesta por él, y el seguimiento de cambios necesita
     mover la primera sin tocar la segunda. Una alarma sin la marca (las que ya
     existen) **se trata como puesta por él**: no se toca.
6. **Sigue los cambios** (decisión de Pepe, 14-nov). En cada lectura completa,
   para las reuniones con `outlookEventId`:
   - **Movida** (cambió fecha u hora): se actualizan fecha y horas. Si la
     alarma tiene `auto: true`, se recalcula sobre la hora nueva; si es de él,
     **se deja como está** y el aviso del momento dice que la reunión se movió,
     para que él decida.
   - **Cancelada** (el UID no aparece en una lectura completa y fresca, y la
     reunión todavía era futura): queda en `status: 'CANCELLED'` y **se apaga la
     alarma**. No se borra: él ve que se canceló. Las que ya pasaron no se
     tocan.
   - **Cambió de estado** (`NEEDS-ACTION` → `ACCEPTED`): se actualiza
     `confirmacion`, y con eso el chip y el texto de la alarma.
   - **Él la borró de la app**: la reunión sigue en Outlook pero su `id` tiene
     lápida → **no se recrea**. Esa es la diferencia con una cancelación:
     cancelada = está en la app y no en Outlook; borrada por él = está en
     Outlook y no en la app.
   - **Él la rechazó en Outlook** (`DECLINED`): si nunca entró, no entra; si ya
     estaba, queda `CANCELLED` y sin alarma. El puente manda igual el estado
     `RECHAZADA` en vez de callarse el evento, para que una rechazada no se
     confunda con una que el organizador canceló.
   - Todo cambio en una reunión de hoy o de mañana se avisa en el momento, con
     el mismo `_fireNotification` que usa el aviso al toque.
7. **Lo que él borra no vuelve, y lo nuevo le llega sin abrir la app.**
   - Para «no recrear lo que él borró» **se reusa el mecanismo de lápidas que
     la app ya tiene** (`_deletedIds` + `window._lbpRecordDel`), en vez de una
     lista nueva: ya se sincroniza (`_mergeCloudData` combina las lápidas de
     los dos lados y una baja en cualquier equipo es definitiva) y ya se poda a
     los 30 días. Como el `id` de la reunión se deriva del UID, alcanza con
     mirar `d._deletedIds[id]` antes de importar. (Esto reemplaza la lista
     `outlookVistos` que decía el borrador: hacía con código nuevo lo que ya
     está hecho y probado.)
   - Al ingerir algo nuevo o un cambio, el worker del briefing llama al empujón
     de life-planner **reusando el camino que ya existe para las campañas**
     (`env.LBP_SERVICE` → `/push-campanas`). Si no, con la app cerrada la
     alarma nunca llega a la nube y no suena nada.
   - La app pide `/meeting-proposals` **al abrir y cada hora**, no solo con un
     token de Google vivo: esta cadena no depende de Google.
8. **Duplicados del propio Outlook:** dos invitaciones distintas a la misma
   reunión existen de verdad (el «CHILLI GLOBAL SUMMIT NOVIEMBRE» del 12-nov
   llegó dos veces, de `ana.cardona@` y de `sandra.sanchez@`, al mismo
   horario). Entran como una sola: misma fecha, misma hora de inicio y título
   normalizado igual. **El desempate es fijo, no «la primera»**, porque el
   orden en que AppleScript devuelve los eventos es arbitrario y dos equipos
   elegirían distinto: gana la `ACEPTADA`; si las dos están en el mismo estado,
   gana el UID más chico. El UID de la perdedora igual va a `outlookVistos`.

## Decisiones mías, para que las revise

- **Solo de hoy en adelante.** Las 86 históricas no entran. El historial se
  puede pedir después.
- **Una rechazada no entra.** `DECLINED` es la única respuesta que dice «no
  voy» sin ambigüedad.
- **Una cancelada se marca, no se borra.** Si desaparece sola, no se entera de
  que se canceló.
- **La app mezcla, no el worker.** Escribir el blob desde el worker es lo que ya
  le borró datos una vez.
- **Sin modelo.** Ningún dato de esta cadena lo decide Claude: todos salen de
  Outlook. Es lo que hace que el riesgo de alarma equivocada sea casi nulo.
- **El huso horario se toma como Outlook lo da**, en hora local de la Mac. Si
  viaja y cambia la hora de la Mac, las que ya entraron no se recalculan.

## Lo que queda a criterio de quien lo construya

- Cómo se recorta el ICS para sacar el UID y el PARTSTAT. Hay una trampa
  medida: el ICS **parte las líneas a los 75 caracteres** y la continuación
  arranca con un espacio, así que corta nombres y hasta la palabra `PARTSTAT`
  al medio. Hay que desdoblar las líneas antes de buscar.
- Otra trampa medida: `offset of "UID:" in ics` **revienta con -1723 dentro del
  bloque `tell application "Microsoft Outlook"`**. La extracción va en Python,
  no en AppleScript.
- Una tercera: AppleScript devuelve los minutos **sin cero adelante** («11:0»
  por 11:00). Hay que rellenarlos.
- Y una cuarta: **los títulos tienen barras** («PFC | Bolivia - Partnership»),
  así que `|` solo no sirve como separador de campos. El puente ya usa `|~|` y
  `<<<EOR>>>`, que no aparecen en ningún título.
- Si el estado de la última lectura vive en el KV del briefing o en los datos
  de la app.

## Cómo se prueba que quedó bien

- `node --test tests/*.test.mjs` en verde, con pruebas nuevas de:
  - `ACCEPTED` / `NEEDS-ACTION` / `DECLINED` → etiqueta correcta o descarte;
  - una reunión ya importada no se duplica;
  - una que él borró no vuelve;
  - una que él rechazó queda CANCELLED;
  - una que desapareció de Outlook queda CANCELLED y sin alarma;
  - una movida mueve la alarma `auto` y **no** mueve la alarma de él;
  - `NEEDS-ACTION` → `ACCEPTED` cambia el chip;
  - dos invitaciones al mismo horario entran como una, y gana siempre la misma
    sin importar el orden de lectura;
  - minutos con cero adelante.
- Pruebas del puente en verde, con el ICS real de uno de sus eventos como
  fixture, **incluida una serie que se repite**, para que quede a la vista que
  hoy no entra.
- En el sitio publicado, en celular y computadora: la **Reunión Mensual Bolivia
  del 2-dic 16:00** aparece con chip «Propuesta», cliente Chillibeans y alarma
  a las 15:00.
