# Life & Business Planner 2026

**Status:** Active, **v4.90**

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
