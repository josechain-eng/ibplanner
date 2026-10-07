#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.84 — Add Cloud & Sync + Notifications to desktop sidebar.
On desktop the sidebar only shows navGroups. Cloud & Sync / Notifications
are only accessible from the mobile drawer. Fix: add them to the sidebar too.
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
# PATCH 1: Append Settings section to the desktop sidebar
# The sidebar ends after navGroups.map(...) then closes with ))
# Insert after that closing before </nav>
# ═══════════════════════════════════════════════════════════════
patch('sidebar-settings',
    # The sidebar renders navGroups then immediately closes
    # Find the pattern that ends navGroups in the sidebar and closes the <nav className="sidebar">
    '  })), /*#__PURE__*/React.createElement("main", {\n'
    '    className: "content"\n'
    '  }, renderPage()))',
    '  ),\n'
    # Settings section header
    '  /*#__PURE__*/React.createElement("div", {className:"nav-section", style:{marginTop:8}}, "\\u2699\\uFE0F Settings"),\n'
    # Cloud & Sync button
    '  /*#__PURE__*/React.createElement("div", {\n'
    '    className: "nav-item",\n'
    '    onClick: function() { window.dispatchEvent(new Event(\'lbp_open_sync\')); }\n'
    '  },\n'
    '    /*#__PURE__*/React.createElement("span", {style:{fontSize:15}}, isConnected ? "\\u2601\\uFE0F" : "\\uD83D\\uDD0C"),\n'
    '    " Cloud & Sync",\n'
    '    isConnected && /*#__PURE__*/React.createElement("span", {style:{width:7,height:7,borderRadius:\'50%\',background:\'#4ade80\',display:\'inline-block\',marginLeft:\'auto\',flexShrink:0}})\n'
    '  ),\n'
    # Notifications button
    '  /*#__PURE__*/React.createElement("div", {\n'
    '    className: "nav-item",\n'
    '    onClick: function() { setNotifPopOpen(true); }\n'
    '  },\n'
    '    /*#__PURE__*/React.createElement("span", {style:{fontSize:15}}, notifPerm === \'granted\' ? "\\uD83D\\uDD14" : "\\uD83D\\uDD15"),\n'
    '    " Notifications",\n'
    '    notifPerm !== \'granted\' && /*#__PURE__*/React.createElement("span", {className:"badge", style:{marginLeft:\'auto\'}}, "!")\n'
    '  )\n'
    '  )), /*#__PURE__*/React.createElement("main", {\n'
    '    className: "content"\n'
    '  }, renderPage()))'
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Version bump
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.83';",
    "window.LBP_VERSION = '4.84';"
)

if errors:
    print('\n'.join(errors))
    print('⚠️  NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'Saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check484.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check484.js'], capture_output=True, text=True)
    print('✅ node --check PASSED' if r.returncode == 0 else '❌ node --check FAILED:\n' + r.stderr[:800])
