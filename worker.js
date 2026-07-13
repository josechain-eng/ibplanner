// ═══════════════════════════════════════════════════════════════
// Life Business Planner 2026 — Cloudflare Worker
// Handles: data sync, push subscriptions, alarm scheduling
// ═══════════════════════════════════════════════════════════════

// ── VAPID keys (generated, do not change) ──────────────────────
const VAPID_PUBLIC_KEY = 'BApPK_6j13xSMZOEpBPK2lUtfH02sSarLJ8469bpbULrUYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0';
const VAPID_PRIVATE_JWK = {"key_ops":["sign"],"ext":true,"kty":"EC","x":"Ck8r_qPXfFIxk4SkE8raVS18fTaxJqssnzjr1ultQus","y":"UYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0","crv":"P-256","d":"-X7F-ZLnRwC0O8pjVQO7vjhYKmAQUsDR-f50nF2epuo"};
const VAPID_SUBJECT = 'mailto:admin@lifeplanner.app';

// ── CORS headers ───────────────────────────────────────────────
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

// ── Main export ────────────────────────────────────────────────
export default {
  // ── HTTP handler ─────────────────────────────────────────────
  async fetch(request, env) {
    // Global try-catch: any unhandled exception returns a CORS-enabled error.
    // Without this, Cloudflare's own 500 page has no CORS headers → browser
    // blocks the response and the app sees "CORS policy" errors for every request.
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('Worker unhandled exception:', err && err.message ? err.message : String(err));
      return json({ error: 'Internal server error', detail: err && err.message ? err.message : String(err) }, 500);
    }
  },

  // ── Cron handler — runs every minute ─────────────────────────
  async scheduled(event, env) {
    return scheduledHandler(event, env);
  },
};

