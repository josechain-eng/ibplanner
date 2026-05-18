// Life Business Planner 2026 — Service Worker

self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

var _timers = {};

// ── Config stored from KEEPALIVE so pushsubscriptionchange can re-register ──
var _swWorkerUrl = null;
var _swSyncKey = null;
var _swVapidKey = 'BApPK_6j13xSMZOEpBPK2lUtfH02sSarLJ8469bpbULrUYe4u4mMnNTG8QNUl2FajsOZo_D2CohQ98j1HzArmD0';

function urlB64ToUint8Array(b64) {
  var pad = '='.repeat((4 - b64.length % 4) % 4);
  var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

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
    data: { tag: tag, vibration: vibration },
    // Adding actions signals to Android that this is interactive/important,
    // which increases the chance of a heads-up (banner) notification
    actions: [
      { action: 'open', title: '▶ Open App' },
      { action: 'dismiss', title: '✓ Dismiss' }
    ]
  }).catch(function() {});
}

// ── Web Push: fired by Cloudflare even when Chrome is fully closed ──
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) {}
  e.waitUntil(showAlarm(
    data.title || 'Reminder',
    data.body || '',
    'lbp_push_' + (data.alarmId || Date.now()),
    data.vibration || 'long'
  ));
});

// ── pushsubscriptionchange: Android/FCM invalidated the token ──────────────
// Re-subscribe automatically and update Cloudflare KV.
// This fires even when the app is fully closed.
self.addEventListener('pushsubscriptionchange', function(e) {
  e.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(_swVapidKey)
    }).then(function(newSub) {
      var tasks = [];
      // POST new subscription to Cloudflare KV directly from SW
      if (_swWorkerUrl && _swSyncKey) {
        tasks.push(
          fetch(_swWorkerUrl + '/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ syncKey: _swSyncKey, subscription: newSub.toJSON() })
          }).catch(function() {})
        );
      }
      // Notify open app windows so they can also update their local state
      tasks.push(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
          cs.forEach(function(c) { c.postMessage({ type: 'PUSH_SUB_CHANGED' }); });
        })
      );
      return Promise.all(tasks);
    }).catch(function() {
      // Re-subscribe failed — at least notify open clients so they can retry
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
        cs.forEach(function(c) { c.postMessage({ type: 'PUSH_SUB_CHANGED' }); });
      });
    })
  );
});

// ── SW-side setTimeout alarms (backup for when app is open) ────
function scheduleOne(alarmId, triggerAt, title, body, vibration) {
  if (_timers[alarmId]) clearTimeout(_timers[alarmId]);
  var delay = triggerAt - Date.now();
  if (delay <= 0) {
    showAlarm(title, body, 'lbp_' + alarmId, vibration);
  } else if (delay < 86400000) {
    _timers[alarmId] = setTimeout(function() {
      showAlarm(title, body, 'lbp_' + alarmId, vibration);
      delete _timers[alarmId];
    }, delay);
  }
}

self.addEventListener('message', function(e) {
  var d = e.data || {};

  // ── Page asks SW to show a notification (reliable from background) ──
  if (d.type === 'SHOW_NOTIFICATION') {
    e.waitUntil(showAlarm(d.title, d.body, d.tag, d.vibration));
    return;
  }

  if (d.type === 'KEEPALIVE') {
    e.waitUntil(new Promise(function(r) { setTimeout(r, 25000); }));
    // Store config so pushsubscriptionchange can re-register without app being open
    if (d.workerUrl) _swWorkerUrl = d.workerUrl;
    if (d.syncKey) _swSyncKey = d.syncKey;
    var now = Date.now();
    (d.alarms || []).forEach(function(a) {
      if (a.triggerAt > now && !_timers[a.alarmId])
        scheduleOne(a.alarmId, a.triggerAt, a.title, a.body, a.vibration);
    });
    if (e.source) e.source.postMessage({ type: 'KEEPALIVE_ACK' });
    return;
  }
  if (d.type === 'SCHEDULE_ALARM') {
    scheduleOne(d.alarmId, d.triggerAt, d.title, d.body, d.vibration);
    return;
  }
  if (d.type === 'CANCEL_ALARM') {
    if (_timers[d.alarmId]) { clearTimeout(_timers[d.alarmId]); delete _timers[d.alarmId]; }
    return;
  }
  if (d.type === 'CHECK_MISSED') {
    var now2 = Date.now();
    (d.alarms || []).forEach(function(a) {
      var age = now2 - a.triggerAt;
      if (age >= 0 && age < 3600000) showAlarm(a.title, '(Missed) ' + a.body, 'lbp_m_' + a.alarmId, a.vibration);
      else if (a.triggerAt > now2) scheduleOne(a.alarmId, a.triggerAt, a.title, a.body, a.vibration);
    });
    return;
  }
});

// ── Handle notification action buttons ─────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'dismiss') return; // just close
  // 'open' action or tap on notification body — focus or open app
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
