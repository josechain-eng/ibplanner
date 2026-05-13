// Life Business Planner 2026 — Service Worker
// Upload this file to the same folder as LifeBusinessPlanner2026.html on GitHub

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

var _timers = {};

function fireAlarm(alarmId, title, body) {
  self.registration.showNotification('🔔 ' + title, {
    body: body,
    vibrate: [400, 150, 400, 150, 400],
    tag: 'lbp_' + alarmId,
    requireInteraction: true,
    silent: false,
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
          vibrate: [400, 150, 400, 150, 400],
          tag: 'lbp_m_' + a.alarmId,
          requireInteraction: true,
          silent: false
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