// ── Separated so the try-catch above can wrap everything cleanly ──
async function handleRequest(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const p = url.pathname;

    // GET /vapid-key  →  return public key so app can subscribe
    if (p === '/vapid-key' && request.method === 'GET') {
      return json({ key: VAPID_PUBLIC_KEY });
    }

    // POST /sync  →  save full data blob for a sync key
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

    // GET /sync?key=…  →  load data blob
    if (p === '/sync' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const raw = await env.LBP_KV.get(`data:${syncKey}`);
      return json({ data: raw ? JSON.parse(raw) : null });
    }

    // POST /subscribe  →  store push subscription for a sync key
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

    // POST /alarm  →  schedule an alarm (single, kept for compatibility)
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

    // POST /alarms/batch  →  replace ALL alarms for a syncKey in ONE KV write (preferred)
    if (p === '/alarms/batch' && request.method === 'POST') {
      const { syncKey, alarms } = await request.json();
      if (!syncKey || !Array.isArray(alarms)) return json({ error: 'missing fields' }, 400);
      await env.LBP_KV.put(`alarms:${syncKey}`, JSON.stringify(alarms), { expirationTtl: 60 * 60 * 24 * 365 });
      await registerSyncKey(env, syncKey);
      return json({ ok: true });
    }

    // DELETE /alarm?key=…&id=…  →  cancel an alarm
    if (p === '/alarm' && request.method === 'DELETE') {
      const syncKey = url.searchParams.get('key');
      const alarmId = url.searchParams.get('id');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const alarms = JSON.parse(await env.LBP_KV.get(`alarms:${syncKey}`) || '[]');
      await env.LBP_KV.put(`alarms:${syncKey}`, JSON.stringify(alarms.filter(a => a.alarmId !== alarmId)));
      return json({ ok: true });
    }

    // GET /list-alarms?key=…  →  list stored alarms (diagnostic)
    if (p === '/list-alarms' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const alarms = JSON.parse(await env.LBP_KV.get(`alarms:${syncKey}`) || '[]');
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      return json({ alarms, alarmCount: alarms.length, subscriptionCount: subs.length });
    }

    // POST /test-push  →  immediately push to all devices for a syncKey (diagnostic)
    if (p === '/test-push' && request.method === 'POST') {
      const { syncKey } = await request.json();
      if (!syncKey) return json({ error: 'missing syncKey' }, 400);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      if (!subs.length) return json({ error: 'no subscriptions registered for this syncKey', hint: 'Open the app on this device, go to Cloud Settings and tap Re-register' }, 404);
      let sent = 0, failed = 0;
      for (const sub of subs) {
        try {
          await sendPush(sub, { title: 'Test Push from Cloud ☁️', body: 'Cloudflare → phone pipeline is working!', alarmId: 'test_' + Date.now(), vibration: 'long' });
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

    // GET /rebuild-registry  →  one-time fix: seed synckeys_registry from KV.list()
    // Call this ONCE from Cloud Settings if the registry is empty after a fresh deploy.
    // Do NOT call this on a schedule — it burns list operations.
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

    // GET /debug-smart?key=  →  shows what smart notifications would fire NOW (no push sent)
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

    // GET /check-sub?key=…&endpoint=…  →  verify a subscription is still in KV
    // Used by the app on startup / visibilitychange to detect silently-expired subs
    if (p === '/check-sub' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      const endpoint = url.searchParams.get('endpoint');
      if (!syncKey || !endpoint) return json({ error: 'missing params' }, 400);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      const found = subs.some(s => s.endpoint === endpoint);
      return json({ found, count: subs.length });
    }

    // POST /chat  →  proxy to Claude API (key stored as Worker secret ANTHROPIC_API_KEY)
    if (p === '/chat' && request.method === 'POST') {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set.' }, 500);
      const { messages, systemPrompt, area } = await request.json();
      if (!messages || !Array.isArray(messages)) return json({ error: 'messages array required' }, 400);
      const content = await callClaude(env, messages, systemPrompt || ('You are a strategic business consultant for Ventura Mall. Help brainstorm ' + (area || 'business') + ' ideas.'), 2048);
      return json({ content });
    }

    // GET /briefing-ai?key=&date=  →  returns today's AI-generated briefing from KV
    if (p === '/briefing-ai' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key');
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      if (!syncKey) return json({ error: 'missing key' }, 400);
      const stored = await env.LBP_KV.get(`briefing_ai:${syncKey}:${date}`);
      if (!stored) return json({ ready: false, message: 'Briefing not yet generated. Will arrive at 8am.' });
      return json({ ready: true, briefing: stored, date });
    }

    // POST /analyze-doc  →  send a stored file to Claude for intelligent analysis
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

      const systemPrompt = 'Eres un asistente de análisis de documentos para un gerente de mall (Ventura Mall, Bolivia). Analiza el documento y extrae información estructurada. Responde SOLO con JSON válido, sin texto adicional.';

      const userPrompt = `Analiza este documento (${fileName}) y devuelve un JSON con esta estructura exacta:
{
  "summary": ["punto clave 1", "punto clave 2", ...],
  "dates": [{"date": "YYYY-MM-DD o descripción", "description": "qué significa esta fecha"}],
  "obligations": ["obligación o compromiso 1", ...],
  "parties": ["parte involucrada 1", ...],
  "title": "título o tema del documento",
  "docType": "contrato|factura|propuesta|informe|otro"
}

Si no hay fechas, dates=[] ; si no hay obligaciones, obligations=[] ; etc.
Máximo 6 items por lista. Sé conciso y específico.`;

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
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: contentBlocks }]
        })
      });

      if (!apiRes.ok) {
        const err = await apiRes.text();
        return json({ error: 'Claude API error: ' + err }, apiRes.status);
      }
      const apiData = await apiRes.json();
      const rawText = apiData.content && apiData.content[0] ? apiData.content[0].text : '{}';

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

    // GET /briefing  →  daily briefing summary (tasks, projects, meetings, alarms)
    // No syncKey needed — reads registry and picks freshest data blob.
    if (p === '/briefing' && request.method === 'GET') {
      const now = Date.now();
      const registry = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
      if (!registry.length) return json({ error: 'no registry found — open the app first' }, 404);

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
          // Count alarms for TODAY (Bolivia UTC-4) — both already fired and upcoming
          const boliviaNow = now - 4 * 3600 * 1000;
          const todayBO = new Date(boliviaNow);
          todayBO.setUTCHours(0, 0, 0, 0);
          const todayStartUTC = todayBO.getTime() + 4 * 3600 * 1000;
          const todayEndUTC   = todayStartUTC + 86400000;
          totalAlarms += alarms.filter(a => a.triggerAt >= todayStartUTC && a.triggerAt < todayEndUTC).length;
        }
      }

      if (!bestData) return json({ error: 'no synced data found — open the app and sync' }, 404);

      // Tasks — only non-DONE (status 'INBOX' is the active state used by the app)
      const tasks = (bestData.tasks || [])
        .filter(t => t.status !== 'DONE' && t.status !== 'done' && t.status !== 'completed' && !t.completed)
        .map(t => ({ title: t.title || t.name, status: t.status, priority: t.priority, dueDate: t.dueDate }));

      // Projects — active (not completed/archived/done)
      const projects = (bestData.projects || [])
        .filter(pr => pr.status !== 'DONE' && pr.status !== 'done' && pr.status !== 'completed' && pr.status !== 'archived')
        .map(pr => ({ name: pr.name || pr.title, status: pr.status, department: pr.department }));

      // Meetings — today and upcoming
      const todayStr = new Date().toISOString().slice(0, 10);
      const meetings = (bestData.meetings || [])
        .filter(m => (m.date || '') >= todayStr)
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
        .slice(0, 10)
        .map(m => ({ title: m.title || m.name, date: m.date, time: m.time, location: m.location }));

      // Goals — active
      const goals = (bestData.goals || [])
        .filter(g => g.status !== 'completed' && g.status !== 'done')
        .map(g => ({ title: g.title || g.name, progress: g.progress, dueDate: g.dueDate }));

      // Habits — active
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

    // ── GET /file-stats?key=  — R2 storage usage for this syncKey ──
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

    // ── POST /file  — upload file to R2 (or KV fallback) for cross-device access ──
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
        // KV fallback: 25 MB value limit → ~15 MB file cap
        if (body.data.length > 22 * 1024 * 1024) return json({ error: 'file too large for cloud sync — add R2 binding for larger files' }, 413);
        await env.LBP_KV.put(`file:${body.syncKey}:${body.fileId}`, val, { expirationTtl: 365 * 24 * 3600 });
      }
      return json({ ok: true });
    }

    // ── GET /file?key=&id=  — retrieve file from R2 (or KV fallback) ──
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

    // ── DELETE /file?key=&id=  — remove file from R2 (or KV fallback) ──
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

    // POST /backup?key=…&date=…  →  store daily backup snapshot in KV (kept 30 days)
    if (p === '/backup' && request.method === 'POST') {
      const key = url.searchParams.get('key');
      const date = url.searchParams.get('date') || new Date().toISOString().slice(0,10);
      if (!key) return json({ error: 'missing key' }, 400);
      const body = await request.text();
      if (!body || body.length > 20971520) return json({ error: 'too large' }, 413);
      await env.LBP_KV.put('backup:' + key + ':' + date, body, { expirationTtl: 30 * 86400 });
      return json({ ok: true, date: date, bytes: body.length });
    }

    // GET /backups?key=…  →  list available backup dates
    if (p === '/backups' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) return json({ error: 'missing key' }, 400);
      const prefix = 'backup:' + key + ':';
      const list = await env.LBP_KV.list({ prefix: prefix });
      const dates = list.keys.map(function(k){ return k.name.replace(prefix,''); }).sort().reverse();
      return json({ dates: dates });
    }

    // GET /backup?key=…&date=…  →  retrieve a specific backup
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

