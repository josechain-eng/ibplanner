// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// Life Business Planner 2026 \u2014 Cloudflare Worker
// Handles: data sync, push subscriptions, alarm scheduling
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

// \u2500\u2500 VAPID keys (generated, do not change) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const VAPID_PUBLIC_KEY = 'BApPK_6j13xSMZOEpBPK2lUtfH02sSarLJ8469bpbULrUYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0';
const VAPID_PRIVATE_JWK = {"key_ops":["sign"],"ext":true,"kty":"EC","x":"Ck8r_qPXfFIxk4SkE8raVS18fTaxJqssnzjr1ultQus","y":"UYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0","crv":"P-256","d":"-X7F-ZLnRwC0O8pjVQO7vjhYKmAQUsDR-f50nF2epuo"};
const VAPID_SUBJECT = 'mailto:admin@lifeplanner.app';

// \u2500\u2500 CORS headers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// \u2500\u2500 Main export \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export default {
  // \u2500\u2500 HTTP handler \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  async fetch(request, env) {
    // Global try-catch: any unhandled exception returns a CORS-enabled error.
    // Without this, Cloudflare's own 500 page has no CORS headers \u2192 browser
    // blocks the response and the app sees "CORS policy" errors for every request.
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('Worker unhandled exception:', err && err.message ? err.message : String(err));
      return json({ error: 'Internal server error', detail: err && err.message ? err.message : String(err) }, 500);
    }
  },

  // \u2500\u2500 Cron handler \u2014 runs every minute \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  async scheduled(event, env) {
    return scheduledHandler(event, env);
  },
};

