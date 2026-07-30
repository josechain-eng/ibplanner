// Life Business Planner 2026 — Service Worker

// ── OFFLINE app shell ────────────────────────────────────────────────────
// Precachea el HTML + React (CDN) + iconos para que la app ABRA sin conexión.
// La data ya es local (localStorage/IDB); esto faltaba: cachear el shell mismo.
var SHELL_CACHE = 'lbp-shell-v1';
var _CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js'
];
var SHELL_URLS = ['LifeBusinessPlanner2026.html', 'icon-192.png', 'icon-512.png'].concat(_CDN_ASSETS);

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL_CACHE).then(function(cache) {
    // best-effort por URL: si una falla (p.ej. sin red al instalar), no rompe el resto
    return Promise.all(SHELL_URLS.map(function(u) { return cache.add(u).catch(function(){}); }));
  }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k.indexOf('lbp-shell-') === 0 && k !== SHELL_CACHE) return caches.delete(k);
      }));
    })
  ]));
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (_) { return; }

  // (1) Navegación / documento HTML → stale-while-revalidate: sirve el HTML cacheado
  //     al instante (rápido + OFFLINE) y lo refresca en 2º plano cuando hay red.
  if (req.mode === 'navigate' || (url.origin === self.location.origin && url.pathname.indexOf('.html') !== -1)) {
    e.respondWith(caches.open(SHELL_CACHE).then(function(cache) {
      return cache.match(req).then(function(hit) {
        return hit || cache.match('LifeBusinessPlanner2026.html');
      }).then(function(cached) {
        var net = fetch(req).then(function(resp) {
          if (resp && resp.ok) cache.put('LifeBusinessPlanner2026.html', resp.clone());
          return resp;
        }).catch(function() { return cached; });
        return cached || net;
      });
    }));
    return;
  }

  // (2) React (CDN) + iconos → cache-first (versionados/estáticos; funcionan offline).
  var isCdn = _CDN_ASSETS.indexOf(url.href) !== -1;
  var isIcon = url.origin === self.location.origin && url.pathname.indexOf('.png') !== -1;
  if (isCdn || isIcon) {
    e.respondWith(caches.match(req).then(function(cached) {
      return cached || fetch(req).then(function(resp) {
        if (resp) { var clone = resp.clone(); caches.open(SHELL_CACHE).then(function(cache) { cache.put(req, clone); }); }
        return resp;
      });
    }));
    return;
  }
  // (3) Resto (worker API, DolarAPI, Google, etc.) → red directa (passthrough).
});

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
  var alarmId = data.alarmId || String(Date.now());
  // Cancel SW-side timer for this alarm — cloud push already handled it
  if (_timers[alarmId]) { clearTimeout(_timers[alarmId]); delete _timers[alarmId]; }
  // Use same tag prefix as SW timer so OS deduplicates if both fire
  var tag = 'lbp_' + alarmId;
  var p = showAlarm(data.title || 'Reminder', data.body || '', tag, data.vibration || 'long');
  // Tell open app windows this alarm fired so page-side check() skips it
  var broadcast = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
    cs.forEach(function(c) { c.postMessage({ type: 'ALARM_FIRED', alarmId: alarmId }); });
  });
  // Persist fired alarmId in Cache API so app reads it on next open (prevents duplicate local firing)
  var cacheStore = caches.open('lbp-fired-v1').then(function(cache) {
    return cache.put(new Request('https://lbp.local/fired/' + encodeURIComponent(alarmId)), new Response(String(Date.now())));
  }).catch(function(){});
  e.waitUntil(Promise.all([p, broadcast, cacheStore]));
});

