#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.83 — GCal sync: add error visibility + manual sync button on cards.

Root cause of silent failures:
- _gcalPush uses `.then(r => r.ok ? r.json() : null)` — API errors (401, 403, 400)
  return null and are completely swallowed.
- `.catch(function(){})` swallows all network errors.
- User has zero feedback when sync fails.

Fixes:
1. _gcalPush now reads the error body and dispatches 'lbp_gcal_toast' event
2. App exposes window._addToastGlobal so _gcalPush can show a toast
3. MeetCard shows 📅 (green = synced, orange = not synced) — tap to manually push
"""
import re, subprocess

f = '/Users/josechain/lbplanner/LifeBusinessPlanner2026.html'
html = open(f, encoding='utf-8').read()
original_len = len(html)
errors = []

def patch(name, old, new, count=1):
    global html
    n = html.count(old)
    if n == 0:
        errors.append(f'❌ PATCH [{name}] NOT FOUND')
        return False
    if n > 1 and count == 1:
        errors.append(f'⚠️  PATCH [{name}] found {n} times — using first')
    html = html.replace(old, new, count)
    print(f'✅ [{name}]')
    return True

# ═══════════════════════════════════════════════════════════════
# PATCH 1: _gcalPush — replace silent failure with error logging + toast
# ═══════════════════════════════════════════════════════════════
patch('gcal-push-error-logging',
    '''      var method = meeting.gcalEventId ? 'PUT' : 'POST';
      var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events' + (meeting.gcalEventId ? '/' + meeting.gcalEventId : '');
      fetch(url, { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(ev) {
          if (ev && ev.id && !meeting.gcalEventId) {
            window.dispatchEvent(new CustomEvent('lbp_gcal_event_id', { detail: { lbpId: meeting.id, gcalEventId: ev.id } }));
          }
        }).catch(function(){});''',
    '''      var method = meeting.gcalEventId ? 'PUT' : 'POST';
      var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events' + (meeting.gcalEventId ? '/' + meeting.gcalEventId : '');
      fetch(url, { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body })
        .then(function(r) {
          if (!r.ok) {
            return r.json().catch(function(){return {};}).then(function(errBody) {
              var msg = (errBody && errBody.error && errBody.error.message) || ('HTTP ' + r.status);
              console.error('[LBP GCal] Sync failed:', r.status, msg, errBody);
              if (window._addToastGlobal) window._addToastGlobal({id:uid(),title:'\\u274C GCal sync failed',body:msg});
              return null;
            });
          }
          return r.json();
        })
        .then(function(ev) {
          if (ev && ev.id) {
            if (!meeting.gcalEventId) {
              window.dispatchEvent(new CustomEvent('lbp_gcal_event_id', { detail: { lbpId: meeting.id, gcalEventId: ev.id } }));
            }
            if (window._addToastGlobal) window._addToastGlobal({id:uid(),title:'\\u2705 Google Calendar',body:'Reunión sincronizada: '+meeting.title});
          }
        })
        .catch(function(e) {
          console.error('[LBP GCal] Network error:', e);
          if (window._addToastGlobal) window._addToastGlobal({id:uid(),title:'\\u274C GCal: error de red',body:'Verifica tu conexión e intenta de nuevo'});
        });'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Expose addToast globally (right after window._setDataGlobal = setData)
# ═══════════════════════════════════════════════════════════════
patch('expose-addtoast-global',
    '  window._setDataGlobal = setData;',
    '  window._setDataGlobal = setData;\n  window._addToastGlobal = function(t) { addToast(t); };'
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: MeetCard — add GCal sync status icon button
# Insert after the 🎙️ record button and before Delete
# ═══════════════════════════════════════════════════════════════
OLD_MEETCARD = (
    '},mePrepLoad&&mePrepItem&&mePrepItem.id===m.id?\'⏳\':\'🤖\'), " ", '
    '/*#__PURE__*/React.createElement("button",{className:"btn btn-secondary btn-sm",style:{fontSize:10},title:"Grabar reunión",onClick:function(e){e.stopPropagation();recOpen(m);}}, \'🎙️\'), " ", '
    '/*#__PURE__*/React.createElement("button", {\n'
    '      className: "btn btn-danger btn-sm",\n'
    '      onClick: function onClick(e) { e.stopPropagation(); del(m.id); }\n'
    '    }, "Delete"))'
)
NEW_MEETCARD = (
    '},mePrepLoad&&mePrepItem&&mePrepItem.id===m.id?\'⏳\':\'🤖\'), " ", '
    '/*#__PURE__*/React.createElement("button",{className:"btn btn-secondary btn-sm",style:{fontSize:10},title:"Grabar reunión",onClick:function(e){e.stopPropagation();recOpen(m);}}, \'🎙️\'), " ",'
    'localStorage.getItem(\'lbp_gcal_connected\')==\'1\' && /*#__PURE__*/React.createElement("button",{'
    'className:"btn btn-secondary btn-sm",'
    'style:{fontSize:11,padding:\'2px 6px\',color:m.gcalEventId?\'#4ade80\':\'#fb923c\'},'
    'title:m.gcalEventId?\'\\u2705 Synced to GCal — tap to re-sync\':\'\\u26A0\\uFE0F Not in GCal — tap to sync now\','
    'onClick:function(e){e.stopPropagation();if(window._gcalPush)window._gcalPush(m);}'
    '}, m.gcalEventId ? \'📅✅\' : \'📅⚠️\'), " ",'
    '/*#__PURE__*/React.createElement("button", {\n'
    '      className: "btn btn-danger btn-sm",\n'
    '      onClick: function onClick(e) { e.stopPropagation(); del(m.id); }\n'
    '    }, "Delete"))'
)
patch('meetcard-gcal-icon', OLD_MEETCARD, NEW_MEETCARD)

# ═══════════════════════════════════════════════════════════════
# PATCH 4: Version bump
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.82';",
    "window.LBP_VERSION = '4.83';"
)

if errors:
    print('\n'.join(errors))
    print('⚠️  NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'Saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check483.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check483.js'], capture_output=True, text=True)
    print('✅ node --check PASSED' if r.returncode == 0 else '❌ node --check FAILED:\n' + r.stderr[:800])