// ── Registry helper — tracks known syncKeys using get/put instead of list() ──
// list() costs 1 op each call; get() costs 1 op from a 100k/day quota.
// We call scheduledHandler every minute (1,440×/day) so list() burns the
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
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens || 1024, system, messages })
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.content && data.content[0]) ? data.content[0].text : '';
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
        const overdue = tasks.filter(t => t.dueDate && t.dueDate < todayStr);
        const projects = (data.projects || []).filter(p => !['DONE','CANCELLED'].includes(p.status));
        title = '\uD83C\uDF05 Briefing del d\u00eda';

        const ctx = {
          fecha: todayStr,
          tareasHoy: todayTasks.map(t => ({ titulo: t.title, prioridad: t.priority })),
          reunionesHoy: meetings.map(m => ({ titulo: m.title, hora: m.startTime || '', cliente: m.clientName || '' })),
          tareasVencidas: overdue.slice(0, 5).map(t => ({ titulo: t.title, vencio: t.dueDate })),
          proyectosActivos: projects.slice(0, 8).map(p => ({ nombre: p.name, estado: p.status })),
          habitosPendientes: habits.length,
          totalTareasPendientes: tasks.length
        };

        const aiText = await callClaude(env, [
          { role: 'user', content: 'Datos de hoy (' + todayStr + ') para el gerente del Ventura Mall:\n' + JSON.stringify(ctx, null, 2) + '\n\nEscribe un briefing matutino personalizado en espa\u00f1ol. Directo, motivador y pr\u00e1ctico. M\u00e1ximo 3 oraciones. Empieza con lo m\u00e1s urgente. NO inventes datos que no est\u00e9n arriba. IMPORTANTE: NO uses markdown, NO uses #, **, --, asteriscos ni guiones. Solo texto plano.' }
        ], 'Eres el asistente del Ventura Mall (La Paz, Bolivia). Das briefings matutinos concisos en texto plano sin markdown. USA SOLO datos reales provistos, NO inventes.', 300);

        const stripMd = (s) => s.replace(/#{1,6}\s*/g,'').replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1').replace(/^-{2,}\s*$/gm,'').replace(/^>\s*/gm,'').replace(/\n+/g,' ').trim();
        if (aiText && aiText.trim().length > 10) {
          body = stripMd(aiText).slice(0, 200);
          const fullBriefing = JSON.stringify({
            generated: new Date().toISOString(),
            summary: stripMd(aiText),
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
        body = `${recentDone} completadas esta semana · ${open} pendientes — ¡sigue así!`;

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
          ? `"${oldest.title}" — alarma de hace ${days} día${days>1?'s':''}, sigue abierta`
          : `${stale.length} tareas con alarma pasada siguen abiertas`;

      } else if (type === 'meeting_followup') {
        // Meetings from past 1-14 days without followup — fires daily per unresolved meeting
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
          ? `"${stagnant[0].name}" lleva más de 10 días sin actualizaciones`
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
          ? `"${neglected[0].name || neglected[0].company}" — más de 30 días sin reunión`
          : `${neglected.length} clientes activos sin reunión en 30+ días`;
      }

      if (!title) continue;

      for (const sub of subs) {
        try {
          await sendPush(sub, { title, body, alarmId: `smart_${type}_${todayStr}`, vibration: 'long' });
        } catch(e) {
          if (e.status === 404 || e.status === 410) {
            const updated = subs.filter(s => s.endpoint !== sub.endpoint);
            await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
          }
        }
      }
      await env.LBP_KV.put(sentKey, '1', { expirationTtl: 90000 }); // 25h TTL
    } catch(e) {
      console.error('Smart notif error:', type, syncKey, e && e.message);
    }
  }
}

