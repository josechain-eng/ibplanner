# Life & Business Planner 2026

**Status:** Active, **v5.26** - chats con memoria + copiar/exportar

## TRAMPA GRAVE: `wrangler deploy` BORRA las vars del dashboard (13-sep-2026)
- **Sintoma:** el microfono de voz fallo con "OPENAI_API_KEY no configurada en el worker". `wrangler secret list --name life-planner` mostro solo ANTHROPIC_API_KEY y BRIEFING_KEY: faltaban **OPENAI_API_KEY y JINA_API_KEY**.
- **CAUSA (fue mia):** el `wrangler.toml` de life-planner (que cree yo) **no tiene bloque `[vars]`**. Un `wrangler deploy` **reemplaza el conjunto de vars del worker por el del toml**, asi que las que estaban puestas como texto plano en el dashboard se borraron. Desplegue ese worker ~6 veces en la sesion.
- **Por que ANTHROPIC_API_KEY sobrevivio:** era un SECRET de verdad. Los secrets se guardan aparte y **siempre** sobreviven al deploy. El worker briefing-diario-pepe no perdio nada porque su toml SI declara `[vars]`.
- **IMPACTO:** `/transcribe` (Whisper) caido -> **asistente de voz, grabador de reuniones Y grabador de journal** todos rotos. JINA_API_KEY solo era respaldo del TC (dolarblue es la fuente primaria), impacto menor.
- **REGLA:** en estos workers todo lo sensible va como **secret** (`wrangler secret put`), NUNCA como var del dashboard. Antes de `wrangler deploy` sobre un worker que se administro por dashboard: correr `wrangler secret list` y mirar si hay vars que el toml no declare.
- Aviso dejado como comentario al inicio de `lbplanner/wrangler.toml`.
- **Restaurar:** `cd ~/lbplanner && npx wrangler secret put OPENAI_API_KEY` (lo hace Pepe, es su credencial).


## Briefing push de las 8am no llegaba (04-sep-2026) - COLISION EN EL TICK 12:00 UTC
- **OJO, AMBIGUEDAD:** "briefing" son DOS sistemas distintos. (a) la **notificacion push** de LB Planner 8am, y (b) el **correo** del proyecto Briefing Diario. Confirmar SIEMPRE cual antes de investigar: perdi varios pasos en el equivocado.
- **Sintoma:** la push del briefing dejo de llegar el 3 y 4 de sep. Ultima recibida: 2 de sep.
- **Descartado uno por uno:** cron puntual (`briefing_ai` generado 12:00:42 y 12:00:44 UTC); `/test-push` 4/4 OK; payload chico (669-760 bytes, lejos del limite ~4KB); `/force-smart` corriendo el MISMO camino del cron a demanda -> 4/4 enviadas y el usuario LA RECIBIO. Codigo, contenido y canal OK: el fallo era exclusivo del tick 12:00 UTC.
- **RAIZ:** `isRefreshTime` (~1219) refresca el TC en `(h===12 && mm<2)` y el gate del briefing (~1305) era `(utcH===12 && utcM<2)`. **La misma invocacion** hacia: refrescar TC (varios fetches externos, Jina lento/inestable con reintentos) + generar el briefing con Opus 5 + firmar VAPID y enviar 4 push. Sobrecargada, los envios (que van al final) morian. Misma familia que la regresion ya documentada del 17-ago.
- **Fix:** briefing movido a `utcH===12 && utcM>=3 && utcM<5` (8:03am Bolivia). Invocacion propia y liviana; lee el TC ya cacheado en KV.
- **Fix 2 (visibilidad):** el `catch(e)` del loop de envio se tragaba TODO error que no fuera 404/410 y luego marcaba `sentKey` **incondicionalmente** -> un push fallido era indistinguible de uno entregado (de ahi `already_sent_today:true` sin que llegara nada). Ahora se registra cada envio en KV `push_log:<syncKey>` (rolling 40, `GET /push-log?key=`) y **solo se marca el dia si al menos un device recibio**.
- **Endpoint nuevo `/force-smart?key=&type=`**: corre cualquier smart notif a demanda sin esperar su horario (borra la marca del dia primero). Ahorra un dia de espera por hipotesis; usarlo siempre para diagnosticar.
- **Formato de la marca:** `smart:<syncKey>:<YYYY-MM-DD>:<type>` (cuidado el orden).
- **Pendiente:** verificar manana ~8:03am y revisar `/push-log`. Si falla, el log ya trae el error exacto.
- **Nota aparte:** `lastSync` del blob quedo congelado en 2026-09-02T23:12Z. Sin relacion probada con esto, pero conviene vigilarlo.

## v5.14 - informe: atribucion por item + seccion transversal + alias

## TRAMPA Cloudflare: worker -> worker por workers.dev da 404 (31-ago)
- `/email-actions` de LBP hacia `fetch('https://briefing-diario-pepe.josechain.workers.dev/ventura-emails?key=...')` y recibia **404**, aunque desde curl externo el endpoint respondia 401/200 correctamente. El briefing worker NUNCA devuelve 404 (rutas desconocidas dan 200 con un texto de ayuda) -> el 404 lo genera Cloudflare al llamar de Worker a Worker por la URL publica de workers.dev en la misma cuenta.
- **Fix:** service binding en `lbplanner/wrangler.toml`:
  `[[services]]  binding = "BRIEFING_SERVICE"  service = "briefing-diario-pepe"`
  y en el codigo `env.BRIEFING_SERVICE.fetch(new Request('https://briefing.internal' + path))`, con fallback a fetch HTTP si el binding no existe. El mensaje de error indica `(binding)` o `(http)` para diagnosticar.
- **VERIFICADO en vivo:** 60 correos en ventana de 7 dias, 8 franquicias, items con tipo/fecha/nombres reales (Mango-Laura Conejero pagos interiorismo, AX-Mobik extension, PF Changs-Due Diligence, Johnny Rockets-FAT Brands API...). La cadena Outlook -> bridge -> KV -> service binding -> Claude -> .doc funciona punta a punta.

## v5.12-5.14 (31-ago): atribucion correcta de items del informe
- **v5.12 - bug de atribucion:** los items de checklist/subtareas heredaban el cliente del PROYECTO padre. Como "MARKETING Y VENTAS" tiene clientId=CK, items como "Reforzar campana agosto 50%, **Boss y Hugo**" aparecian bajo CK. Fix: `itemBucket(text, fallback)` detecta la marca por el **texto del propio item** y solo hereda si no nombra ninguna.
- **v5.13 - proyectos transversales:** regla nueva = un proyecto es "de marca" solo si su **NOMBRE** nombra una franquicia (`CK`, `MANGO`, `Mango VSur`). Si la marca aparece solo en la descripcion, es transversal (`isTransversal`) y sus items genericos van al bucket `general[projName]`, renderizado como seccion **"Marketing general y otras areas"** agrupada POR PROYECTO. Descubrimiento: los transversales no son marketing, son **otros locales del mall** (PF Changs, Fogo de Chao, Johnny Rockets, Edikted, RRHH, Pedidos Ya, Lucy). Antes se descartaban enteros -> por eso los totales SUBIERON (24->32 completados).
- **v5.14 - alias de clientes:** nuevo `window._LBP_CLIENT_ALIASES = { 'Boss': ['Hugo','Hugo Boss'], 'Kids Delux': ['Delux'] }`, consumido por `_detectClientId` junto a businessName/name/contactos. Hugo y Boss = misma empresa, tiendas distintas; el campo `meta` de cada item conserva el proyecto de origen (BOSS / HUGO / DELUX) para no confundir tiendas.
- **Verificacion:** siempre probar `_buildWeeklyReport` en Node con los datos reales de `/sync` antes de desplegar (ver tecnica en v5.09). Detecto estos 3 bugs asi.

