#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Raise cloud file limit from 15 MB to 50 MB now that worker uses R2."""
import re, subprocess

f = '/Users/josechain/lbplanner/LifeBusinessPlanner2026.html'
html = open(f, encoding='utf-8').read()
original_len = len(html)
errors = []

def patch(name, old, new):
    global html
    n = html.count(old)
    if n == 0:
        errors.append(f'❌ PATCH [{name}] NOT FOUND')
        return False
    html = html.replace(old, new, 1)
    print(f'✅ [{name}]')
    return True

patch('cloud-file-max',
    'var LBP_CLOUD_FILE_MAX = 15 * 1024 * 1024; // 15 MB max for cloud sync',
    'var LBP_CLOUD_FILE_MAX = 50 * 1024 * 1024; // 50 MB max for cloud sync (R2 has no per-file cap)'
)

# Also update the size check in _lbpCloudFile.upload
patch('upload-size-check',
    '    if (!dataUrl || dataUrl.length > 22 * 1024 * 1024) return Promise.resolve(false);',
    '    // base64 of 50 MB ≈ 67 MB chars; Worker body limit is 100 MB\n    if (!dataUrl || dataUrl.length > 90 * 1024 * 1024) return Promise.resolve(false);'
)

# Update MAX_FILE_SIZE alert message (was "max 50 MB" which is correct — keep)
# No change needed there.

patch('version',
    "window.LBP_VERSION = '4.78';",
    "window.LBP_VERSION = '4.79';"
)

if errors:
    print('\n'.join(errors))
    print('⚠️  NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'Saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check479.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check479.js'], capture_output=True, text=True)
    print('✅ node --check PASSED' if r.returncode == 0 else '❌ node --check FAILED:\n' + r.stderr[:600])
