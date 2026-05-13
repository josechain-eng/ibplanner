// Life Business Planner 2026 — Service Worker

self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

var _timers = {};

function showAlarm(title, body, tag) {
  return self.registration.showNotification('🔔 ' + title, {
    body: body,
    tag: tag || 'lbp_alarm',
    requireInteraction: true,
    data: { tag: tag }
  }).catch(function() {});
}

// ── Web Push: fired by Cloudflare even when Chrome is fully closed ──
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) {}
  e.waitUntil(showAlarm(data.title || 'Reminder', data.body || '', 'lbp_push_' + (data.alarmId || Date.now())));
});

// ── SW-side setTimeout alarms (backup for when app is open) ────
function scheduleOne(alarmId, triggerAt, title, body) {
  if (_timers[alarmId]) clearTimeout(_timers[alarmId]);
  var delay = triggerAt - Date.now();
  if (delay <= 0) {
    showAlarm(title, body, 'lbp_' + alarmId);
  } else if (delay < 86400000) {
    _timers[alarmId] = setTimeout(function() {
      showAlarm(title, body, 'lbp_' + alarmId);
      delete _timers[alarmId];
    }, delay);
  }
}

self.addEventListener('message', function(e) {
  var d = e.data || {};

  if (d.type === 'KEEPALIVE') {
    e.waitUntil(new Promise(function(r) { setTimeout(r, 25000); }));
    var now = Date.now();
    (d.alarms || []).forEach(function(a) {
      if (a.triggerAt > now && !_timers[a.alarmId])
        scheduleOne(a.alarmId, a.triggerAt, a.title, a.body);
    });
    if (e.source) e.source.postMessage({ type: 'KEEPALIVE_ACK' });
    return;
  }
  if (d.type === 'SCHEDULE_ALARM') { scheduleOne(d.alarmId, d.triggerAt, d.title, d.body); return; }
  if (d.type === 'CANCEL_ALARM') {
    if (_timers[d.alarmId]) { clearTimeout(_timers[d.alarmId]); delete _timers[d.alarmId]; }
    return;
  }
  if (d.type === 'CHECK_MISSED') {
    var now2 = Date.now();
    (d.alarms || []).forEach(function(a) {
      var age = now2 - a.triggerAt;
      if (age >= 0 && age < 3600000) showAlarm(a.title, '(Missed) ' + a.body, 'lbp_m_' + a.alarmId);
      else if (a.triggerAt > now2) scheduleOne(a.alarmId, a.triggerAt, a.title, a.body);
    });
    return;
  }
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