## v5.11 - informe con comunicaciones de correo (Outlook)

## v5.11 (30-ago): informe integra el correo de Ventura Mall (Outlook) con analisis IA
- **Hallazgo clave:** ya existia un puente a Outlook funcionando en `~/Documents/Projects/Briefing Diario/bridge/ventura_bridge.py`. Lee `jchain@venturamall.bo` via **AppleScript/osascript** contra Outlook local, sin contrasenas (secreto en Keychain: `-a briefing -s briefing-ingest-secret`), corre por launchd, publica en `POST /ingest-ventura` -> KV `ingest_ventura`. **Razon de existir:** SmarterMail de Ventura solo ofrece IMAP sin cifrar (puerto 143, el 993 cerrado) -> conectarse por red mandaria la password en texto plano.
- **Decision de arquitectura:** REUSAR el bridge, no duplicarlo. LB Planner es una pagina web y NO puede leer Outlook local; copiar la logica implicaria un segundo launchd + Keychain + AppleScript que mantener.
- **Cambios en el bridge:** `DAYS_BACK` 14->30 (cubre el informe mensual), `MAX_EMAILS` 60->200, `snippet` 250->**1500 chars** (250 no alcanzaba para acuerdos/negociaciones).
- **Worker del Briefing:** nuevo `GET /ventura-emails?key=<INGEST_SECRET>` (devuelve el KV `ingest_ventura` con CORS); cap de guardado 100->300.
- **Worker LBP:** nuevo `GET /email-actions?days=N` -> trae los correos del briefing, filtra por ventana, y hace que Claude extraiga por franquicia items {tipo: ACUERDO/NEGOCIACION/ACCION/COMUNICACION/PENDIENTE, texto, fecha}. Devuelve JSON. Degrada elegante: si falta el secreto o falla, devuelve `{error}` y el informe se genera igual. Requiere secreto **`BRIEFING_KEY`** = el INGEST_SECRET del briefing.
- **App:** nuevo `window._generateReport(data,days,label)` (async) reemplaza la llamada directa del menu: arma el informe, hace fetch a `/email-actions`, adjunta `rep.emailActions` y exporta. Timeout de 45s -> si la IA tarda, exporta sin esa seccion. Seccion nueva en el .doc: "Comunicaciones con franquicias (correo)" con chips de color por tipo.
- **TRAMPA CRITICA encontrada:** el `wrangler.toml` del Briefing Diario tenia `crons = []` mientras el cron REAL (`30 12 * * *` = 8:30am Bolivia) vivia solo en el dashboard. Desplegar con ese toml **habria borrado el cron y matado el briefing diario**. Se corrigio el toml antes de desplegar. Misma trampa que ya estaba documentada para el worker de LBP: **siempre verificar crons en el toml antes de `wrangler deploy`**.

## v5.09 — informe completo (selector de período + captura total)

## v5.08/v5.09 (30-ago): Informe de actividades — selector de período + cobertura completa
- **v5.08:** `_buildWeeklyReport(data, days, periodLabel)` parametrizado (antes 7 días fijos). Menú Herramientas ahora tiene 3 ítems: **Informe 1 semana / 3 semanas / 1 mes** (7/21/30 días). Título, período y nombre de archivo dinámicos. ⚠️ El menú REAL que se renderiza está ~17919 (bloque `nav-item` explícito), NO el array `items:[...]` de ~17715 — hay que tocar AMBOS o el cambio no se ve.
- **v5.09 — RAÍZ del "informe incompleto":** el filtro exigía prioridad alta/media **Y** clientId. Medido con datos reales (21 días): **18 tareas completadas, 0 con clientId** → solo 6 salían (rescatadas por match de texto del nombre de marca). Checklists: **83 ítems (29 tildados) → 0 aparecían**. 18 tareas abiertas todas vencidas → invisibles.
- **Fix v5.09:** eliminado el filtro de prioridad (ahora se **muestra** como chip de color URGENTE/ALTA/MEDIA/BAJA en vez de filtrar). Añadido: sección **"SIN ASIGNAR A FRANQUICIA"** (bucket `unassigned`), **parseo de checklists** de descripciones (`parseChecklist` → done/pending), columna **PENDIENTE** (vencidas + por vencer), **finanzas** del período (transactions), **documentos** agregados, **próximos 7 días** (reuniones + vencimientos). Resultado: 6 → **47 completados, 26 en curso, 68 pendientes**.
- **Filtro de alcance:** solo excluye `category==='Personal'` (3 ítems). Las categorías NO son confiables — el tool `__catwork` marcó 85 tareas como 'Work' incluyendo personales ("Comprar pañales"). Decisión consciente del usuario: prefiere ruido a perder datos.
- **Layout:** KPIs (Completado/En curso/Pendiente/Franquicias) → por franquicia con 3 bloques color-coded → Sin asignar → Marketing → Finanzas → Documentos → Próximos 7 días → Plan (manual).
- Patch: `scratchpad/patch_report.py` (splice por marcadores, funciones nuevas en `new_build.js`/`new_export.js`).
- **Testing:** se puede generar el .doc en Node sin navegador — `eval` de las 3 funciones window.* + stubs de `Blob`/`URL`/`document` para capturar el HTML. Muy útil para verificar antes de desplegar.

## v5.07 (29-ago): tildar checklist (descripción) no persistía

## v5.07 (29-ago): tildar checklist (descripción) no persistía
- **Síntoma:** tickear ítems de un checklist en la descripción de un proyecto (modal Edit) + Guardar NO guardaba; volvía a salir sin tildar. Tampoco se podía tildar desde la vista de resumen (tarjeta). Mac.
- **RAÍZ:** en el editor (`rte-body` contenteditable) el checkbox tiene `contenteditable=false` (clickeable), pero al tildarlo solo cambia la *property* `checked` del DOM, NO el *atributo* `checked` que serializa `innerHTML`, y un click en checkbox NO dispara `onInput` → `handleInput()`/`onChange` nunca corría → Guardar reescribía el HTML viejo. La vista de resumen (`RichContent`, dangerouslySetInnerHTML) era read-only sin callback.
- **Fix 1 (editor RTE ~2148):** añadido `onClick` al contenteditable: si el target es checkbox, refleja property→attribute (`setAttribute/removeAttribute 'checked'`) y llama `handleInput()`. Corre DESPUÉS de que el box togglee.
- **Fix 2 (`RichContent` ~2166):** prop opcional `onToggle(newHtml)` + `ref`; onClick sobre checkbox refleja attr y llama `onToggle(ref.innerHTML)`. Wired en la tarjeta de proyecto (ProjectsScreen ~5617) → `setData` actualiza `p.description`. Ahora tildar en el resumen persiste.
- **Pendiente/menor:** los modales de detalle viewProject/viewTask/journal aún usan `RichContent` sin `onToggle` (read-only). Si Pepe quiere tildar ahí también, pasar `onToggle` con el `setData` correspondiente.

