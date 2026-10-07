#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner — Cross-device attachment sync (v4.78)
Problem: files are stored only in IndexedDB (device-local). Cannot see
attachments from another device.

Solution: upload file content to Cloudflare KV via new /file endpoint.
IDB stays as local cache. On read, if IDB misses → fetch from cloud → cache.
Size limit: 15 MB per file for cloud sync (larger files remain local-only).
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
# PATCH 1: Add _lbpCloudFile helper after window._lbpIDB = _lbpIDB;
# ═══════════════════════════════════════════════════════════════
patch('cloud-file-helper',
    'window._lbpIDB = _lbpIDB;\n\n// Request persistent storage',
    r'''window._lbpIDB = _lbpIDB;

// ── Cloud file store — uploads/downloads files via Cloudflare KV ──
// Files <= 15 MB are synced to KV so any device can access them.
// IDB is used as a local cache; cloud is the source of truth.
var LBP_CLOUD_FILE_MAX = 15 * 1024 * 1024; // 15 MB max for cloud sync
var _lbpCloudFile = {
  upload: function(fileId, dataUrl, name, mime) {
    var syncKey = localStorage.getItem('lbp_sync_key');
    if (!syncKey || !window.LBP_WORKER_URL) return Promise.resolve(false);
    // dataUrl string length check: base64 of 15MB ≈ 20M chars
    if (!dataUrl || dataUrl.length > 22 * 1024 * 1024) return Promise.resolve(false);
    return fetch(window.LBP_WORKER_URL + '/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncKey: syncKey, fileId: fileId, data: dataUrl, name: name || '', mime: mime || '' })
    }).then(function(r) { return r.ok; }).catch(function() { return false; });
  },
  get: function(fileId) {
    var syncKey = localStorage.getItem('lbp_sync_key');
    if (!syncKey || !window.LBP_WORKER_URL) return Promise.resolve(null);
    return fetch(window.LBP_WORKER_URL + '/file?key=' + encodeURIComponent(syncKey) + '&id=' + encodeURIComponent(fileId))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(obj) { return obj ? obj.data : null; })
      .catch(function() { return null; });
  },
  del: function(fileId) {
    var syncKey = localStorage.getItem('lbp_sync_key');
    if (!syncKey || !window.LBP_WORKER_URL) return Promise.resolve();
    return fetch(window.LBP_WORKER_URL + '/file?key=' + encodeURIComponent(syncKey) + '&id=' + encodeURIComponent(fileId), { method: 'DELETE' }).catch(function() {});
  }
};

// Request persistent storage'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: ReadOnlyAttachments useEffect — add cloud fallback
# ═══════════════════════════════════════════════════════════════
patch('roa-cloud-fallback',
    '''  useEffect(function() {
    if (!attachments.length) return;
    var cancelled = false;
    Promise.all(attachments.map(function(a) {
      if (a.type === 'link') return Promise.resolve([a.id, null]);
      if (a.data) return Promise.resolve([a.id, a.data]);
      return _lbpIDB.get(a.id).then(function(d) { return [a.id, d]; });
    })).then(function(pairs) {
      if (cancelled) return;
      var map = {};
      pairs.forEach(function(p) { if (p[1]) map[p[0]] = p[1]; });
      setFileData(map);
    });
    return function() { cancelled = true; };
  }, [attachments]);

  var getData = function(a) { return fileData[a.id] || a.data || null; };

  if (!attachments.length) return null;''',
    '''  useEffect(function() {
    if (!attachments.length) return;
    var cancelled = false;
    Promise.all(attachments.map(function(a) {
      if (a.type === 'link') return Promise.resolve([a.id, null]);
      if (a.data) return Promise.resolve([a.id, a.data]);
      return _lbpIDB.get(a.id).then(function(idbData) {
        if (idbData) return [a.id, idbData];
        // IDB miss — try cloud
        return _lbpCloudFile.get(a.id).then(function(cloudData) {
          if (cloudData && !cancelled) _lbpIDB.put(a.id, cloudData); // cache locally
          return [a.id, cloudData];
        });
      });
    })).then(function(pairs) {
      if (cancelled) return;
      var map = {};
      pairs.forEach(function(p) { if (p[1]) map[p[0]] = p[1]; });
      setFileData(map);
    });
    return function() { cancelled = true; };
  }, [attachments]);

  var getData = function(a) { return fileData[a.id] || a.data || null; };

  if (!attachments.length) return null;'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: ReadOnlyAttachments "File stored on device" message
# Replace with friendlier "not available" (rare now — cloud covers most cases)
# ═══════════════════════════════════════════════════════════════
patch('roa-no-file-msg',
    "        /*#__PURE__*/React.createElement(\"p\", { style:{fontSize:12,color:'var(--text-dim)',textAlign:'center',margin:'4px 0 8px'} }, 'File stored on the device where it was uploaded. Open the app on that device to access it.'),",
    "        /*#__PURE__*/React.createElement(\"p\", { style:{fontSize:12,color:'var(--text-dim)',textAlign:'center',margin:'4px 0 8px'} }, 'File not available on this device. It may have been uploaded before cloud sync was enabled.'),",
    count=2
)

# ═══════════════════════════════════════════════════════════════
# PATCH 4: AttachmentManager useEffect — add cloud fallback (same as ReadOnly)
# ═══════════════════════════════════════════════════════════════
patch('am-cloud-fallback',
    '''  // Load file data from IDB whenever attachment list changes
  useEffect(function() {
    if (!attachments.length) return;
    var cancelled = false;
    Promise.all(attachments.map(function(a) {
      // Backward compat: if data is already inline (old format), use it directly
      if (a.data) return Promise.resolve([a.id, a.data]);
      return _lbpIDB.get(a.id).then(function(d) { return [a.id, d]; });
    })).then(function(pairs) {
      if (cancelled) return;
      var map = {};
      pairs.forEach(function(p) { if (p[1]) map[p[0]] = p[1]; });
      setFileData(map);
    });
    return function() { cancelled = true; };
  }, [attachments]);''',
    '''  // Load file data from IDB whenever attachment list changes; fall back to cloud
  useEffect(function() {
    if (!attachments.length) return;
    var cancelled = false;
    Promise.all(attachments.map(function(a) {
      // Backward compat: if data is already inline (old format), use it directly
      if (a.data) return Promise.resolve([a.id, a.data]);
      return _lbpIDB.get(a.id).then(function(idbData) {
        if (idbData) return [a.id, idbData];
        // IDB miss — try cloud
        return _lbpCloudFile.get(a.id).then(function(cloudData) {
          if (cloudData && !cancelled) _lbpIDB.put(a.id, cloudData); // cache locally
          return [a.id, cloudData];
        });
      });
    })).then(function(pairs) {
      if (cancelled) return;
      var map = {};
      pairs.forEach(function(p) { if (p[1]) map[p[0]] = p[1]; });
      setFileData(map);
    });
    return function() { cancelled = true; };
  }, [attachments]);'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 5: readFile — upload to cloud after IDB.put
# ═══════════════════════════════════════════════════════════════
patch('readfile-cloud-upload',
    '''        _lbpIDB.put(id, e.target.result).then(function() { resolve(att); });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);''',
    '''        _lbpIDB.put(id, e.target.result).then(function() {
          // Upload to cloud if within size limit (enables cross-device access)
          if (file.size <= LBP_CLOUD_FILE_MAX) {
            _lbpCloudFile.upload(id, e.target.result, file.name, file.type);
          }
          resolve(att);
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 6: Audio recording onstop — upload to cloud after IDB.put
# ═══════════════════════════════════════════════════════════════
patch('audio-cloud-upload',
    '''                _lbpIDB.put(id, ev.target.result).then(function() {
                  onChange([].concat(_toConsumableArray(attachments), [att]));
                });''',
    '''                _lbpIDB.put(id, ev.target.result).then(function() {
                  if (blob.size <= LBP_CLOUD_FILE_MAX) {
                    _lbpCloudFile.upload(id, ev.target.result, att.name, 'audio/webm');
                  }
                  onChange([].concat(_toConsumableArray(attachments), [att]));
                });'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 7: saveDrawing — upload to cloud after IDB.put
# ═══════════════════════════════════════════════════════════════
patch('drawing-cloud-upload',
    '''    _lbpIDB.put(id, dataUrl).then(function() {
      onChange([].concat(_toConsumableArray(attachments), [att]));
    });''',
    '''    _lbpIDB.put(id, dataUrl).then(function() {
      _lbpCloudFile.upload(id, dataUrl, att.name, 'image/png');
      onChange([].concat(_toConsumableArray(attachments), [att]));
    });'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 8: removeItem — also delete from cloud
# ═══════════════════════════════════════════════════════════════
patch('remove-cloud-delete',
    '''  var removeItem = function removeItem(id) {
    _lbpIDB.del(id);
    onChange(attachments.filter(function(a) { return a.id !== id; }));
  };''',
    '''  var removeItem = function removeItem(id) {
    _lbpIDB.del(id);
    _lbpCloudFile.del(id);
    onChange(attachments.filter(function(a) { return a.id !== id; }));
  };'''
)

# ═══════════════════════════════════════════════════════════════
# PATCH 9: Version bump → v4.78
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.77';",
    "window.LBP_VERSION = '4.78';"
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
    open('/tmp/check478.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check478.js'], capture_output=True, text=True)
    if r.returncode == 0:
        print('✅ node --check PASSED')
    else:
        print('❌ node --check FAILED:')
        print(r.stderr[:800])