// \u2500\u2500 Separated so the try-catch above can wrap everything cleanly \u2500\u2500
async function handleRequest(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const p = url.pathname;

    // GET /vapid-key  \u2192  return public key so app can subscribe
    if (p === '/vapid-key' && request.method === 'GET') {
      return json({ key: VAPID_PUBLIC_KEY });
    }

    // GET /dailyinfo  \u2192  exchange rates (BCB oficial + cripto) + Santa Cruz weather
    // Cached in KV, refreshed by cron 3\u00d7/day (8:10pm/8am/4pm Bolivia). Lazy-refresh if stale.
    if (p === '/dailyinfo' && request.method === 'GET') {
      let info = JSON.parse(await env.LBP_KV.get('dailyinfo_v2') || 'null');
      const force = url.searchParams.get('force') === '1';
      const age = Date.now() - ((info && info.updatedAt) || 0);
      // OBSOLETO POR FECHA: el BCB ya publico un dia distinto al que tenemos en
      // cache. Es el caso que de verdad importa - un cron perdido dejaba el valor
      // viejo hasta 12h. El guard de 30 min evita refrescar en cada apertura los
      // dias en que el BCB no publica (sabado, domingo y feriados: su fecha se
      // queda atras a proposito y nunca va a coincidir con hoy).
      const fechaVieja = !!info && info.bcbFecha !== _ultHabilBolivia();
      const stale = !info || force || age > 5 * 3600 * 1000 || (fechaVieja && age > 30 * 60 * 1000);
      if (stale) {
        try { info = await refreshDailyInfo(env, force ? 'force' : (fechaVieja ? 'lazy-fecha' : 'lazy')); } catch (e) { /* keep old cache */ }
      }
      return json(info || { error: 'no data yet' });
    }

    // GET /tc-probe  ->  prueba CADA fuente del tipo de cambio por separado, sin
    // escribir en KV. Dice cual fuente esta viva, que valor da y de que fecha es,
    // mas lo que hay guardado en cache. Es el probe de conexiones de este dato.
    if (p === '/tc-probe' && request.method === 'GET') {
      const out = { hoyBolivia: _hoyBolivia(), ultimoDiaHabil: _ultHabilBolivia(), fuentes: {} };
      try {
        out.fuentes.bcbDirecto = (await _fetchBcbDirect()) || 'no-match';
        // Si no hay match hay que poder ver QUE devolvio el BCB a la IP de
        // Cloudflare: un 200 con la pagina real, o un challenge / 403 / 429 que
        // no lanza excepcion y por eso se confunde con "parser roto".
        if (out.fuentes.bcbDirecto === 'no-match') {
          const r = await fetch('https://www.bcb.gob.bo/', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'es-ES,es;q=0.9',
            },
          });
          const t = await r.text();
          out.bcbDiag = {
            status: r.status,
            server: r.headers.get('server'),
            ctype: r.headers.get('content-type'),
            largo: (t || '').length,
            tieneTarjeta: (t || '').indexOf('is-tc-oficial') >= 0,
            tieneNum: (t || '').indexOf('bcb-tco-num') >= 0,
            inicio: (t || '').replace(/\s+/g, ' ').slice(0, 300),
          };
        }
      } catch (e) { out.fuentes.bcbDirecto = 'ERROR: ' + (e && e.message); }
      try {
        const h2 = await (await fetch('https://www.dolarbluebolivia.click/', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
        const m = h2 && h2.match(/faq-official[^>]*>\s*Bs\s*([0-9]{1,2}[.,][0-9]{2})/i);
        out.fuentes.dolarblue = m ? parseFloat(m[1].replace(',', '.')) : 'no-match';
      } catch (e) { out.fuentes.dolarblue = 'ERROR: ' + (e && e.message); }
      try {
        const arr = await (await fetch('https://bo.dolarapi.com/v1/dolares', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
        const of = Array.isArray(arr) ? arr.find(x => x.casa === 'oficial') : null;
        out.fuentes.dolarapi = of ? { venta: of.venta, fecha: of.fechaActualizacion } : 'no-match';
      } catch (e) { out.fuentes.dolarapi = 'ERROR: ' + (e && e.message); }
      // Jina (r.jina.ai) quedo descartado como fuente: con JINA_API_KEY devuelve
      // 401 (clave invalida) y sin clave 429 (limite por IP, y las IPs de los
      // Workers son compartidas). Se deja solo como ultimo respaldo en el refresco.

      const cache = JSON.parse(await env.LBP_KV.get('dailyinfo_v2') || 'null');
      out.cache = cache ? {
        bcb: cache.bcb, bcbFecha: cache.bcbFecha, bcbSource: cache.bcbSource,
        updatedAt: new Date(cache.updatedAt || 0).toISOString(),
        alDia: cache.bcbFecha === _ultHabilBolivia(),
      } : null;
      return json(out);
    }

    // GET /dailyinfo-log  \u2192  diagn\u00f3stico: \u00faltimos refrescos (hora, disparador, valor, fecha de la fuente, errores)
    if (p === '/dailyinfo-log' && request.method === 'GET') {
      const log = JSON.parse(await env.LBP_KV.get('dailyinfo_log') || '[]');
      const camb = JSON.parse(await env.LBP_KV.get('tc_cambios') || '[]');
      return json({
        count: log.length,
        cambios: camb.slice().reverse(),   // solo cuando el valor cambio de verdad
        log: log.slice().reverse(),
      });
    }


    // POST /sync  \u2192  save full data blob for a sync key
    if (p === '/sync' && request.method === 'POST') {
      const { syncKey, data } = await request.json();
      if (!syncKey) return json({ error: 'missing syncKey' }, 400);
      const serialized = JSON.stringify(data);
      const MAX_BYTES = 20 * 1024 * 1024; // 20 MB safety limit (KV hard limit is 25 MB)
      if (serialized.length > MAX_BYTES) {
        const sizeMB = (serialized.length / (1024 * 1024)).toFixed(1);
        return json({
          error: 'Data too large',
          detail: `Your data blob is ${sizeMB} MB (limit: 20 MB). Clear old brainstorm sessions or attachments to reduce size.`,
          sizeMB
        }, 413);
      }
      await env.LBP_KV.put(`data:${syncKey}`, serialized, { expirationTtl: 60 * 60 * 24 * 365 });
      const sizeMB = (serialized.length / (1024 * 1024)).toFixed(2);
      return json({ ok: true, sizeMB });
    }

    // GET /sync?key=\u2026  \u2192  load data blob
    if (p === '/sync' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const raw = await env.LBP_KV.get(`data:${syncKey}`);
      return json({ data: raw ? JSON.parse(raw) : null });
    }

    // POST /subscribe  \u2192  store push subscription for a sync key
    if (p === '/subscribe' && request.method === 'POST') {
      const { syncKey, subscription } = await request.json();
      if (!syncKey || !subscription) return json({ error: 'missing fields' }, 400);
      const existing = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      const filtered = existing.filter(s => s.endpoint !== subscription.endpoint);
      filtered.push(subscription);
      await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(filtered), { expirationTtl: 60 * 60 * 24 * 365 });
      await registerSyncKey(env, syncKey);
      return json({ ok: true });
    }

    // POST /alarm  \u2192  schedule an alarm (single, kept for compatibility)
    if (p === '/alarm' && request.method === 'POST') {
      const { syncKey, alarmId, triggerAt, title, body, vibration } = await request.json();
      if (!syncKey) return json({ error: 'missing syncKey' }, 400);
      const alarms = JSON.parse(await env.LBP_KV.get(`alarms:${syncKey}`) || '[]');
      const filtered = alarms.filter(a => a.alarmId !== alarmId);
      filtered.push({ alarmId, triggerAt, title, body, vibration: vibration || 'long' });
      await env.LBP_KV.put(`alarms:${syncKey}`, JSON.stringify(filtered), { expirationTtl: 60 * 60 * 24 * 365 });
      await registerSyncKey(env, syncKey);
      return json({ ok: true });
    }

    // POST /alarms/batch  \u2192  MERGE (union by alarmId) alarms for a syncKey.
    // NOT replace-all: a device with stale data must never wipe alarms that another
    // device registered (that caused real alarms to vanish cross-device). Incoming
    // wins on the same id; long-past alarms (>1h old, cron already handled them) are
    // dropped to bound growth. Removal of a specific alarm goes through DELETE /alarm.
    if (p === '/alarms/batch' && request.method === 'POST') {
      const { syncKey, alarms } = await request.json();
      if (!syncKey || !Array.isArray(alarms)) return json({ error: 'missing fields' }, 400);
      const now = Date.now();
      const existing = JSON.parse(await env.LBP_KV.get(`alarms:${syncKey}`) || '[]');
      const byId = {};
      for (const a of existing) { if (a && a.alarmId) byId[a.alarmId] = a; }
      for (const a of alarms) { if (a && a.alarmId) byId[a.alarmId] = a; }
      const merged = Object.keys(byId).map(k => byId[k]).filter(a => a && typeof a.triggerAt === 'number' && a.triggerAt > now - 60 * 60 * 1000);
      await env.LBP_KV.put(`alarms:${syncKey}`, JSON.stringify(merged), { expirationTtl: 60 * 60 * 24 * 365 });
      await registerSyncKey(env, syncKey);
      return json({ ok: true, count: merged.length });
    }

    // DELETE /alarm?key=\u2026&id=\u2026  \u2192  cancel an alarm
    if (p === '/alarm' && request.method === 'DELETE') {
      const syncKey = url.searchParams.get('key');
      const alarmId = url.searchParams.get('id');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const alarms = JSON.parse(await env.LBP_KV.get(`alarms:${syncKey}`) || '[]');
      await env.LBP_KV.put(`alarms:${syncKey}`, JSON.stringify(alarms.filter(a => a.alarmId !== alarmId)));
      return json({ ok: true });
    }

    // GET /list-alarms?key=\u2026  \u2192  list stored alarms (diagnostic)
    if (p === '/list-alarms' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const alarms = JSON.parse(await env.LBP_KV.get(`alarms:${syncKey}`) || '[]');
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      return json({ alarms, alarmCount: alarms.length, subscriptionCount: subs.length });
    }

    // POST /test-push  \u2192  immediately push to all devices for a syncKey (diagnostic)
    if (p === '/test-push' && request.method === 'POST') {
      const { syncKey } = await request.json();
      if (!syncKey) return json({ error: 'missing syncKey' }, 400);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      if (!subs.length) return json({ error: 'no subscriptions registered for this syncKey', hint: 'Open the app on this device, go to Cloud Settings and tap Re-register' }, 404);
      let sent = 0, failed = 0;
      for (const sub of subs) {
        try {
          await sendPush(sub, { title: 'Test Push from Cloud \u2601\ufe0f', body: 'Cloudflare \u2192 phone pipeline is working!', alarmId: 'test_' + Date.now(), vibration: 'long' });
          sent++;
        } catch(e) {
          failed++;
          if (e.status === 404 || e.status === 410) {
            const updated = subs.filter(s => s.endpoint !== sub.endpoint);
            await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
          }
        }
      }
      return json({ sent, failed, total: subs.length });
    }

    // GET /rebuild-registry  \u2192  one-time fix: seed synckeys_registry from KV.list()
    // Call this ONCE from Cloud Settings if the registry is empty after a fresh deploy.
    // Do NOT call this on a schedule \u2014 it burns list operations.
    if (p === '/rebuild-registry' && request.method === 'GET') {
      const existing = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
      const { keys } = await env.LBP_KV.list({ prefix: 'alarms:' });
      const fromList = keys.map(k => k.name.slice('alarms:'.length));
      const merged = Array.from(new Set([...existing, ...fromList]));
      if (merged.length > 0) {
        await env.LBP_KV.put('synckeys_registry', JSON.stringify(merged));
      }
      return json({ ok: true, syncKeys: merged, wasEmpty: existing.length === 0 });
    }

    // GET /debug-smart?key=  \u2192  shows what smart notifications would fire NOW (no push sent)
    // GET /force-smart?key=&type=  ->  corre el MISMO camino que el cron, a demanda.
    // Sirve para reproducir el envio del briefing sin esperar a las 12:00 UTC.
    if (p === '/force-smart' && request.method === 'GET') {
      const k = url.searchParams.get('key');
      const t = url.searchParams.get('type') || 'briefing';
      if (!k) return json({ error: 'missing key' }, 400);
      const d0 = new Date();
      const today = d0.toISOString().slice(0, 10);
      const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      // Borramos la marca del dia para que no se auto-salte.
      const sk = 'smart:' + k + ':' + today + ':' + t;  // mismo formato que sendSmartNotif
      await env.LBP_KV.delete(sk).catch(() => {});
      try {
        await sendSmartNotif(env, [k], t, today, tmr);
      } catch (e) {
        return json({ ok: false, threw: String(e && e.message || e) });
      }
      const log = JSON.parse(await env.LBP_KV.get('push_log:' + k) || '[]');
      return json({ ok: true, type: t, last: log[0] || null });
    }

    // GET /push-log?key=  ->  ultimos resultados de envio de smart notifs
    if (p === '/push-log' && request.method === 'GET') {
      const k = url.searchParams.get('key');
      if (!k) return json({ error: 'missing key' }, 400);
      const log = JSON.parse(await env.LBP_KV.get('push_log:' + k) || '[]');
      return json({ key: k, entries: log.length, log });
    }

    if (p === '/debug-smart' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      if (!syncKey) return json({ error: 'missing key param' }, 400);
      const raw = await env.LBP_KV.get(`data:${syncKey}`);
      if (!raw) return json({ error: 'no data found for this sync key' }, 404);
      const data = JSON.parse(raw);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      const now = Date.now();
      const nowDate = new Date(now);
      const todayStr = nowDate.toISOString().slice(0, 10);
      const tomorrowStr = new Date(now + 86400000).toISOString().slice(0, 10);
      const utcH = nowDate.getUTCHours();

      const allTasks = (data.tasks || []);
      const openTasks = allTasks.filter(t => t.status !== 'DONE');
      const todayTasks = openTasks.filter(t => t.dueDate === todayStr);
      const tomorrowTasks = openTasks.filter(t => t.dueDate === tomorrowStr);
      const overdue = openTasks.filter(t => t.dueDate && t.dueDate < todayStr);
      const meetings = (data.meetings || []).filter(m => m.date === todayStr);
      const habits = (data.habits || []).filter(h => h.active !== false);
      const habitEntries = (data.habitEntries || []).filter(e => e.date === todayStr);
      const doneHabitIds = new Set(habitEntries.map(e => e.habitId));
      const pendingHabits = habits.filter(h => !doneHabitIds.has(h.id));
      const recentDone = allTasks.filter(t => t.status === 'DONE' && t.updatedAt && (now - t.updatedAt) < 7 * 86400000).length;

      // Check which sentKeys already exist
      const [bKey, hKey, dKey, wKey] = await Promise.all([
        env.LBP_KV.get(`smart:${syncKey}:${todayStr}:briefing`),
        env.LBP_KV.get(`smart:${syncKey}:${todayStr}:habits`),
        env.LBP_KV.get(`smart:${syncKey}:${todayStr}:dl:${tomorrowStr}`),
        env.LBP_KV.get(`smart:${syncKey}:${todayStr}:weekly`),
      ]);

      return json({
        now_utc: nowDate.toISOString(),
        utc_hour: utcH,
        today: todayStr,
        tomorrow: tomorrowStr,
        subscriptions: subs.length,
        data_found: true,
        tasks: {
          total: allTasks.length,
          open: openTasks.length,
          due_today: todayTasks.map(t => t.title),
          due_tomorrow: tomorrowTasks.map(t => t.title),
          overdue: overdue.length,
        },
        meetings_today: meetings.length,
        habits: { total: habits.length, pending_today: pendingHabits.map(h => h.name) },
        completed_this_week: recentDone,
        smart_notifs: {
          briefing: { already_sent_today: !!bKey, would_fire_at: '12:00 UTC (8am Bolivia)' },
          habits: { already_sent_today: !!hKey, would_fire_at: '01:00 UTC (9pm Bolivia)', pending: pendingHabits.length },
          deadlines: { already_sent_today: !!dKey, tasks_due_tomorrow: tomorrowTasks.length, runs_every_minute: true },
          weekly: { already_sent_today: !!wKey, would_fire_at: 'Sat 01:00 UTC (Fri 9pm Bolivia)', open_tasks: openTasks.length, done_this_week: recentDone },
        }
      });
    }

    // GET /check-sub?key=\u2026&endpoint=\u2026  \u2192  verify a subscription is still in KV
    // Used by the app on startup / visibilitychange to detect silently-expired subs
    if (p === '/check-sub' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      const endpoint = url.searchParams.get('endpoint');
      if (!syncKey || !endpoint) return json({ error: 'missing params' }, 400);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      const found = subs.some(s => s.endpoint === endpoint);
      return json({ found, count: subs.length });
    }

    // POST /chat  \u2192  proxy to Claude API (key stored as Worker secret ANTHROPIC_API_KEY)
    // Trae los correos de Ventura Mall (Outlook, via el bridge del Briefing
    // Diario) y hace que Claude extraiga acciones/acuerdos por franquicia.
    // Se usa para la seccion de comunicaciones del informe de actividades.
    if (p === '/email-actions' && request.method === 'GET') {
      const days = Math.min(parseInt(url.searchParams.get('days') || '14', 10) || 14, 60);
      const briefUrl = env.BRIEFING_URL || 'https://briefing-diario-pepe.josechain.workers.dev';
      const briefKey = env.BRIEFING_KEY;
      if (!briefKey) return json({ error: 'Falta el secreto BRIEFING_KEY en el worker', emails: 0, byClient: [] }, 200);
      let payload;
      const briefPath = '/ventura-emails?key=' + encodeURIComponent(briefKey);
      try {
        // Preferimos el service binding: un fetch a la URL publica de
        // workers.dev desde otro Worker de la misma cuenta devuelve 404.
        let r;
        if (env.BRIEFING_SERVICE) {
          r = await env.BRIEFING_SERVICE.fetch(new Request('https://briefing.internal' + briefPath));
        } else {
          r = await fetch(briefUrl + briefPath);
        }
        if (!r.ok) return json({ error: 'Briefing respondio ' + r.status + (env.BRIEFING_SERVICE ? ' (binding)' : ' (http)'), emails: 0, byClient: [] }, 200);
        payload = await r.json();
      } catch (err) {
        return json({ error: 'No pude leer el briefing: ' + err.message, emails: 0, byClient: [] }, 200);
      }
      // Nombres canonicos de las franquicias, leidos de los datos del usuario,
      // para que el informe use SIEMPRE los mismos nombres que el resto del doc.
      const syncKey = url.searchParams.get('key') || '';
      let clients = [];
      if (syncKey) {
        try {
          const blob = await env.LBP_KV.get('data:' + syncKey);
          if (blob) {
            const parsed = JSON.parse(blob);
            clients = (parsed.clients || []).map(c => c.businessName || c.name).filter(Boolean);
          }
        } catch (err) { /* sin clientes, Claude usa los nombres que encuentre */ }
      }
      const ALIASES = { 'Boss': ['Hugo', 'Hugo Boss'], 'Kids Delux': ['Delux'] };
      // Normaliza el nombre que devolvio el modelo al nombre canonico del cliente.
      // "Calvin Klein (CK)" -> "CK", "Chilli Beans" -> "Chillibeans", "Hugo" -> "Boss".
      function canonical(name) {
        const raw = String(name || '').trim();
        if (!raw) return raw;
        const flat = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
        let best = null, bestLen = 0;
        for (const c of clients) {
          const cands = [c].concat(ALIASES[c] || []);
          for (const cand of cands) {
            const cf = String(cand).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!cf) continue;
            if ((flat.includes(cf) || cf.includes(flat)) && cf.length > bestLen) { best = c; bestLen = cf.length; }
          }
        }
        return best || raw;
      }
      const all = Array.isArray(payload.emails) ? payload.emails : [];
      const cutoff = Date.now() - days * 86400000;
      const inWindow = all.filter(e => {
        const t = e && e.date ? Date.parse(e.date) : NaN;
        return !isNaN(t) && t >= cutoff;
      });
      if (!inWindow.length) {
        return json({ ts: payload.ts || null, days, emails: 0, byClient: [], note: 'Sin correos en la ventana' }, 200);
      }
      // Compacta para el modelo: asunto, remitente, fecha, y cuerpo recortado.
      // Tope de correos que van al modelo. Si se recorta, se informa en el .doc
      // en vez de perderlos en silencio.
      const MAX_ANALYZE = 200;
      const analyzed = inWindow.slice(0, MAX_ANALYZE);
      const compact = analyzed.map((e, i) => (
        '[' + (i + 1) + '] ' + (e.date || '').slice(0, 10) +
        ' | DE: ' + String(e.from || '').slice(0, 80) +
        ' | ASUNTO: ' + String(e.subject || '').slice(0, 140) +
        (e.attended ? ' | (ya respondido)' : ' | (sin responder)') +
        '\nCUERPO: ' + String(e.snippet || '').slice(0, 1200)
      )).join('\n\n');
      const system = 'Eres analista del gerente de Ventura Mall (La Paz, Bolivia). ' +
        'Recibiras correos de su casilla corporativa. Tu tarea: extraer que ACCIONES, ' +
        'NEGOCIACIONES, ACUERDOS y COMUNICACIONES relevantes hubo con cada franquicia o marca ' +
        '(Mango, Calvin Klein/CK, Armani Exchange/AX, Hugo Boss, Chillibeans, Kids Delux, Tommy/TH, u otras). ' +
        'REGLAS ESTRICTAS: usa SOLO lo que aparece en los correos, NO inventes ni supongas. ' +
        'Ignora newsletters, promociones y avisos automaticos. Si un correo no se relaciona con ' +
        'ninguna franquicia o marca, omitelo por completo. Se concreto y breve: cada item una linea, ' +
        'redactado para un informe ejecutivo al dueno de la empresa. ' +
        (clients.length ? 'Usa EXACTAMENTE estos nombres para las franquicias conocidas: ' +
          clients.join(', ') + '. Hugo pertenece a Boss. Delux pertenece a Kids Delux. ' +
          'Si el correo es de otro local del mall que no esta en esa lista, usa su nombre comun. ' : '') +
        'Responde SOLO con JSON valido, sin texto alrededor, con esta forma exacta: ' +
        '{"byClient":[{"client":"Mango","items":[{"tipo":"ACUERDO|NEGOCIACION|ACCION|COMUNICACION|PENDIENTE",' +
        '"texto":"que paso, concreto","fecha":"YYYY-MM-DD"}]}]}';
      const raw = await callClaude(env, [{ role: 'user', content: compact }], system, 8192);
      let parsed = { byClient: [] };
      try {
        const m = String(raw || '').match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch (err) { /* si el modelo no devolvio JSON, se informa vacio */ }
      // Normaliza y fusiona: si el modelo devolvio "CK" y "Calvin Klein (CK)"
      // por separado, quedan como una sola entrada.
      const merged = {};
      (Array.isArray(parsed.byClient) ? parsed.byClient : []).forEach(c => {
        const name = canonical(c && c.client);
        if (!name) return;
        if (!merged[name]) merged[name] = { client: name, items: [] };
        merged[name].items = merged[name].items.concat(Array.isArray(c.items) ? c.items : []);
      });
      const known = new Set(clients);
      const byClient = Object.keys(merged).map(k => merged[k]).sort((a, b) => {
        const ka = known.has(a.client) ? 0 : 1, kb = known.has(b.client) ? 0 : 1;
        if (ka !== kb) return ka - kb;
        return b.items.length - a.items.length;
      });
      return json({ ts: payload.ts || null, days, emails: inWindow.length, analyzed: analyzed.length, byClient }, 200);
    }

    if (p === '/chat' && request.method === 'POST') {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set.' }, 500);
      const { messages, systemPrompt, area } = await request.json();
      if (!messages || !Array.isArray(messages)) return json({ error: 'messages array required' }, 400);
      const content = await callClaude(env, messages, systemPrompt || ('You are a strategic business consultant for Ventura Mall. Help brainstorm ' + (area || 'business') + ' ideas.'), 4096);
      return json({ content });
    }

    // POST /transcribe  ->  audio (blob en el body) -> OpenAI Whisper -> { text }
    // Requiere secret OPENAI_API_KEY. Query ?lang=es|en mejora la precision.
    if (p === '/transcribe' && request.method === 'POST') {
      const key = env.OPENAI_API_KEY;
      if (!key) return json({ error: 'OPENAI_API_KEY no configurada en el worker' }, 500);
      const lang = url.searchParams.get('lang') || 'es';
      const mime = request.headers.get('content-type') || 'audio/webm';
      const buf = await request.arrayBuffer();
      if (!buf || buf.byteLength === 0) return json({ error: 'audio vacio' }, 400);
      if (buf.byteLength > 25 * 1024 * 1024) return json({ error: 'audio mayor a 25MB (limite de Whisper); grabar en tramos mas cortos' }, 413);
      const ext = mime.indexOf('mp4') >= 0 ? 'mp4' : (mime.indexOf('ogg') >= 0 ? 'ogg' : (mime.indexOf('wav') >= 0 ? 'wav' : 'webm'));
      const fd = new FormData();
      fd.append('file', new File([buf], 'audio.' + ext, { type: mime }));
      fd.append('model', 'whisper-1');
      if (lang && lang !== 'auto') fd.append('language', lang);
      fd.append('response_format', 'json');
      try {
        const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + key },
          body: fd
        });
        const data = await r.json().catch(function(){ return null; });
        if (!r.ok) return json({ error: 'whisper: ' + (data && data.error ? data.error.message : ('HTTP ' + r.status)) }, r.status);
        return json({ text: (data && data.text) || '' });
      } catch (e) { return json({ error: 'transcribe: ' + (e && e.message) }, 500); }
    }

    // GET /briefing-ai?key=&date=  \u2192  returns today's AI-generated briefing from KV
    if (p === '/briefing-ai' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const stored = await env.LBP_KV.get(`briefing_ai:${syncKey}:${date}`);
      if (!stored) return json({ ready: false, message: 'Briefing not yet generated. Will arrive at 8am.' });
      return json({ ready: true, briefing: stored, date });
    }

    // POST /analyze-doc  \u2192  send a stored file to Claude for intelligent analysis
    if (p === '/analyze-doc' && request.method === 'POST') {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set.' }, 500);
      const body = await request.json().catch(() => null);
      if (!body || !body.syncKey || !body.fileId) return json({ error: 'missing syncKey or fileId' }, 400);

      // Fetch file data from R2 or KV
      let fileJson = null;
      if (env.LBP_R2) {
        const obj = await env.LBP_R2.get(`${body.syncKey}/${body.fileId}`);
        if (obj) fileJson = JSON.parse(await obj.text());
      }
      if (!fileJson) {
        const val = await env.LBP_KV.get(`file:${body.syncKey}:${body.fileId}`);
        if (val) fileJson = JSON.parse(val);
      }
      if (!fileJson || !fileJson.data) return json({ error: 'file not found in cloud' }, 404);

      // Parse data URL: data:mime;base64,XXX
      const dataUrl = fileJson.data;
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx === -1) return json({ error: 'invalid file data' }, 400);
      const meta = dataUrl.slice(5, commaIdx); // "mime;base64"
      const b64 = dataUrl.slice(commaIdx + 1);
      const mime = meta.split(';')[0] || fileJson.mime || 'application/octet-stream';
      const fileName = fileJson.name || body.fileId;

      const isPdf = mime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
      const isImage = mime.startsWith('image/');

      if (!isPdf && !isImage) return json({ error: 'Only PDF and image files are supported for analysis' }, 400);

      const systemPrompt = 'Eres un asistente de an\u00e1lisis de documentos para un gerente de mall (Ventura Mall, Bolivia). Analiza el documento y extrae informaci\u00f3n estructurada. Responde SOLO con JSON v\u00e1lido, sin texto adicional.';

      const userPrompt = `Analiza este documento (${fileName}) y devuelve un JSON con esta estructura exacta:
{
  "summary": ["punto clave 1", "punto clave 2", ...],
  "dates": [{"date": "YYYY-MM-DD o descripci\u00f3n", "description": "qu\u00e9 significa esta fecha"}],
  "obligations": ["obligaci\u00f3n o compromiso 1", ...],
  "parties": ["parte involucrada 1", ...],
  "title": "t\u00edtulo o tema del documento",
  "docType": "contrato|factura|propuesta|informe|otro"
}

Si no hay fechas, dates=[] ; si no hay obligaciones, obligations=[] ; etc.
M\u00e1ximo 6 items por lista. S\u00e9 conciso y espec\u00edfico.`;

      let contentBlocks;
      if (isPdf) {
        contentBlocks = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: userPrompt }
        ];
      } else {
        contentBlocks = [
          { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
          { type: 'text', text: userPrompt }
        ];
      }

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-5',
          max_tokens: 2048,
          thinking: { type: 'disabled' },
          system: systemPrompt,
          messages: [{ role: 'user', content: contentBlocks }]
        })
      });

      if (!apiRes.ok) {
        const err = await apiRes.text();
        return json({ error: 'Claude API error: ' + err }, apiRes.status);
      }
      const apiData = await apiRes.json();
      const _tb = Array.isArray(apiData.content) ? apiData.content.find(function(b){ return b && b.type === 'text'; }) : null;
      const rawText = _tb ? _tb.text : '{}';

      // Parse Claude's JSON response
      try {
        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}') + 1;
        const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd));
        return json({ ok: true, analysis: parsed, fileName });
      } catch(e) {
        return json({ ok: true, analysis: { summary: [rawText], dates: [], obligations: [], parties: [], title: fileName, docType: 'otro' }, fileName });
      }
    }

    // GET /briefing  \u2192  daily briefing summary (tasks, projects, meetings, alarms)
    // No syncKey needed \u2014 reads registry and picks freshest data blob.
    if (p === '/briefing' && request.method === 'GET') {
      const now = Date.now();
      const registry = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
      if (!registry.length) return json({ error: 'no registry found \u2014 open the app first' }, 404);

      // Pick the freshest data blob across all devices
      let bestData = null;
      let bestTime = 0;
      let totalAlarms = 0;

      for (const syncKey of registry) {
        const raw = await env.LBP_KV.get(`data:${syncKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const t = parsed._cloudSaveTime || 0;
          if (t > bestTime) { bestTime = t; bestData = parsed; }
        }
        const alarmRaw = await env.LBP_KV.get(`alarms:${syncKey}`);
        if (alarmRaw) {
          const alarms = JSON.parse(alarmRaw);
          // Count alarms for TODAY (Bolivia UTC-4) \u2014 both already fired and upcoming
          const boliviaNow = now - 4 * 3600 * 1000;
          const todayBO = new Date(boliviaNow);
          todayBO.setUTCHours(0, 0, 0, 0);
          const todayStartUTC = todayBO.getTime() + 4 * 3600 * 1000;
          const todayEndUTC   = todayStartUTC + 86400000;
          totalAlarms += alarms.filter(a => a.triggerAt >= todayStartUTC && a.triggerAt < todayEndUTC).length;
        }
      }

      if (!bestData) return json({ error: 'no synced data found \u2014 open the app and sync' }, 404);

      // Tasks \u2014 only non-DONE (status 'INBOX' is the active state used by the app)
      const tasks = (bestData.tasks || [])
        .filter(t => t.status !== 'DONE' && t.status !== 'done' && t.status !== 'completed' && !t.completed)
        .map(t => ({ title: t.title || t.name, status: t.status, priority: t.priority, dueDate: t.dueDate }));

      // Projects \u2014 active (not completed/archived/done)
      const projects = (bestData.projects || [])
        .filter(pr => pr.status !== 'DONE' && pr.status !== 'done' && pr.status !== 'completed' && pr.status !== 'archived')
        .map(pr => ({ name: pr.name || pr.title, status: pr.status, department: pr.department }));

      // Meetings \u2014 today and upcoming
      const todayStr = new Date().toISOString().slice(0, 10);
      const meetings = (bestData.meetings || [])
        .filter(m => (m.date || '') >= todayStr)
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
        .slice(0, 10)
        .map(m => ({ title: m.title || m.name, date: m.date, time: m.time, location: m.location }));

      // Goals \u2014 active
      const goals = (bestData.goals || [])
        .filter(g => g.status !== 'completed' && g.status !== 'done')
        .map(g => ({ title: g.title || g.name, progress: g.progress, dueDate: g.dueDate }));

      // Habits \u2014 active
      const habits = (bestData.habits || [])
        .filter(h => h.active !== false)
        .map(h => ({ name: h.name || h.title, frequency: h.frequency }));

      return json({
        lastSync: bestTime ? new Date(bestTime).toISOString() : null,
        activeAlarms: totalAlarms,
        tasks:    { count: tasks.length,    items: tasks.slice(0, 100) },
        projects: { count: projects.length, items: projects.slice(0, 50) },
        meetings: { count: meetings.length, items: meetings },
        goals:    { count: goals.length,    items: goals.slice(0, 50) },
        habits:   { count: habits.length,   items: habits.slice(0, 50) },
      });
    }

    // \u2500\u2500 GET /file-stats?key=  \u2014 R2 storage usage for this syncKey \u2500\u2500
    if (p === '/file-stats' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      if (!env.LBP_R2) return json({ error: 'R2 not configured', r2: false }, 200);
      const listed = await env.LBP_R2.list({ prefix: `${syncKey}/` });
      let totalBytes = 0;
      const files = [];
      for (const obj of listed.objects) {
        totalBytes += obj.size || 0;
        const fileId = obj.key.replace(`${syncKey}/`, '');
        // Try to get the name from metadata
        const name = (obj.customMetadata && obj.customMetadata.name) ? obj.customMetadata.name : fileId;
        files.push({ fileId, name, size: obj.size || 0, uploaded: obj.uploaded ? obj.uploaded.toISOString() : null });
      }
      const R2_FREE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
      return json({ r2: true, totalBytes, fileCount: files.length, files, usedPercent: Math.round(totalBytes / R2_FREE_BYTES * 100 * 10) / 10, freeGB: 10 });
    }

    // \u2500\u2500 POST /file  \u2014 upload file to R2 (or KV fallback) for cross-device access \u2500\u2500
    // R2: no per-file size limit (~75 MB practical max via Worker transfer).
    // KV fallback: used only if LBP_R2 binding is not configured (~15 MB limit).
    if (p === '/file' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body || !body.syncKey || !body.fileId || !body.data) return json({ error: 'missing params' }, 400);
      const val = JSON.stringify({ data: body.data, name: body.name || '', mime: body.mime || '' });
      if (env.LBP_R2) {
        // R2: store as JSON text, no size cap beyond Worker 100 MB body limit
        await env.LBP_R2.put(`${body.syncKey}/${body.fileId}`, val, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { name: body.name || '', mime: body.mime || '' }
        });
      } else {
        // KV fallback: 25 MB value limit \u2192 ~15 MB file cap
        if (body.data.length > 22 * 1024 * 1024) return json({ error: 'file too large for cloud sync \u2014 add R2 binding for larger files' }, 413);
        await env.LBP_KV.put(`file:${body.syncKey}:${body.fileId}`, val, { expirationTtl: 365 * 24 * 3600 });
      }
      return json({ ok: true });
    }

    // \u2500\u2500 GET /file?key=&id=  \u2014 retrieve file from R2 (or KV fallback) \u2500\u2500
    if (p === '/file' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      const fileId  = url.searchParams.get('id');
      if (!syncKey || !fileId) return json({ error: 'missing params' }, 400);
      if (env.LBP_R2) {
        const obj = await env.LBP_R2.get(`${syncKey}/${fileId}`);
        if (!obj) return json({ error: 'not found' }, 404);
        return json(JSON.parse(await obj.text()));
      } else {
        const val = await env.LBP_KV.get(`file:${syncKey}:${fileId}`);
        if (!val) return json({ error: 'not found' }, 404);
        return json(JSON.parse(val));
      }
    }

    // \u2500\u2500 DELETE /file?key=&id=  \u2014 remove file from R2 (or KV fallback) \u2500\u2500
    if (p === '/file' && request.method === 'DELETE') {
      const syncKey = url.searchParams.get('key');
      const fileId  = url.searchParams.get('id');
      if (!syncKey || !fileId) return json({ error: 'missing params' }, 400);
      if (env.LBP_R2) {
        await env.LBP_R2.delete(`${syncKey}/${fileId}`);
      } else {
        await env.LBP_KV.delete(`file:${syncKey}:${fileId}`);
      }
      return json({ ok: true });
    }

    // POST /backup?key=\u2026&date=\u2026  \u2192  store daily backup snapshot in KV (kept 30 days)
    if (p === '/backup' && request.method === 'POST') {
      const key = url.searchParams.get('key');
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
      if (!key) return json({ error: 'missing key' }, 400);
      const body = await request.text();
      if (!body || body.length > 20971520) return json({ error: 'too large' }, 413);
      await env.LBP_KV.put('backup:' + key + ':' + date, body, { expirationTtl: 30 * 86400 });
      return json({ ok: true, date: date, bytes: body.length });
    }

    // GET /backups?key=\u2026  \u2192  list available backup dates
    if (p === '/backups' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) return json({ error: 'missing key' }, 400);
      const prefix = 'backup:' + key + ':';
      const list = await env.LBP_KV.list({ prefix: prefix });
      const dates = list.keys.map(function(k){ return k.name.replace(prefix,''); }).sort().reverse();
      return json({ dates: dates });
    }

    // GET /backup?key=\u2026&date=\u2026  \u2192  retrieve a specific backup
    if (p === '/backup' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      const date = url.searchParams.get('date');
      if (!key || !date) return json({ error: 'missing key or date' }, 400);
      const data = await env.LBP_KV.get('backup:' + key + ':' + date);
      if (!data) return json({ error: 'not found' }, 404);
      return new Response(data, { headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) });
    }

    return new Response('Not found', { status: 404, headers: CORS });
}

// \u2500\u2500 Registry helper \u2014 tracks known syncKeys using get/put instead of list() \u2500\u2500
// list() costs 1 op each call; get() costs 1 op from a 100k/day quota.
// We call scheduledHandler every minute (1,440\u00d7/day) so list() burns the
// 1,000 list-op free-tier limit before 17:00 every day.
async function registerSyncKey(env, syncKey) {
  const registry = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
  if (!registry.includes(syncKey)) {
    registry.push(syncKey);
    await env.LBP_KV.put('synckeys_registry', JSON.stringify(registry));
  }
}

async function callClaude(env, messages, system, maxTokens) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-5', max_tokens: maxTokens || 2048, thinking: { type: 'disabled' }, system, messages })
    });
    if (!res.ok) return '';
    const data = await res.json();
    const textBlock = Array.isArray(data.content) ? data.content.find(function(b){ return b && b.type === 'text'; }) : null;
    return textBlock ? textBlock.text : '';
  } catch(e) {
    return '';
  }
}

async function sendSmartNotif(env, syncKeys, type, todayStr, tomorrowStr) {
  for (const syncKey of syncKeys) {
    try {
      const sentKey = type === 'deadlines'
        ? `smart:${syncKey}:${todayStr}:dl:${tomorrowStr}`
        : `smart:${syncKey}:${todayStr}:${type}`;
      const already = await env.LBP_KV.get(sentKey);
      if (already) continue;

      const raw = await env.LBP_KV.get(`data:${syncKey}`);
      if (!raw) continue;
      const data = JSON.parse(raw);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      if (!subs.length) continue;

      let title = '', body = '';

      if (type === 'briefing') {
        const tasks = (data.tasks || []).filter(t => t.status !== 'DONE');
        const todayTasks = tasks.filter(t => t.dueDate === todayStr);
        const meetings = (data.meetings || []).filter(m => m.date === todayStr);
        const habits = (data.habits || []).filter(h => h.active !== false);
        // "Pendientes" son los que HOY todavia no se registraron, no todos los
        // activos. Antes se mandaba habits.length y el briefing podia decir "5
        // habitos pendientes" aunque estuvieran los 5 hechos.
        const _hechosHoy = new Set((data.habitEntries || []).filter(e => e.date === todayStr).map(e => e.habitId));
        const habitsPend = habits.filter(h => !_hechosHoy.has(h.id));
        const overdue = tasks.filter(t => t.dueDate && t.dueDate < todayStr);
        const projects = (data.projects || []).filter(p => !['DONE','CANCELLED'].includes(p.status));
        title = '\uD83C\uDF05 Briefing del d\u00eda';

        const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const recentTasks = tasks.filter(t => t.createdAt && new Date(t.createdAt) >= threeDaysAgo)
          .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,3);
        const overdueSort = overdue.sort((a,b) => (a.dueDate||'').localeCompare(b.dueDate||''));
        const ctx = {
          fecha: todayStr,
          tareasHoy: todayTasks.map(t => ({ titulo: t.title, prioridad: t.priority })),
          reunionesHoy: meetings.map(m => ({ titulo: m.title, hora: m.startTime || '' })),
          // Se le mandan solo las 5 mas antiguas, pero TAMBIEN el total real: sin
          // el total la IA contaba las que recibia y afirmaba "5 tareas vencidas
          // en total" cuando habia 12 (visto en el briefing del 7-oct-2026).
          tareasVencidas: overdueSort.slice(0, 5).map(t => ({ titulo: t.title, vencio: t.dueDate })),
          tareasVencidasTotal: overdue.length,
          tareasRecientes: recentTasks.map(t => ({ titulo: t.title, creado: (t.createdAt||'').slice(0,10) })),
          // Mismo caso que las vencidas: se mandan 5 de muestra pero TAMBIEN el
          // total, porque la IA contaba las que recibia y afirmaba "5 proyectos
          // activos" habiendo 19 (visto el 7-oct-2026).
          proyectosActivos: projects.slice(0, 5).map(p => ({ nombre: p.name, estado: p.status })),
          proyectosActivosTotal: projects.length,
          habitosPendientes: habitsPend.length,
          habitosTotal: habits.length
        };

        const aiText = await callClaude(env, [
          { role: 'user', content: 'Datos de hoy (' + todayStr + ') para el gerente del Ventura Mall:\n' + JSON.stringify(ctx, null, 2) + '\n\nEscribe un briefing matutino ESTRUCTURADO en espa\u00f1ol. USA SOLO datos reales del JSON, NO inventes nada. Formato EXACTO (texto plano, sin markdown, sin asteriscos, sin guiones extra):\n\nREUNIONES HOY: [lista por hora y nombre, o \'ninguna\']\nTAREAS VENCIDAS (3 mas antiguas): [nombre + fecha vencida de cada una]\nHOY EN AGENDA: [tareas con fecha de hoy, o \'ninguna\']\nRECIEN AGREGADAS: [tareas de los ultimos 3 dias que requieren atencion, o \'ninguna\']\n\nMantener conciso. Cada seccion en una linea. Nombres exactos de las tareas/reuniones.' }
        ], 'Eres el asistente ejecutivo del Ventura Mall (La Paz, Bolivia). Das briefings matutinos estructurados en texto plano sin markdown. USA SOLO datos reales provistos, NO inventes nada.', 450);

        // Conserva los saltos de l\u00ednea (colapsa m\u00faltiples a uno) para que las secciones queden separadas
        const stripMd = (s) => s.replace(/#{1,6}\s*/g,'').replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1').replace(/^-{2,}\s*$/gm,'').replace(/^>\s*/gm,'').replace(/[ \t]{2,}/g,' ').replace(/\n{2,}/g,'\n').trim();

        // TAREAS VENCIDAS se arma ACA, no la escribe la IA. Dos razones:
        //   1) En vinetas se lee de un vistazo; la IA las juntaba en un parrafo
        //      separado por punto y coma porque el prompt pide "cada seccion en
        //      una linea", y pedirle vinetas se cumple unos dias y otros no.
        //   2) Los nombres y las fechas salen EXACTOS del dato, sin que la IA los
        //      reformule ni los acorte.
        // La IA sigue redactando las otras tres secciones; aca solo se reemplaza
        // el bloque de vencidas, de modo que el orden original no cambia.
        const _fmtVenc = (iso) => {
          if (!iso) return '';
          const dm = iso.slice(8, 10) + '/' + iso.slice(5, 7);
          // El anio solo se muestra si NO es el de hoy: evita el ruido de
          // "2026-07-17" repetido en cada linea, sin volverse ambiguo con una
          // tarea arrastrada del anio pasado.
          return iso.slice(0, 4) === todayStr.slice(0, 4) ? dm : dm + '/' + iso.slice(2, 4);
        };
        const _topVenc = overdueSort.slice(0, 3);
        // El encabezado dice "3 de 12", no "3 mas antiguas": asi se ve de una que
        // hay mas atras de las tres que se listan.
        const _encVenc = overdue.length > _topVenc.length
          ? 'TAREAS VENCIDAS (' + _topVenc.length + ' de ' + overdue.length + '):'
          : 'TAREAS VENCIDAS (' + _topVenc.length + '):';
        const _bloqueVenc = _topVenc.length
          ? _encVenc + '\n' + _topVenc.map(t => '\u2022 ' + t.title + ' (vencio ' + _fmtVenc(t.dueDate) + ')').join('\n')
          : 'TAREAS VENCIDAS: ninguna';
        // Toma el encabezado y TODAS las lineas que le siguen hasta el proximo
        // encabezado de seccion, para no dejar huerfanas si la IA ya habia partido
        // la lista en varios renglones.
        const _reVenc = /^TAREAS VENCIDAS.*(?:\n(?!REUNIONES|TAREAS VENCIDAS|HOY EN AGENDA|RECI[E\u00c9]N AGREGADAS)[^\n]*)*/mi;

        if (aiText && aiText.trim().length > 10) {
          const _base = stripMd(aiText);
          // Si la IA omitio la seccion, se agrega al final en vez de perderla.
          const texto = _reVenc.test(_base) ? _base.replace(_reVenc, _bloqueVenc) : (_base + '\n' + _bloqueVenc);
          // ---- Cuerpo de la NOTIFICACION ----
          // Android decide el tamano de letra, no la app (la API de notificaciones
          // no expone tipografia), asi que lo unico que podemos hacer para que
          // entre mas es gastar menos renglones. De ahi los tres recortes que
          // siguen. El texto que ve la app (summary) queda completo.
          let _cuerpo = texto
            // 1) La IA encabeza con "BRIEFING MATUTINO - <fecha completa>". Es
            //    redundante: el titulo ya dice "Briefing del dia" y Android pone
            //    la hora al lado. Y como la fecha larga envuelve, se come DOS
            //    renglones arriba de todo, que es donde mas duele.
            .replace(/^BRIEFING\b[^\n]*\n?/im, '')
            // 2) La IA cierra con un comentario largo de prosa. A veces lo rotula
            //    "NOTA:" y a veces no ("Dia sin compromisos fijos: ventana ideal
            //    para..."), asi que filtrar por la etiqueta se escapaba. En vez de
            //    eso, en la notificacion SOLO sobrevive lo que tiene estructura:
            //    un encabezado de seccion EN MAYUSCULAS seguido de dos puntos, o
            //    una vinieta. Todo lo demas es prosa y se queda en la app.
            .split('\n')
            //    Un encabezado = arranca con 2+ MAYUSCULAS y en algun punto tiene
            //    dos puntos. Ojo: el resto de la linea SI puede traer minusculas
            //    ("TAREAS VENCIDAS (3 de 12):"), por eso no se puede exigir
            //    mayusculas hasta los dos puntos.
            .filter(l => /^\u2022 /.test(l) || /^[A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1]{2,}[^\n]*:/.test(l))
            .join('\n')
            // NOTA si pasa el filtro (es mayuscula + dos puntos), asi que se saca aparte.
            .replace(/^NOTA\b[^\n]*\n?/im, '');

          // 3) Las secciones que quedaron en "ninguna" gastan un renglon entero
          //    cada una para no decir nada. Se sacan de su lugar y se juntan en
          //    una sola linea al final, sin perder la informacion.
          const _chips = [];
          for (const _v of [
            { re: /^REUNIONES HOY\s*:\s*ninguna\.?\s*$/im, chip: '\ud83d\udcc5 Sin reuniones' },
            { re: /^HOY EN AGENDA\s*:\s*ninguna\.?\s*$/im, chip: '\ud83d\udccb Sin agenda' },
            { re: /^RECI[E\u00c9]N AGREGADAS\s*:\s*ninguna\.?\s*$/im, chip: '\ud83c\udd95 Sin nuevas' },
          ]) {
            if (_v.re.test(_cuerpo)) { _chips.push(_v.chip); _cuerpo = _cuerpo.replace(_v.re, ''); }
          }
          // Al borrar una linea queda su salto: se colapsan para no dejar huecos.
          _cuerpo = _cuerpo.replace(/\n{2,}/g, '\n').trim();

          // 4) PROYECTOS y HABITOS se arman aca, igual que las vencidas. La IA a
          //    veces los ponia como secciones propias y a veces los metia dentro de
          //    la linea NOTA, con lo cual desaparecian del push al recortarla. Fijos
          //    aparecen siempre y con los numeros reales.
          _cuerpo = _cuerpo
            .replace(/^PROYECTOS\b[^\n]*\n?/im, '')
            .replace(/^H[A\u00c1]BITOS\b[^\n]*\n?/im, '')
            .replace(/\n{2,}/g, '\n').trim();
          // La ultima linea junta todo lo que NO exige accion, para no gastar un
          // renglon por dato. El conteo de proyectos va aca: es contexto, no algo
          // que haya que hacer hoy. Los nombres quedan en la vista de la app.
          if (projects.length) {
            _chips.unshift('\ud83d\udcc1 ' + projects.length + ' proyecto' + (projects.length > 1 ? 's' : ''));
          }
          // Habitos: si quedan pendientes es accionable y se lleva su propio
          // renglon; si estan todos hechos (o no hay ninguno) no merece mas que un
          // lugar en la linea de contexto.
          let _bloqueHab = '';
          if (habits.length) {
            if (habitsPend.length > 0) {
              _bloqueHab = '\n\ud83d\udd04 HABITOS: ' + habitsPend.length + ' pendiente' + (habitsPend.length > 1 ? 's' : '') + ' de ' + habits.length;
            } else {
              _chips.splice(projects.length ? 1 : 0, 0, '\u2705 Habitos al dia');
            }
          }

          // Emojis por seccion para que escanee mejor. Van DESPUES de los recortes:
          // las secciones vacias ya no estan, asi que no se les pone emoji al pedo.
          const pushBody = _cuerpo
            .replace(/^REUNIONES/mi, '\ud83d\udcc5 REUNIONES')
            .replace(/^TAREAS VENCIDAS/mi, '\u26a0\ufe0f TAREAS VENCIDAS')
            .replace(/^HOY EN AGENDA/mi, '\ud83d\udccb HOY EN AGENDA')
            .replace(/^RECI[E\u00c9]N AGREGADAS/mi, '\ud83c\udd95 RECI\u00c9N AGREGADAS')
            + _bloqueHab
            + (_chips.length ? '\n' + _chips.join(' \u00b7 ') : '');
          // Primera l\u00ednea: tipo de cambio oficial (BCB) desde dailyinfo_v2
          let tcLine = '';
          try {
            const di = JSON.parse(await env.LBP_KV.get('dailyinfo_v2') || 'null');
            if (di && di.bcb && di.bcb.venta != null) {
              // Marcamos el dato cuando NO es del dia, para que el briefing no
              // presente como de hoy un valor que quedo viejo.
              const viejo = di.bcbFecha && di.bcbFecha !== _ultHabilBolivia();
              tcLine = '\ud83d\udcb5 TC oficial: Bs ' + Number(di.bcb.venta).toFixed(2)
                + (viejo ? ' (al ' + di.bcbFecha.slice(8, 10) + '/' + di.bcbFecha.slice(5, 7) + ')' : '') + '\n';
            }
          } catch (e) { /* sin TC si falla */ }
          // 1200, no 600: con 600 el texto se cortaba a media palabra (el briefing
          // del 7-oct daba 642). El limite real es el payload cifrado del Web Push,
          // que el estandar garantiza en 4096 bytes; 1200 caracteres quedan muy por
          // debajo incluso contando tildes y emojis como varios bytes.
          // OJO: esto evita que NOSOTROS cortemos el texto. Cuanto muestra Android
          // en pantalla lo decide el sistema, no la app.
          body = (tcLine + pushBody).slice(0, 1200);
          const fullBriefing = JSON.stringify({
            generated: new Date().toISOString(),
            summary: tcLine + texto,
            stats: { tareasHoy: todayTasks.length, reunionesHoy: meetings.length, vencidas: overdue.length, habitosPendientes: habits.length, proyectosActivos: projects.length },
            tareasHoy: todayTasks.slice(0, 5).map(t => t.title),
            reunionesHoy: meetings.map(m => ({ title: m.title, time: m.startTime || '', client: m.clientName || '' }))
          });
          await env.LBP_KV.put('briefing_ai:' + syncKey + ':' + todayStr, fullBriefing, { expirationTtl: 172800 });
        } else {
          const parts = [];
          if (todayTasks.length) parts.push(todayTasks.length + ' tarea' + (todayTasks.length > 1 ? 's' : '') + ' para hoy');
          else if (tasks.length) parts.push(tasks.length + ' pendiente' + (tasks.length > 1 ? 's' : ''));
          if (meetings.length) parts.push(meetings.length + (meetings.length > 1 ? ' reuniones' : ' reuni\u00f3n') + ' hoy');
          if (overdue.length) parts.push(overdue.length + ' vencida' + (overdue.length > 1 ? 's' : ''));
          if (habits.length) parts.push(habits.length + ' h\u00e1bito' + (habits.length > 1 ? 's' : ''));
          body = parts.length ? parts.join(' \u00b7 ') : '\u00a1Que tengas un gran d\u00eda! \u2728';
        }
      } else if (type === 'habits') {
        const habits = (data.habits || []).filter(h => h.active !== false);
        if (!habits.length) continue;
        const entries = data.habitEntries || [];
        const todayEntries = entries.filter(e => e.date === todayStr);
        const completedIds = new Set(todayEntries.map(e => e.habitId));
        const missing = habits.filter(h => !completedIds.has(h.id));
        if (!missing.length) continue;
        title = '\uD83D\uDD04 \u00a1H\u00e1bitos pendientes!';
        body = missing.length === 1
          ? `Pendiente: "${missing[0].name}"`
          : `${missing.length} h\u00e1bitos sin registrar hoy \u2014 \u00a1no rompas la racha!`;
      } else if (type === 'deadlines') {
        // Collect all entry types with dueDate = tomorrow
        const dueTasks = (data.tasks || []).filter(t => t.status !== 'DONE' && t.dueDate === tomorrowStr);
        const dueProjects = (data.projects || []).filter(p => !['DONE','CANCELLED','ARCHIVED'].includes(p.status) && p.dueDate === tomorrowStr);
        const dueMeetings = (data.meetings || []).filter(m => m.date === tomorrowStr);
        const dueGoals = (data.goals || []).filter(g => g.status !== 'DONE' && g.dueDate === tomorrowStr);
        // Build one entry per item \u2014 each gets its own push and sentKey
        const allDue = [
          ...dueTasks.map(t => ({ label: t.title, type: 'Tarea' })),
          ...dueProjects.map(p => ({ label: p.name, type: 'Proyecto' })),
          ...dueMeetings.map(m => ({ label: m.title, type: 'Reuni\u00f3n' })),
          ...dueGoals.map(g => ({ label: g.title, type: 'Meta' })),
        ];
        if (!allDue.length) continue;
        // Send one push per due entry, with unique sentKey per entry
        for (const entry of allDue) {
          const entrySentKey = `smart:${syncKey}:${todayStr}:dl:${tomorrowStr}:${entry.label.slice(0,40)}`;
          const alreadySent = await env.LBP_KV.get(entrySentKey);
          if (alreadySent) continue;
          const eTitle = `\u23F0 Vence ma\u00f1ana`;
          const eBody = `${entry.type}: "${entry.label}"`;
          for (const sub of subs) {
            try {
              await sendPush(sub, { title: eTitle, body: eBody, alarmId: `dl_${todayStr}_${entry.label.slice(0,20)}`, vibration: 'long' });
            } catch(e) {
              if (e.status === 404 || e.status === 410) {
                const updated = subs.filter(s => s.endpoint !== sub.endpoint);
                await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
              }
            }
          }
          await env.LBP_KV.put(entrySentKey, '1', { expirationTtl: 90000 });
        }
        continue; // already sent individually above, skip the generic send below
      } else if (type === 'weekly') {
        const allTasks = data.tasks || [];
        const open = allTasks.filter(t => t.status !== 'DONE').length;
        const recentDone = allTasks.filter(t => t.status === 'DONE' && t.updatedAt && (Date.now() - t.updatedAt) < 7 * 86400000).length;
        title = '\uD83D\uDCCA Resumen semanal';
        body = `${recentDone} completadas esta semana \u00b7 ${open} pendientes \u2014 \u00a1sigue as\u00ed!`;

      } else if (type === 'stale_alarms') {
        // Tasks with fired alarms that are still open (1-14 days overdue)
        const stale = (data.tasks || []).filter(t => {
          if (t.status === 'DONE') return false;
          if (!t.alarm || !t.alarm.enabled || !t.alarm.datetime) return false;
          const ms = new Date(t.alarm.datetime).getTime();
          const days = (now - ms) / 86400000;
          return ms < now && days >= 1 && days <= 14;
        });
        if (!stale.length) continue;
        const oldest = [...stale].sort((a,b) => new Date(a.alarm.datetime) - new Date(b.alarm.datetime))[0];
        const days = Math.floor((now - new Date(oldest.alarm.datetime).getTime()) / 86400000);
        title = '\u23F0 Tareas con alarma sin completar';
        body = stale.length === 1
          ? `"${oldest.title}" \u2014 alarma de hace ${days} d\u00eda${days>1?'s':''}, sigue abierta`
          : `${stale.length} tareas con alarma pasada siguen abiertas`;

      } else if (type === 'meeting_followup') {
        // Meetings from past 1-14 days without followup \u2014 fires daily per unresolved meeting
        const cutoff14 = new Date(now - 14 * 86400000).toISOString().slice(0, 10);
        const pastMeetings = (data.meetings || []).filter(m => m.date >= cutoff14 && m.date < todayStr);
        if (!pastMeetings.length) continue;
        const hasFollowup = (m) => {
          if (m.followedUp) return true;
          const mEnd = new Date(m.date + 'T' + (m.endTime || m.startTime || '23:00')).getTime();
          return [...(data.tasks || []), ...(data.projects || []), ...(data.journal || [])].some(
            e => e.meetingId === m.id || (e.createdAt && e.createdAt > mEnd && e.createdAt < mEnd + 48 * 3600000)
          );
        };
        const unresolved = pastMeetings.filter(m => !hasFollowup(m));
        if (!unresolved.length) continue;
        for (const m of unresolved) {
          const mSentKey = 'smart:' + syncKey + ':' + todayStr + ':fu:' + (m.id || m.title).slice(0, 30);
          if (await env.LBP_KV.get(mSentKey)) continue;
          const daysAgo = Math.round((now - new Date(m.date).getTime()) / 86400000);
          const mTitle = '\uD83D\uDCCB Reuni\u00f3n sin seguimiento';
          const mBody = '"' + m.title + '" (hace ' + daysAgo + ' d\u00eda' + (daysAgo > 1 ? 's' : '') + ') \u2014 marca seguimiento o crea un entry';
          for (const sub of subs) {
            try {
              await sendPush(sub, { title: mTitle, body: mBody, alarmId: 'fu_' + todayStr + '_' + (m.id || '').slice(0, 12), vibration: 'long' });
            } catch(e) {
              if (e.status === 404 || e.status === 410) {
                await env.LBP_KV.put('subs:' + syncKey, JSON.stringify(subs.filter(s => s.endpoint !== sub.endpoint)));
              }
            }
          }
          await env.LBP_KV.put(mSentKey, '1', { expirationTtl: 90000 });
        }
        continue;

      } else if (type === 'project_health') {
        // Active projects with no updates in 10+ days
        const stagnant = (data.projects || []).filter(p => {
          if (['DONE','ON_HOLD','PAUSED'].includes(p.status)) return false;
          const last = p.updatedAt || p.createdAt || 0;
          return last && (now - last) / 86400000 > 10;
        });
        if (!stagnant.length) continue;
        title = '\uD83D\uDCCB Proyectos sin actividad';
        body = stagnant.length === 1
          ? `"${stagnant[0].name}" lleva m\u00e1s de 10 d\u00edas sin actualizaciones`
          : `${stagnant.length} proyectos activos sin actividad reciente`;

      } else if (type === 'client_health') {
        // Active clients with no meeting in 30+ days
        const cMeetings = data.meetings || [];
        const neglected = (data.clients || []).filter(c => {
          if (!['ACTIVE','CLIENT'].includes(c.status)) return false;
          const cm = cMeetings.filter(m => m.clientId === c.id);
          if (!cm.length) return c.createdAt && (now - c.createdAt) / 86400000 > 30;
          const lastMs = Math.max(...cm.map(m => new Date(m.date).getTime()));
          return (now - lastMs) / 86400000 > 30;
        });
        if (!neglected.length) continue;
        title = '\uD83D\uDC65 Clientes sin contacto reciente';
        body = neglected.length === 1
          ? `"${neglected[0].name || neglected[0].company}" \u2014 m\u00e1s de 30 d\u00edas sin reuni\u00f3n`
          : `${neglected.length} clientes activos sin reuni\u00f3n en 30+ d\u00edas`;
      }

      if (!title) continue;

      // Registro de resultados: antes cualquier error que no fuera 404/410 se
      // tragaba en silencio y ademas se marcaba el dia como enviado, asi que un
      // push fallido era indistinguible de uno entregado. Se guarda en KV
      // (push_log, rolling) y se puede leer con GET /push-log?key=
      let _ok = 0;
      const _fails = [];
      for (const sub of subs) {
        try {
          await sendPush(sub, { title, body, alarmId: `smart_${type}_${todayStr}`, vibration: 'long' });
          _ok++;
        } catch(e) {
          _fails.push({ status: e && e.status, msg: String(e && e.message || e).slice(0, 140), ep: (sub.endpoint || '').slice(0, 60) });
          if (e.status === 404 || e.status === 410) {
            const updated = subs.filter(s => s.endpoint !== sub.endpoint);
            await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
          }
        }
      }
      try {
        const _lk = 'push_log:' + syncKey;
        const _log = JSON.parse(await env.LBP_KV.get(_lk) || '[]');
        _log.unshift({ t: new Date().toISOString(), type, subs: subs.length, sent: _ok, failed: _fails.length, errors: _fails });
        await env.LBP_KV.put(_lk, JSON.stringify(_log.slice(0, 40)), { expirationTtl: 1209600 });
      } catch(_e) { /* el log nunca debe romper el envio */ }
      // Solo marcamos el dia como enviado si al menos un device lo recibio.
      if (_ok > 0) await env.LBP_KV.put(sentKey, '1', { expirationTtl: 90000 }); // 25h TTL
    } catch(e) {
      console.error('Smart notif error:', type, syncKey, e && e.message);
    }
  }
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// Daily info: exchange rates (BCB oficial + cripto P2P) + Santa Cruz weather
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
function _median(nums) {
  const a = nums.filter(n => isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function _fetchBinanceP2P(tradeType) {
  const r = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ asset: 'USDT', fiat: 'BOB', tradeType, page: 1, rows: 8, payTypes: [], publisherType: null }),
  });
  const j = await r.json();
  const prices = (j.data || []).map(a => parseFloat(a.adv && a.adv.price)).filter(isFinite);
  return _median(prices.slice(0, 6));
}

// WMO weathercode \u2192 emoji (fallback open-meteo)
function _wmoEmoji(c) {
  if (c === 0) return '\u2600\ufe0f';
  if (c === 1 || c === 2) return '\u26c5';
  if (c === 3) return '\u2601\ufe0f';
  if (c >= 45 && c <= 48) return '\ud83c\udf2b\ufe0f';
  if (c >= 51 && c <= 67) return '\ud83c\udf27\ufe0f';
  if (c >= 71 && c <= 77) return '\ud83c\udf28\ufe0f';
  if (c >= 80 && c <= 82) return '\ud83c\udf26\ufe0f';
  if (c >= 95) return '\u26c8\ufe0f';
  return '\ud83c\udf24\ufe0f';
}

// Condici\u00f3n (texto alt de Meteored) \u2192 emoji. El orden importa (lluvia antes que "parcial").
function _meteoEmoji(alt) {
  const a = (alt || '').toLowerCase();
  if (a.indexOf('torment') >= 0) return '\u26c8\ufe0f';
  if (a.indexOf('chubasc') >= 0) return '\ud83c\udf26\ufe0f';
  if (a.indexOf('lluvia') >= 0 || a.indexOf('llovizna') >= 0) return '\ud83c\udf27\ufe0f';
  if (a.indexOf('nieve') >= 0) return '\ud83c\udf28\ufe0f';
  if (a.indexOf('niebla') >= 0 || a.indexOf('neblina') >= 0 || a.indexOf('bruma') >= 0) return '\ud83c\udf2b\ufe0f';
  if (a.indexOf('parcial') >= 0 || a.indexOf('claros') >= 0 || a.indexOf('poco nub') >= 0) return '\u26c5';
  if (a.indexOf('cubierto') >= 0 || a.indexOf('nuboso') >= 0 || a.indexOf('nublado') >= 0 || a.indexOf('nubes') >= 0) return '\u2601\ufe0f';
  if (a.indexOf('despejado') >= 0 || a.indexOf('sol') >= 0) return '\u2600\ufe0f';
  return '\ud83c\udf24\ufe0f';
}

// Meteored (meteored.com.bo) \u2014 pron\u00f3stico 7 d\u00edas, tomamos 3 (Hoy, Ma\u00f1ana, +1).
// Datos correctos para Santa Cruz. Devuelve {days:[{label,max,min,emoji}], nowTemp} o null.
async function _fetchMeteoredWeather() {
  const html = await (await fetch('https://www.meteored.com.bo/tiempo-en_Santa+Cruz+de+la+Sierra-America+Sur-Bolivia-Santa+Cruz--1-17636.html', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': 'text/html',
    },
  })).text();

  // temperatura actual observada
  let nowTemp = null;
  const cm = html.match(/dato-temperatura[^>]*data-weather="([\d.\-]+)/);
  if (cm) nowTemp = Math.round(parseFloat(cm[1]));

  // tarjetas de d\u00edas (grid-item dia d1..d7)
  const marks = [...html.matchAll(/class="grid-item dia d\d/g)].map(m => m.index);
  if (!marks.length) return null;
  const seg = html.slice(marks[0], marks[marks.length - 1] + 3000);
  const tiles = seg.split(/class="grid-item dia d\d[^"]*"/).slice(1);
  const decode = s => s.replace(/&ntilde;/g, '\u00f1').replace(/&aacute;/g, '\u00e1').replace(/&eacute;/g, '\u00e9')
    .replace(/&iacute;/g, '\u00ed').replace(/&oacute;/g, '\u00f3').replace(/&uacute;/g, '\u00fa');
  const days = [];
  for (let i = 0; i < Math.min(tiles.length, 3); i++) {
    const t = tiles[i];
    const labM = t.match(/text-0">\s*([^<]+?)\s*<\/span>/);
    const altM = t.match(/symbols\/color\/\d+\.svg"[^>]*alt="([^"]*)"/);
    const mxM = t.match(/class="max[^"]*"[^>]*data-weather="([\d.\-]+)/);
    const mnM = t.match(/class="min[^"]*"[^>]*data-weather="([\d.\-]+)/);
    const pM = t.match(/probabilidad[^>]*>\s*(\d+)%/);
    if (!mxM || !mnM) continue;
    days.push({
      label: labM ? decode(labM[1].trim()) : (i === 0 ? 'Hoy' : (i === 1 ? 'Ma\u00f1ana' : '')),
      max: Math.round(parseFloat(mxM[1])),
      min: Math.round(parseFloat(mnM[1])),
      emoji: _meteoEmoji(altM ? altM[1] : ''),
      rain: pM ? parseInt(pM[1], 10) : null,
    });
  }
  return days.length ? { days: days, nowTemp: nowTemp } : null;
}

// Fecha de hoy en Bolivia (UTC-4) como YYYY-MM-DD.
function _hoyBolivia(now) {
  return new Date((now || Date.now()) - 4 * 3600 * 1000).toISOString().slice(0, 10);
}

// Ultimo dia habil en Bolivia (YYYY-MM-DD). El BCB no publica sabados ni domingos,
// asi que el fin de semana la cotizacion vigente es la del viernes: comparar contra
// "hoy" daria por atrasado un dato que esta correcto, y haria refrescar en vano cada
// media hora todo el fin de semana. No cubre feriados (ahi si avisara, y preferimos
// que avise de mas que de menos).
function _ultHabilBolivia(now) {
  const d = new Date((now || Date.now()) - 4 * 3600 * 1000), g = d.getUTCDay();
  if (g === 0) d.setUTCDate(d.getUTCDate() - 2);
  else if (g === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// BCB DIRECTO (www.bcb.gob.bo) - fuente autoritativa del tipo de cambio oficial.
// El home trae la tarjeta "is-tc-oficial" con la fecha legible por maquina en
// <time datetime="YYYY-MM-DD"> y el valor en <span class="bcb-tco-num">NN,NN</span>.
// Devolver la fecha es lo importante: es la unica fuente que declara DE QUE DIA
// es el dato, asi que es la unica con la que se puede saber si ya publicaron hoy
// en vez de adivinar. Devuelve {venta, fecha} o null.
// (Historico: se creia que bcb.gob.bo devolvia 429 a las IPs de datacenter de
//  Cloudflare y por eso se leia via r.jina.ai o dolarbluebolivia.click. Hoy
//  responde 200 directo; si volviera a bloquear, la cadena de respaldo sigue.)
async function _fetchBcbDirect() {
  const html = await (await fetch('https://www.bcb.gob.bo/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9',
    },
  })).text();
  return _parseBcbHtml(html);
}

// Parser del home del BCB, separado del fetch para poder correrlo sobre el HTML
// venga de donde venga (directo o via proxy lector).
function _parseBcbHtml(html) {
  if (!html) return null;
  // ACOTAR a la tarjeta del tipo de cambio. Es obligatorio, no una optimizacion:
  // el home trae varias tarjetas con la misma estructura y FECHAS DISTINTAS (una
  // de ellas tenia 2026-09-30 mientras el tipo de cambio era del 2026-10-02), asi
  // que tomar el primer <time> de la pagina daria una fecha equivocada.
  // Se ancla en class="... is-tc-oficial ..." porque en el CSS la clase se escribe
  // con punto (.bcb-kpi2-card.is-tc-oficial) y ahi no hay ningun class="...":
  // exigir el atributo garantiza que caemos en el marcado y no en el <style>.
  const am = html.match(/class="[^"]*\bis-tc-oficial\b[^"]*"/);
  if (!am) return null;
  // Cortar en el <article> siguiente, que es el limite real de la tarjeta. Con una
  // ventana fija de N caracteres el recorte entraba en la tarjeta de al lado (que
  // tiene su propio <time> con otra fecha) y solo acertabamos por el orden de los
  // matches: si el BCB quitara el <time> de esta tarjeta, heredariamos su fecha.
  const resto = html.slice(am.index + am[0].length);
  const fin = resto.search(/<article\b/);
  const card = fin > 0 ? resto.slice(0, fin) : resto.slice(0, 4000);
  const mv = card.match(/class="bcb-tco-num"[^>]*>\s*([0-9]{1,2}[.,][0-9]{2})/);
  if (!mv) return null;
  const v = parseFloat(mv[1].replace(',', '.'));
  if (!isFinite(v) || v <= 1 || v >= 100) return null;
  const mf = card.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/);
  return { venta: v, fecha: mf ? mf[1] : null };
}

async function refreshDailyInfo(env, trigger, opts) {
  const prev = JSON.parse(await env.LBP_KV.get('dailyinfo_v2') || 'null') || {};
  const info = {
    bcb: prev.bcb || null,
    crypto: prev.crypto || null,
    weather: prev.weather || null,
    weatherNow: prev.weatherNow || null,
    bcbFecha: prev.bcbFecha || null,
    bcbSource: prev.bcbSource || null,
    updatedAt: Date.now(),
  };

  // 1+2. Tipo de cambio: oficial (BCB) + cripto/paralelo. Fuente principal: DolarAPI Bolivia.
  // (fetch directo a bcb.gob.bo / p2p.binance.com FALLA desde Cloudflare: bloquean IPs de datacenter.
  //  DolarAPI es una API p\u00fablica que s\u00ed responde a Workers.)
  const errs = [];
  let dolarFecha = null;   // fechaActualizacion que reporta DolarAPI para el oficial
  let bcbSource = null;    // 'bcb' (directo, sin lag) | 'dolarapi' (respaldo, ~13h de retraso)

  let bcbFecha = null;     // fecha "as of" que declara el propio BCB (YYYY-MM-DD)

  // (0) PRIMARIO: BCB DIRECTO. Es la fuente oficial y la unica que trae su propia
  //     fecha, de modo que podemos distinguir "el BCB todavia no publico" de
  //     "nuestro refresco no corrio".
  try {
    const bd = await _fetchBcbDirect();
    if (bd) {
      info.bcb = { venta: bd.venta, compra: bd.venta };
      bcbFecha = bd.fecha;
      bcbSource = 'bcb-directo';
    } else { errs.push('bcb-directo:no-match'); }
  } catch (e) { errs.push('bcb-directo:' + (e && e.message)); }

  // (1) RESPALDO: dolarbluebolivia.click (Astro server-render, sin rate limit).
  //     El oficial esta en <span class="faq-official">Bs 11.80</span>. OJO: este
  //     sitio refleja el cambio del BCB con retraso - a las 20:10 Bolivia todavia
  //     devolvia el valor del dia anterior (ver dailyinfo_log, 25-sep a 2-oct).
  //     Por eso bajo a respaldo y el BCB subio a primario.
  if (!bcbSource) try {
    const h2 = await (await fetch('https://www.dolarbluebolivia.click/', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const m = h2 && h2.match(/faq-official[^>]*>\s*Bs\s*([0-9]{1,2}[.,][0-9]{2})/i);
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (isFinite(v) && v > 1 && v < 100) { info.bcb = { venta: v, compra: v }; bcbSource = 'dolarblue'; } }
    if (!bcbSource) errs.push('dolarblue:no-match');
  } catch (e) { errs.push('dolarblue:' + (e && e.message)); }

  // (2) BCB real v\u00eda proxy lector r.jina.ai (autoritativo, pero inestable: 429 / render variable).
  //     Solo si dolarblue fall\u00f3. Opcional secret JINA_API_KEY sube el l\u00edmite (por-clave).
  if (!bcbSource) {
    try {
      const jinaHeaders = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/plain', 'X-Return-Format': 'text' };
      if (env.JINA_API_KEY) jinaHeaders['Authorization'] = 'Bearer ' + env.JINA_API_KEY;
      const txt = await (await fetch('https://r.jina.ai/https://www.bcb.gob.bo/', { headers: jinaHeaders })).text();
      const m = txt && txt.match(/Bolivianos por d[o\u00f3]lar estadounidense[\s\S]{0,140}?([0-9]{1,2}[.,][0-9]{2})/i);
      if (m) { const v = parseFloat(m[1].replace(',', '.')); if (isFinite(v) && v > 1 && v < 100) { info.bcb = { venta: v, compra: v }; bcbSource = 'bcb-jina'; } }
      if (!bcbSource) errs.push('jina:no-match:' + (txt || '').replace(/\s+/g, ' ').slice(0, 40));
    } catch (e) { errs.push('jina:' + (e && e.message)); }
  }

  // DolarAPI: cripto/paralelo siempre; y RESPALDO del oficial solo si el BCB fall\u00f3.
  try {
    const arr = await (await fetch('https://bo.dolarapi.com/v1/dolares', { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
    if (Array.isArray(arr)) {
      const of = arr.find(x => x.casa === 'oficial');
      const bn = arr.find(x => ['binance', 'cripto', 'blue', 'paralelo'].includes(x.casa));
      if (of) dolarFecha = of.fechaActualizacion || null;
      if (!bcbSource && of && isFinite(of.venta)) { info.bcb = { venta: of.venta, compra: of.compra }; bcbSource = 'dolarapi'; }
      // CONFIRMACION DE FECHA. El BCB responde 429 a las IPs de Cloudflare, asi
      // que no podemos leer su fecha autoritativa; DolarAPI si publica la suya
      // (fechaActualizacion). Si DolarAPI dice "hoy" Y coincide con el valor que
      // ya tenemos, damos la fecha por confirmada. Si discrepan, el valor que
      // mandamos es el de dolarblue (va adelantado respecto a DolarAPI: el 2-oct
      // a las 08:00 dolarblue ya tenia 11,90 y DolarAPI seguia en el 1-oct) y
      // dejamos la fecha sin confirmar en vez de inventarla.
      if (!bcbFecha && of && dolarFecha && info.bcb && isFinite(of.venta)) {
        const fd = String(dolarFecha).slice(0, 10);
        if (fd === _hoyBolivia() && Math.abs(of.venta - info.bcb.venta) < 0.005) bcbFecha = fd;
      }
      if (bn && isFinite(bn.venta)) info.crypto = { venta: bn.venta, compra: bn.compra };
    }
  } catch (e) { errs.push('dolarapi:' + (e && e.message)); }

  // Fallback cripto: CriptoYa (Binance P2P USDT/BOB) si DolarAPI no dio cripto
  if (!info.crypto) {
    try {
      const cy = await (await fetch('https://criptoya.com/api/usdt/bob/1')).json();
      const bp = cy && cy.binancep2p;
      if (bp && isFinite(bp.ask)) info.crypto = { venta: bp.ask, compra: bp.bid };
    } catch (e) { errs.push('criptoya:' + (e && e.message)); }
  }
  info._errors = errs;

  // 3. Clima Santa Cruz \u2014 PRIMARIO: Meteored (datos correctos). FALLBACK: open-meteo.
  // Se omite en los refrescos de solo-tipo-de-cambio (cada 30 min): Meteored es un
  // scrape pesado de HTML, el pronostico no cambia cada media hora, y raspar su
  // home 48 veces al dia es justo lo que hace que a uno lo bloqueen.
  const soloTC = !!(opts && opts.soloTC);
  let mtWeather = null;
  if (soloTC) { /* sin clima en este refresco */ } else {
  try { mtWeather = await _fetchMeteoredWeather(); } catch (e) { errs.push('meteored:' + (e && e.message)); }
  if (mtWeather && mtWeather.days.length) {
    info.weather = mtWeather.days;
    info.weatherNow = (mtWeather.nowTemp != null) ? { temp: mtWeather.nowTemp } : (info.weatherNow || null);
  } else {
    try {
      const w = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=-17.7833&longitude=-63.1821&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=America/La_Paz&forecast_days=3')).json();
      const d = w.daily;
      if (d && d.time) {
        info.weather = d.time.slice(0, 3).map((t, i) => ({
          label: i === 0 ? 'Hoy' : (i === 1 ? 'Ma\u00f1ana' : ['dom','lun','mar','mi\u00e9','jue','vie','s\u00e1b'][new Date(t + 'T00:00').getDay()]),
          max: Math.round(d.temperature_2m_max[i]),
          min: Math.round(d.temperature_2m_min[i]),
          emoji: _wmoEmoji(d.weathercode[i]),
          rain: d.precipitation_probability_max[i],
        }));
      }
    } catch (e) { errs.push('openmeteo:' + (e && e.message)); }
  }
  }

  // bcbFecha se sobreescribe SIEMPRE, incluso con null. null significa "no pudimos
  // confirmar de que dia es este valor", y eso es justo lo que hay que guardar:
  // conservar la fecha del cache etiquetaria un valor posiblemente nuevo con una
  // fecha vieja (un "al 01/10" falso en el briefing). Preferimos no afirmar nada.
  info.bcbFecha = bcbFecha;
  if (bcbSource) info.bcbSource = bcbSource;

  // REGISTRO DE CAMBIOS: una entrada solo cuando el valor cambia de verdad. El log
  // general recibe 48 entradas por dia y rota, asi que no sirve para contestar "a
  // que hora cambio el tipo de cambio". Guardando solo los cambios, 120 entradas
  // cubren meses, y cada entrada trae la hora exacta en que lo vimos cambiar.
  // OJO: la hora es cuando NOSOTROS lo detectamos (resolucion 30 min), no la hora
  // en que el BCB publico. Es lo mas cerca que podemos estar: el BCB devuelve 429
  // a las IPs de Cloudflare, asi que no hay forma de leer su hora de publicacion.
  try {
    const antes = prev.bcb ? prev.bcb.venta : null;
    const ahora = info.bcb ? info.bcb.venta : null;
    // Number.isFinite, NO isFinite: el global convierte primero, y isFinite(null)
    // es true porque Number(null) es 0. Con el global, el primer arranque (sin
    // valor previo) registraba un cambio falso "de 0 a 11,90", y lo mismo cada vez
    // que se cayeran todas las fuentes. Number.isFinite(null) es false.
    if (Number.isFinite(antes) && Number.isFinite(ahora) && Math.abs(antes - ahora) >= 0.005) {
      const camb = JSON.parse(await env.LBP_KV.get('tc_cambios') || '[]');
      camb.push({
        t: new Date().toISOString(),
        de: antes, a: ahora,
        fecha: bcbFecha, fuente: bcbSource,
        trigger: (trigger || '') + (opts && opts.soloTC ? '/tc' : ''),
      });
      while (camb.length > 120) camb.shift();
      await env.LBP_KV.put('tc_cambios', JSON.stringify(camb));
    }
  } catch (e) { /* el registro nunca debe romper el refresco */ }

  await env.LBP_KV.put('dailyinfo_v2', JSON.stringify(info));

  // Diagn\u00f3stico: una entrada por refresco (rolling, \u00faltimas 40). Permite ver CU\u00c1NDO
  // corri\u00f3 cada refresco, qu\u00e9 valor devolvi\u00f3 DolarAPI, su propio fechaActualizacion,
  // y cualquier error \u2014 para saber si el refresco de las 7am corri\u00f3 y qu\u00e9 trajo.
  try {
    const log = JSON.parse(await env.LBP_KV.get('dailyinfo_log') || '[]');
    log.push({
      t: new Date().toISOString(),
      trigger: (trigger || 'unknown') + (opts && opts.soloTC ? '/tc' : ''),
      bcbVenta: info.bcb ? info.bcb.venta : null,
      bcbSource: bcbSource,
      bcbFecha: bcbFecha,
      alDia: bcbFecha ? (bcbFecha === _ultHabilBolivia()) : null,
      dolarFecha: dolarFecha,
      cryptoVenta: info.crypto ? info.crypto.venta : null,
      errors: errs,
    });
    // 300 entradas, no 40: con el refresco cada 30 min entran 48 por dia, asi que
    // un tope de 40 daba menos de 21 horas de historia y el log se vaciaba antes de
    // poder revisar la noche anterior. 300 cubre ~6 dias.
    while (log.length > 300) log.shift();
    await env.LBP_KV.put('dailyinfo_log', JSON.stringify(log));
  } catch (e) { /* el logging nunca debe romper el refresco */ }

  return info;
}

async function scheduledHandler(event, env) {
    const now = Date.now();

    // REFRESCO DEL TIPO DE CAMBIO: cada 30 minutos, todo el dia.
    // Antes eran 3 horarios fijos y el de las 20:10 Bolivia nunca llegaba a ver el
    // valor nuevo (ver dailyinfo_log del 25-sep al 2-oct: a las 20:10 la fuente
    // seguia dando el valor del dia anterior y el cambio recien aparecia por la
    // manana). En vez de adivinar la hora exacta de publicacion -- que no podemos
    // comprobar, porque el BCB devuelve 429 a las IPs de Cloudflare -- se consulta
    // cada media hora: el atraso maximo pasa a ser de 30 minutos sea cuando sea.
    // Costo: 48 refrescos/dia x 2 escrituras en KV = 96, muy por debajo del limite
    // de 1.000/dia del plan gratuito.
    //
    // EL CLIMA sigue 3x/dia (20:30, 07:00 y 16:00 Bolivia = 00:30, 11:00 y 20:00
    // UTC; Bolivia es UTC-4 todo el ano). Su fuente es un scrape pesado.
    //
    // Ventanas de 5 minutos, no de 1: Cloudflare pierde ~20% de los disparos del
    // cron sin dejar rastro. El guard de 20 minutos evita que una ventana de 5
    // disparos refresque 5 veces.
    // Corre antes del early-return de syncKeys para no depender del registro.
    {
      const d0 = new Date(now), h = d0.getUTCHours(), mm = d0.getUTCMinutes();
      const enVentana = (mm < 5) || (mm >= 30 && mm < 35);
      const conClima = (h === 0 && mm >= 30 && mm < 35) || (h === 11 && mm < 5) || (h === 20 && mm < 5);
      if (enVentana) {
        let last = 0;
        try { last = (JSON.parse(await env.LBP_KV.get('dailyinfo_v2') || 'null') || {}).updatedAt || 0; } catch (e) { last = 0; }
        if (now - last > 20 * 60 * 1000) {
          const et = 'cron:' + String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + 'UTC';
          try { await refreshDailyInfo(env, et, { soloTC: !conClima }); } catch (e) { /* ignore */ }
        }
      }
    }

    // NEVER call KV.list() here \u2014 free tier allows only 1,000 list ops/day
    // but the cron fires 1,440 times/day. Using list() in the cron exhausts
    // the quota before noon every day.
    // If the registry is empty, skip silently. It gets populated automatically
    // when the app registers for push (/subscribe) or schedules alarms (/alarms/batch).
    // Use GET /rebuild-registry from Cloud Settings to seed it manually if needed.
    const syncKeys = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
    if (syncKeys.length === 0) return;

    for (const syncKey of syncKeys) {
     try {
      const name = `alarms:${syncKey}`;
      const alarms = JSON.parse(await env.LBP_KV.get(name) || '[]');

      // Time-due alarms first. If none, skip WITHOUT touching the data blob.
      // (Fetching+parsing the full data blob every minute is expensive and, on the
      // heavy 12:00 UTC tick that also refreshes rates + builds the AI briefing, it
      // pushed the invocation over its limit and aborted the briefing send.)
      const timeDue = alarms.filter(a => a.triggerAt <= now && (now - a.triggerAt) < 6 * 60 * 1000);
      if (!timeDue.length) continue;

      // Only NOW load the synced data to validate owners: an alarm whose entity is
      // completed/cancelled/archived is STALE (a stale client keeps re-registering it).
      // Never fire it, and purge its occurrences. IDs are entityId + '_' + <ms>.
      let deadIds = [];
      try {
        const draw = await env.LBP_KV.get(`data:${syncKey}`);
        if (draw) {
          const ddata = JSON.parse(draw);
          const consider = (en) => {
            if (!en || !en.id) return;
            if (en.status === 'DONE' || en.status === 'CANCELLED' || en.status === 'ARCHIVED' || en.completed === true || en.done === true) deadIds.push(en.id);
            if (Array.isArray(en.subtasks)) en.subtasks.forEach(consider);
            if (Array.isArray(en.milestones)) en.milestones.forEach(consider);
          };
          Object.keys(ddata).forEach(k => { if (Array.isArray(ddata[k])) ddata[k].forEach(consider); });
        }
      } catch (e) { deadIds = []; }
      const isDead = (alarmId) => {
        for (let i = 0; i < deadIds.length; i++) { if (alarmId && alarmId.indexOf(deadIds[i] + '_') === 0) return true; }
        return false;
      };

      const due = timeDue.filter(a => !isDead(a.alarmId));

      if (due.length) {
        const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
        for (const alarm of due) {
          for (const sub of subs) {
            try {
              await sendPush(sub, { title: alarm.title, body: alarm.body, alarmId: alarm.alarmId, vibration: alarm.vibration || 'long' });
            } catch (e) {
              // Subscription expired \u2014 remove it
              if (e.status === 404 || e.status === 410) {
                const updated = subs.filter(s => s.endpoint !== sub.endpoint);
                await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
              }
            }
          }
        }
      }

      // Remove fired alarms AND every stale (dead-owner) alarm.
      const remaining = alarms.filter(a => !due.find(d => d.alarmId === a.alarmId) && !isDead(a.alarmId));
      if (remaining.length !== alarms.length) {
        await env.LBP_KV.put(name, JSON.stringify(remaining));
      }
     } catch (e) { /* per-syncKey guard: never let one key abort the smart-notif block below */ }
    }

    // === Smart Notifications ===
    // Times are UTC. La Paz, Bolivia = UTC-4 (always, no DST).
    const nowDate = new Date(now);
    const utcH = nowDate.getUTCHours();
    const utcM = nowDate.getUTCMinutes();
    const utcDow = nowDate.getUTCDay(); // 0=Sun
    const todayUTC = nowDate.toISOString().slice(0, 10);
    const tomorrowUTC = new Date(now + 86400000).toISOString().slice(0, 10);

    // Daily briefing: 12:00 UTC = 8am Bolivia (UTC-4, no DST)
    // Briefing 12:03 UTC (8:03am Bolivia), NO 12:00. A las 12:00 el mismo tick
    // refresca el tipo de cambio (varios fetches externos, Jina incluido, que es
    // lento e inestable). Juntar eso + generar el briefing con Opus 5 + firmar y
    // enviar los push en UNA sola invocacion la sobrecargaba, y los envios ---que
    // van al final--- morian. Con 3 minutos de separacion el briefing corre en su
    // propia invocacion liviana y lee el TC ya cacheado en KV.
    if (utcH === 12 && utcM >= 3 && utcM < 5) {
      await sendSmartNotif(env, syncKeys, 'briefing', todayUTC, tomorrowUTC);
    }
    // Habit reminder: 01:00 UTC = 9pm Bolivia (UTC-4)
    if (utcH === 1 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'habits', todayUTC, tomorrowUTC);
    }
    // Deadline alerts: 21:00 UTC = 5pm Bolivia (UTC-4) \u2014 one push per entry
    if (utcH === 21 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'deadlines', todayUTC, tomorrowUTC);
    }
    // Weekend summary: Saturday 11am Bolivia = 15:00 UTC
    if (utcDow === 6 && utcH === 15 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'weekly', todayUTC, tomorrowUTC);
    }

    // \u2500\u2500 Intelligent Alerts (Bolivia UTC-4) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Stale alarms: Mon-Fri 10am Bolivia = 14:00 UTC
    if (utcH === 14 && utcM < 2 && utcDow >= 1 && utcDow <= 5) {
      await sendSmartNotif(env, syncKeys, 'stale_alarms', todayUTC, tomorrowUTC);
    }
    // Meeting follow-up: every day 9am Bolivia = 13:00 UTC (daily until followedUp)
    if (utcH === 13 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'meeting_followup', todayUTC, tomorrowUTC);
    }
    // Project health + Client health: every Monday 9:45am Bolivia = 13:45 UTC
    if (utcDow === 1 && utcH === 13 && utcM >= 45 && utcM < 47) {
      await sendSmartNotif(env, syncKeys, 'project_health', todayUTC, tomorrowUTC);
      await sendSmartNotif(env, syncKeys, 'client_health', todayUTC, tomorrowUTC);
    }
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// Web Push implementation (RFC 8030 + RFC 8291 aes128gcm + VAPID)
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64uDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function concat(...bufs) {
  const total = bufs.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) { out.set(new Uint8Array(b), off); off += b.byteLength; }
  return out.buffer;
}

async function makeVapidJWT(endpoint) {
  const origin = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 43200;
  const enc = new TextEncoder();
  const hdr = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const pay = b64u(enc.encode(JSON.stringify({ aud: origin, exp, sub: VAPID_SUBJECT })));
  const msg = `${hdr}.${pay}`;
  const key = await crypto.subtle.importKey('jwk', VAPID_PRIVATE_JWK,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(msg));
  return `${msg}.${b64u(sig)}`;
}

async function encryptPayload(subscription, plaintext) {
  const enc = new TextEncoder();
  const payload = enc.encode(JSON.stringify(plaintext));

  // User keys from subscription
  const uaPublic = b64uDecode(subscription.keys.p256dh);
  const authSecret = b64uDecode(subscription.keys.auth);

  // Generate server EC key pair
  const serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));

  // Import user public key
  const uaPublicKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, serverKeys.privateKey, 256);

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM = HKDF(salt=auth, IKM=sharedSecret, info="WebPush: info\0" || uaPublic || serverPublicRaw, len=32)
  const prkInfo = concat(enc.encode('WebPush: info\0'), uaPublic, serverPublicRaw);
  const ikmKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits']);
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: prkInfo }, ikmKey, 256);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = enc.encode('Content-Encoding: nonce\0');
  const hkdfKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cek = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, hkdfKey, 128);
  const nonce = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, hkdfKey, 96);

  // AES-GCM encrypt (add padding delimiter byte 0x02)
  const padded = concat(payload, new Uint8Array([2]));
  const aesCek = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesCek, padded);

  // Build aes128gcm content: salt(16) + rs(4, big-endian) + keylen(1) + serverPublic(65) + ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = concat(salt, rs, new Uint8Array([65]), serverPublicRaw, ciphertext);
  return body;
}

async function sendPush(subscription, data) {
  const jwt = await makeVapidJWT(subscription.endpoint);
  const body = await encryptPayload(subscription, data);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',   // delivers immediately via FCM/APNs \u2192 enables heads-up banners on Android
    },
    body,
  });

  if (!res.ok && res.status !== 201) {
    const err = new Error(`Push failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
}