## v5.06 (24-ago): pre-recordatorios faltantes → RAÍZ = sync-up roto por sendBeacon
- **Síntoma:** el "pre-recordatorio" del día anterior (worker smart-notif `deadlines`, 21:00 UTC / 5pm Bolivia, tareas/reuniones con dueDate=mañana) solo llegó para 2 tareas. Confirmado: la nube solo tenía **2 tasks con dueDate=hoy** (exactamente las 2 avisadas). El resto de tareas de hoy, creadas en el cel, NO estaban en la nube.
- **RAÍZ:** `_flushCloudSync` (flush al cambiar de app, HTML ~880) usaba `navigator.sendBeacon` → **límite ~64KB**; el blob de datos es **~4MB** → sendBeacon **fallaba siempre** → los datos del cel nunca subían. (keepalive:true tiene el mismo cap 64KB.) Por eso el DATA-sync del cel llevaba días congelado aunque el POST /sync normal daba 200 desde la Mac.
- **Fix:** `_flushCloudSync` ahora usa **fetch normal** (sin sendBeacon/keepalive) — en `visibilitychange:hidden` la página sigue viva y el fetch de 4MB alcanza a completar. + debounce del sync **2000→800ms**.
- **Distinción clave:** ALARMAS por hora van por `/alarms/batch` (KV, ya confiable v5.05). Los PRE-RECORDATORIOS y el display cross-device dependen del DATA-sync (`data:${syncKey}`), que es lo que arregla v5.06.
- Pendiente verificar: que tras v5.06 el cel suba datos (ver `_cloudSaveTime` y task count en /sync suben al crear tareas en el cel).

## v5.05 (17-ago): alarmas del CELULAR no llegaban a la nube — 2 fixes ✅ VERIFICADO
- **PRUEBA EXITOSA:** task "prueba2" creado en el CELULAR con app en segundo plano → llegó al KV, sobrevivió (no lo borró la Mac), el cron lo disparó 11:59, y **sonó en AMBOS (cel + Mac)**. El caso que fallaba (Carles) quedó resuelto.

- **Diagnóstico definitivo** (consola Mac + KV): el `POST /sync` da **200 desde la Mac** → la Mac SÍ sincroniza. Pero tareas creadas en el **CELULAR** (prueba/synctest/Carles) NO llegan a la nube; solo "synctest 2" creada en la Mac llegó. **El celular (Samsung) manda la app a segundo plano antes de completar las llamadas async a la nube.** La alarma sonó igual por el **timer local** del cel despierto.
- **Fix 1 (worker `/alarms/batch`): MERGE (union por alarmId), NO replace-all.** Antes, la Mac con datos viejos mandaba su lote y **borraba** las alarmas que el cel había subido (Carles). Ahora une; descarta alarmas >1h pasadas. **Protege incluso contra clientes viejos** (es server-side).
- **Fix 2 (app): flush de alarmas con `keepalive:true` + disparo inmediato en `visibilitychange:hidden` y `pagehide`** (HTML ~911, ~933). Antes esperaba 800ms y usaba fetch normal → si Samsung mataba la app en ese lapso, la alarma nunca subía.
- **OJO:** la Mac vieja aún puede borrar vía DELETE /alarm (reconciliación v5.02). Por eso AMBOS devices deben ir a v5.05. El merge del worker protege el path batch, pero no el DELETE individual.
- **PENDIENTE:** el DATA-sync (`POST /sync`) del CELULAR sigue sin completar (Samsung). Afecta display cross-device y worker isDead, NO el disparo de alarmas (que van por /alarms/batch, ahora con keepalive). Investigar hacer el /sync resiliente (keepalive/beacon inmediato) si el usuario lo pide.

## CRÍTICO (17-ago): alarma real no sonó → 2 causas encadenadas
1. **Borrado cross-device (bug MÍO, arreglado v5.04):** la "reconciliación de huérfanas" (v5.02) y la "purga visibilitychange" (v5.03) borraban de la nube alarmas cuya entidad no estuviera en los datos LOCALES. Un device con datos viejos (Mac, que no sincronizó un task creado en el cel) **borraba alarmas REALES**. Atrapado EN VIVO: alarma "Prueba" (11:28) estaba en KV 11:26:20, borrada 11:26:38 (antes de sonar). **v5.04 removió TODO borrado cliente por ausencia**; la limpieza de completados la hace solo el worker (fire-time isDead, presente+completado).
2. **SYNC-UP ROTO (raíz más profunda, PENDIENTE):** `data:${syncKey}` en la nube está **congelado desde el 14-ago** (73 tasks, createdAt máx 2026-08-14; task "prueba" de hoy NO está). Blob nube=4.29MB (bajo el límite 20MB). El `POST /alarm` SÍ funciona (alarmas llegan al KV) pero el `POST /sync` NO actualiza la nube hace 6 días. Consecuencia: worker isDead + cualquier validación operan con datos viejos; cross-device roto.
   - Sync-up code: HTML ~844 (debounce 2s → pull → `_mergeCloudData` → `POST /sync`), loguea `[LBP SYNC] Push result: <status>`. **Siguiente paso: abrir consola en el device y leer ese log** (413=too large; 200=merge descarta datos nuevos; undefined=red). Merge `_mergeCloudData` por-item con `updatedAt`/`_cloudSaveTime` — sospechoso de descartar items nuevos.
- **DELETE guard** (worker rechaza borrar alarma si owner activo en cloud data): probado y **REVERTIDO** — con sync roto, un completado de hoy no sube → guard rechazaría apagar su alarma → sonaría. No usar hasta arreglar sync.
- **Nota:** la alarma de hoy sonó por el **temporizador LOCAL** del cel (despierto), no por la nube. El briefing 8am de hoy SÍ llegó con TC (Bs 11.52) — fix briefing OK.

## Fix: la validación de alarmas del worker mataba el envío del briefing (17-ago-2026)
- **Regresión** del fix anterior: la validación descargaba+parseaba `data:${syncKey}` (blob grande: 73 tasks, 19 proyectos...) **cada minuto**. En el tick **12:00 UTC** (que ADEMÁS refresca TC con varios fetches y genera el briefing con Opus 5) esa carga extra abortaba la invocación **antes** del `sendPush` del briefing → `briefing_ai` se guardaba (línea 680, antes del send) pero la notificación no llegaba. Diagnóstico: `/dailyinfo-log` mostró cron corriendo 12:00/12:01; `/briefing-ai?key=&date=` mostró el briefing generado 12:00:19 → probó que corrió pero no envió. `/test-push` = 3/4 OK (canal sano). NO era Samsung.
- **Fix:** el cron solo descarga/parsea el blob cuando hay una alarma **time-due** ese minuto (`if(!timeDue.length) continue;` antes de tocar data). + `try/catch` por syncKey para que nada aborte el bloque de smart-notifs. El bloqueo de completados sigue (se valida al disparar).
- **TC en briefing:** el TC oficial solo se anteponía al PUSH (line 672), no al `summary` guardado → no se veía en la app. Ahora `summary: tcLine + stripMd(aiText)`.
- **Dónde ve el briefing la app:** Home, tarjeta colapsable "🌅 Briefing del día" (fetch `/briefing-ai`, HTML ~4141).

## Diagnóstico profundo con wrangler (17-ago-2026)
- **wrangler CLI está instalado y autenticado** como josechain@gmail.com. Worker="life-planner". KV LBP_KV id=`308c3def2b0e468798011665598009a2`. R2 bucket=`lbp-files` (binding LBP_R2). Secrets: ANTHROPIC_API_KEY, OPENAI_API_KEY, JINA_API_KEY (persisten entre deploys). Se puede `npx wrangler deploy` (creé `wrangler.toml` con name/main/compat 2024-11-06/KV/R2/`crons=["* * * * *"]` — OJO: incluir crons o el deploy los borra) y `npx wrangler tail life-planner --format json` (JSON multi-línea, cpuTime~59ms, outcome ok).
- **Hallazgo 1:** el cron NO se aborta (cpuTime 59ms, exceptions []). La regresión del briefing NO era CPU/abort.
- **Hallazgo 2 (clave):** las pruebas por inyección de alarmas en KV son **INVÁLIDAS** — la app abierta borra del cloud las alarmas "huérfanas" (reconciliación v5.02 + purga visibilitychange v5.03) ANTES de que el cron las dispare. En el tail: la alarma inyectada desapareció del KV pero el cron nunca la puso en `due` (0 logs). Para probar el cron real hay que cerrar la app en TODOS los devices.
- **Hallazgo 3:** endpoint temporal `/debug-push?key=&big=0|1` probó que el servidor entrega a FCM OK **tanto push pequeño como grande (380 chars, emojis+saltos, tipo briefing)** → los 3 subs OK. El handoff server→FCM del briefing FUNCIONA. Endpoint ya removido (worker restaurado limpio).
- **Conclusión provisional:** server+FCM OK para el briefing. El fallo del briefing de hoy quedó como entrega en el device (Android/Samsung tras idle nocturno) o hiccup transitorio, NO el código. Pendiente confirmar con el usuario si llegaron los 2 debug-push y esperar el briefing real de mañana 8am.

