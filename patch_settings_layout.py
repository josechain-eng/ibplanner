#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.82 — Fix Cloud Settings layout on mobile.
Push / GCal / R2 were in a horizontal flex row → truncated on mobile.
Change to vertical stack so each section is full width.
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
# PATCH 1: Change the outer container from horizontal flex to vertical stack
# ═══════════════════════════════════════════════════════════════
patch('settings-outer-flex-to-column',
    "isConnected && /*#__PURE__*/React.createElement('div', { style:{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:12,marginTop:4,display:'flex',alignItems:'center',justifyContent:'space-between',gap:8} },",
    "isConnected && /*#__PURE__*/React.createElement('div', { style:{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:12,marginTop:4,display:'flex',flexDirection:'column',gap:0} },"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Remove flex:1 from the push section (not needed in column layout)
# ═══════════════════════════════════════════════════════════════
patch('push-section-flex1',
    "/*#__PURE__*/React.createElement('div', { style:{flex:1} },\n"
    "            /*#__PURE__*/React.createElement('p', { style:{fontSize:11,color:pushRegistered",
    "/*#__PURE__*/React.createElement('div', { style:{} },\n"
    "            /*#__PURE__*/React.createElement('p', { style:{fontSize:11,color:pushRegistered"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: Version bump
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.81';",
    "window.LBP_VERSION = '4.82';"
)

if errors:
    print('\n'.join(errors))
    print('⚠️  NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'Saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check482.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check482.js'], capture_output=True, text=True)
    print('✅ node --check PASSED' if r.returncode == 0 else '❌ node --check FAILED:\n' + r.stderr[:800])
