#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LB Planner v4.75 patch:
1. Meeting end time auto +1h
2. Family Clothing Sizes (replaces Outfit Planner)
3. Remove Skin Tracker, add Baby module
4. AI chat in Workout Planner (fitness expert)
5. AI chat in Recipes & Groceries (nutrition + photo analysis)
6. Shared AiExpertChat component
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
# PATCH 1: Meeting start time → auto end time +1h
# ═══════════════════════════════════════════════════════════════
patch('meeting-endtime',
    "    onChange: function onChange(e) {\n      return setForm(_objectSpread(_objectSpread({}, form), {}, {\n        startTime: e.target.value,\n        alarm: form.date ? meetingAlarmDefault(form.date, e.target.value) : form.alarm\n      }));\n    }\n  })), /*#__PURE__*/React.createElement(\"div\", {\n    className: \"form-group\"\n  }, /*#__PURE__*/React.createElement(\"label\", null, \"End Time\")",
    "    onChange: function onChange(e) {\n      var _st = e.target.value;\n      var _ep = _st ? _st.split(':') : null;\n      var _autoEnd = _ep ? (function(){var _h=parseInt(_ep[0])+1;return(_h>=24?'23':_h<10?'0'+_h:''+_h)+':'+_ep[1];})() : form.endTime;\n      return setForm(_objectSpread(_objectSpread({}, form), {}, {\n        startTime: _st,\n        endTime: _autoEnd,\n        alarm: form.date ? meetingAlarmDefault(form.date, _st) : form.alarm\n      }));\n    }\n  })), /*#__PURE__*/React.createElement(\"div\", {\n    className: \"form-group\"\n  }, /*#__PURE__*/React.createElement(\"label\", null, \"End Time\")"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 2: INITIAL_DATA — add familySizes, babyProfile, babyLog
# ═══════════════════════════════════════════════════════════════
patch('initial-data',
    "  skinLogs: [],\n  skinProducts: [],",
    "  skinLogs: [],\n  skinProducts: [],\n  familySizes: [],\n  babyProfile: {name: '', dob: ''},\n  babyLog: [],"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 3: Drawer — Health & Wellness remove skin, add baby
# ═══════════════════════════════════════════════════════════════
patch('drawer-health',
    "['journal', '\U0001F4D3', 'Journal'], ['habits', '\U0001F504', 'Habit Tracker'], ['workout', '\U0001F3CB️', 'Workout Planner'], ['recipes', '\U0001F37D', 'Recipes & Groceries'], ['medication', '\U0001F48A', 'Medication Tracker'], ['skin', '✨', 'Skin Tracker']",
    "['journal', '\U0001F4D3', 'Journal'], ['habits', '\U0001F504', 'Habit Tracker'], ['workout', '\U0001F3CB️', 'Workout Planner'], ['recipes', '\U0001F37D', 'Recipes & Groceries'], ['medication', '\U0001F48A', 'Medication Tracker'], ['baby', '\U0001F476', 'Baby']"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 4: Drawer — Dream Life rename Outfit Planner → Family Sizes
# ═══════════════════════════════════════════════════════════════
patch('drawer-outfits-label',
    "['outfits', '\U0001F457', 'Outfit Planner']",
    "['outfits', '\U0001F454', 'Family Sizes']"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 5: Switch case — skin → baby
# ═══════════════════════════════════════════════════════════════
patch('switch-skin-to-baby',
    "      case 'skin':\n        return /*#__PURE__*/React.createElement(SkinTrackerScreen, props);",
    "      case 'baby':\n        return /*#__PURE__*/React.createElement(BabyScreen, props);"
)

# ═══════════════════════════════════════════════════════════════
# PATCH 6: Replace OutfitPlannerScreen with FamilyClothingSizesScreen
# ═══════════════════════════════════════════════════════════════

# Find the exact boundaries - get start of OutfitPlannerScreen
start_marker = 'var OutfitPlannerScreen = function OutfitPlannerScreen(_ref55) {'
end_marker = '\n// ─── HOUSEHOLD ─'

NEW_OUTFIT = r'''var OutfitPlannerScreen = function OutfitPlannerScreen(_ref55) {
  var data = _ref55.data, setData = _ref55.setData;
  var _fm = useState(false), _fm2 = _slicedToArray(_fm, 2), modal = _fm2[0], setModal = _fm2[1];
  var _fe = useState(null), _fe2 = _slicedToArray(_fe, 2), editItem = _fe2[0], setEditItem = _fe2[1];
  var _fmb = useState('All'), _fmb2 = _slicedToArray(_fmb, 2), filterMember = _fmb2[0], setFilterMember = _fmb2[1];
  var _ff = useState({member:'',clothingType:'',subcategory:'',size:'',notes:''}),
      _ff2 = _slicedToArray(_ff, 2), form = _ff2[0], setForm = _ff2[1];
  var clothingTypes = ['Zapatos','Camisas','Pantalones','Shorts','Vestidos','Ropa Interior','Abrigos','Accesorios','Ropa Deportiva','Otro'];
  var sizes = data.familySizes || [];
  var uniqueMembers = [];
  sizes.forEach(function(s){if(s.member&&uniqueMembers.indexOf(s.member)<0)uniqueMembers.push(s.member);});
  var members = ['All'].concat(uniqueMembers);
  var filtered = filterMember === 'All' ? sizes : sizes.filter(function(s){return s.member === filterMember;});
  var resetForm = function(){setForm({member:'',clothingType:'',subcategory:'',size:'',notes:''}); setEditItem(null);};
  var save = function save() {
    if (!form.member || !form.clothingType) return;
    if (editItem) {
      setData(function(d){return _objectSpread(_objectSpread({},d),{},{familySizes:(d.familySizes||[]).map(function(x){return x.id===editItem.id?_objectSpread(_objectSpread({},editItem),form):x;})});});
    } else {
      setData(function(d){return _objectSpread(_objectSpread({},d),{},{familySizes:[].concat(_toConsumableArray(d.familySizes||[]),[_objectSpread(_objectSpread({},form),{},{id:uid(),createdAt:now()})])});});
    }
    setModal(false); resetForm();
  };
  var del = function del(id) {
    if(!confirm('Delete this entry?'))return;
    setData(function(d){return _objectSpread(_objectSpread({},d),{},{familySizes:(d.familySizes||[]).filter(function(x){return x.id!==id;}),_deletedIds:_lbpRecordDel(d,id)});});
  };
  return React.createElement('div', null,
    React.createElement('div', {className:'page-header'},
      React.createElement('h1', null, '👔 Family Sizes'),
      React.createElement('button', {className:'btn btn-primary btn-sm', onClick:function(){resetForm();setModal(true);}}, '+ Add')
    ),
    members.length > 1 && React.createElement('div', {className:'tabs'},
      members.map(function(m){
        return React.createElement('div', {key:m, className:'tab '+(filterMember===m?'active':''), onClick:function(){setFilterMember(m);}}, m);
      })
    ),
    React.createElement('div', {className:'page-content'},
      filtered.length === 0 ? React.createElement('div', {className:'empty-state'},
        React.createElement('div', {className:'e-icon'}, '👔'),
        React.createElement('h3', null, 'No sizes saved yet'),
        React.createElement('p', null, 'Add clothing sizes and preferences for your family members.'),
        React.createElement('button', {className:'btn btn-primary', onClick:function(){resetForm();setModal(true);}}, '+ Add First Entry')
      ) : React.createElement(React.Fragment, null,
        uniqueMembers.filter(function(m){return filterMember==='All'||m===filterMember;}).map(function(member){
          var memberItems = filtered.filter(function(s){return s.member===member;});
          if(!memberItems.length) return null;
          return React.createElement('div', {key:member, style:{marginBottom:16}},
            React.createElement('div', {style:{fontWeight:700,fontSize:12,color:'var(--purple-light)',textTransform:'uppercase',letterSpacing:1,marginBottom:8,paddingBottom:4,borderBottom:'1px solid var(--border)'}}, member),
            memberItems.map(function(s){
              return React.createElement('div', {key:s.id, className:'card mb-8'},
                React.createElement('div', {className:'row'},
                  React.createElement('div', {style:{flex:1}},
                    React.createElement('div', {style:{fontWeight:600,fontSize:14}}, s.clothingType+(s.subcategory?' — '+s.subcategory:'')),
                    React.createElement('div', {style:{display:'flex',gap:8,marginTop:4,flexWrap:'wrap',alignItems:'center'}},
                      s.size && React.createElement(Chip, {label:'📏 '+s.size, color:'#6B3FA0'}),
                      s.notes && React.createElement('span', {style:{fontSize:12,color:'var(--text-dim)'}}, s.notes)
                    )
                  ),
                  React.createElement('div', {style:{display:'flex',gap:6}},
                    React.createElement('button', {className:'btn btn-secondary btn-sm', onClick:function(){setEditItem(s);setForm({member:s.member,clothingType:s.clothingType,subcategory:s.subcategory||'',size:s.size||'',notes:s.notes||''});setModal(true);}}, '✏️'),
                    React.createElement('button', {className:'btn btn-danger btn-sm btn-icon', onClick:function(){del(s.id);}}, '\xD7')
                  )
                )
              );
            })
          );
        })
      )
    ),
    modal && React.createElement(Modal, {
      title: editItem ? 'Edit Entry' : 'Add Clothing Size',
      onClose: function(){setModal(false);resetForm();},
      footer: React.createElement(React.Fragment, null,
        React.createElement('button', {className:'btn btn-secondary', onClick:function(){setModal(false);resetForm();}}, 'Cancel'),
        React.createElement('button', {className:'btn btn-primary', onClick:save}, 'Save')
      )
    },
      React.createElement('div', {className:'form-group'},
        React.createElement('label', null, 'Family Member *'),
        React.createElement('input', {value:form.member, onChange:function(e){setForm(_objectSpread(_objectSpread({},form),{},{member:e.target.value}));}, placeholder:'e.g. Pepe, Esposa, Bebé...'})
      ),
      React.createElement('div', {className:'form-group'},
        React.createElement('label', null, 'Clothing Type *'),
        React.createElement('select', {value:form.clothingType, onChange:function(e){setForm(_objectSpread(_objectSpread({},form),{},{clothingType:e.target.value}));}},
          React.createElement('option', {value:''}, 'Select...'),
          clothingTypes.map(function(t){return React.createElement('option', {key:t}, t);})
        )
      ),
      React.createElement('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}},
        React.createElement('div', {className:'form-group'},
          React.createElement('label', null, 'Subcategoría'),
          React.createElement('input', {value:form.subcategory, onChange:function(e){setForm(_objectSpread(_objectSpread({},form),{},{subcategory:e.target.value}));}, placeholder:'e.g. Sneakers, Formal...'})
        ),
        React.createElement('div', {className:'form-group'},
          React.createElement('label', null, 'Talla / Size'),
          React.createElement('input', {value:form.size, onChange:function(e){setForm(_objectSpread(_objectSpread({},form),{},{size:e.target.value}));}, placeholder:'e.g. 42, M, 10...'})
        )
      ),
      React.createElement('div', {className:'form-group'},
        React.createElement('label', null, 'Preferencias / Notas'),
        React.createElement('input', {value:form.notes, onChange:function(e){setForm(_objectSpread(_objectSpread({},form),{},{notes:e.target.value}));}, placeholder:'Color favorito, marca, tela...'})
      )
    )
  );
};
'''

idx_start = html.find(start_marker)
idx_end = html.find(end_marker, idx_start)
if idx_start < 0 or idx_end < 0:
    errors.append('❌ PATCH [outfit-screen] boundaries not found')
else:
    html = html[:idx_start] + NEW_OUTFIT + html[idx_end:]
    print('✅ [outfit-screen] FamilyClothingSizesScreen')

# ═══════════════════════════════════════════════════════════════
# PATCH 7: Insert AiExpertChat component + AI system prompts
#          — insert right before WorkoutPlannerScreen
# ═══════════════════════════════════════════════════════════════

AI_COMPONENTS = r'''// ─── AI EXPERT CHAT SYSTEM PROMPTS ───────────────────────────
var WORKOUT_AI_SP = 'Eres un experto en fitness y entrenamiento personal con conocimiento profundo de ejercicios, rutinas de gym y casa, grupos musculares, nutrición deportiva, recuperación y programas como Freeletics, HIIT, CrossFit, yoga y más. Das consejos prácticos, motivadores y personalizados. USA SOLO datos reales que el usuario comparta. NO inventes. Si no tienes información suficiente, pídela.';
var RECIPES_AI_SP = 'Eres un experto en nutrición y cocina. Conoces calorías, macros, recetas saludables, planes de comida para pérdida de peso y ganancia muscular (como MyFitnessPal). Puedes analizar fotos de comida: identificar ingredientes y estimar calorías. Cuando el usuario suba una foto, analiza los alimentos visibles con detalle. USA SOLO datos reales. NO inventes calorías exactas sin verlos; da estimaciones con rango.';
var BABY_AI_SP = 'Eres la Dra. Baby AI, pediatra virtual especializada en bebés recién nacidos y lactantes. La familia está en La Paz, Bolivia (altitud ~3600m, considera adaptación). Conoces los principales centros pediátricos en La Paz: Clínica Arco Iris, Hospital del Niño, Clínica Los Olivos, Centro Médico Boliviano-Japonés. Conoces el PAI (Programa Ampliado de Inmunización Bolivia) y medicamentos OTC disponibles en Bolivia.\n\nCONOCIMIENTO DE SUEÑO (Rested Mama, Happy Baby - Wake Time Chart):\nVentana de vigilia = tiempo desde que despierta hasta que se coloca a dormir.\n0-9 sem: 45-60min vigilia, 16-20h sueño/día, 4-8 siestas\n10-12 sem: 45min-1h15m, 16-18h, 4-5 siestas\n3-4 meses: 1h30m-1h45m, 15-17h, 3-4 siestas\n4-5 meses: 2h-2h30m, 14-16h, 3 siestas\n5-6 meses: 2h15m-2h30m, 14-15.5h, 3 siestas\n6-7 meses (3 siestas): 2h30m-2h45m, 13.5-15h\n6-7 meses (2 siestas): 3h-3h15m, 13.5-15h\n7-9 meses: 3h-3h30m, 13-14.5h, 2 siestas\n9-10 meses: 3h15m, 13-14.5h, 2 siestas\n10-12 meses: 3h15m-3h45m, 13-14h, 2 siestas\n12-13 meses (2 siestas): 3h30m-4h, 13-14h\n12-13 meses (1 siesta): 4h45m-5h45m, 12.5-14h\n14-18 meses: 5h-5h30m, 12.5-14h, 1 siesta\n18m-3 años: 5h30m-6h, 12.5-14h, 1 siesta\n4-5 años: sin siestas, 12-13h\n\nTemas: lactancia, fórmula, introducción alimentos, vacunas, desarrollo motor, cólicos, reflujo, fiebre, sueño, rutinas, medicamentos OTC.\nIMPORTANTE: USA SOLO datos reales. SIEMPRE recomienda consulta presencial para diagnósticos. NO inventes.';

// ─── AI EXPERT CHAT COMPONENT ─────────────────────────────────
var AiExpertChat = function AiExpertChat(props) {
  var systemPrompt = props.systemPrompt || '';
  var title = props.title || 'AI';
  var placeholder = props.placeholder || 'Escribe tu pregunta...';
  var allowImage = props.allowImage || false;
  var contextFn = props.contextFn;
  var _msgs = useState([]), _msgs2 = _slicedToArray(_msgs, 2), msgs = _msgs2[0], setMsgs = _msgs2[1];
  var _inp = useState(''), _inp2 = _slicedToArray(_inp, 2), inp = _inp2[0], setInp = _inp2[1];
  var _load = useState(false), _load2 = _slicedToArray(_load, 2), loading = _load2[0], setLoading = _load2[1];
  var _imgD = useState(null), _imgD2 = _slicedToArray(_imgD, 2), imgData = _imgD2[0], setImgData = _imgD2[1];
  var fileRef = useRef(null);
  var msgsEndRef = useRef(null);
  useEffect(function(){if(msgsEndRef.current)msgsEndRef.current.scrollIntoView({behavior:'smooth'});},[msgs]);
  var renderMsg = function(text){
    if(!text) return null;
    var lines = text.split('\n');
    return React.createElement('div',{style:{fontSize:13,lineHeight:1.7}},
      lines.map(function(line,i){
        if(line.startsWith('## ')||line.startsWith('# ')){
          var lvl=line.startsWith('## ')?2:1;
          return React.createElement('div',{key:i,style:{fontWeight:800,fontSize:lvl===1?14:13,color:'var(--purple-light)',marginTop:i===0?0:10,marginBottom:2}},line.replace(/^#+\s*/,''));
        }
        if(line.startsWith('### ')) return React.createElement('div',{key:i,style:{fontWeight:700,fontSize:12,color:'#FF9800',marginTop:8,marginBottom:2}},line.replace(/^###\s*/,''));
        if(line.startsWith('- ')||line.startsWith('• ')) return React.createElement('div',{key:i,style:{paddingLeft:12,fontSize:13}},'• '+line.replace(/^[-•]\s*/,''));
        if(!line.trim()) return React.createElement('div',{key:i,style:{height:4}});
        var parts=line.split(/\*\*(.*?)\*\*/);
        if(parts.length>1) return React.createElement('div',{key:i,style:{fontSize:13}},parts.map(function(p,j){return j%2===1?React.createElement('strong',{key:j},p):p;}));
        return React.createElement('div',{key:i},line);
      })
    );
  };
  var send = function send() {
    var text = inp.trim();
    if(!text && !imgData) return;
    if(!window.LBP_WORKER_URL){alert('Configura el Worker URL en Settings para usar IA.');return;}
    var userContent;
    if(imgData && allowImage){
      userContent=[{type:'image',source:{type:'base64',media_type:imgData.type,data:imgData.data}},{type:'text',text:text||'Analiza esta imagen: identifica alimentos, ingredientes y estima las calorías.'}];
    } else {
      userContent = text;
    }
    var newMsgs = msgs.concat([{role:'user',content:userContent}]);
    setMsgs(newMsgs);
    setInp(''); setImgData(null); setLoading(true);
    var ctx = contextFn ? contextFn() : '';
    var sp = systemPrompt + (ctx ? '\n\nCONTEXTO ACTUAL DEL USUARIO:\n'+ctx : '');
    fetch(window.LBP_WORKER_URL+'/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({systemPrompt:sp, messages:newMsgs.map(function(m){return{role:m.role,content:m.content};})})
    }).then(function(r){return r.json();}).then(function(d){
      setLoading(false);
      if(d.response) setMsgs(function(prev){return prev.concat([{role:'assistant',content:d.response}]);});
      else if(d.error) setMsgs(function(prev){return prev.concat([{role:'assistant',content:'⚠️ Error: '+d.error}]);});
    }).catch(function(e){setLoading(false);setMsgs(function(prev){return prev.concat([{role:'assistant',content:'⚠️ Error de conexión.'}]);});});
  };
  var handleImg = function(e){
    var file = e.target.files && e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      var b64 = ev.target.result.split(',')[1];
      setImgData({data:b64,type:file.type,name:file.name});
    };
    reader.readAsDataURL(file);
  };
  return React.createElement('div',{style:{display:'flex',flexDirection:'column',height:'100%',minHeight:420}},
    React.createElement('div',{style:{flex:1,overflowY:'auto',padding:'0 4px 12px',display:'flex',flexDirection:'column',gap:8}},
      msgs.length===0 && React.createElement('div',{style:{textAlign:'center',color:'var(--text-dim)',padding:'32px 16px',fontSize:14}},
        React.createElement('div',{style:{fontSize:32,marginBottom:8}},'🤖'),
        React.createElement('div',null,'Pregunta sobre '+title+'...'),
        allowImage && React.createElement('div',{style:{fontSize:12,marginTop:8,color:'var(--text-dim)'}},'📷 Puedes subir fotos de comida para análisis de calorías')
      ),
      msgs.map(function(m,i){
        var isUser=m.role==='user';
        var textContent=typeof m.content==='string'?m.content:(Array.isArray(m.content)?m.content.filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join(' '):'');
        var hasImage=Array.isArray(m.content)&&m.content.some(function(c){return c.type==='image';});
        return React.createElement('div',{key:i,style:{display:'flex',justifyContent:isUser?'flex-end':'flex-start'}},
          React.createElement('div',{style:{maxWidth:'85%',padding:'10px 14px',borderRadius:isUser?'14px 14px 2px 14px':'14px 14px 14px 2px',background:isUser?'#6B3FA0':'var(--card)',border:isUser?'none':'1px solid var(--border)',color:isUser?'#fff':'var(--text)',fontSize:13,lineHeight:1.5}},
            hasImage&&React.createElement('div',{style:{fontSize:11,opacity:0.7,marginBottom:4}},'📷 imagen adjunta'),
            isUser ? React.createElement('div',null,textContent) : renderMsg(textContent)
          )
        );
      }),
      loading && React.createElement('div',{style:{display:'flex',justifyContent:'flex-start'}},
        React.createElement('div',{style:{padding:'10px 14px',borderRadius:'14px 14px 14px 2px',background:'var(--card)',border:'1px solid var(--border)',color:'var(--text-dim)',fontSize:13}},'⏳ Pensando...')
      ),
      React.createElement('div',{ref:msgsEndRef})
    ),
    imgData && React.createElement('div',{style:{padding:'6px 10px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,color:'var(--text-dim)',marginBottom:6,display:'flex',alignItems:'center',justifyContent:'space-between'}},
      React.createElement('span',null,'📷 ',imgData.name),
      React.createElement('span',{style:{cursor:'pointer',color:'#f66',fontWeight:'bold',padding:'0 4px'},onClick:function(){setImgData(null);setFileRef_to_empty();}},'×')
    ),
    React.createElement('div',{style:{display:'flex',gap:8,alignItems:'flex-end',paddingTop:8,borderTop:'1px solid var(--border)'}},
      allowImage && React.createElement(React.Fragment,null,
        React.createElement('input',{type:'file',accept:'image/*',ref:fileRef,style:{display:'none'},onChange:handleImg}),
        React.createElement('button',{onClick:function(){fileRef.current&&fileRef.current.click();},style:{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:10,padding:'9px 11px',fontSize:16,cursor:'pointer',flexShrink:0}},'📷')
      ),
      React.createElement('textarea',{
        value:inp,placeholder:placeholder,rows:2,
        onChange:function(e){setInp(e.target.value);},
        onKeyDown:function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}},
        style:{flex:1,background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:10,padding:'9px 12px',fontSize:13,resize:'none',fontFamily:'inherit',lineHeight:1.5}
      }),
      React.createElement('button',{
        onClick:send,disabled:loading||(!inp.trim()&&!imgData),
        style:{background:'#6B3FA0',border:'none',color:'#fff',borderRadius:10,padding:'9px 14px',fontWeight:'bold',cursor:'pointer',opacity:(loading||(!inp.trim()&&!imgData))?0.45:1,flexShrink:0,fontSize:16}
      },'↑')
    )
  );
};
'''

anchor_workout = 'var WorkoutPlannerScreen = function WorkoutPlannerScreen(_ref57) {'
if anchor_workout in html:
    html = html.replace(anchor_workout, AI_COMPONENTS + anchor_workout, 1)
    print('✅ [ai-expert-chat] AiExpertChat component + system prompts')
else:
    errors.append('❌ [ai-expert-chat] anchor not found')

# ═══════════════════════════════════════════════════════════════
# PATCH 8: WorkoutPlannerScreen — add AI Coach tab
# ═══════════════════════════════════════════════════════════════
patch('workout-tabs',
    "['Log', 'Templates'].map(function (t) {",
    "['Log', 'Templates', 'AI Coach'].map(function (t) {"
)

# Add AI tab content before page-content closes in WorkoutPlannerScreen
patch('workout-ai-content',
    "  }))), modal && /*#__PURE__*/React.createElement(Modal, {\n    title: wpEditItem ? \"Edit Workout\" : \"Log Workout\",",
    "  })), tab === 'AI Coach' && React.createElement(AiExpertChat, {key:'wk-ai',systemPrompt:WORKOUT_AI_SP,title:'fitness y entrenamiento',placeholder:'Pregúntame sobre ejercicios, rutinas, grupos musculares, progreso...'})), modal && /*#__PURE__*/React.createElement(Modal, {\n    title: wpEditItem ? \"Edit Workout\" : \"Log Workout\","
)

# ═══════════════════════════════════════════════════════════════
# PATCH 9: RecipesScreen — add Nutrition AI tab
# ═══════════════════════════════════════════════════════════════
patch('recipes-tabs',
    "['Recipes', 'Grocery'].map(function (t) {",
    "['Recipes', 'Grocery', 'Nutrición AI'].map(function (t) {"
)

patch('recipes-tab-labels',
    "t === 'Recipes' ? '🍽 Recipes' : '🛒 Grocery List'",
    "t === 'Recipes' ? '🍽 Recipes' : t === 'Grocery' ? '🛒 Grocery List' : '🤖 Nutrición AI'"
)

patch('recipes-ai-content',
    "  })))), modal && /*#__PURE__*/React.createElement(Modal, {\n    title: \"New Recipe\",",
    "  }))), tab === 'Nutrición AI' && React.createElement(AiExpertChat, {key:'rec-ai',systemPrompt:RECIPES_AI_SP,title:'nutrición y cocina',placeholder:'Pregunta sobre recetas, calorías, plan de comidas... (puedes subir fotos)',allowImage:true})), modal && /*#__PURE__*/React.createElement(Modal, {\n    title: \"New Recipe\","
)

# ═══════════════════════════════════════════════════════════════
# PATCH 10: Replace SkinTrackerScreen with BabyScreen
# ═══════════════════════════════════════════════════════════════
SKIN_START = 'var SkinTrackerScreen = function SkinTrackerScreen(_ref60) {'
HUB_MARKER = '\n// ─── HUB SCREENS ─'

BABY_SCREEN = r'''var BabyScreen = function BabyScreen(_ref60) {
  var data = _ref60.data, setData = _ref60.setData;
  // Baby profile state
  var bp = data.babyProfile || {name:'', dob:''};
  var _bt = useState('Today'), _bt2 = _slicedToArray(_bt, 2), tab = _bt2[0], setTab = _bt2[1];
  var _bpe = useState(false), _bpe2 = _slicedToArray(_bpe, 2), profileEdit = _bpe2[0], setProfileEdit = _bpe2[1];
  var _bpf = useState({name:bp.name||'', dob:bp.dob||''}), _bpf2 = _slicedToArray(_bpf, 2), profileForm = _bpf2[0], setProfileForm = _bpf2[1];
  var _blm = useState(false), _blm2 = _slicedToArray(_blm, 2), logModal = _blm2[0], setLogModal = _blm2[1];
  var _blf = useState({type:'feeding',date:today(),time:(function(){var n=new Date();return(n.getHours()<10?'0'+n.getHours():''+n.getHours())+':'+(n.getMinutes()<10?'0'+n.getMinutes():''+n.getMinutes());})(),amount:'',unit:'ml',notes:''}),
      _blf2 = _slicedToArray(_blf, 2), logForm = _blf2[0], setLogForm = _blf2[1];

  // Compute baby age from DOB
  var babyAge = (function(){
    if(!bp.dob) return '';
    var dob = new Date(bp.dob);
    var now2 = new Date();
    var diffMs = now2 - dob;
    var diffDays = Math.floor(diffMs/86400000);
    if(diffDays < 7) return diffDays+' días';
    if(diffDays < 30) return Math.floor(diffDays/7)+' semanas';
    if(diffDays < 365) return Math.floor(diffDays/30)+' meses';
    var yrs = Math.floor(diffDays/365);
    var mos = Math.floor((diffDays%365)/30);
    return yrs+'a '+(mos>0?mos+'m':'');
  })();

  var LOG_TYPES = [
    {id:'feeding',label:'🍼 Alimentación',color:'#6B3FA0'},
    {id:'nap',label:'💤 Siesta',color:'#2196F3'},
    {id:'sleep',label:'🌙 Dormir noche',color:'#1565C0'},
    {id:'diaper',label:'💧 Pañal',color:'#4CAF50'},
    {id:'bath',label:'🛁 Baño',color:'#00BCD4'},
    {id:'medication',label:'💊 Medicamento',color:'#FF9800'},
    {id:'other',label:'📝 Otro',color:'#9E9E9E'}
  ];
  var getTypeLabel = function(id){var t=LOG_TYPES.find(function(x){return x.id===id;});return t?t.label:id;};
  var getTypeColor = function(id){var t=LOG_TYPES.find(function(x){return x.id===id;});return t?t.color:'#6B3FA0';};

  var saveProfile = function(){
    setData(function(d){return _objectSpread(_objectSpread({},d),{},{babyProfile:_objectSpread({},profileForm)});});
    setProfileEdit(false);
  };

  var saveLog = function(){
    if(!logForm.type) return;
    setData(function(d){return _objectSpread(_objectSpread({},d),{},{babyLog:[].concat(_toConsumableArray(d.babyLog||[]),[_objectSpread(_objectSpread({},logForm),{},{id:uid(),createdAt:now()})])});});
    setLogModal(false);
    setLogForm({type:'feeding',date:today(),time:(function(){var n=new Date();return(n.getHours()<10?'0'+n.getHours():''+n.getHours())+':'+(n.getMinutes()<10?'0'+n.getMinutes():''+n.getMinutes());})(),amount:'',unit:'ml',notes:''});
  };

  var delLog = function(id){
    setData(function(d){return _objectSpread(_objectSpread({},d),{},{babyLog:(d.babyLog||[]).filter(function(x){return x.id!==id;}),_deletedIds:_lbpRecordDel(d,id)});});
  };

  var allLogs = _toConsumableArray(data.babyLog||[]).sort(function(a,b){return (b.date+b.time).localeCompare(a.date+a.time);});
  var todayLogs = allLogs.filter(function(l){return l.date===today();});

  // Context function for Baby AI
  var babyCtxFn = function(){
    var lines=[];
    if(bp.name) lines.push('Bebé: '+bp.name+(babyAge?' ('+babyAge+')':''));
    if(bp.dob) lines.push('Fecha nacimiento: '+bp.dob);
    if(allLogs.length>0){
      lines.push('\nRegistros recientes (últimas 48h):');
      var cutoff=new Date(Date.now()-172800000).toISOString().slice(0,10);
      allLogs.filter(function(l){return l.date>=cutoff;}).slice(0,20).forEach(function(l){
        var line=l.date+' '+l.time+' — '+getTypeLabel(l.type);
        if(l.amount) line+=' '+l.amount+(l.unit?' '+l.unit:'');
        if(l.notes) line+=': '+l.notes;
        lines.push(line);
      });
    }
    return lines.join('\n');
  };

  return React.createElement('div', null,
    // Header
    React.createElement('div', {className:'page-header'},
      React.createElement('h1', null, '👶 ', bp.name||'Baby'),
      React.createElement('button', {className:'btn btn-primary btn-sm', onClick:function(){setLogModal(true);}}, '+ Log')
    ),

    // Baby profile bar
    React.createElement('div', {style:{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:'10px 14px',margin:'0 0 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}},
      profileEdit ? React.createElement('div', {style:{display:'flex',gap:8,flex:1,alignItems:'center',flexWrap:'wrap'}},
        React.createElement('input', {value:profileForm.name, onChange:function(e){setProfileForm(_objectSpread(_objectSpread({},profileForm),{},{name:e.target.value}));}, placeholder:'Nombre del bebé', style:{flex:1,minWidth:100}}),
        React.createElement('input', {type:'date', value:profileForm.dob, onChange:function(e){setProfileForm(_objectSpread(_objectSpread({},profileForm),{},{dob:e.target.value}));}, style:{flex:1}}),
        React.createElement('button', {className:'btn btn-primary btn-sm', onClick:saveProfile}, 'Guardar'),
        React.createElement('button', {className:'btn btn-secondary btn-sm', onClick:function(){setProfileEdit(false);}}, 'Cancelar')
      ) : React.createElement(React.Fragment, null,
        React.createElement('div', null,
          React.createElement('span', {style:{fontWeight:700,fontSize:15}}, bp.name||'Mi bebé'),
          babyAge && React.createElement('span', {style:{fontSize:13,color:'var(--text-dim)',marginLeft:8}}, babyAge),
          !bp.name && React.createElement('span', {style:{fontSize:12,color:'var(--text-dim)'}}, 'Configura el perfil...')
        ),
        React.createElement('button', {className:'btn btn-secondary btn-sm', onClick:function(){setProfileForm({name:bp.name||'',dob:bp.dob||''});setProfileEdit(true);}}, '✏️ Editar')
      )
    ),

    // Tabs
    React.createElement('div', {className:'tabs'},
      ['Today','📋 Registro','IA Pediatra'].map(function(t){
        return React.createElement('div',{key:t,className:'tab '+(tab===t?'active':''),onClick:function(){setTab(t);}},t);
      })
    ),

    // Content
    React.createElement('div', {className:'page-content'},

      // TODAY TAB
      tab === 'Today' && React.createElement(React.Fragment, null,
        React.createElement('div', {style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:12}},
          LOG_TYPES.slice(0,6).map(function(lt){
            return React.createElement('button', {key:lt.id,
              style:{background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 4px',fontSize:12,cursor:'pointer',textAlign:'center',color:'var(--text)'},
              onClick:function(){setLogForm(function(f){return _objectSpread(_objectSpread({},f),{},{type:lt.id});});setLogModal(true);}
            }, lt.label);
          })
        ),
        todayLogs.length === 0 ? React.createElement('div', {className:'empty-state'},
          React.createElement('div', {className:'e-icon'}, '👶'),
          React.createElement('h3', null, 'Sin registros hoy'),
          React.createElement('button', {className:'btn btn-primary', onClick:function(){setLogModal(true);}}, '+ Log actividad')
        ) : todayLogs.map(function(l){
          return React.createElement('div', {key:l.id, className:'card mb-8'},
            React.createElement('div', {className:'row'},
              React.createElement('div', null,
                React.createElement(Chip, {label:getTypeLabel(l.type), color:getTypeColor(l.type)}),
                React.createElement('div', {style:{fontSize:13,marginTop:4,color:'var(--text-dim)'}}, l.time, l.amount?' • '+l.amount+(l.unit?' '+l.unit:''):'', l.notes?' • '+l.notes:'')
              ),
              React.createElement('button', {className:'btn btn-danger btn-sm btn-icon', onClick:function(){delLog(l.id);}}, '\xD7')
            )
          );
        })
      ),

      // REGISTRO TAB
      tab === '📋 Registro' && React.createElement(React.Fragment, null,
        allLogs.length === 0 ? React.createElement('div', {className:'empty-state'},
          React.createElement('div', {className:'e-icon'}, '📋'),
          React.createElement('h3', null, 'Sin registros aún')
        ) : (function(){
          var dates = [];
          allLogs.forEach(function(l){if(dates.indexOf(l.date)<0)dates.push(l.date);});
          return React.createElement(React.Fragment, null,
            dates.map(function(d){
              var dayLogs = allLogs.filter(function(l){return l.date===d;});
              var dateLabel = d===today()?'Hoy':d;
              return React.createElement('div', {key:d, style:{marginBottom:12}},
                React.createElement('div', {style:{fontSize:11,fontWeight:700,color:'var(--purple-light)',marginBottom:6,textTransform:'uppercase'}}, dateLabel, ' — ', dayLogs.length, ' entradas'),
                dayLogs.map(function(l){
                  return React.createElement('div', {key:l.id, className:'card mb-6'},
                    React.createElement('div', {className:'row'},
                      React.createElement('div', null,
                        React.createElement('span', {style:{fontWeight:600,fontSize:13}}, getTypeLabel(l.type)),
                        React.createElement('span', {style:{fontSize:12,color:'var(--text-dim)',marginLeft:8}}, l.time),
                        (l.amount||l.notes) && React.createElement('div', {style:{fontSize:12,color:'var(--text-dim)',marginTop:2}}, l.amount?(l.amount+(l.unit?' '+l.unit:'')):'', l.notes?' • '+l.notes:'')
                      ),
                      React.createElement('button', {className:'btn btn-danger btn-sm btn-icon', onClick:function(){delLog(l.id);}}, '\xD7')
                    )
                  );
                })
              );
            })
          );
        })()
      ),

      // IA PEDIATRA TAB
      tab === 'IA Pediatra' && React.createElement(AiExpertChat, {key:'baby-ai',systemPrompt:BABY_AI_SP,title:'pediatría y cuidado del bebé',placeholder:'Pregunta sobre sueño, lactancia, desarrollo, vacunas, medicamentos...',contextFn:babyCtxFn})

    ),

    // Log Modal
    logModal && React.createElement(Modal, {
      title: '+ Log Actividad',
      onClose: function(){setLogModal(false);},
      footer: React.createElement(React.Fragment, null,
        React.createElement('button', {className:'btn btn-secondary', onClick:function(){setLogModal(false);}}, 'Cancel'),
        React.createElement('button', {className:'btn btn-primary', onClick:saveLog}, 'Save')
      )
    },
      React.createElement('div', {className:'form-group'},
        React.createElement('label', null, 'Tipo'),
        React.createElement('select', {value:logForm.type, onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{type:e.target.value}));}},
          LOG_TYPES.map(function(lt){return React.createElement('option', {key:lt.id, value:lt.id}, lt.label);})
        )
      ),
      React.createElement('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}},
        React.createElement('div', {className:'form-group'},
          React.createElement('label', null, 'Fecha'),
          React.createElement('input', {type:'date', value:logForm.date, onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{date:e.target.value}));}})
        ),
        React.createElement('div', {className:'form-group'},
          React.createElement('label', null, 'Hora'),
          React.createElement('input', {type:'time', value:logForm.time, onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{time:e.target.value}));}})
        )
      ),
      (logForm.type==='feeding'||logForm.type==='nap'||logForm.type==='sleep'||logForm.type==='medication') && React.createElement('div', {style:{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10}},
        React.createElement('div', {className:'form-group'},
          React.createElement('label', null, logForm.type==='feeding'?'Cantidad':logForm.type==='nap'||logForm.type==='sleep'?'Duración (min)':'Dosis'),
          React.createElement('input', {type:'number', value:logForm.amount, onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{amount:e.target.value}));}, placeholder:'0'})
        ),
        React.createElement('div', {className:'form-group'},
          React.createElement('label', null, 'Unidad'),
          logForm.type==='feeding' ? React.createElement('select', {value:logForm.unit, onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{unit:e.target.value}));}},
            React.createElement('option', {value:'ml'}, 'ml'),
            React.createElement('option', {value:'oz'}, 'oz'),
            React.createElement('option', {value:'min'}, 'min seno')
          ) : React.createElement('input', {value:logForm.unit||'min', onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{unit:e.target.value}));}, placeholder:'unidad'})
        )
      ),
      React.createElement('div', {className:'form-group'},
        React.createElement('label', null, 'Notas'),
        React.createElement('input', {value:logForm.notes, onChange:function(e){setLogForm(_objectSpread(_objectSpread({},logForm),{},{notes:e.target.value}));}, placeholder:logForm.type==='feeding'?'Leche materna / fórmula...':logForm.type==='diaper'?'Húmedo / sucio...':logForm.type==='medication'?'Nombre del medicamento...':'Notas...'})
      )
    )
  );
};
'''

idx_skin = html.find(SKIN_START)
idx_hub = html.find(HUB_MARKER, idx_skin)
if idx_skin < 0 or idx_hub < 0:
    errors.append('❌ PATCH [baby-screen] SkinTrackerScreen boundaries not found')
else:
    html = html[:idx_skin] + BABY_SCREEN + html[idx_hub:]
    print('✅ [baby-screen] BabyScreen')

# ═══════════════════════════════════════════════════════════════
# PATCH 11: Version bump → v4.75
# ═══════════════════════════════════════════════════════════════
patch('version',
    "window.LBP_VERSION = '4.74';",
    "window.LBP_VERSION = '4.75';"
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
    # node --check
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    biggest = max(scripts, key=len)
    open('/tmp/check475.js','w').write(biggest)
    r = subprocess.run(['node','--check','/tmp/check475.js'], capture_output=True, text=True)
    if r.returncode == 0:
        print('✅ node --check PASSED')
    else:
        print('❌ node --check FAILED:')
        print(r.stderr[:800])