## Fix DEFINITIVO worker: validación autoritativa de alarmas en cron (16-ago-2026)
- **Causa raíz REAL** (tras 3 chats): un SEGUNDO dispositivo (Mac con versión vieja del app, sin el guard de v5.00) re-registraba las **60 ocurrencias** diarias del task DONE "Seguimiento despacho Mango" en KV cada vez que corría `scheduleAlarms`. Confirmado: borré las 60 → reaparecieron 60 completas. Ningún fix cliente puede ganar esto (cualquier device re-crea).
- **Fix server-side (100%):** el cron (`scheduledHandler`, worker.js ~1066) ahora carga `data:${syncKey}`, arma `deadIds` (entidades completadas: DONE/CANCELLED/ARCHIVED/done/completed, incl. subtasks y milestones anidados) y: (1) **no dispara** ninguna alarma cuyo owner esté en deadIds; (2) **purga del KV** todas sus ocurrencias (`remaining = !fired && !isDead`). **Self-healing:** aunque un device viejo re-suba las 60, el cron las borra en el siguiente tick (1 min). ⚠️ Requiere DEPLOY del worker.
- **Pendiente usuario:** desplegar worker + actualizar/cerrar la Mac (corre versión vieja que re-registra). Con el worker desplegado ya no importa, pero conviene.
- Guard: si `data:${syncKey}` no existe/parsea, deadIds=[] → dispara como antes (no sobre-purga).

## Fix RAÍZ: cola local (lbp_pending_alarms) revivía alarmas de completados (v5.03, 16-ago-2026)
- **Diagnóstico definitivo** (con `/sync` y `/list-alarms`): el task "Seguimiento despacho Mango" (`ms7mfmq6aacu64b0smj`) estaba `status:DONE` y la nube quedaba limpia tras borrarlo, PERO seguía sonando a las 10:00. Causa: `lbp_pending_alarms` (localStorage del cel) aún tenía sus ocurrencias, y el **re-sync en `visibilitychange`** (POST /alarm por cada pending futura) las **re-subía a Cloudflare** cada vez que la app se hacía visible → el cron las disparaba → loop. Reconciliación v5.02 las borraba pero el re-sync las revivía.
- **Fix (v5.03):** al inicio del handler `visibilitychange` se **purga `lbp_pending_alarms`** dejando solo alarmas de entidades ACTIVAS (con `alarm.enabled` y NO completadas; incluye `subtasks` y `milestones` anidados). Las muertas se borran además de la nube (DELETE /alarm). Guard `_loaded`: no purga si `lbp2026_data` aún no tiene datos (evita borrar válidas en arranque).
- Lección: hay 3 capas de estado (nube KV, `lbp_pending_alarms` local, timers del SW). Cancelar solo una no basta; el re-sync local→nube en visibilitychange puede revivir lo borrado. Cualquier "completado que sigue sonando" → revisar las 3.

## Reconciliación de alarmas huérfanas + limpieza KV (v5.02, 16-ago-2026)
- **Diagnóstico con /list-alarms:** el task completado "Seguimiento despacho Mango" (`ms7mfmq6aacu64b0smj`) tenía **60 ocurrencias** vivas en Cloudflare KV → seguía disparando push a las 10:00. Quedaron huérfanas desde ANTES de v5.00 (task ya inactivo → scheduleAlarms no lo revisita). **Borradas manualmente** las 60 vía `DELETE /alarm?key=&id=`.
- **Fix estructural (v5.02):** nuevo bloque en el useEffect [data] que 1x por sesión (`window._lbpReconciledAlarms`) hace `GET /list-alarms`, arma set de entity.ids válidos (con alarma habilitada y NO completados, incl. subtasks) y borra del KV toda alarma cuyo `alarmId` no empiece con `<validId>_`. Guard: si `_validIds.length===0` NO reconcilia (evita borrado masivo en arranque sin datos).
- **Worker OK confirmado:** `/test-push` devolvió sent 3/3 → pipeline Cloudflare→FCM→cel funciona. La causa de "solo llegan al abrir la app" es **Samsung matando Chrome** (battery + Deep sleeping apps). Datos device: Worker `https://life-planner.josechain.workers.dev`, syncKey `lbp_0mnvmyv9uh8wciya`, 3 subs registradas.

## Fix: "(Missed)" seguía apareciendo para tasks completados (v5.01, 15-ago-2026)
- v5.00 arregló `scheduleAlarms` (re-registro + cancelación en la nube), pero había **3 caminos más** que disparaban alarmas SIN excluir completados. Todos ahora saltan `status` DONE/CANCELLED/ARCHIVED o `done/completed===true`:
  1. `check()` en vivo (~17509) — disparo cuando la app está abierta.
  2. bucle "(Missed)" de entidades en useEffect (~17571).
  3. bucle "(Missed)" de subtasks (~17596) — usa `done`.
  4. missed por `lbp_pending_alarms` (visibilitychange, ~3650) — ahora cruza contra `lbp2026_data` y descarta IDs de entidades muertas (`_isDead` por prefijo `id_`).
- Clave localStorage de datos = **`lbp2026_data`**. IDs de alarma = `entity.id + '_' + occMs` (+`_r<n>`).

## Fix: alarma de task recurrente seguía disparando tras completarlo (v5.00, 14-ago-2026)
- **Causa raíz:** tasks completados quedan en `data.tasks` con `status:'DONE'` (no se borran). `scheduleAlarms` NO los excluía → cada cambio de datos re-registraba las ocurrencias diarias en Cloudflare, y las ya guardadas en KV nunca se cancelaban.
- **Fix:** `scheduleAlarms` ahora salta entidades completadas (`status` DONE/CANCELLED/ARCHIVED, o `done/completed===true`) y llama `_cancelEntityCloudAlarms(entity,alarm)`: recalcula ocurrencias (IDs deterministas `eid_<occMs>` + `_r`) y las borra vía `_cloudCancelAlarm` (DELETE /alarm), además purga `lbp_pending_alarms`. Dedup por page-load (`window._lbpCanceledDone`); si se reactiva la tarea, se re-programa normal.
- Aplica a TODOS los tipos (tasks/goals/projects/etc). Se arregla solo al abrir la app con la tarea completada presente en los datos.