// ── Periodic Background Sync: backup alarm check when FCM is blocked by Samsung ──
// Fires periodically even when app is closed. Chrome allows it for installed PWAs
// with high engagement. Reads config from Cache, fetches due alarms from Cloudflare KV.
self.addEventListener('periodicsync', function(event) {
  if (event.tag !== 'lbp-alarm-check') return;
  event.waitUntil(
    caches.open('lbp-config-v1').then(function(cache) {
      return cache.match('https://lbp.local/config');
    }).then(function(resp) {
      return resp ? resp.json() : null;
    }).then(function(cfg) {
      if (!cfg || !cfg.workerUrl || !cfg.syncKey) return;
      return fetch(cfg.workerUrl + '/list-alarms?key=' + encodeURIComponent(cfg.syncKey))
        .then(function(r) { return r.json(); })
        .then(function(result) {
          var alarms = result.alarms || [];
          var now = Date.now();
          // Fire alarms that are due within the last 4 hours (broader window than cloud push)
          var due = alarms.filter(function(a) {
            return a.triggerAt <= now && (now - a.triggerAt) < 4 * 3600000;
          });
          if (!due.length) return;
          return caches.open('lbp-fired-v1').then(function(firedCache) {
            return firedCache.keys().then(function(keys) {
              var firedIds = keys.map(function(k) {
                var parts = k.url.split('/fired/');
                return parts[1] ? decodeURIComponent(parts[1]) : '';
              });
              var toFire = due.filter(function(a) {
                return firedIds.indexOf(a.id) === -1;
              });
              return Promise.all(toFire.map(function(a) {
                return firedCache.put(
                  new Request('https://lbp.local/fired/' + encodeURIComponent(a.id)),
                  new Response(String(now))
                ).then(function() {
                  return showAlarm(
                    a.title || 'Recordatorio',
                    a.body || '',
                    'lbp_ps_' + a.id,
                    a.vibration || 'long'
                  );
                });
              }));
            });
          });
        });
    }).catch(function() {})
  );
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
    // Persist config to Cache API so notificationclick can read it even if SW was killed
    if (d.workerUrl && d.syncKey) {
      caches.open('lbp-config-v1').then(function(cache) {
        cache.put(new Request('https://lbp.local/config'), new Response(JSON.stringify({workerUrl: d.workerUrl, syncKey: d.syncKey})));
      }).catch(function(){});
    }
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
    e.waitUntil(caches.open('lbp-fired-v1').then(function(fc) {
      return fc.keys().then(function(keys) {
        var fired = keys.map(function(k) { var pr = k.url.split('/fired/'); return pr[1] ? decodeURIComponent(pr[1]) : ''; });
        return Promise.all((d.alarms || []).map(function(a) {
          var age = now2 - a.triggerAt;
          if (age >= 0 && age < 3600000) {
            var fkey = 'm_' + a.alarmId;
            if (fired.indexOf(fkey) !== -1) return;  // ya mostrada antes → no repetir
            return fc.put(new Request('https://lbp.local/fired/' + encodeURIComponent(fkey)), new Response(String(now2)))
              .then(function() { return showAlarm(a.title, '(Missed) ' + a.body, 'lbp_m_' + a.alarmId, a.vibration); });
          } else if (a.triggerAt > now2) { scheduleOne(a.alarmId, a.triggerAt, a.title, a.body, a.vibration); }
        }));
      });
    }).catch(function(){}));
    return;
  }
});

// ── Handle notification action buttons ─────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  // Cancel cloud reminder alarms when user interacts with the notification
  var tag = e.notification.tag || '';
  var baseId = tag.indexOf('lbp_') === 0 ? tag.slice(4) : '';
  if (baseId && baseId.indexOf('_r') < 0) {
    var _doCancelReminders = function(wUrl, sKey) {
      if (!wUrl || !sKey) return;
      for (var _ri = 1; _ri <= 4; _ri++) {
        fetch(wUrl + '/alarm?key=' + encodeURIComponent(sKey) + '&id=' + encodeURIComponent(baseId + '_r' + _ri), {method: 'DELETE'}).catch(function(){});
      }
    };
    if (_swWorkerUrl && _swSyncKey) {
      _doCancelReminders(_swWorkerUrl, _swSyncKey);
    } else {
      // SW was killed and restarted — read config from Cache API
      caches.open('lbp-config-v1').then(function(cache) {
        return cache.match('https://lbp.local/config');
      }).then(function(resp) {
        return resp ? resp.json() : null;
      }).then(function(cfg) {
        if (cfg) { _swWorkerUrl = cfg.workerUrl; _swSyncKey = cfg.syncKey; }
        _doCancelReminders(_swWorkerUrl, _swSyncKey);
      }).catch(function(){});
    }
  }
  if (e.action === 'dismiss') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      if (cs.length) return cs[0].focus();
      return self.clients.openWindow(self.registration.scope);
    })
  );
});
