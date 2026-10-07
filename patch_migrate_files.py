#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.81 — One-time migration button: upload all local IDB files to R2 cloud"""
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
# PATCH 1: Pass data prop to SyncSettingsButton at call site
# ═══════════════════════════════════════════════════════════════
patch('settings-data-prop-callsite',
    '/*#__PURE__*/React.createElement(SyncSettingsButton, {workerUrl: workerUrl, setWorkerUrl: setWorkerUrl, syncKey: syncKey})',
    '/*#__PURE__*/React.createElement(SyncSettingsButton, {workerUrl: workerUrl, setWorkerUrl: setWorkerUrl, syncKey: syncKey, data: data})'
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Accept data prop in SyncSettingsButton destructuring
# ═══════════════════════════════════════════════════════════════
patch('settings-data-prop-recv',
    '  var workerUrl = _ref_ssb.workerUrl, setWorkerUrl = _ref_ssb.setWorkerUrl, syncKey = _ref_ssb.syncKey;',
    '  var workerUrl = _ref_ssb.workerUrl, setWorkerUrl = _ref_ssb.setWorkerUrl, syncKey = _ref_ssb.syncKey, data = _ref_ssb.data;'
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: Add migration state vars after r2DelId state
# ═══════════════════════════════════════════════════════════════
patch('migration-state-vars',
    '  var _r2S5=useState(null),_r2S6=_slicedToArray(_r2S5,2),r2DelId=_r2S6[0],setR2DelId=_r2S6[1];',
    '  var _r2S5=useState(null),_r2S6=_slicedToArray(_r2S5,2),r2DelId=_r2S6[0],setR2DelId=_r2S6[1];\n'
    '  var _mig1=useState(null),_mig2=_slicedToArray(_mig1,2),migState=_mig2[0],setMigState=_mig2[1];'
    # migState: null | {running, done, total, skipped, errors, complete}
)

# ═══════════════════════════════════════════════════════════════
# PATCH 4: Add migration button + progress inside the R2 panel,
#          after the file list and before the closing of the R2 panel div
# Insert right before the version indicator (which follows the R2 panel)
# ═══════════════════════════════════════════════════════════════
MIGRATE_UI = (
    # Migration button row
    "            /*#__PURE__*/React.createElement('div', {style:{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.08)'} },\n"
    "              /*#__PURE__*/React.createElement('div', {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},\n"
    "                /*#__PURE__*/React.createElement('span', {style:{fontSize:11,color:'var(--text-dim)'}}, '\\uD83D\\uDD04 Subir archivos locales al cloud'),\n"
    "                /*#__PURE__*/React.createElement('button', {\n"
    "                  style:{fontSize:10,padding:'3px 9px',borderRadius:7,background:'rgba(107,63,160,0.3)',border:'1px solid rgba(107,63,160,0.6)',color:'#c084fc',cursor:'pointer',whiteSpace:'nowrap'},\n"
    "                  disabled:!!(migState&&migState.running),\n"
    "                  onClick:function(){\n"
    "                    if(!workerUrl){return;}\n"
    "                    var sk=localStorage.getItem('lbp_sync_key');\n"
    "                    if(!sk) return;\n"
    # Collect all attachments from all data arrays
    "                    var TYPES=['tasks','projects','meetings','journal','goals','habits','routines','householdTasks','workouts','medications'];\n"
    "                    var allAtts=[];\n"
    "                    TYPES.forEach(function(k){\n"
    "                      ((data&&data[k])||[]).forEach(function(item){\n"
    "                        ((item.attachments)||[]).forEach(function(att){\n"
    "                          if(att&&att.id&&att.type!=='link'&&!att.data) allAtts.push(att);\n"
    "                        });\n"
    "                      });\n"
    "                    });\n"
    "                    if(!allAtts.length){setMigState({running:false,done:0,total:0,skipped:0,errors:0,complete:true,msg:'No hay archivos locales para subir.'});return;}\n"
    "                    setMigState({running:true,done:0,total:allAtts.length,skipped:0,errors:0,complete:false});\n"
    # Process sequentially
    "                    var idx=0;\n"
    "                    function next(){\n"
    "                      if(idx>=allAtts.length){\n"
    "                        setMigState(function(p){return Object.assign({},p,{running:false,complete:true,msg:'\\u2705 Listo! '+p.done+' subidos, '+p.skipped+' ya en cloud, '+p.errors+' errores.'});});\n"
    "                        return;\n"
    "                      }\n"
    "                      var att=allAtts[idx++];\n"
    "                      _lbpIDB.get(att.id).then(function(idbData){\n"
    "                        if(!idbData){\n"
    "                          setMigState(function(p){return Object.assign({},p,{skipped:p.skipped+1,done:p.done+1});});\n"
    "                          next(); return;\n"
    "                        }\n"
    "                        if(idbData.length>90*1024*1024){\n"
    "                          setMigState(function(p){return Object.assign({},p,{skipped:p.skipped+1,done:p.done+1});});\n"
    "                          next(); return;\n"
    "                        }\n"
    "                        _lbpCloudFile.upload(att.id,idbData,att.name||'',att.mimeType||'')\n"
    "                          .then(function(ok){\n"
    "                            setMigState(function(p){return Object.assign({},p,{done:p.done+1,errors:ok?p.errors:p.errors+1});});\n"
    "                            next();\n"
    "                          }).catch(function(){\n"
    "                            setMigState(function(p){return Object.assign({},p,{done:p.done+1,errors:p.errors+1});});\n"
    "                            next();\n"
    "                          });\n"
    "                      }).catch(function(){setMigState(function(p){return Object.assign({},p,{done:p.done+1,errors:p.errors+1});});next();});\n"
    "                    }\n"
    "                    next();\n"
    "                  }\n"
    "                }, (migState&&migState.running) ? '\\u23F3 Subiendo...' : '\\u2601\\uFE0F Subir ahora')\n"
    "              ),\n"
    # Progress bar while running
    "              migState && migState.running && /*#__PURE__*/React.createElement(React.Fragment, null,\n"
    "                /*#__PURE__*/React.createElement('div', {style:{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-dim)',marginBottom:3}},\n"
    "                  /*#__PURE__*/React.createElement('span', null, 'Subiendo '+migState.done+' de '+migState.total+'...'),\n"
    "                  /*#__PURE__*/React.createElement('span', null, Math.round(migState.done/migState.total*100)+'%')\n"
    "                ),\n"
    "                /*#__PURE__*/React.createElement('div', {style:{height:6,borderRadius:3,background:'rgba(255,255,255,0.1)',overflow:'hidden'}},\n"
    "                  /*#__PURE__*/React.createElement('div', {style:{height:'100%',width:Math.round(migState.done/migState.total*100)+'%',background:'#c084fc',borderRadius:3,transition:'width 0.2s'}})\n"
    "                )\n"
    "              ),\n"
    # Result message
    "              migState && migState.complete && /*#__PURE__*/React.createElement('p', {\n"
    "                style:{fontSize:11,color:migState.errors?'#fbbf24':'#4ade80',margin:'4px 0 0',fontWeight:600}\n"
    "              }, migState.msg)\n"
    "            ),\n"
)

patch('r2-migrate-button',
    "          /*#__PURE__*/React.createElement('div', { style:{marginTop:10, fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'right'} },\n"
    "            'v' + (window.LBP_VERSION || '?')\n"
    "          )",
    MIGRATE_UI +
    "          /*#__PURE__*/React.createElement('div', { style:{marginTop:10, fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'right'} },\n"
    "            'v' + (window.LBP_VERSION || '?')\n"
    "          )"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 5: Version bump
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.80';",
    "window.LBP_VERSION = '4.81';"
)

if errors:
    print('\n'.join(errors))
    print('⚠️  NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'Saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check481.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check481.js'], capture_output=True, text=True)
    print('✅ node --check PASSED' if r.returncode == 0 else '❌ node --check FAILED:\n' + r.stderr[:800])
