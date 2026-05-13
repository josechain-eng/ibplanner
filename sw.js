// Life Business Planner 2026 — Service Worker

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
    tag: 'lbp_' + alarmId,
    requireInteraction: true,
    data: { alarmId: alarmId }
  }).catch(function() {});
  delete _timers[alarmId];
}

function scheduleOne(alarmId, triggerAt, title, body) {
  if (_timers[alarmId]) clearTimeout(_timers[alarmId]);
  var delay = triggerAt - Date.now();
  if (delay <= 0) {
    fireAlarm(alarmId, title, body);
  } else if (delay < 86400000) {
    _timers[alarmId] = setTimeout(function() {
      fireAlarm(alarmId, title, body);
    }, delay);
  }
}

self.addEventListener('message', function(e) {
  var data = e.data || {};

  if (data.type === 'KEEPALIVE') {
    // Extend SW lifetime for 25s so Android can't kill it between pings
    e.waitUntil(new Promise(function(resolve) {
      setTimeout(resolve, 25000);
    }));
    // Re-schedule any alarms that were lost when SW was previously killed
    var now = Date.now();
    (data.alarms || []).forEach(function(a) {
      if (a.triggerAt > now && !_timers[a.alarmId]) {
        scheduleOne(a.alarmId, a.triggerAt, a.title, a.body);
      }
    });
    if (e.source) e.source.postMessage({ type: 'KEEPALIVE_ACK' });
    return;
  }

  if (data.type === 'SCHEDULE_ALARM') {
    scheduleOne(data.alarmId, data.triggerAt, data.title, data.body);
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
    var now2 = Date.now();
    (data.alarms || []).forEach(function(a) {
      var age = now2 - a.triggerAt;
      if (age >= 0 && age < 3600000) {
        self.registration.showNotification('🔔 ' + a.title, {
          body: '(Missed) ' + a.body,
          tag: 'lbp_m_' + a.alarmId,
          requireInteraction: true
        }).catch(function() {});
      } else if (a.triggerAt > now2) {
        scheduleOne(a.alarmId, a.triggerAt, a.title, a.body);
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