## Grabación en segundo plano — MediaRecorder + Whisper (v4.99, 9-ago-2026) ✅ COMPLETO
- **Motivo:** Pepe necesita usar el cel (WhatsApp/correo/calc) MIENTRAS graba. Web Speech API NO lo permite. Solución: motor **MediaRecorder** (graba audio a blob, sobrevive al background) + transcripción con **OpenAI Whisper** server-side.
- **Worker:** `POST /transcribe` (audio blob en body -> `whisper-1` -> `{text}`), query `?lang=es|en`, límite 25MB, secret `OPENAI_API_KEY`. Desplegado + secret puesto.
- **Frontend (Reuniones Y Journal):** `recStart/jRecStart` piden `getUserMedia({audio})`, MediaRecorder con mime auto (webm/opus, fallback mp4/ogg), `.start(5000)` (timeslice 5s), timer mm:ss, wake lock. `recStop/jRecStop` → `onstop` → `recFinishRef/jRecFinishRef.current()` arma Blob, sube a `/transcribe?lang=` (es-BO→es, en-US→en) y vuelca en `recFinal/jRecFinal`; luego flujo de summary existente intacto. Estados nuevos: `recTranscribing/jRecTranscribing`, `recElapsed/jRecElapsed`, refs `recMRRef/recChunksRef/recStreamRef/recTimerRef/recFinishRef` (idem jRec*). `_recCleanup/_jRecCleanup` en open/close.
- **Journal ahora SÍ tiene** pantalla oscura (`jRecSleepScreen`, overlay antes del jRecModal) + wake lock + `visibilitychange` re-adquiere.
- **Ya NO hay transcripción en vivo** durante la grabación (Whisper es batch): se muestra timer + aviso "grabando en segundo plano"; el texto aparece al parar.
- **Limitación inevitable:** una LLAMADA telefónica le quita el mic al navegador (interrumpe la grabación).

## Pantalla oscura + wake lock de grabación (v4.98, 6-ago-2026)
- Grabador de reuniones (MeetingsScreen): tiene "🌙 Pantalla oscura" (`recSleepScreen`, overlay negro in-page con punto rojo pulsante + "Toca para volver") que mantiene la PAGINA activa (no bloquea el cel) para que la grabacion siga. Pide `navigator.wakeLock.request('screen')` en `recStart`, lo libera en `recStop`.
- **Hueco corregido:** el Wake Lock API se libera solo al ocultarse la pagina (bloqueo/cambio de app) y NO se re-adquiere. Añadido `useEffect` con `visibilitychange`: al volver a visible mientras `recRunRef.current`, re-pide el wake lock (si `!current || .released`) y hace `recSRRef.current.start()` (nudge) por si el reconocimiento se corto. Meetings only por ahora; journal (jRecStart) NO tiene wake lock ni pantalla oscura (posible follow-up).
- Limitacion Web Speech API: si el usuario BLOQUEA el cel (boton power), la pagina se oculta y el audio de ese lapso se pierde (la API no graba con pantalla bloqueada). Por eso hay que usar "Pantalla oscura" en vez del boton power. Solo Chrome/Chromium Android (S24 Ultra OK; iOS Safari no).

## Grabación de voz — idioma ES-BO / EN (v4.97, 6-ago-2026)
- Transcripción = **Web Speech API del navegador** (`SpeechRecognition`, Chrome/Chromium), NO Claude. Claude solo resume después (`/chat`, prompts ya dicen "usa el idioma de la transcripción"). ⚠️ La Web Speech API maneja **UN idioma por sesión** — no transcribe ES+EN simultáneo/mezclado bien.
- 2 grabadores: `recStart` (reuniones ~7756) y `jRecStart` (journal ~4962). Antes `sr.lang='es'` (genérico). Ahora `sr.lang=(localStorage.getItem('lbp_rec_lang')||'es-BO')` → default **es-BO** (español Bolivia, mejor acento).
- Añadido **selector 🇧🇴 Español / 🇺🇸 English** en ambos grabadores (visible cuando !active), estados `recLang`/`jRecLang`, persiste en `lbp_rec_lang`. Para una reunión en inglés, elegir 🇺🇸 antes de grabar.
- Limitación honesta comunicada a Pepe: no hay API de navegador que transcriba perfecto una conversación mezclada ES+EN a la vez; el selector cubre el caso práctico (reunión mayormente en un idioma). Solo app.

## Fix: brainstormProfile no guardaba (v4.96, 6-ago-2026)
- Sintoma: en el brainstorm, el boton "Save Profile" no hacia nada al pegar el perfil. Causa probable: textarea CONTROLADO (`value:profileDraft`) + gate `disabled:!profileDraft.trim()`; un quirk de pegado/teclado en movil dejaba el estado vacio → boton deshabilitado → "no pasa nada".
- Fix (BrainstormScreen ~15650): textarea **no controlado** (`defaultValue`+`ref=profileRef`, se mantiene onChange solo para UI), `saveProfile` lee `profileRef.current.value` como fuente autoritativa, quitado el gate `disabled`, y el boton Clear tambien limpia el ref. Ademas salvaguarda en `_mergeData` (~766): conservar `brainstormProfile` no vacio de cualquier lado para que la sync no lo borre (es escalar, no esta en `_SYNC_LISTS`).
- Verificado en vivo por curl+grep (4 marcadores presentes en v4.96). Solo app.
- Nota de testing: la app cachea el shell (SW, v4.91); para ver una version nueva en un navegador limpio hay que unregister SW + `caches.delete` + navegar con `?cb=` o 2 refreshes.

