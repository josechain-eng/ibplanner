# PWA Push Notification Stack — Complete Reference

Battle-tested setup for reliable background push notifications in a single-file HTML PWA.
Built and debugged with Pepe across many sessions. This is what WORKS.

---

## Architecture Overview

```
App (HTML/React) → scheduleAlarms() → Cloudflare Worker KV
                                            ↓ (cron every 1 min)
                                      sendPush() → FCM/APNs
                                            ↓
                                      Service Worker (sw.js)
                                            ↓
                                      OS Notification (sound + vibration + panel)
```

Backup path when app is open:
```
App → check() every 30s → fireAlarmOnce() → _fireNotification() → SW SHOW_NOTIFICATION → OS Notification
```

---

## File Structure

3 files needed (all in the same GitHub Pages folder as the HTML):
- `LifeBusinessPlanner2026.html` — the app
- `sw.js` — service worker (must be at same scope as HTML)
- `worker.js` — deploy to Cloudflare Workers (NOT served from GitHub)

---

## VAPID Keys (already generated for LB Planner)

```javascript
const VAPID_PUBLIC_KEY = 'BApPK_6j13xSMZOEpBPK2lUtfH02sSarLJ8469bpbULrUYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0';
const VAPID_PRIVATE_JWK = {"key_ops":["sign"],"ext":true,"kty":"EC","x":"Ck8r_qPXfFIxk4SkE8raVS18fTaxJqssnzjr1ultQus","y":"UYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0","crv":"P-256","d":"-X7F-ZLnRwC0O8pjVQO7vjhYKmAQUsDR-f50nF2epuo"};
const VAPID_SUBJECT = 'mailto:admin@lifeplanner.app';
```

For a NEW app, generate fresh VAPID keys:
```javascript
// In Node.js or browser console:
const keys = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateJwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
const publicRaw = await crypto.subtle.exportKey('raw', keys.publicKey);
// base64url-encode publicRaw for VAPID_PUBLIC_KEY
```

---

## Cloudflare Worker (worker.js) — Key Patterns

### Required KV binding
Variable name MUST be exactly: `LBP_KV` (set in Cloudflare Worker Settings → Bindings)

### Cron trigger
Expression: `* * * * *` (every minute — fires alarms)

### Critical: Urgency: high header on push
```javascript
headers: {
  'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
  'Content-Encoding': 'aes128gcm',
  'Content-Type': 'application/octet-stream',
  'TTL': '86400',
  'Urgency': 'high',  // ← CRITICAL for Android heads-up banners via FCM
},
```

