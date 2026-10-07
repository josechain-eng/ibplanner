#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner — GCal Sync Fix (v4.77)
Problem: when a meeting is saved and the token is null (e.g., after page reload),
_gcalPush silently aborts. User has no idea the sync failed.

Fix:
1. _gcalPush queues failed meetings + dispatches 'lbp_gcal_push_queued'
2. _gcalInitGIS callback flushes the queue after successful auth
3. MeetingsScreen shows a banner when push is queued + tapping it reconnects
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
# PATCH 1: _gcalPush — queue meeting when token is null, flush on auth
# ═══════════════════════════════════════════════════════════════
patch('gcal-push-queue',
    '''  window._gcalPush = function(meeting) {
    if (!meeting || !meeting.id) return;
    window._gcalEnsureToken(function(token) {
      if (!token) return;''',
    '''  window._gcalFlushPushQueue = function() {
    var q = window._gcalPushQueue || [];
    window._gcalPushQueue = [];
    q.forEach(function(m){ window._gcalPush(m); });
  };

  window._gcalPush = function(meeting) {
    if (!meeting || !meeting.id) return;
    window._gcalEnsureToken(function(token) {
      if (!token) {
        if (!window._gcalPushQueue) window._gcalPushQueue = [];
        window._gcalPushQueue = window._gcalPushQueue.filter(function(m){return m.id!==meeting.id;});
        window._gcalPushQueue.push(meeting);
        window.dispatchEvent(new CustomEvent('lbp_gcal_push_queued',{detail:{count:window._gcalPushQueue.length}}));
        return;
      }'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: _gcalInitGIS auth callback — flush queue after successful auth
# ═══════════════════════════════════════════════════════════════
patch('gcal-authed-flush',
    '''        window.dispatchEvent(new Event('lbp_gcal_authed'));
        var cbs = _gcalPendingCbs.slice(); _gcalPendingCbs = [];
        cbs.forEach(function(cb) { try { cb(window._gcalToken); } catch(e){} });''',
    '''        window.dispatchEvent(new Event('lbp_gcal_authed'));
        var cbs = _gcalPendingCbs.slice(); _gcalPendingCbs = [];
        cbs.forEach(function(cb) { try { cb(window._gcalToken); } catch(e){} });
        // Flush any meetings that were queued while token was unavailable
        if (window._gcalFlushPushQueue) window._gcalFlushPushQueue();'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: MeetingsScreen — add gcalPending state after existing states
# ═══════════════════════════════════════════════════════════════
patch('meetings-gcal-pending-state',
    '  var recSRRef=useRef(null);\n  var recRunRef=useRef(false);',
    '  var recSRRef=useRef(null);\n  var recRunRef=useRef(false);\n  var _gcalPS=useState(false),_gcalPS2=_slicedToArray(_gcalPS,2),gcalPending=_gcalPS2[0],setGcalPending=_gcalPS2[1];'
)

# ═══════════════════════════════════════════════════════════════
# PATCH 4: MeetingsScreen — add useEffect to listen for gcal queue events
# Insert after the existing lbp_gcal_event_id useEffect (line ~15343)
# ═══════════════════════════════════════════════════════════════
patch('meetings-gcal-pending-effect',
    '''    window.addEventListener('lbp_gcal_event_id', onGcalId);
    return function() { window.removeEventListener('lbp_gcal_event_id', onGcalId); };
  }, []);''',
    '''    window.addEventListener('lbp_gcal_event_id', onGcalId);
    return function() { window.removeEventListener('lbp_gcal_event_id', onGcalId); };
  }, []);

  // Show banner when a gcal push was queued (token unavailable), clear when auth succeeds
  useEffect(function(){
    var onQueued=function(){setGcalPending(true);};
    var onAuthed=function(){setGcalPending(false);};
    window.addEventListener('lbp_gcal_push_queued',onQueued);
    window.addEventListener('lbp_gcal_authed',onAuthed);
    return function(){
      window.removeEventListener('lbp_gcal_push_queued',onQueued);
      window.removeEventListener('lbp_gcal_authed',onAuthed);
    };
  },[]);'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 5: MeetingsScreen render — add GCal pending banner after page-header
# Insert the banner right after the page-header div, before page-content
# ═══════════════════════════════════════════════════════════════
BANNER_OLD = (
    '  }, "+ New")), /*#__PURE__*/React.createElement("div", {\n'
    '    className: "page-content"\n'
    '  },\n'
    "    mHighlight === 'today'"
)
BANNER_NEW = (
    '  }, "+ New")),\n'
    '  gcalPending && /*#__PURE__*/React.createElement("div", {\n'
    "    style:{display:'flex',alignItems:'center',gap:8,background:'rgba(251,191,36,.12)',border:'1px solid rgba(251,191,36,.5)',borderRadius:10,padding:'8px 14px',margin:'8px 16px 0'}\n"
    '  },\n'
    '    /*#__PURE__*/React.createElement("span", {style:{fontSize:13}}, "\\u26a0\\ufe0f"),\n'
    '    /*#__PURE__*/React.createElement("span", {style:{fontSize:12,flex:1,color:\'var(--text)\'}}, "Reuniones pendientes de sincronizar con Google Calendar"),\n'
    '    /*#__PURE__*/React.createElement("button", {\n'
    "      className:'btn btn-secondary btn-sm',\n"
    "      style:{fontSize:11,padding:'4px 10px',whiteSpace:'nowrap'},\n"
    '      onClick:function(){if(window._gcalConnect)window._gcalConnect();}\n'
    '    }, "\\uD83D\\uDD04 Sincronizar")\n'
    '  ),\n'
    '  /*#__PURE__*/React.createElement("div", {\n'
    '    className: "page-content"\n'
    '  },\n'
    "    mHighlight === 'today'"
)
patch('meetings-gcal-banner', BANNER_OLD, BANNER_NEW)

# ═══════════════════════════════════════════════════════════════
# PATCH 6: Version bump → v4.77
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.76';",
    "window.LBP_VERSION = '4.77';"
)

# ═══════════════════════════════════════════════════════════════
# Save & Check
# ═══════════════════════════════════════════════════════════════
if errors:
    print('\n'.join(errors))
    print('⚠️  Errors found — NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'\nFile saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check477.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check477.js'], capture_output=True, text=True)
    if r.returncode == 0:
        print('✅ node --check PASSED')
    else:
        print('❌ node --check FAILED:')
        print(r.stderr[:800])