## Brainstorm IA nutrido para sobrestock (v4.95, 4-ago-2026)
- BrainstormScreen (~15623) tiene areas con `SYSTEM_PROMPTS` por area + `brainstormProfile` del usuario que se antepone. Modelo Opus 5 via /chat.
- Añadida area **"Sobrestock"** (rojo #E53935, 🏷️) = experto internacional en retail/ventas LatAm (Bolivia) para **reducir sobrestock fuerte y rapido** (stock vigente vs vencido/obsoleto). Caja de herramientas: precio/oferta (markdown por antiguedad, combos, cajas misteriosas), canales (live selling, WhatsApp difusion/grupos VIP, ferias, mayoristas/lotes, marketplaces de saldos), urgencia/gamificacion, incentivos al equipo de ventas, B2B/donacion RSE, CRM/influencers, merchandising, y datos (ABC, sell-through). Da ideas especificas + como ejecutar + metrica; separa vigente (margen) vs obsoleto (velocidad).
- Enriquecidos prompts Sales y Marketing con contexto retail LatAm/Bolivia + tacticas (live selling, WhatsApp, ferias, cuotas/QR). Corregido bug: Branding decia "Panama" → "La Paz, Bolivia".
- Patch: `scratchpad/patch_brainstorm.py`. Solo app (GitHub Pages), sin worker.

## Goal Clarity Coach — nutrido con 3 videos Tony Robbins (v4.94, 4-ago-2026)
- Reescrito `GC_SP` (system prompt del coach, HTML ~9280) integrando 3 marcos de los videos que pasó Pepe: (A) **RPM for Planning** = Resultado/Proposito/MAP; (B) **7 pasos "The Path"** (fHVzWwRMTtE/CwsBMt4yP50/HiVu2Lcv6vA): 1 que quieres realmente, 2 enfrenta la verdad, 3 crea MAP, 4 haz lo dificil, 5 practica diaria, 6 sube estandares y mide, 7 celebra/contribuye; (C) **80% psicologia / 20% mecanica** (estado=fisiologia/lenguaje/foco, historia, estandares). Secuencia de 9 preguntas (una por mensaje): resultado→especificidad/medicion→enfrentar la verdad→POR QUE es un MUST (+crecimiento/contribucion)→palanca dolor/placer→nuevo estandar/identidad→psicologia/estado→MAP+lo dificil→practica diaria. Mantiene el mismo bloque de salida `[[GOAL]]{title,description,vision,targetDate,period,category,firstAction,whyPain}` (sin cambio de schema/código; los conceptos nuevos se pliegan en esos campos).
- Enriquecido el prompt de generación de plan (MAP): pide hitos que muevan la aguja + 1 accion DIFICIL + 1 habito/practica diaria.
- Patch aplicado con `scratchpad/patch_coach.py` (regex, comillas JSON escapadas `\\"`). Solo app (GitHub Pages), sin worker. El modelo IA sigue siendo Opus 5 vía /chat.

## Auditoría de alarmas (v4.93, 4-ago-2026)
- **Cobertura OK:** 10 módulos con alarma (tasks/goals/projects/journal/routines/habits/medications/householdTasks/workouts/meetings) cubiertos consistentemente en agendar (HTML ~17418), check local `types` (~17355) y missed (~17431). Subtareas de proyectos: agendadas + missed, pero NO en check() (menor; nube cubre). Dedup nube↔local vía `lbp_cloud_fired` (escrito por SW push, leído por check/missed como `_cloudFired`/`_cloudFiredM`, formato `id_<ms>`).
- **Hueco corregido:** check() y missed leían `al.datetime` fijo → NO disparaban recurrencia localmente (solo la nube v4.92). Añadido helper `_recentOccurrence(baseIso,rec,alarm,nowMs)` (ms-math para daily/weekly/custom-days/weeks/hours; stepping para monthly/weekdays/custom-months). check()/missed ahora usan la ocurrencia y clave `id_<ms>` que calza con el alarmId de la nube (`_futureOccurrences`). En Bolivia (sin DST) ambos coinciden exactamente; con DST podría desalinear 1h en transiciones (edge, aceptable).
- Worker cron: dispara alarmas due (ventana 6min) y las ELIMINA tras enviar (línea ~1059) → cada ocurrencia suena 1 vez. NO requirió cambios de worker.
- Repeticiones (`repeatIntervals`): aplican solo a la PRÓXIMA ocurrencia de un recurrente (occ[0]), no a las futuras occ[1..N]. Aceptable; si se quiere repetir cada día habría que expandir.

## Recurrencia de alarmas (v4.92, 4-ago-2026) — bug de fondo
- **La recurrencia NUNCA estuvo implementada.** `scheduleAlarms` tomaba `alarm.datetime` (timestamp fijo) y hacía `if (alarmMs < nowMs) return` → una alarma diaria con fecha pasada nunca se re-agendaba. `recurrence:'daily'` era solo cosmético (se guardaba/mostraba pero nada calculaba la próxima ocurrencia). Por eso la tarea diaria de Pepe no sonó ni ese día ni los anteriores.
- **Fix (solo app, sin deploy worker):** helper `_futureOccurrences(baseIso, rec, alarm, nowMs)` genera las próximas ocurrencias futuras (daily/weekly/monthly/weekdays/custom con customInterval/customUnit) con **horizonte 60 días / máx 62**. `scheduleAlarms` agenda occ[0] (primaria, con SW+local si <24h) y occ[1..N] solo en la nube. Cada apertura de la app re-extiende el horizonte (idempotente porque `/alarms/batch` reemplaza todo el set con TODAS las ocurrencias).
- **Bug latente corregido de paso:** el re-sync en `visibilitychange` usaba `/alarms/batch` (reemplaza TODO) con solo alarmas <24h → borraba las ocurrencias futuras. Cambiado a **upsert por `/alarm`** (no destructivo).
- El worker ya elimina cada alarma tras dispararla (cron línea ~1059), así que cada ocurrencia suena una vez. NO requiere cambios en worker.js.
- Limitación: horizonte 60 días; si la app no se abre en 2 meses, se agota. En la práctica se re-extiende en cada apertura.


## Offline (v4.91, 30-jul-2026) — IMPORTANTE
- **Bug hallado:** el "abrir offline" NUNCA estuvo realmente habilitado. `sw.js` no tenía handler `fetch` ni precache del shell, y **React/ReactDOM se cargan desde CDN** (cdnjs 18.2.0). Offline: el documento no cargaba (red colgada) y aunque cargara, sin React no renderiza. La data sí era local (localStorage/IDB).
- **Fix:** en `sw.js` — `SHELL_CACHE='lbp-shell-v1'`, precache en install de `['LifeBusinessPlanner2026.html','icon-192.png','icon-512.png', react.production.min.js, react-dom.production.min.js]` (best-effort por URL con `cache.add().catch`), `activate` limpia shells viejos, y handler `fetch`: (1) navegación/HTML → stale-while-revalidate; (2) React CDN + iconos → cache-first; (3) resto (worker API, DolarAPI, Google GSI) → passthrough a la red.
- ⚠️ **Requiere UNA visita ONLINE tras el deploy** para que el shell se cachee; después abre offline. **Cambio de comportamiento:** el HTML ahora es SWR → tras un deploy nuevo, el usuario ve el HTML anterior en la 1ª carga y el nuevo en la 2ª (la versión "atrasa" una carga). Para forzar update inmediato: 2 refreshes. Si algún día hay que romper cache del shell, subir `lbp-shell-v1`→`v2`.

## Sesión 29-jul-2026 (v4.88→4.90) — resumen
- **v4.88:** clima mojibake (worker→ASCII puro) + notificación repetida en cada refresh (dedup en `CHECK_MISSED` sw.js + persistir `alarmId+'_missed'` en `lbp_shown_alarms` antes de postear). Confirmado por Pepe: tarea "Pedir Claudia..." ya no se repite.
- **v4.89:** clima seguía mojibake en el cel porque la app cacheaba el dato viejo (<3.5h no re-fetchea). Fix: bump de clave de cache `lbp_dailyinfo2`→`lbp_dailyinfo3` → re-fetch fresco una vez. Confirmado OK.
- **v4.90:** modal Cloud & Sync cubría toda la pantalla SIN scroll (no se veía la versión al fondo). Fix: `maxHeight:'calc(100vh - 32px)' + overflowY:'auto'` en el contenedor interno (~línea 15964). El número de versión `vX.XX` vive al FONDO de ese modal.
- **También:** worker Opus 5 global (thinking disabled), cadena TC oficial dolarblue→Jina→DolarAPI, Goal Clarity Coach (fases 1-3) + hitos en Goals. Todo confirmado en vivo.
- Backups v4.90 creados en `backups/` (HTML+worker+sw, 20260729).

## Fixes v4.88 (2 bugs)
1. **Clima con mojibake (¸õÖ, Ma√±ana):** el copy-paste del `worker.js` al editor de Cloudflare corrompía los emojis LITERALES del clima (`_wmoEmoji`/`_meteoEmoji` devolvían `'☀️'` etc.) y la ñ. Fix: **todo el `worker.js` se convirtió a ASCII puro** (non-ASCII → `\uXXXX`) → inmune a corrupción de paste. Script usado: iterar por codepoint, `\u`+charCodeAt por code unit. Verificado `_wmoEmoji(0)='☀️'` + regex dólar OK. **Requiere re-deploy del worker.**
2. **Notificación repetida en cada refresh del cel:** `CHECK_MISSED` en sw.js no tenía dedup y el `visibilitychange` (HTML ~3532) disparaba missed alarms (ventana 4h) en cada foco sin marcarlas como mostradas. Fix: app persiste `alarmId+'_missed'` en `lbp_shown_alarms` ANTES de postear; SW deduplica CHECK_MISSED vía cache `lbp-fired-v1` (patrón igual a periodicsync). Va por GitHub Pages (HTML+sw.js).
**File:** `LifeBusinessPlanner2026.html` (~795KB)
**Hosted:** josechain-eng.github.io/**ibplanner**/LifeBusinessPlanner2026.html (⚠️ repo=`ibplanner`, NO `lbplanner` — /lbplanner/ da 404. Verificado 29-jul: /ibplanner/ sirve v4.88+)
**Worker:** https://life-planner.josechain.workers.dev

## Recent version history (v4.60+)
- v4.60 — Journal recording with link to task/project
- v4.61-62 — Gmail businessName search, Contact field in meeting form
- v4.63 — Smart Alerts Dashboard (HomeScreen: stale tasks, followup, etc.), meeting follow-up push notifications
- v4.64 — Chat con tus Datos (ChatScreen 💬), Store Management (Operations section in client form)
- v4.65 — Franchise Health Dashboard 🏪, Vista 360° per client, Email→Tasks
- v4.66 — AI Brief + 360° in project detail modal, etLoad state bug fixed
- v4.67 — clientType field (Franquicia/Proveedor/etc.), businessName for Gmail, Dashboard filters Franquicia only
- v4.68 — Multi-contacts per franchise (contacts[] array), meeting contact dropdown from franchise contacts
- v4.69 — Auto-detect contacts from Gmail (Claude extracts names+roles from email signatures)
- v4.70 — Fixed: card layout, AI no-hallucination prompts, 360° shows hints when 0 data, worker.js syntax errors fixed (extra } in smart notif chain)
- v4.75 — Long-press en celdas de día del week calendar (dashboard) abre nueva reunión pre-cargada con esa fecha (window._lbpNewMeeting = date string)
- v4.76 — Tarjeta "Daily Info" (entre Good Morning y Briefing): TC oficial BCB + cripto, clima Santa Cruz 3 días, calendario eventos retail/feriados próx. 3 meses