### Endpoints
- `GET /vapid-key` → returns public key
- `POST /sync` + `GET /sync?key=` → store/load full data blob per syncKey (rejects >20MB with 413)
- `POST /subscribe` → store push subscription (appends, doesn't overwrite)
- `POST /alarm` → store alarm in KV
- `POST /alarms/batch` → replace ALL alarms in one KV write (preferred over /alarm)
- `DELETE /alarm?key=&id=` → cancel alarm
- `GET /list-alarms?key=` → diagnostic: shows stored alarms + subscription count
- `POST /test-push` → immediately push to all devices for a syncKey (diagnostic)
- `GET /check-sub?key=&endpoint=` → verify a subscription is still in KV
- `GET /stats?key=` → returns byte sizes of all KV entries for a syncKey
- `GET /rebuild-registry` → one-time fix: seeds synckeys_registry from KV.list() — call manually, never on a schedule
- `GET /briefing` → daily summary of tasks/projects/meetings/goals/habits
- `POST /chat` → proxy to Claude API (requires ANTHROPIC_API_KEY secret)

### Alarm window in cron
```javascript
const due = alarms.filter(a => a.triggerAt <= now && (now - a.triggerAt) < 5 * 60 * 1000);
```
5-minute window — alarms missed by >5 min won't fire via cloud (local check() catches them).

### Encryption
Full aes128gcm Web Push encryption implemented (RFC 8030 + RFC 8291).
Uses Web Crypto API — works natively in Cloudflare Workers.

---

## Service Worker (sw.js) — Key Patterns

### showNotification — always use this signature
```javascript
function showAlarm(title, body, tag, vibration) {
  var vPattern = vibration === 'verylong'
    ? [1200, 300, 1200, 300, 1500]
    : [600, 150, 600, 150, 1000];
  return self.registration.showNotification('🔔 ' + title, {
    body: body,
    tag: tag || 'lbp_alarm',
    requireInteraction: true,
    vibrate: vPattern,
    silent: false,
    data: { tag, vibration },
    actions: [                          // ← increases Android heads-up chance
      { action: 'open', title: '▶ Open App' },
      { action: 'dismiss', title: '✓ Dismiss' }
    ]
  }).catch(function() {});
}
```

### Handle push events
```javascript
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  e.waitUntil(showAlarm(data.title||'Reminder', data.body||'',
    'lbp_push_'+(data.alarmId||Date.now()), data.vibration||'long'));
});
```

### SHOW_NOTIFICATION message from page (reliable even when backgrounded)
```javascript
if (d.type === 'SHOW_NOTIFICATION') {
  e.waitUntil(showAlarm(d.title, d.body, d.tag, d.vibration));
  return;
}
```
**Key insight**: calling `reg.showNotification()` from the PAGE is throttled by Android when the tab is backgrounded. Always post to SW via `reg.active.postMessage({type:'SHOW_NOTIFICATION',...})` instead.

### KEEPALIVE pattern (prevents SW from being killed)
```javascript
// In app, every 20 seconds:
setInterval(function() {
  navigator.serviceWorker.ready.then(function(r) {
    if (!r.active) return;
    r.active.postMessage({type: 'KEEPALIVE', alarms: pendingAlarms});
  });
}, 20000);

// In SW:
if (d.type === 'KEEPALIVE') {
  e.waitUntil(new Promise(function(r) { setTimeout(r, 25000); }));
  // reschedule any alarms not yet in _timers
}
```

### notificationclick — handle action buttons
```javascript
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
```

---

## App-Side Patterns (HTML/React)

### VAPID key subscription — MUST add padding before atob()
```javascript
var b64 = key.replace(/-/g,'+').replace(/_/g,'/');
while (b64.length % 4) b64 += '=';  // ← CRITICAL, many browsers fail without this
var appKey = Uint8Array.from(atob(b64), function(c){ return c.charCodeAt(0); });
```

### _cloudScheduleAlarm — no 24h limit for cloud
```javascript
// ✅ CORRECT: register with cloud for ALL future alarms
if (window._cloudScheduleAlarm) window._cloudScheduleAlarm(alarmId, alarmMs, title, body, vibration);
// SW setTimeout only for alarms within 24h (browser can't hold timers longer reliably)
if (diff <= oneDayMs) {
  _postAlarmToSW(alarmId, alarmMs, title, body, vibration);
  setTimeout(function() { /* fire locally */ }, diff);
}
```
**Bug to avoid**: putting a 24h guard BEFORE the cloud call — this silently prevents alarms from ever reaching Cloudflare KV.

### scheduleAlarms useEffect — fires on data change
```javascript
useEffect(function() {
  if (!data) return;
  var _types = ['tasks','goals','projects','journal','routines','habits',
                'medications','householdTasks','workouts','meetings'];
  _types.forEach(function(k){ scheduleAlarms(data[k] || [], k, noop); });

  // Missed alarm detection (cross-device: alarm set on phone, desktop opens later)
  var nowMs = Date.now();
  _types.forEach(function(k) {
    (data[k] || []).forEach(function(entity) {
      var al = entity.alarm;
      if (!al || !al.enabled || !al.datetime) return;
      var t = new Date(al.datetime).getTime();
      var age = nowMs - t;
      if (age <= 0 || age > 3600000) return; // not missed or too old (>1h)
      var missedKey = (entity.id || '') + '_' + al.datetime + '_missed';
      if (firedRef.current.has(missedKey)) return;
      firedRef.current.add(missedKey);
      // show "(Missed)" OS notification via SW
    });
  });
}, [data]);
```

### check() window — 5 minutes, not 90 seconds
```javascript
var win = _now - 300000; // 5 min window catches late opens
```

### Notification body format — entity name in body too
```javascript
var body = alarm.label
  ? (entityName ? entityName + ' · ' + alarm.label : alarm.label)
  : (entityName ? entityName + ' · ' + typeLabel + ' reminder' : typeLabel + ' reminder');
// Example: "Prueba 13 · Journal entry reminder"
```
Both title AND body should contain the entity name so it's visible in collapsed notifications.

### Type display labels
```javascript
var _ALARM_TYPE_LABELS = {
  tasks:'Task', goals:'Goal', projects:'Project', journal:'Journal entry',
  routines:'Routine', habits:'Habit', medications:'Medication',
  householdTasks:'Household task', workouts:'Workout', meetings:'Meeting'
};
```

### _workerFetch — always use this wrapper
```javascript
function _workerFetch(path, opts) {
  if (!window.LBP_WORKER_URL) return Promise.resolve(null);
  return fetch(window.LBP_WORKER_URL + path, opts).catch(function() { return null; });
}
```

### Version indicator — always include, helps debugging
```javascript
window.LBP_VERSION = '2.6'; // increment on every deploy
```
Show it in settings panel: `'v' + (window.LBP_VERSION || '?')`

---

## Sync Key Pattern

Each device gets a random sync key on first load:
```javascript
var k = localStorage.getItem('lbp_sync_key');
if (!k) { k = 'lbp_' + Math.random().toString(36).slice(2,18); localStorage.setItem('lbp_sync_key', k); }
```
Used as KV namespace prefix for all data: `data:{syncKey}`, `subs:{syncKey}`, `alarms:{syncKey}`

Cross-device: user copies key from device A → pastes into device B → both share same data + alarms.

---

## Android Heads-Up Notification — The Full Story

### What works
- Notification DOES appear in the panel ✓
- Sound plays ✓
- Vibration works ✓
- Heads-up (floating banner over other apps) — requires one of:

### Fix 1: Install as PWA (best, automatic after install)
Add `beforeinstallprompt` listener, show install button. Once installed as PWA:
- Android gives it its own notification channel
- Channel defaults to HIGH importance
- Heads-up banners appear automatically

```javascript
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  window._installPrompt = e;
  window.dispatchEvent(new Event('lbp_can_install'));
});
// In UI: window._installPrompt.prompt()
```

### Fix 2: Android notification channel setting (manual, one-time)
Long-press any notification from the app → Settings → set importance to **Urgent** + enable "Pop on screen".
Must be done on the SPECIFIC channel for that site (not Chrome's general settings).

### Why `Urgency: high` helps but isn't enough
The Web Push `Urgency: high` header tells FCM to deliver immediately (no batching).
Affects DELIVERY speed, not the Android notification DISPLAY importance.
Still needed — include it always.

### Why actions help
Adding `actions` to showNotification makes Android classify it as "interactive" which slightly increases heads-up probability. Not guaranteed but helpful.

---

## Cloudflare Setup Checklist

1. Create account at dash.cloudflare.com
2. Workers & Pages → KV → Create namespace `LBP_KV` → copy ID
3. Workers & Pages → Create Worker → paste worker.js
4. Worker Settings → Bindings → KV Namespace → variable name: `LBP_KV`
5. Worker Settings → Triggers → Cron: `* * * * *`
6. Copy Worker URL (no trailing slash!) → paste into app Cloud Settings → Test → Save
7. Click 🔔 bell → Enable Notifications → grant permission
8. Cloud Settings → Re-register button (after notifications enabled)
9. Cloud Settings → Test Cloud Push → confirm notification arrives

---

## Common Bugs & Fixes

| Bug | Cause | Fix |
|-----|-------|-----|
| `_cloudScheduleAlarm skipped` | `window.LBP_WORKER_URL` empty at call time | Check useEffect sets it from state; init script reads localStorage |
| 0 alarms in cloud | 24h guard before cloud call in `scheduleAlarms` | Move cloud call BEFORE the `diff > oneDayMs` check |
| Push fails silently | Subscription expired | Re-register button; remove 404/410 subs in cron |
| VAPID key decode error | Missing base64 padding | `while (b64.length % 4) b64 += '='` before atob() |
| All alarm sounds identical | Duplicate `playAlarmSound` definition (second overwrites first) | Search file for duplicate, remove the second one |
| Notification from page not showing in background | `reg.showNotification()` from page context is throttled | Use `reg.active.postMessage({type:'SHOW_NOTIFICATION',...})` instead |
| `Cannot reach Worker` | Trailing slash in URL | Remove trailing slash from Worker URL |
| Deploy button grayed out in Cloudflare | Already deployed — not an error | Code is live, nothing to do |
| Desktop doesn't auto-receive push | Chrome background service not running | Opening app catches it via missed-alarm detection (1h window) |
| KV list operations exceeded (1,000/day) | Cron called KV.list() every minute (1,440×/day) when registry was empty | Fixed in worker.js: cron never calls list(); use GET /rebuild-registry once to seed registry |
| Attachments disappear on different device | File binary stored in IDB (local only); metadata syncs to KV | Expected: open app on device where file was uploaded; or use link attachments (🔗) which sync everywhere |
