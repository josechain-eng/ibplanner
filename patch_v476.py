#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.76 patch:
1. Journal header overflow fix (flexWrap on button group)
2. Journal card button overflow fix (wrap metadata/actions)
3. Journal "Link to" section → dropdowns instead of chip list
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
# PATCH 1: Journal page-header — add flexWrap to buttons container
# ═══════════════════════════════════════════════════════════════
# The header buttons div has many items that overflow on mobile.
# Add flexWrap + justifyContent so they wrap gracefully.

patch('journal-header-wrap',
    "React.createElement(\"div\", {style:{display:\"flex\",gap:6}},\n    ['All','Journal','Note'].map(",
    "React.createElement(\"div\", {style:{display:\"flex\",gap:5,flexWrap:\"wrap\",justifyContent:\"flex-end\",alignItems:\"center\"}},\n    ['All','Journal','Note'].map("
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: Journal page-header — also make the h1 not shrink weirdly
# Add flexShrink:0 to h1 and allow page-header to wrap
# ═══════════════════════════════════════════════════════════════
# We target the .page-header CSS to allow wrap
patch('page-header-css',
    ".page-header { padding: 20px 24px 0; display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }",
    ".page-header { padding: 20px 24px 0; display: flex; align-items: center; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: Journal card row — split metadata + actions to prevent overflow
# The right side has: mood emoji, mood chip, alarm icon, attachment count,
# note/journal badge, record button, edit button, delete button — too many items.
# Split into two mini-rows: badges row + actions row
# ═══════════════════════════════════════════════════════════════
# (journal-card-rightside already applied separately)

# ═══════════════════════════════════════════════════════════════
# PATCH 4: Journal "Link to" section → dropdowns
# Replace individual chip lists with select dropdowns per type
# ═══════════════════════════════════════════════════════════════
OLD_LINK = """/*#__PURE__*/React.createElement("div", {style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:10}}, "🔗 Link this entry to…"),
    [['task','Tasks','title',data.tasks||[]],['project','Projects','name',data.projects||[]],['meeting','Meetings','title',data.meetings||[]],['goal','Goals','title',data.goals||[]],['habit','Habits','name',data.habits||[]]].map(function(row){
      var itype=row[0], ilabel=row[1], ikey=row[2], items=row[3];
      if(!items.length) return null;
      var linkedIds=(form.links||[]).filter(function(l){return l.type===itype;}).map(function(l){return l.id;});
      return /*#__PURE__*/React.createElement("div", {key:itype, style:{marginBottom:8}},
        /*#__PURE__*/React.createElement("div", {style:{fontSize:11,color:"var(--text-dim)",marginBottom:4}}, ilabel),
        /*#__PURE__*/React.createElement("div", {style:{display:"flex",flexWrap:"wrap",gap:4}},
          items.slice(0,15).map(function(item){
            var isl=linkedIds.includes(item.id);
            return /*#__PURE__*/React.createElement("div", {key:item.id,
              onClick:function(){var nl=isl?(form.links||[]).filter(function(l){return !(l.type===itype&&l.id===item.id);}):[].concat(_toConsumableArray(form.links||[]),[{type:itype,id:item.id}]);setForm(_objectSpread(_objectSpread({},form),{},{links:nl}));},
              style:{fontSize:11,padding:"3px 10px",borderRadius:12,cursor:"pointer",userSelect:"none",
                     background:isl?"var(--purple)":"var(--surface)",color:isl?"#fff":"var(--text-dim)",
                     border:"1px solid "+(isl?"var(--purple)":"var(--border)")}},
              (isl?"✓ ":"")+(item[ikey]||"(no name)")
            );
          })
        )
      );
    })"""

NEW_LINK = """/*#__PURE__*/React.createElement("div", {style:{fontSize:12,fontWeight:700,color:"var(--text-dim)",marginBottom:8}}, "🔗 Link this entry to…"),
    (form.links||[]).length > 0 && /*#__PURE__*/React.createElement("div", {style:{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}},
      (form.links||[]).map(function(lnk){
        var allRows=[['task','Tasks','title',data.tasks||[]],['project','Projects','name',data.projects||[]],['meeting','Meetings','title',data.meetings||[]],['goal','Goals','title',data.goals||[]],['habit','Habits','name',data.habits||[]]];
        var row=allRows.find(function(r){return r[0]===lnk.type;});
        if(!row) return null;
        var item=(row[3]).find(function(it){return it.id===lnk.id;});
        var label=item?(item[row[2]]||'(sin nombre)'):'(eliminado)';
        var typeColors={task:'#6B3FA0',project:'#2196F3',meeting:'#FF9800',goal:'#4CAF50',habit:'#E91E63'};
        var col=typeColors[lnk.type]||'#888';
        return /*#__PURE__*/React.createElement("div", {key:lnk.type+lnk.id,
          style:{display:"flex",alignItems:"center",gap:4,fontSize:11,padding:"3px 8px 3px 10px",borderRadius:12,background:col+"22",border:"1px solid "+col+"55",color:"var(--text)"}},
          /*#__PURE__*/React.createElement("span", null, label),
          /*#__PURE__*/React.createElement("span", {
            style:{cursor:"pointer",color:"#f66",fontWeight:"bold",fontSize:12,lineHeight:1,paddingLeft:2},
            onClick:function(){var nl=(form.links||[]).filter(function(l){return !(l.type===lnk.type&&l.id===lnk.id);});setForm(_objectSpread(_objectSpread({},form),{},{links:nl}));}
          }, "×")
        );
      })
    ),
    [['task','Tasks','title',data.tasks||[]],['project','Projects','name',data.projects||[]],['meeting','Meetings','title',data.meetings||[]],['goal','Goals','title',data.goals||[]],['habit','Habits','name',data.habits||[]]].map(function(row){
      var itype=row[0], ilabel=row[1], ikey=row[2], items=row[3];
      if(!items.length) return null;
      var linkedIds=(form.links||[]).filter(function(l){return l.type===itype;}).map(function(l){return l.id;});
      var unlinked=items.filter(function(it){return !linkedIds.includes(it.id);});
      if(!unlinked.length) return null;
      return /*#__PURE__*/React.createElement("div", {key:itype, style:{marginBottom:6}},
        /*#__PURE__*/React.createElement("select", {
          value:"",
          onChange:function(e){
            var id=e.target.value;
            if(!id) return;
            var nl=[].concat(_toConsumableArray(form.links||[]),[{type:itype,id:id}]);
            setForm(_objectSpread(_objectSpread({},form),{},{links:nl}));
          },
          style:{width:"100%",background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 10px",fontSize:12,cursor:"pointer"}
        },
          /*#__PURE__*/React.createElement("option", {value:""}, "+ Link a "+ilabel+"..."),
          unlinked.map(function(item){
            return /*#__PURE__*/React.createElement("option", {key:item.id, value:item.id}, item[ikey]||"(sin nombre)");
          })
        )
      );
    })"""

patch('journal-link-dropdowns', OLD_LINK, NEW_LINK)

# ═══════════════════════════════════════════════════════════════
# PATCH 5: Version bump → v4.76
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.75';",
    "window.LBP_VERSION = '4.76';"
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
    open('/tmp/check476.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check476.js'], capture_output=True, text=True)
    if r.returncode == 0:
        print('✅ node --check PASSED')
    else:
        print('❌ node --check FAILED:')
        print(r.stderr[:800])
