// Life Business Planner 2026 — Service Worker
// Upload this file to the same folder as LifeBusinessPlanner2026.html on GitHub

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

var _timers = {};
// Inline icon so notifications show visually on Android (icon is required)
var _icon = 'data:image/png;base64,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';

function fireAlarm(alarmId, title, body) {
  self.registration.showNotification('🔔 ' + title, {
    body: body,
    icon: _icon,
    badge: _icon,
    vibrate: [500, 200, 500, 200, 500, 200, 500],
    tag: 'lbp_' + alarmId,
    requireInteraction: true,
    data: { alarmId: alarmId }
  }).catch(function() {});
  delete _timers[alarmId];
}

self.addEventListener('message', function(e) {
  var data = e.data || {};

  // Keepalive: hold a waitUntil open for 25s to prevent SW termination
  if (data.type === 'KEEPALIVE') {
    e.waitUntil(new Promise(function(resolve) {
      setTimeout(resolve, 25000);
    }));
    if (e.source) e.source.postMessage({ type: 'KEEPALIVE_ACK' });
    return;
  }

  if (data.type === 'SCHEDULE_ALARM') {
    var alarmId = data.alarmId;
    if (_timers[alarmId]) clearTimeout(_timers[alarmId]);
    var delay = data.triggerAt - Date.now();
    if (delay <= 0) {
      fireAlarm(alarmId, data.title, data.body);
    } else if (delay < 86400000) {
      _timers[alarmId] = setTimeout(function() {
        fireAlarm(alarmId, data.title, data.body);
      }, delay);
    }
    return;
  }

  if (data.type === 'CANCEL_ALARM') {
    if (_timers[data.alarmId]) {
      clearTimeout(_timers[data.alarmId]);
      delete _timers[data.alarmId];
    }
    return;
  }

  if (data.type === 'CHECK_MISSED') {
    var now = Date.now();
    (data.alarms || []).forEach(function(a) {
      var age = now - a.triggerAt;
      if (age >= 0 && age < 600000) {
        self.registration.showNotification('🔔 ' + a.title, {
          body: '(Missed) ' + a.body,
          icon: _icon,
          badge: _icon,
          vibrate: [500, 200, 500, 200, 500],
          tag: 'lbp_m_' + a.alarmId,
          requireInteraction: true
        }).catch(function() {});
      } else if (a.triggerAt > now) {
        var delay2 = a.triggerAt - now;
        if (delay2 < 86400000) {
          if (_timers[a.alarmId]) clearTimeout(_timers[a.alarmId]);
          (function(id, t, b) {
            _timers[id] = setTimeout(function() { fireAlarm(id, t, b); }, delay2);
          })(a.alarmId, a.title, a.body);
        }
      }
    });
    return;
  }
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clients) {
        if (clients.length > 0) return clients[0].focus();
        return self.clients.openWindow(self.registration.scope);
      })
  );
});
