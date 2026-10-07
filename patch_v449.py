#!/usr/bin/env python3
import sys

def rep(content, old, new, label):
    count = content.count(old)
    if count != 1:
        print(f'ERROR [{label}]: expected 1, found {count}')
        sys.exit(1)
    return content.replace(old, new, 1)

# ─── HTML ───────────────────────────────────────────────────────────────────
with open('/Users/josechain/lbplanner/LifeBusinessPlanner2026.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Version bump
html = rep(html, "window.LBP_VERSION = '4.48';", "window.LBP_VERSION = '4.49';", 'version')

# 2. Helper functions after defaultAlarm
OLD_DEFAULT_ALARM = """var defaultAlarm = function defaultAlarm() {
  return {
    enabled: false,
    datetime: '',
    recurrence: 'once',
    customInterval: 1,
    customUnit: 'days',
    label: '',
    repeatCount: 0,
    repeatInterval: 5,
    sound: 'bell',
    vibration: 'long'
  };
};"""

NEW_HELPERS = OLD_DEFAULT_ALARM + """
var tomorrowStr = function tomorrowStr() {
  var d = new Date(); d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
};
var tomorrowAlarmStr = function tomorrowAlarmStr() {
  var d = new Date(); d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T10:00';
};
var defaultTaskAlarm = function defaultTaskAlarm() {
  return {
    enabled: true,
    datetime: tomorrowAlarmStr(),
    recurrence: 'once',
    customInterval: 1,
    customUnit: 'days',
    label: '',
    repeatCount: 1,
    repeatInterval: 5,
    sound: 'bell',
    vibration: 'long'
  };
};
var _defaultTaskForm = function _defaultTaskForm() {
  return {title:'',description:'',status:'INBOX',priority:'MEDIUM',dueDate:tomorrowStr(),estimatedHours:'',projectId:'',clientId:'',attachments:[],category:'',tags:[],alarm:defaultTaskAlarm()};
};"""

html = rep(html, OLD_DEFAULT_ALARM, NEW_HELPERS, 'helpers')

# 3. Task form initial useState
OLD_USESTATE39 = """  var _useState39 = useState({
      title: '',
      description: '',
      status: 'INBOX',
      priority: 'MEDIUM',
      dueDate: '',
      estimatedHours: '',
      projectId: '',
      attachments: [],
      category: '',
      tags: [],
      alarm: defaultAlarm()
    }),"""
html = rep(html, OLD_USESTATE39, "  var _useState39 = useState(_defaultTaskForm()),", 'task-useState')

# 4. Task save reset
OLD_SAVE_RESET = """    setForm({
      title: '',
      description: '',
      status: 'INBOX',
      priority: 'MEDIUM',
      dueDate: '',
      estimatedHours: '',
      projectId: '',
      attachments: [],
      category: '',
      tags: [],
      alarm: defaultAlarm()
    });
    setModal(false);
    setEditItem(null);
  };
  var changeStatus = function changeStatus"""
html = rep(html, OLD_SAVE_RESET,
    "    setForm(_defaultTaskForm());\n    setModal(false);\n    setEditItem(null);\n  };\n  var changeStatus = function changeStatus",
    'task-save-reset')

# 5. Header New Task button + add AI Prioritize button
OLD_HEADER_BTN = """      onClick: function onClick() { setEditItem(null); setForm({title:'',description:'',status:'INBOX',priority:'MEDIUM',dueDate:'',estimatedHours:'',projectId:'',attachments:[],category:'',tags:[],alarm:defaultAlarm()}); setModal(true); }
    }, "+ Add Task")
  )), /*#__PURE__*/React.createElement("div", {
    className: "tabs"
"""
NEW_HEADER_BTN = """      onClick: function onClick() { setEditItem(null); setForm(_defaultTaskForm()); setModal(true); }
    }, "+ Add Task")
  )), /*#__PURE__*/React.createElement("div", {
    className: "tabs"
"""
html = rep(html, OLD_HEADER_BTN, NEW_HEADER_BTN, 'header-new-btn')

# 6. Empty-state New Task button
OLD_EMPTY_BTN = """    onClick: function onClick() { setEditItem(null); setForm({title:'',description:'',status:'INBOX',priority:'MEDIUM',dueDate:'',estimatedHours:'',projectId:'',attachments:[],category:'',tags:[],alarm:defaultAlarm()}); setModal(true); }
  }, "+ Add Task")) : displayed.map"""
html = rep(html, OLD_EMPTY_BTN,
    "    onClick: function onClick() { setEditItem(null); setForm(_defaultTaskForm()); setModal(true); }\n  }, \"+ Add Task\")) : displayed.map",
    'empty-state-btn')

# 7. Add AI state vars after _tSwipe (after the initial useState was already changed)
OLD_SWIPE = "  var _tSwipe = useRef({x:null,y:null,did:false});\n  var _useState39 = useState(_defaultTaskForm()),"
NEW_SWIPE = """  var _tSwipe = useRef({x:null,y:null,did:false});
  var _useTAI1=useState(false),_useTAI2=_slicedToArray(_useTAI1,2),tAiLoading=_useTAI2[0],setTAiLoading=_useTAI2[1];
  var _useTAI3=useState(null),_useTAI4=_slicedToArray(_useTAI3,2),tAiMsg=_useTAI4[0],setTAiMsg=_useTAI4[1];
  var _useTAI5=useState(false),_useTAI6=_slicedToArray(_useTAI5,2),tAiPrioritizing=_useTAI6[0],setTAiPrioritizing=_useTAI6[1];
  var _useTAI7=useState(null),_useTAI8=_slicedToArray(_useTAI7,2),tAiPriorityResult=_useTAI8[0],setTAiPriorityResult=_useTAI8[1];
  var _useState39 = useState(_defaultTaskForm()),"""
html = rep(html, OLD_SWIPE, NEW_SWIPE, 'ai-states')

# 8. Add AI Prioritize button in header (between Compact and + Add Task)
OLD_COMPACT_BTN = """    /*#__PURE__*/React.createElement("button", {className:"btn btn-secondary btn-sm", onClick:function(){setCompact(function(c){return !c;});}, title:compact?"Expanded view":"Compact view"}, compact ? "☐ Expand" : "☰ Compact"),
    /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary btn-sm",
      onClick: function onClick() { setEditItem(null); setForm(_defaultTaskForm()); setModal(true); }
    }, "+ Add Task")"""
NEW_COMPACT_BTN = """    /*#__PURE__*/React.createElement("button", {className:"btn btn-secondary btn-sm", onClick:function(){setCompact(function(c){return !c;});}, title:compact?"Expanded view":"Compact view"}, compact ? "☐ Expand" : "☰ Compact"),
    /*#__PURE__*/React.createElement("button", {className:"btn btn-secondary btn-sm", disabled:tAiPrioritizing||allTasks.filter(function(t){return t.status!=='DONE';}).length===0,
      onClick:function(){
        var active=allTasks.filter(function(t){return t.status!=='DONE';}).slice(0,15);
        if(!active.length||!window.LBP_WORKER_URL){return;}
        setTAiPrioritizing(true);setTAiPriorityResult(null);
        var list=active.map(function(t,i){return (i+1)+'. '+t.title+(t.dueDate?' (due '+t.dueDate+')':'')+(t.priority?' ['+t.priority+']':'');}).join('\\n');
        fetch(window.LBP_WORKER_URL+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({messages:[{role:'user',content:'Tasks:\\n'+list}],
            systemPrompt:'You are a productivity coach. Analyze these tasks and identify the 3 most important to focus on today. Reply with plain text only: list them as "1. Task name — reason (one short sentence)" then add a blank line and a single \\u{1F4A1} tip line.'})
        }).then(function(r){return r.json();}).then(function(res){
          setTAiPrioritizing(false);
          if(res.content) setTAiPriorityResult(res.content);
          else if(res.error) setTAiPriorityResult('Error: '+res.error);
        }).catch(function(){setTAiPrioritizing(false);setTAiPriorityResult('Network error');});
      }
    }, tAiPrioritizing ? '⏳ Thinking...' : '🧠 Prioritize'),
    /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary btn-sm",
      onClick: function onClick() { setEditItem(null); setForm(_defaultTaskForm()); setModal(true); }
    }, "+ Add Task")"""
html = rep(html, OLD_COMPACT_BTN, NEW_COMPACT_BTN, 'ai-prioritize-btn')

# 9. Add AI Priority result panel before tManageCats
OLD_MANAGE_CATS = "    tManageCats && /*#__PURE__*/React.createElement(\"div\", {style:{background:'var(--card)',borderRadius:10,padding:'10px 12px',marginBottom:10,border:'1px solid var(--border)'}},"
NEW_MANAGE_CATS = """    tAiPriorityResult && /*#__PURE__*/React.createElement('div',{style:{background:'rgba(107,63,160,0.08)',border:'1px solid var(--purple-light)',borderRadius:10,padding:'10px 12px',marginBottom:10}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}},
        React.createElement('span',{style:{fontSize:12,fontWeight:700,color:'var(--purple-light)'}},'\\uD83E\\uDDE0 AI Priority Suggestion'),
        React.createElement('button',{onClick:function(){setTAiPriorityResult(null);},style:{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:16,lineHeight:1,padding:'0 2px'}},'\\xd7')
      ),
      React.createElement('div',{style:{fontSize:12,color:'var(--text)',whiteSpace:'pre-wrap',lineHeight:1.6}},tAiPriorityResult)
    ),
    tManageCats && /*#__PURE__*/React.createElement("div", {style:{background:'var(--card)',borderRadius:10,padding:'10px 12px',marginBottom:10,border:'1px solid var(--border)'}},"""
html = rep(html, OLD_MANAGE_CATS, NEW_MANAGE_CATS, 'ai-priority-panel')

# 10. Add AI auto-tag button + clientId select in task form
# The anchor: right before CategoryTagInput in the tasks modal (unique via "label: form.title || 'Task'" + JournalLinksSection)
OLD_CAT_INPUT = """/*#__PURE__*/React.createElement(CategoryTagInput,{category:form.category||'',tags:Array.isArray(form.tags)?form.tags:[],allCategories:(data.categories||['Personal','Work','Home','Health','Finance','Learning','Creative']),onChange:function(c,t){setForm(function(f){return Object.assign({},f,{category:c,tags:t});});},onAddCategory:function(v){setData(function(d){return Object.assign({},d,{categories:(d.categories||[]).concat([v])});});}}), /*#__PURE__*/React.createElement(AlarmPanel, {
    alarm: form.alarm,
    onChange: function onChange(a) {
      return setForm(_objectSpread(_objectSpread({}, form), {}, {
        alarm: a
      }));
    },
    label: form.title || 'Task'
  }), editItem && editItem.id && /*#__PURE__*/React.createElement(JournalLinksSection, {data:data,setData:setData,itemType:'task',itemId:editItem.id})),"""
NEW_CAT_INPUT = """tAiMsg && /*#__PURE__*/React.createElement('div',{style:{background:'rgba(107,63,160,0.08)',border:'1px solid var(--purple-light)',borderRadius:8,padding:'7px 10px',marginBottom:6,fontSize:11,color:'var(--text)'}},tAiMsg),
/*#__PURE__*/React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',marginBottom:4}},
  /*#__PURE__*/React.createElement('button',{
    className:'btn btn-secondary btn-sm',style:{fontSize:10},
    disabled:tAiLoading||!form.title,
    onClick:function(){
      if(!window.LBP_WORKER_URL||!form.title){return;}
      setTAiLoading(true);setTAiMsg(null);
      var cats=(data.categories||['Personal','Work','Home','Health','Finance','Learning','Creative']).join(', ');
      fetch(window.LBP_WORKER_URL+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({messages:[{role:'user',content:'Task: '+form.title+(form.description?'\\nDescription: '+form.description:'')}],
          systemPrompt:'You are a task management AI. Given a task, suggest the best category and 1-3 tags. Available categories: '+cats+'. Reply ONLY with JSON: {"category":"Work","tags":["tag1","tag2"]}'})
      }).then(function(r){return r.json();}).then(function(res){
        setTAiLoading(false);
        if(res.error){setTAiMsg('\\u26A0\\uFE0F '+res.error);return;}
        try{
          var txt=res.content||'';
          var m=txt.match(/\\{[^}]+\\}/);
          if(m){var obj=JSON.parse(m[0]);if(obj.category||obj.tags){setForm(function(f){return Object.assign({},f,{category:obj.category||f.category,tags:Array.isArray(obj.tags)?obj.tags:f.tags});});setTAiMsg('\\u2728 Applied: '+(obj.category||'')+(obj.tags?' + '+obj.tags.join(', '):''));}}
          else{setTAiMsg('Could not parse AI response');}
        }catch(e){setTAiMsg('Parse error');}
      }).catch(function(){setTAiLoading(false);setTAiMsg('Network error');});
    }
  }, tAiLoading ? '\\u2728 Thinking...' : '\\u2728 AI Auto-tag')
),
/*#__PURE__*/React.createElement(CategoryTagInput,{category:form.category||'',tags:Array.isArray(form.tags)?form.tags:[],allCategories:(data.categories||['Personal','Work','Home','Health','Finance','Learning','Creative']),onChange:function(c,t){setForm(function(f){return Object.assign({},f,{category:c,tags:t});});},onAddCategory:function(v){setData(function(d){return Object.assign({},d,{categories:(d.categories||[]).concat([v])});});}}), /*#__PURE__*/React.createElement(AlarmPanel, {
    alarm: form.alarm,
    onChange: function onChange(a) {
      return setForm(_objectSpread(_objectSpread({}, form), {}, {
        alarm: a
      }));
    },
    label: form.title || 'Task'
  }), editItem && editItem.id && /*#__PURE__*/React.createElement(JournalLinksSection, {data:data,setData:setData,itemType:'task',itemId:editItem.id})),"""
html = rep(html, OLD_CAT_INPUT, NEW_CAT_INPUT, 'ai-autotag-btn')

# 11. Add clientId dropdown in task form
_PROJ_START = '(data.projects||[]).map(function(p){return /*#__PURE__*/React.createElement("option",{key:p.id,value:p.id},p.name);})'
_proj_s = html.find(_PROJ_START)
_proj_e = html.find('/*#__PURE__*/React.createElement(CategoryTagInput', _proj_s)
_OLD_PROJ = html[_proj_s:_proj_e]
_split_at = _PROJ_START + '))'
_CLIENT_DIV = (
    ', /*#__PURE__*/React.createElement("div", {className:"form-group"}'
    + ', /*#__PURE__*/React.createElement("label", null, "\U0001F465 Link to Client (optional)")'
    + ', /*#__PURE__*/React.createElement("select", {value:form.clientId||\'\',onChange:function(e){setForm(_objectSpread(_objectSpread({},form),{},{clientId:e.target.value}));}}'
    + ', /*#__PURE__*/React.createElement("option", {value:\'\'},"\u2014 None \u2014")'
    + ', (data.clients||[]).map(function(c){return /*#__PURE__*/React.createElement("option",{key:c.id,value:c.id},c.name||c.company||c.id);})'
    + '))'
)
_NEW_PROJ = _OLD_PROJ.replace(_split_at + ', ', _split_at + _CLIENT_DIV + ', ', 1)
html = rep(html, _OLD_PROJ, _NEW_PROJ, 'clientId-field')

# 12. Add CalendarScreen + FocusScreen before BrainstormScreen
CALENDAR_SCREEN = """// ─── CalendarScreen ──────────────────────────────────────────
var CalendarScreen = function CalendarScreen(props) {
  var data = props.data, navigate = props.navigate;
  var _c1=useState(function(){var d=new Date();return{year:d.getFullYear(),month:d.getMonth()};}),_c2=_slicedToArray(_c1,2),cal=_c2[0],setCal=_c2[1];
  var _c3=useState(null),_c4=_slicedToArray(_c3,2),selDay=_c4[0],setSelDay=_c4[1];
  var year=cal.year,month=cal.month;
  var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var pad=function(n){return String(n).padStart(2,'0');};
  var dayStr=function(dd){return year+'-'+pad(month+1)+'-'+pad(dd);};
  var todayD=new Date();
  var todayFull=todayD.getFullYear()+'-'+pad(todayD.getMonth()+1)+'-'+pad(todayD.getDate());
  var tasks=data.tasks||[],meetings=data.meetings||[],workouts=data.workouts||[],goals=data.goals||[];
  var getItems=function(dd){var ds=dayStr(dd);return{tasks:tasks.filter(function(x){return x.dueDate===ds&&x.status!=='DONE';}),meetings:meetings.filter(function(x){return x.date===ds;}),workouts:workouts.filter(function(x){return x.date===ds;}),goals:goals.filter(function(x){return x.targetDate===ds;})};};
  var firstDay=new Date(year,month,1).getDay();
  var daysInMonth=new Date(year,month+1,0).getDate();
  var cells=[];
  for(var ci=0;ci<firstDay;ci++)cells.push(null);
  for(var cd=1;cd<=daysInMonth;cd++)cells.push(cd);
  while(cells.length%7!==0)cells.push(null);
  var selItems=selDay?getItems(selDay):null;
  var goPrev=function(){setCal(function(c){return c.month===0?{year:c.year-1,month:11}:{year:c.year,month:c.month-1};});setSelDay(null);};
  var goNext=function(){setCal(function(c){return c.month===11?{year:c.year+1,month:0}:{year:c.year,month:c.month+1};});setSelDay(null);};
  return React.createElement('div',null,
    React.createElement('div',{className:'page-header'},
      React.createElement('h1',null,'📅 Unified Calendar'),
      React.createElement('div',{style:{display:'flex',gap:6,alignItems:'center'}},
        React.createElement('button',{className:'btn btn-secondary btn-sm',onClick:goPrev},'◀'),
        React.createElement('span',{style:{fontWeight:700,fontSize:14,minWidth:130,textAlign:'center'}},MONTHS[month]+' '+year),
        React.createElement('button',{className:'btn btn-secondary btn-sm',onClick:goNext},'▶')
      )
    ),
    React.createElement('div',{style:{display:'flex',gap:12,padding:'4px 0 8px',flexWrap:'wrap',fontSize:11}},
      React.createElement('span',{style:{color:'#2196F3'}},'● Tasks'),
      React.createElement('span',{style:{color:'#4CAF50'}},'● Meetings'),
      React.createElement('span',{style:{color:'#9C27B0'}},'● Goals'),
      React.createElement('span',{style:{color:'#FF9800'}},'● Workouts')
    ),
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:3}},
      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){return React.createElement('div',{key:d,style:{textAlign:'center',fontSize:9,color:'var(--text-dim)',fontWeight:600,padding:'3px 0'}},d);})
    ),
    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}},
      cells.map(function(dayNum,i){
        if(dayNum===null)return React.createElement('div',{key:'e'+i,style:{minHeight:50}});
        var items=getItems(dayNum);
        var ds=dayStr(dayNum);
        var isToday=ds===todayFull;
        var isSel=dayNum===selDay;
        var total=items.tasks.length+items.meetings.length+items.workouts.length+items.goals.length;
        return React.createElement('div',{
          key:dayNum,
          onClick:function(){setSelDay(dayNum===selDay?null:dayNum);},
          style:{minHeight:50,borderRadius:6,padding:'4px 2px',cursor:'pointer',
            background:isSel?'var(--purple)':isToday?'rgba(107,63,160,0.18)':'var(--card)',
            border:isToday?'1.5px solid var(--purple-light)':isSel?'1.5px solid var(--purple)':'1px solid var(--border)'}
        },
          React.createElement('div',{style:{fontSize:11,fontWeight:(isToday||isSel)?700:400,textAlign:'center',marginBottom:2,
            color:isSel?'#fff':isToday?'var(--purple-light)':'var(--text)'}},dayNum),
          total>0&&React.createElement('div',{style:{display:'flex',gap:1,flexWrap:'wrap',justifyContent:'center',padding:'0 1px'}},
            items.tasks.length>0&&React.createElement('span',{style:{width:5,height:5,borderRadius:'50%',background:'#2196F3',display:'inline-block',flexShrink:0}}),
            items.meetings.length>0&&React.createElement('span',{style:{width:5,height:5,borderRadius:'50%',background:'#4CAF50',display:'inline-block',flexShrink:0}}),
            items.goals.length>0&&React.createElement('span',{style:{width:5,height:5,borderRadius:'50%',background:'#9C27B0',display:'inline-block',flexShrink:0}}),
            items.workouts.length>0&&React.createElement('span',{style:{width:5,height:5,borderRadius:'50%',background:'#FF9800',display:'inline-block',flexShrink:0}})
          )
        );
      })
    ),
    selDay&&selItems&&React.createElement('div',{style:{marginTop:10,background:'var(--card)',borderRadius:10,padding:'10px 12px',border:'1px solid var(--border)'}},
      React.createElement('div',{style:{fontWeight:700,fontSize:13,marginBottom:8,color:'var(--purple-light)'}},MONTHS[month]+' '+selDay),
      (selItems.tasks.length+selItems.meetings.length+selItems.workouts.length+selItems.goals.length===0)
        ?React.createElement('div',{style:{color:'var(--text-dim)',fontSize:12,textAlign:'center',padding:'8px 0'}},'Nothing scheduled this day')
        :React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:5}},
          selItems.tasks.map(function(t){return React.createElement('div',{key:t.id,style:{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',background:'rgba(33,150,243,0.1)',borderRadius:6,cursor:'pointer'},onClick:function(){navigate('tasks');}},React.createElement('span',{style:{fontSize:12}},'\\u2705'),React.createElement('div',{style:{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},t.title),React.createElement('span',{style:{fontSize:10,color:'var(--text-dim)'}},t.priority||''));}),
          selItems.meetings.map(function(m){return React.createElement('div',{key:m.id,style:{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',background:'rgba(76,175,80,0.1)',borderRadius:6,cursor:'pointer'},onClick:function(){navigate('meetings');}},React.createElement('span',{style:{fontSize:12}},'📅'),React.createElement('div',{style:{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},m.title),m.startTime&&React.createElement('span',{style:{fontSize:10,color:'var(--text-dim)'}},m.startTime));}),
          selItems.goals.map(function(g){return React.createElement('div',{key:g.id,style:{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',background:'rgba(156,39,176,0.1)',borderRadius:6,cursor:'pointer'},onClick:function(){navigate('goals');}},React.createElement('span',{style:{fontSize:12}},'🎯'),React.createElement('div',{style:{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},g.title));}),
          selItems.workouts.map(function(w,wi){return React.createElement('div',{key:w.id||wi,style:{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',background:'rgba(255,152,0,0.1)',borderRadius:6}},React.createElement('span',{style:{fontSize:12}},'🏋️'),React.createElement('div',{style:{flex:1,fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},w.name||w.title||'Workout'));})
        )
    )
  );
};

// ─── FocusScreen ──────────────────────────────────────────
var FocusScreen = function FocusScreen(props) {
  var data = props.data, setData = props.setData, navigate = props.navigate;
  var _f1=useState(null),_f2=_slicedToArray(_f1,2),focusTask=_f2[0],setFocusTask=_f2[1];
  var _f3=useState(25*60),_f4=_slicedToArray(_f3,2),timerLeft=_f4[0],setTimerLeft=_f4[1];
  var _f5=useState(false),_f6=_slicedToArray(_f5,2),timerOn=_f6[0],setTimerOn=_f6[1];
  var _f7=useState('work'),_f8=_slicedToArray(_f7,2),timerPhase=_f8[0],setTimerPhase=_f8[1];
  var _f9=useState(0),_f10=_slicedToArray(_f9,2),sessions=_f10[0],setSessions=_f10[1];
  var timerRef=useRef(null);
  useEffect(function(){
    if(timerOn){timerRef.current=setInterval(function(){setTimerLeft(function(t){return t>0?t-1:0;});},1000);}
    else{clearInterval(timerRef.current);}
    return function(){clearInterval(timerRef.current);};
  },[timerOn]);
  useEffect(function(){
    if(timerLeft===0&&timerOn){
      setTimerOn(false);
      if(timerPhase==='work'){setSessions(function(s){return s+1;});setTimerPhase('break');setTimerLeft(5*60);}
      else{setTimerPhase('work');setTimerLeft(25*60);}
    }
  },[timerLeft,timerOn,timerPhase]);
  var activeTasks=(data.tasks||[]).filter(function(t){return t.status!=='DONE';});
  var completeFocusTask=function(){
    if(!focusTask)return;
    setData(function(d){return Object.assign({},d,{tasks:d.tasks.map(function(t){return t.id===focusTask.id?Object.assign({},t,{status:'DONE'}):t;})});});
    setFocusTask(null);setTimerOn(false);setTimerLeft(25*60);setTimerPhase('work');
  };
  var mins=Math.floor(timerLeft/60);
  var secs=timerLeft%60;
  var timerStr=String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');
  var workTime=timerPhase==='work'?25*60:5*60;
  var progress=workTime>0?(workTime-timerLeft)/workTime:0;
  var circ=2*3.14159*52;
  var dashoffset=circ*(1-Math.max(0,Math.min(1,progress)));
  if(!focusTask){
    return React.createElement('div',null,
      React.createElement('div',{className:'page-header'},React.createElement('h1',null,'🎯 Focus Mode')),
      React.createElement('div',{style:{textAlign:'center',padding:'16px 0 8px',color:'var(--text-dim)',fontSize:13}},'Select a task to focus on:'),
      activeTasks.length===0
        ?React.createElement('div',{className:'empty-state'},React.createElement('div',{className:'e-icon'},'🎉'),React.createElement('h3',null,'All tasks done!'),React.createElement('button',{className:'btn btn-primary',onClick:function(){navigate('tasks');}},'+ Add Task'))
        :React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:6}},
          activeTasks.slice(0,25).map(function(t){
            var pColors={URGENT:'#F44336',HIGH:'#FF9800',MEDIUM:'#FFC107',LOW:'#03A9F4'};
            return React.createElement('div',{key:t.id,style:{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--card)',borderRadius:8,border:'1px solid var(--border)',cursor:'pointer'},
              onClick:function(){setFocusTask(t);setTimerLeft(25*60);setTimerPhase('work');setTimerOn(false);}},
              React.createElement('div',{style:{width:8,height:8,borderRadius:'50%',background:pColors[t.priority]||'#6B3FA0',flexShrink:0}}),
              React.createElement('div',{style:{flex:1}},
                React.createElement('div',{style:{fontSize:13,fontWeight:600}},t.title),
                t.dueDate&&React.createElement('div',{style:{fontSize:11,color:'var(--text-dim)'}},'📅 Due: '+t.dueDate)
              ),
              React.createElement('span',{style:{fontSize:10,color:'var(--text-dim)'}},t.status)
            );
          })
        )
    );
  }
  return React.createElement('div',null,
    React.createElement('div',{className:'page-header'},
      React.createElement('h1',null,'🎯 Focus Mode'),
      React.createElement('button',{className:'btn btn-secondary btn-sm',onClick:function(){setFocusTask(null);setTimerOn(false);}},'← Back')
    ),
    React.createElement('div',{style:{background:'var(--card)',borderRadius:10,padding:'12px 14px',marginBottom:12,border:'1px solid var(--border)'}},
      React.createElement('div',{style:{fontWeight:700,fontSize:14}},focusTask.title),
      focusTask.description&&React.createElement('div',{style:{fontSize:12,color:'var(--text-dim)',marginTop:4}},focusTask.description),
      React.createElement('div',{style:{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}},
        React.createElement('span',{style:{fontSize:10,color:'var(--text-dim)'}},'\\uD83D\\uDCCC '+focusTask.status),
        focusTask.dueDate&&React.createElement('span',{style:{fontSize:10,color:'var(--text-dim)'}},'\\uD83D\\uDCC5 '+focusTask.dueDate),
        React.createElement('span',{style:{fontSize:10,color:'#4CAF50'}},'🍅 '+sessions+' session'+(sessions!==1?'s':''))
      )
    ),
    React.createElement('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',margin:'16px 0'}},
      React.createElement('div',{style:{position:'relative',width:130,height:130,marginBottom:14}},
        React.createElement('svg',{width:130,height:130,style:{transform:'rotate(-90deg)'}},
          React.createElement('circle',{cx:65,cy:65,r:52,fill:'none',stroke:'var(--border)',strokeWidth:8}),
          React.createElement('circle',{cx:65,cy:65,r:52,fill:'none',stroke:timerPhase==='work'?'var(--purple-light)':'#4CAF50',strokeWidth:8,
            strokeDasharray:circ,strokeDashoffset:dashoffset,strokeLinecap:'round',style:{transition:'stroke-dashoffset 1s linear'}})
        ),
        React.createElement('div',{style:{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}},
          React.createElement('div',{style:{fontSize:26,fontWeight:800,fontVariantNumeric:'tabular-nums',color:timerPhase==='work'?'var(--purple-light)':'#4CAF50'}},timerStr),
          React.createElement('div',{style:{fontSize:9,color:'var(--text-dim)',marginTop:2,letterSpacing:1}},timerPhase==='work'?'FOCUS':'BREAK')
        )
      ),
      React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}},
        React.createElement('button',{className:'btn btn-primary',style:{minWidth:90},onClick:function(){setTimerOn(function(r){return !r;});}},timerOn?'⏸ Pause':'▶ Start'),
        React.createElement('button',{className:'btn btn-secondary',onClick:function(){setTimerOn(false);setTimerLeft(timerPhase==='work'?25*60:5*60);}},'↺ Reset'),
        timerPhase==='work'
          ?React.createElement('button',{className:'btn btn-secondary',onClick:function(){setTimerOn(false);setTimerPhase('break');setTimerLeft(5*60);}},'☕ Break')
          :React.createElement('button',{className:'btn btn-secondary',onClick:function(){setTimerOn(false);setTimerPhase('work');setTimerLeft(25*60);}},'💪 Work')
      )
    ),
    (focusTask.subtasks||[]).length>0&&React.createElement('div',{style:{background:'var(--card)',borderRadius:10,padding:'10px 12px',marginBottom:10,border:'1px solid var(--border)'}},
      React.createElement('div',{style:{fontWeight:700,fontSize:12,marginBottom:6}},'Subtasks'),
      (focusTask.subtasks||[]).map(function(st){
        return React.createElement('div',{key:st.id,style:{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid var(--border)'}},
          React.createElement('input',{type:'checkbox',checked:st.done||false,style:{width:14,height:14,accentColor:'var(--purple)'},
            onChange:function(){
              var upd=(focusTask.subtasks||[]).map(function(x){return x.id===st.id?Object.assign({},x,{done:!x.done}):x;});
              var updTask=Object.assign({},focusTask,{subtasks:upd});
              setFocusTask(updTask);
              setData(function(d){return Object.assign({},d,{tasks:d.tasks.map(function(t){return t.id===focusTask.id?updTask:t;})});});
            }
          }),
          React.createElement('span',{style:{fontSize:12,textDecoration:st.done?'line-through':'none',color:st.done?'var(--text-dim)':'var(--text)'}},st.title)
        );
      })
    ),
    React.createElement('button',{className:'btn btn-primary',style:{width:'100%',marginTop:8,background:'#4CAF50',border:'none'},onClick:completeFocusTask},'✅ Mark as Complete')
  );
};

"""

OLD_BRAINSTORM = "// ─── BrainstormScreen ──────────────────────────────────────────\nvar BrainstormScreen = function(props) {"
html = rep(html, OLD_BRAINSTORM, CALENDAR_SCREEN + OLD_BRAINSTORM, 'calendar-focus-screens')

# 13. Add routes for calendar and focus
OLD_BRAINSTORM_CASE = "      case 'brainstorm':\n        return /*#__PURE__*/React.createElement(BrainstormScreen, props);"
NEW_BRAINSTORM_CASE = """      case 'calendar':
        return /*#__PURE__*/React.createElement(CalendarScreen, props);
      case 'focus':
        return /*#__PURE__*/React.createElement(FocusScreen, props);
      case 'brainstorm':
        return /*#__PURE__*/React.createElement(BrainstormScreen, props);"""
html = rep(html, OLD_BRAINSTORM_CASE, NEW_BRAINSTORM_CASE, 'routes')

# 14. Add nav items for calendar and focus
OLD_PLANNERS_NAV = "items: [['projects', '📁', 'Project Manager'], ['tasks', '✅', 'Tasks & Time Sheet'], ['meetings', '📅', 'Meetings & Events'], ['routines', '🔁', 'Daily Routines'], ['resources', '🔧', 'Resources & Tools']]"
NEW_PLANNERS_NAV = "items: [['projects', '📁', 'Project Manager'], ['tasks', '✅', 'Tasks & Time Sheet'], ['meetings', '📅', 'Meetings & Events'], ['routines', '🔁', 'Daily Routines'], ['resources', '🔧', 'Resources & Tools'], ['calendar', '📅', 'Unified Calendar'], ['focus', '🎯', 'Focus Mode']]"
html = rep(html, OLD_PLANNERS_NAV, NEW_PLANNERS_NAV, 'nav-items')

with open('/Users/josechain/lbplanner/LifeBusinessPlanner2026.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f'HTML done.')

# ─── WORKER.JS ──────────────────────────────────────────────────────────────
with open('/Users/josechain/lbplanner/worker.js', 'r', encoding='utf-8') as f:
    worker = f.read()

# 15. Add sendSmartNotif function before scheduledHandler
OLD_SCHEDULED = "async function scheduledHandler(event, env) {"
SMART_NOTIF_FN = '''async function sendSmartNotif(env, syncKeys, type, todayStr, tomorrowStr) {
  for (const syncKey of syncKeys) {
    try {
      const sentKey = type === 'deadlines'
        ? `smart:${syncKey}:${todayStr}:dl:${tomorrowStr}`
        : `smart:${syncKey}:${todayStr}:${type}`;
      const already = await env.LBP_KV.get(sentKey);
      if (already) continue;

      const raw = await env.LBP_KV.get(`data:${syncKey}`);
      if (!raw) continue;
      const data = JSON.parse(raw);
      const subs = JSON.parse(await env.LBP_KV.get(`subs:${syncKey}`) || '[]');
      if (!subs.length) continue;

      let title = '', body = '';

      if (type === 'briefing') {
        const tasks = (data.tasks || []).filter(t => t.status !== 'DONE');
        const todayTasks = tasks.filter(t => t.dueDate === todayStr);
        const meetings = (data.meetings || []).filter(m => m.date === todayStr);
        const habits = (data.habits || []).filter(h => h.active !== false);
        const overdue = tasks.filter(t => t.dueDate && t.dueDate < todayStr);
        title = '\\uD83C\\uDF05 Good morning!';
        const parts = [];
        if (todayTasks.length) parts.push(todayTasks.length + ' task' + (todayTasks.length > 1 ? 's' : '') + ' due today');
        if (meetings.length) parts.push(meetings.length + ' meeting' + (meetings.length > 1 ? 's' : ''));
        if (habits.length) parts.push(habits.length + ' habit' + (habits.length > 1 ? 's' : '') + ' to track');
        if (overdue.length) parts.push(overdue.length + ' overdue');
        body = parts.length ? parts.join(' · ') : 'Have a productive day! ✨';
      } else if (type === 'habits') {
        const habits = (data.habits || []).filter(h => h.active !== false);
        if (!habits.length) continue;
        const entries = data.habitEntries || [];
        const todayEntries = entries.filter(e => e.date === todayStr);
        const completedIds = new Set(todayEntries.map(e => e.habitId));
        const missing = habits.filter(h => !completedIds.has(h.id));
        if (!missing.length) continue;
        title = '\\uD83D\\uDD04 Habit check-in';
        body = missing.length === 1
          ? `Still pending: "${missing[0].name}"`
          : `${missing.length} habits still pending — don't break the streak!`;
      } else if (type === 'deadlines') {
        const tasks = (data.tasks || []).filter(t => t.status !== 'DONE' && t.dueDate === tomorrowStr);
        if (!tasks.length) continue;
        title = '\\u23F0 Due tomorrow';
        body = tasks.length === 1
          ? `"${tasks[0].title}" is due tomorrow`
          : `${tasks.length} tasks are due tomorrow`;
      } else if (type === 'weekly') {
        const allTasks = data.tasks || [];
        const open = allTasks.filter(t => t.status !== 'DONE').length;
        const recentDone = allTasks.filter(t => t.status === 'DONE' && t.updatedAt && (Date.now() - t.updatedAt) < 7 * 86400000).length;
        title = '\\uD83D\\uDCCA Weekly wrap-up';
        body = `${recentDone} completed this week · ${open} still open — keep it up!`;
      }

      if (!title) continue;

      for (const sub of subs) {
        try {
          await sendPush(sub, { title, body, alarmId: `smart_${type}_${todayStr}`, vibration: 'long' });
        } catch(e) {
          if (e.status === 404 || e.status === 410) {
            const updated = subs.filter(s => s.endpoint !== sub.endpoint);
            await env.LBP_KV.put(`subs:${syncKey}`, JSON.stringify(updated));
          }
        }
      }
      await env.LBP_KV.put(sentKey, '1', { expirationTtl: 90000 }); // 25h TTL
    } catch(e) {
      console.error('Smart notif error:', type, syncKey, e && e.message);
    }
  }
}

'''

worker = rep(worker, OLD_SCHEDULED, SMART_NOTIF_FN + OLD_SCHEDULED, 'smart-notif-fn')

# 16. Add smart notification calls inside scheduledHandler, after the alarm loop
OLD_END_SCHEDULED = """      // Remove fired alarms
      const remaining = alarms.filter(a => !due.find(d => d.alarmId === a.alarmId));
      await env.LBP_KV.put(name, JSON.stringify(remaining));
    }
}"""
NEW_END_SCHEDULED = """      // Remove fired alarms
      const remaining = alarms.filter(a => !due.find(d => d.alarmId === a.alarmId));
      await env.LBP_KV.put(name, JSON.stringify(remaining));
    }

    // === Smart Notifications ===
    // Times are UTC. Mexico City = UTC-6 (CDT) or UTC-5 (CST).
    const nowDate = new Date(now);
    const utcH = nowDate.getUTCHours();
    const utcM = nowDate.getUTCMinutes();
    const utcDow = nowDate.getUTCDay(); // 0=Sun
    const todayUTC = nowDate.toISOString().slice(0, 10);
    const tomorrowUTC = new Date(now + 86400000).toISOString().slice(0, 10);

    // Daily briefing: 14:00 UTC = 8am Mexico CDT
    if (utcH === 14 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'briefing', todayUTC, tomorrowUTC);
    }
    // Habit reminder: 03:00 UTC = 9pm Mexico CDT
    if (utcH === 3 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'habits', todayUTC, tomorrowUTC);
    }
    // Deadline alerts (runs every min, sends once per day per target date)
    await sendSmartNotif(env, syncKeys, 'deadlines', todayUTC, tomorrowUTC);
    // Weekend summary: Saturday 03:00 UTC = Friday 9pm Mexico CDT
    if (utcDow === 6 && utcH === 3 && utcM < 2) {
      await sendSmartNotif(env, syncKeys, 'weekly', todayUTC, tomorrowUTC);
    }
}"""
worker = rep(worker, OLD_END_SCHEDULED, NEW_END_SCHEDULED, 'smart-notif-calls')

with open('/Users/josechain/lbplanner/worker.js', 'w', encoding='utf-8') as f:
    f.write(worker)
print(f'Worker done.')
print('All changes applied successfully!')