## Habits/Goals — Goal Clarity Coach (v4.85)
- Bug fix: modal "New Habit" en `HabitsScreen` no tenía guard `modal &&` (línea ~9304) → se abría sola y no cerraba. Arreglado.
- Botón "+ Add" del Habit Tracker ahora abre selector **Hábito / Meta** (`gcChooser`). Hábito = form actual; Meta = **Goal Clarity Coach**.
- Coach (Fase 1 de plan Tony Robbins): modal chat conversacional multi-turno vía `/chat`. States `gc1..gc6` (gcChooser/gcOpen/gcMsgs/gcInput/gcLoad/gcDraft). System prompt `GC_SP` guía RPM/OPA: resultado→específico/medible→fecha→POR QUÉ (must)→palanca dolor/placer→primera acción, UNA pregunta a la vez, no acepta vaguedades.
- Al lograr claridad el coach emite `[[GOAL]]{json}[[/GOAL]]`; la app lo parsea → `gcDraft` → tarjeta de revisión → `gcSave` guarda en `data.goals` (usa `vision`=el porqué; añade campos `firstAction`, `whyPain`, `coachChat`). Sale en la pantalla Goals existente, sin duplicar almacén.
- **Fase 2 + 3 hechas (v4.86):** coach ahora es stepper `gcStage` = 'chat'→'plan'→'routine'. States extra `gc7..gc11` (gcStage/gcPlan/gcPlanLoad/gcRoutineOn/gcRoutineTime). Funciones `gcResetCoach`, `gcGenPlan` (IA → JSON array de hitos → `gcPlan`[{id,text,sel}]), `gcTogglePlan`, `gcFinish`.
- `gcFinish` guarda TODO en un `setData`: (1) goal con `milestones`; (2) hitos seleccionados → `data.tasks` (status INBOX, `goalId`, tags:['Meta']); (3) si `gcRoutineOn` → hábito '🎯 '+title en `data.habits` con `alarm` recurrence:'daily' datetime tomorrowStr()+'T'+hora, description=priming del porqué. Usa globals `_defaultTaskForm()`, `tomorrowStr()`, `defaultAlarm()`.
- Fase Rutina reusa habits+alarmas existentes (push diario ya funciona vía scheduleAlarms al cambiar data). Todo verificado con node --check (0 errores). **Falta probar en vivo** (deploy GitHub Pages + hard refresh; el preview local es estático).
- **v4.87:** hitos con progreso DENTRO de GoalsScreen. Función `toggleMilestone(goalId,mId)` (junto a `updateProgress`) marca hito y recalcula `progress = round(done/total*100)` + status. UI en la tarjeta de meta entre la barra Progress y "Target": "📋 Hitos (done/total)" con checkbox por hito (⬜/✅, tachado si done). El slider/barra existente reflejan el progreso auto-calculado.
- **v4.87:** TODO lo que crea el coach (goal, tasks, hábito) va forzado a `category:'Personal'` (Pepe lo pidió explícito).
- ⚠️ **Push a GitHub:** el repo `github.com/josechain-eng/ibplanner` (ojo: "ibplanner") RECHAZA push si se comitean los .zip de `LBPlanner Backup/` (>100MB). Ya está en `.gitignore` (`LBPlanner Backup/`, `*.zip`, `.DS_Store`). Comitear solo los archivos relevantes, no `git add -A` a ciegas.

