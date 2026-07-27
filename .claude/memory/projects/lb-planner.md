# Life & Business Planner 2026

**Status:** Active, **v4.86**
**File:** `LifeBusinessPlanner2026.html` (~795KB)
**Hosted:** josechain-eng.github.io/lbplanner/LifeBusinessPlanner2026.html
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
- Posible mejora futura: mostrar `milestones` y su progreso dentro de GoalsScreen; ligar el toggle del hábito al avance de la meta.

## Daily Info card (v4.76)
- Worker endpoint `GET /dailyinfo` → `{bcb:{venta}, crypto:{venta,compra}, weather:[{date,max,min,code,rain}], updatedAt}`, cached in KV `dailyinfo_v1`, lazy-refresh si >5h.
- `refreshDailyInfo(env)` en worker.js corre en cron a 11:00/16:00/22:00 UTC (7am/12pm/6pm Bolivia), ANTES del early-return de syncKeys.
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
