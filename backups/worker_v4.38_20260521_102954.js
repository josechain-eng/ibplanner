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
      await env.LBP_KV.put(`data:${syncKey}`, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 365 });
      return json({ ok: true });
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
      return json({ ok: true });
    }

    // POST /alarms/batch  →  replace ALL alarms for a syncKey in ONE KV write (preferred)
    if (p === '/alarms/batch' && request.method === 'POST') {
      const { syncKey, alarms } = await request.json();
      if (!syncKey || !Array.isArray(alarms)) return json({ error: 'missing fields' }, 400);
      await env.LBP_KV.put(`alarms:${syncKey}`, JSON.stringify(alarms), { expirationTtl: 60 * 60 * 24 * 365 });
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
      if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set. Go to Cloudflare Workers → Settings → Variables and add it as a secret.' }, 500);
      const { messages, systemPrompt, area } = await request.json();
      if (!messages || !Array.isArray(messages)) return json({ error: 'messages array required' }, 400);
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 2048,
          system: systemPrompt || ('You are a strategic business consultant for Ventura Mall. Help brainstorm ' + (area || 'business') + ' ideas.'),
          messages: messages
        })
      });
      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        return json({ error: errText }, anthropicRes.status);
      }
      const anthropicData = await anthropicRes.json();
      const content = anthropicData.content && anthropicData.content[0] ? anthropicData.content[0].text : '';
      return json({ content });
    }

    return new Response('Not found', { status: 404, headers: CORS });
}

async function scheduledHandler(event, env) {
    const now = Date.now();
    const { keys } = await env.LBP_KV.list({ prefix: 'alarms:' });

    for (const { name } of keys) {
      const syncKey = name.slice('alarms:'.length);
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