async function scheduledHandler(event, env) {
    const now = Date.now();

    // NEVER call KV.list() here — free tier allows only 1,000 list ops/day
    // but the cron fires 1,440 times/day. Using list() in the cron exhausts
    // the quota before noon every day.
    // If the registry is empty, skip silently. It gets populated automatically
    // when the app registers for push (/subscribe) or schedules alarms (/alarms/batch).
    // Use GET /rebuild-registry from Cloud Settings to seed it manually if needed.
    const syncKeys = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
    if (syncKeys.length === 0) return;

    for (const syncKey of syncKeys) {
      const name = `alarms:${syncKey}`;
      const alarms = JSON.parse(await env.LBP_KV.get(name) || '[]');
      const due = alarms.filter(a => a.triggerAt <= now && (now - a.triggerAt) < 6 * 60 * 1000);
      if (!due.length) continue;

      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      for (const alarm of due) {
        for (const sub of subs) {
          try {
            await sendPush(sub, { title: alarm.title, body: alarm.body, alarmId: alarm.alarmId, vibration: alarm.vibration || 'long' });
          } catch (e) {
            // Subscription expired — remove it
            if (e.status === 404 || e.status === 410) {
              const updated = subs.filter(s => s.endpoint !== sub.endpoint);
              await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
            }
          }
        }
      }
      // Remove fired alarms
      const remaining = alarms.filter(a => !due.find(d => d.alarmId === a.alarmId));
      await env.LBP_KV.put(name, JSON.stringify(remaining));
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
    if (utcH === 12 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'briefing', todayUTC, tomorrowUTC);
    }
    // Habit reminder: 01:00 UTC = 9pm Bolivia (UTC-4)
    if (utcH === 1 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'habits', todayUTC, tomorrowUTC);
    }
    // Deadline alerts: 21:00 UTC = 5pm Bolivia (UTC-4) — one push per entry
    if (utcH === 21 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'deadlines', todayUTC, tomorrowUTC);
    }
    // Weekend summary: Saturday 11am Bolivia = 15:00 UTC
    if (utcDow === 6 && utcH === 15 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'weekly', todayUTC, tomorrowUTC);
    }

    // ── Intelligent Alerts (Bolivia UTC-4) ────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
// Web Push implementation (RFC 8030 + RFC 8291 aes128gcm + VAPID)
// ═══════════════════════════════════════════════════════════════

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
      'Urgency': 'high',   // delivers immediately via FCM/APNs → enables heads-up banners on Android
    },
    body,
  });

  if (!res.ok && res.status !== 201) {
    const err = new Error(`Push failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
}
