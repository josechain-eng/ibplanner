#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.80 — R2 Storage Monitor panel in Cloud Settings"""
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
# PATCH 1: Add R2 stats state vars in SettingsScreen after gcalStatus state
# ═══════════════════════════════════════════════════════════════
patch('r2-state-vars',
    "  var _gcalS3 = useState(''), _gcalS4 = _slicedToArray(_gcalS3, 2), gcalStatus = _gcalS4[0], setGcalStatus = _gcalS4[1];",
    "  var _gcalS3 = useState(''), _gcalS4 = _slicedToArray(_gcalS3, 2), gcalStatus = _gcalS4[0], setGcalStatus = _gcalS4[1];\n"
    "  var _r2S1=useState(null),_r2S2=_slicedToArray(_r2S1,2),r2Stats=_r2S2[0],setR2Stats=_r2S2[1];\n"
    "  var _r2S3=useState(false),_r2S4=_slicedToArray(_r2S3,2),r2Loading=_r2S4[0],setR2Loading=_r2S4[1];\n"
    "  var _r2S5=useState(null),_r2S6=_slicedToArray(_r2S5,2),r2DelId=_r2S6[0],setR2DelId=_r2S6[1];"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Insert R2 storage panel before version indicator
# ═══════════════════════════════════════════════════════════════
R2_PANEL = (
    "          /*#__PURE__*/React.createElement('div', { style:{marginTop:14,background:'rgba(255,255,255,0.04)',borderRadius:12,padding:'12px 14px'} },\n"
    "            /*#__PURE__*/React.createElement('div', { style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8} },\n"
    "              /*#__PURE__*/React.createElement('span', { style:{fontSize:12,fontWeight:700,color:'var(--text-primary)'} }, '\\uD83D\\uDDC2 Cloud File Storage (R2)'),\n"
    "              /*#__PURE__*/React.createElement('button', {\n"
    "                style:{fontSize:10,padding:'3px 9px',borderRadius:7,background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)',color:'var(--text)',cursor:'pointer'},\n"
    "                disabled:r2Loading,\n"
    "                onClick:function(){\n"
    "                  var sk=localStorage.getItem('lbp_sync_key');\n"
    "                  if(!workerUrl||!sk){setR2Stats({error:'Worker URL not configured'});return;}\n"
    "                  setR2Loading(true);\n"
    "                  fetch(workerUrl+'/file-stats?key='+encodeURIComponent(sk))\n"
    "                    .then(function(r){return r.json();})\n"
    "                    .then(function(d){setR2Stats(d);setR2Loading(false);})\n"
    "                    .catch(function(){setR2Stats({error:'Error al consultar'});setR2Loading(false);});\n"
    "                }\n"
    "              }, r2Loading ? '\\u23F3' : '\\uD83D\\uDD04 Verificar uso')\n"
    "            ),\n"
    "            r2Stats && r2Stats.error && /*#__PURE__*/React.createElement('p', {style:{fontSize:11,color:'#f87171',margin:'4px 0'}}, r2Stats.error),\n"
    "            r2Stats && !r2Stats.error && !r2Stats.r2 && /*#__PURE__*/React.createElement('p', {style:{fontSize:11,color:'#fbbf24',margin:'4px 0'}}, '\\u26A0\\uFE0F R2 no configurado en el Worker. Agrega el binding LBP_R2.'),\n"
    "            r2Stats && r2Stats.r2 && /*#__PURE__*/React.createElement(React.Fragment, null,\n"
    "              (function(){\n"
    "                var pct = r2Stats.usedPercent || 0;\n"
    "                var barColor = pct < 50 ? '#4ade80' : pct < 75 ? '#fbbf24' : pct < 90 ? '#f97316' : '#ef4444';\n"
    "                var usedMB = ((r2Stats.totalBytes||0) / (1024*1024)).toFixed(1);\n"
    "                var msg = pct >= 90 ? '\\u26A0\\uFE0F Casi lleno! Considera borrar archivos.' :\n"
    "                          pct >= 75 ? '\\u26A0\\uFE0F Uso alto — revisa tus archivos.' :\n"
    "                          pct >= 50 ? '\\u26A0\\uFE0F Superaste el 50% del storage gratuito.' : null;\n"
    "                return /*#__PURE__*/React.createElement(React.Fragment, null,\n"
    "                  /*#__PURE__*/React.createElement('div', {style:{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-dim)',marginBottom:4}},\n"
    "                    /*#__PURE__*/React.createElement('span', null, usedMB+' MB usados de 10,240 MB'),\n"
    "                    /*#__PURE__*/React.createElement('span', {style:{color:barColor,fontWeight:700}}, pct+'%')\n"
    "                  ),\n"
    "                  /*#__PURE__*/React.createElement('div', {style:{height:8,borderRadius:4,background:'rgba(255,255,255,0.1)',overflow:'hidden',marginBottom:6}},\n"
    "                    /*#__PURE__*/React.createElement('div', {style:{height:'100%',width:Math.min(pct,100)+'%',background:barColor,borderRadius:4,transition:'width 0.4s'}})\n"
    "                  ),\n"
    "                  msg && /*#__PURE__*/React.createElement('p', {style:{fontSize:11,color:barColor,margin:'2px 0 6px',fontWeight:600}}, msg),\n"
    "                  /*#__PURE__*/React.createElement('p', {style:{fontSize:11,color:'var(--text-dim)',margin:'0 0 6px'}},\n"
    "                    (r2Stats.fileCount||0)+' archivo'+(r2Stats.fileCount===1?'':'s')+' en cloud'\n"
    "                  ),\n"
    "                  (r2Stats.files||[]).length > 0 && /*#__PURE__*/React.createElement('div', {style:{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:3}},\n"
    "                    (r2Stats.files||[]).map(function(fi){\n"
    "                      var sizeTxt = fi.size > 1024*1024 ? (fi.size/(1024*1024)).toFixed(1)+' MB' : Math.round(fi.size/1024)+' KB';\n"
    "                      var dateTxt = fi.uploaded ? new Date(fi.uploaded).toLocaleDateString('es-BO',{day:'2-digit',month:'short',year:'2-digit'}) : '';\n"
    "                      return /*#__PURE__*/React.createElement('div', {\n"
    "                        key:fi.fileId,\n"
    "                        style:{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'5px 8px'}\n"
    "                      },\n"
    "                        /*#__PURE__*/React.createElement('span', {style:{flex:1,fontSize:11,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, fi.name||fi.fileId),\n"
    "                        /*#__PURE__*/React.createElement('span', {style:{fontSize:10,color:'var(--text-dim)',whiteSpace:'nowrap'}}, sizeTxt),\n"
    "                        dateTxt && /*#__PURE__*/React.createElement('span', {style:{fontSize:10,color:'var(--text-dim)',whiteSpace:'nowrap'}}, dateTxt),\n"
    "                        /*#__PURE__*/React.createElement('button', {\n"
    "                          style:{fontSize:11,color:'#f87171',background:'none',border:'none',cursor:'pointer',padding:'0 2px',lineHeight:1,flexShrink:0},\n"
    "                          title:'Borrar del cloud',\n"
    "                          disabled:r2DelId===fi.fileId,\n"
    "                          onClick:function(){\n"
    "                            var sk=localStorage.getItem('lbp_sync_key');\n"
    "                            if(!workerUrl||!sk) return;\n"
    "                            setR2DelId(fi.fileId);\n"
    "                            fetch(workerUrl+'/file?key='+encodeURIComponent(sk)+'&id='+encodeURIComponent(fi.fileId),{method:'DELETE'})\n"
    "                              .then(function(){\n"
    "                                setR2DelId(null);\n"
    "                                setR2Stats(function(prev){\n"
    "                                  var newFiles=(prev.files||[]).filter(function(x){return x.fileId!==fi.fileId;});\n"
    "                                  var newBytes=(prev.totalBytes||0)-fi.size;\n"
    "                                  var newPct=Math.round(newBytes/((10*1024*1024*1024))*100*10)/10;\n"
    "                                  return Object.assign({},prev,{files:newFiles,fileCount:newFiles.length,totalBytes:newBytes,usedPercent:newPct});\n"
    "                                });\n"
    "                              }).catch(function(){setR2DelId(null);});\n"
    "                          }\n"
    "                        }, r2DelId===fi.fileId ? '\\u23F3' : '\\uD83D\\uDDD1')\n"
    "                      );\n"
    "                    })\n"
    "                  )\n"
    "                );\n"
    "              })()\n"
    "            )\n"
    "          ),\n"
)

patch('r2-panel',
    "          /*#__PURE__*/React.createElement('div', { style:{marginTop:10, fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'right'} },\n"
    "            'v' + (window.LBP_VERSION || '?')\n"
    "          )",
    R2_PANEL +
    "          /*#__PURE__*/React.createElement('div', { style:{marginTop:10, fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'right'} },\n"
    "            'v' + (window.LBP_VERSION || '?')\n"
    "          )"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: Version bump
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.79';",
    "window.LBP_VERSION = '4.80';"
)

if errors:
    print('\n'.join(errors))
    print('⚠️  NOT saving')
else:
    open(f, 'w', encoding='utf-8').write(html)
    print(f'Saved. Size: {len(html):,} bytes (was {original_len:,})')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check480.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check480.js'], capture_output=True, text=True)
    print('✅ node --check PASSED' if r.returncode == 0 else '❌ node --check FAILED:\n' + r.stderr[:800])