## Daily Info card (v4.76)
- Worker endpoint `GET /dailyinfo` → `{bcb:{venta}, crypto:{venta,compra}, weather:[{date,max,min,code,rain}], updatedAt}`, cached in KV `dailyinfo_v1`, lazy-refresh si >5h.
- `refreshDailyInfo(env)` en worker.js corre en cron a **00:10/12:00/20:00 UTC (8:10pm/8am/4pm Bolivia)**, ANTES del early-return de syncKeys. (Antes 11/16/22 UTC = 7am/12pm/6pm — BUG: ninguno caía después de las 8pm que es cuando el BCB publica, así que el briefing 8am usaba el TC del día anterior. Fix v4.87+: 8:10pm captura el valor recién publicado.) Cond: `(h===0&&mm>=10&&mm<12)||(h===12&&mm<2)||(h===20&&mm<2)`.
- **Diagnóstico (v4.87+):** `refreshDailyInfo(env, trigger)` escribe en KV `dailyinfo_log` (rolling, últimas 40) por cada corrida: `{t, trigger, bcbVenta, dolarFecha (fechaActualizacion de DolarAPI), cryptoVenta, errors}`. Triggers: `cron:HH:MMUTC`, `force`, `lazy`. Leer con `GET /dailyinfo-log`. Sirve para saber si el refresco de las 7am corrió y qué le devolvió DolarAPI (¿caso A fuente retrasada, o caso B refresco no corrió/falló?).
- ⚠️ **DEFINITIVO (v4.87+, 29-jul-2026):** el diagnóstico probó que **DolarAPI se atrasa ~13h** respecto al BCB (BCB publica 8pm; DolarAPI recién refleja el valor ~9am del día siguiente). Ejemplo: BCB=11.80 el mié 29 desde 8pm del 28, pero DolarAPI seguía en 11.54 a las 8am del 29. → **Fuente oficial cambiada a BCB directo** `https://www.bcb.gob.bo/` parseando `<span class="bcb-tco-num">11,80</span>` (regex `/bcb-tco-num[^>]*>\s*([0-9]+[.,][0-9]+)/i`, coma→punto). DolarAPI queda solo como **respaldo del oficial** + fuente de cripto. El log registra `bcbSource` = 'bcb' | 'dolarapi'.
- ✅ **RESUELTO (29-jul-2026, confirmado `bcbSource:'bcb'` 11.8):** el fetch directo a bcb.gob.bo desde el Worker da **HTTP 429** (challenge anti-bot a IPs datacenter de CF) — confirmado con `/debug-bcb`. Solución: se lee el BCB vía **proxy lector `https://r.jina.ai/https://www.bcb.gob.bo/`** (trae el texto desde infra de Jina, no desde la IP bloqueada). Parser: regex `/Bolivianos por d[oó]lar estadounidense[\s\S]{0,140}?([0-9]{1,2}[.,][0-9]{2})/i`, coma→punto, rango 1-100. Fuente real, mismo día, sin lag. DolarAPI = respaldo (13h lag) + cripto.
- **OBSERVADO en vivo (29-jul):** Jina es **inestable** — a veces 429, a veces renderiza otra vista del BCB sin el valor (`jina:no-match:Pasar al contenido principal SOBRE EL BC...`). dolarblue en cambio fue directo/estable/sin límites y cubrió correctamente (11.8). Considerar reordenar a dolarblue-primero si sigue el patrón (pendiente decisión de Pepe).
- **Cadena de fuentes del oficial (v4.87+, ee28e7b — REORDENADA):** (1) **dolarbluebolivia.click** directo (Astro server-render, `<span class="faq-official">Bs 11.80</span>`, regex `/faq-official[^>]*>\s*Bs\s*([0-9]{1,2}[.,][0-9]{2})/i`, SIN rate limit, la más estable) → (2) BCB real vía Jina (autoritativo pero inestable: 429/render variable) → (3) DolarAPI (13h lag). Cada una corre solo si la anterior falló. `bcbSource` = 'dolarblue' | 'bcb-jina' | 'dolarapi'. dolarboliviahoy.com NO sirve para oficial (solo trae el paralelo en HTML plano; oficial por JS).
- ⚠️ Jina free tier: **rate limit por-IP** (429 "Per IP rate limit exceeded"). Los Workers comparten IPs de salida → puede saltar ocasionalmente. Mitigación en código: 1 reintento + header opcional `Authorization: Bearer $JINA_API_KEY` si existe el secret `JINA_API_KEY` (sube el límite, por-clave). **Para robustez total: crear key gratis en jina.ai → añadir secret `JINA_API_KEY` en el worker.** Sin key funciona (3 refrescos/día espaciados rara vez chocan el límite), pero la key lo blinda. Si Jina falla, cae a DolarAPI y el log muestra `bcb-jina:...` + `bcbSource:'dolarapi'`.
- Endpoint `/debug-bcb` era temporal, ya removido. Monitoreo ongoing: `/dailyinfo-log` (campo `bcbSource` + `errors`). dolarboliviahoy.com sigue JS-rendered (no sirve). Arreglo inmediato del cache cualquier día: `GET /dailyinfo?force=1`.
- Fuentes (v4.78, KV key `dailyinfo_v2`): **TC** = DolarAPI `bo.dolarapi.com/v1/dolares` (casa 'oficial' y 'binance'); fallback cripto CriptoYa `criptoya.com/api/usdt/bob/1` (binancep2p.ask/bid). **Clima** = **Meteored** `meteored.com.bo/tiempo-en_Santa+Cruz...--1-17636.html` (El Deber daba datos incorrectos, mostraba sol lloviendo). `_fetchMeteoredWeather()` en worker: tarjetas `grid-item dia dN`, por día `text-0`(Hoy/Mañana/día) + `max/min data-weather` + `symbols/color/NN.svg alt=` + `probabilidad>N%`; temp actual `dato-temperatura data-weather`; emoji `_meteoEmoji()` por keywords del alt (torment→⛈️, lluvia→🌧️, parcial→⛅, cubierto→☁️, sol→☀️). Fallback open-meteo lat -17.7833 lon -63.1821. **Requiere deploy manual + `/dailyinfo?force=1` para refrescar KV.**
- ⚠️ Cloudflare BLOQUEA fetch directo a bcb.gob.bo y p2p.binance.com (IPs datacenter) → por eso DolarAPI. Si El Deber también bloquea CF, cae a open-meteo (ver info._errors en /dailyinfo).
- Weather item shape: `{label,max,min,emoji,rain?}` (antes era {date,code,rain}).
- App: state `diData`, fetch on mount, cache localStorage `lbp_dailyinfo` (refresca si >3.5h). Helpers globales `window._LBP_WCODE`, `window._LBP_EVENTS`, `window._lbpUpcomingEvents(date,months)`. Eventos = data estática recurrente anual (feriados Bolivia + Santa Cruz + retail Ventura Mall de imagen calendario).
- ⚠️ Requiere DEPLOY manual de worker.js en Cloudflare para que /dailyinfo funcione. dolarboliviahoy.com es JS-rendered (no scrapeable); eldeber.com.bo/clima da 403 → por eso Binance + open-meteo.

## Client data model (v4.68+)
```javascript
{
  name: 'Habib Rodriguez',      // contact person
  businessName: 'Calvin Klein', // franchise brand (used in Gmail searches)
  clientType: 'Franquicia',     // Franquicia|Proveedor|Cliente|Consultor|Otro
  contacts: [                   // multiple contacts per franchise
    {id, name, role, email, phone}
  ],
  stockStatus: 'OK',            // OK|LOW|CRITICAL
  monthlySalesTarget: '15000',
  lastVisitDate: '2026-06-01',
  staffNotes: 'Manager: Ana...'
}
```

## Key AI modules (v4.63-4.69)
| Module | Location | What |
|--------|----------|------|
| 💬 Chat datos | Nav > Asistente | Natural language query of all data |
| 🏪 Dashboard | Home | Franchise health semáforo (fhVisible state) |
| 👁️ Vista 360° | Client card | Full view: tasks+projects+meetings+$+AI Summary |
| 📧 Email→Tasks | Home | Gmail scan → Claude extracts action items |
| 🤖 Auto-contactos | Client form (Contacts section) | Gmail → Claude extracts contacts with roles |
| 📁 AI Brief+360° | Project detail modal | vpAiLoad/vpAiRes state in HomeScreen |
| 🔔 Smart Alerts | Home dashboard | stale alarms, meeting followup, project health, client health |

## Modelo IA del worker (v4.87+)
- `/chat` y `analyze-doc` usan **`claude-opus-5`** (antes `claude-sonnet-4-6`). Cambiado en `callClaude()` (línea ~567) y en el fetch inline de `/analyze-doc` (línea ~345).
- **`thinking: {type:'disabled'}`** en ambos: Opus 5 activa thinking por defecto y se comería el `max_tokens` (respuestas vacías/truncadas). Disabled es válido a effort default (high). Sin beta header.
- `max_tokens`: callClaude default 2048, `/chat` 4096, analyze-doc 2048.
- Parseo robusto: se busca el bloque `type==='text'` en `content[]` (no `content[0].text`), por si aparece un bloque no-text.
- Quitado header obsoleto `anthropic-beta: pdfs-2024-09-25` (PDF ya es GA; podía dar 400).
- ⚠️ **Requiere DEPLOY manual del worker en Cloudflare** para que aplique. Costo Opus 5: $5/$25 por 1M (vs $3/$15 Sonnet 4.6).

## worker.js smart notifications schedule (Bolivia UTC-4)
- Briefing: 12:00 UTC (8am Bolivia)
- Habits: 01:00 UTC (9pm Bolivia)
- Meeting followup: 13:00 UTC Mon-Fri (9am Bolivia)
- Stale alarms: 14:00 UTC Mon-Fri (10am Bolivia)
- Project health: Wed 15:00 UTC (11am Bolivia)
- Client health: Thu 15:00 UTC (11am Bolivia)
- Weekly: Sat 01:00 UTC (Fri 9pm Bolivia)

## Critical rules
1. `node --check` ALWAYS after HTML patch AND after worker.js change
2. `\n` in Python strings = JS syntax error → use `\\n`
3. AI prompts MUST say "USA SOLO datos reales, NO inventes"
4. For 360°/brief to work: tasks/projects/meetings must have `clientId` set
5. `typeIcon` must be global BEFORE ReadOnlyAttachments
6. worker.js if/else-if chain must NOT have extra `}` between type blocks

## Pending / next session ideas
- Asistente Operacional: AI proactive reminders per franchise (stocks, imports, marketing, sales, RRHH, presencia, capacitaciones)
- Vista 360° chat: natural language queries about a specific franchise
- Weekly Review Assistant (enhanced)
- Document AI: extract dates/terms from contracts
