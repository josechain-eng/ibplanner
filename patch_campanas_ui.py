#!/usr/bin/env python3
"""Tarjeta de confirmacion de campanas desde el correo (v5.37)."""
import re
import subprocess

F = 'LifeBusinessPlanner2026.html'
html = open(F, encoding='utf-8').read()
original = len(html)

A1 = 'var CampaignsScreen = function CampaignsScreen(_ref_camp) {'
assert html.count(A1) == 1, 'ancla CampaignsScreen no unica'
assert 'CampanasCorreo' not in html, 'ya esta aplicado'

COMPONENTE = r"""// Tarjeta de confirmacion de las campanas que el puente leyo en el correo.
// NADA se escribe sin un click explicito en Guardar: los correos tienen
// matices finos (el 70% del Outlet Express, que en Chillibeans solo entran
// las gafas, que AX y CK arrancan el lunes y no el viernes) y una campana mal
// cargada se propaga al informe semanal.
var CampanasCorreo = function CampanasCorreo(props) {
  var data = props.data, setData = props.setData, onDone = props.onDone;
  var _a = useState('cargando'), fase = _a[0], setFase = _a[1];
  var _b = useState(null), lote = _b[0], setLote = _b[1];
  var _c = useState(''), err = _c[0], setErr = _c[1];
  var _d = useState(null), hecho = _d[0], setHecho = _d[1];
  var clientes = data.clients || [];
  var nombreTienda = function(id){
    var c = clientes.filter(function(x){return x.id===id;})[0];
    return c ? (c.businessName || c.name || id) : id;
  };
  var traer = function(){
    var key = localStorage.getItem('lbp_sync_key') || '';
    if (!window.LBP_WORKER_URL || !key) { setFase(''); setErr('Configura el Worker URL en Cloud & Sync.'); return; }
    setFase('cargando'); setErr('');
    fetch(window.LBP_WORKER_URL+'/campaign-actions?key='+encodeURIComponent(key))
      .then(function(r){return r.json();})
      .then(function(res){
        setFase('');
        if (!res || res.error) { setErr((res && res.error) || 'No pude leer el correo.'); return; }
        var acc = (res.acciones||[]).map(function(a){ return Object.assign({}, a, {incluir: a.incluir !== false}); });
        if (!acc.length) { setErr(res.note || 'No encontre campanas nuevas en tus correos enviados.'); return; }
        setLote({acciones:acc, correos:res.correos||0, descartes:res.descartes||[], ts:res.ts||null});
      })
      .catch(function(){ setFase(''); setErr('Error de red al leer el correo.'); });
  };
  useEffect(function(){ traer(); }, []);
  var tocar = function(i, mut){
    setLote(function(l){
      return Object.assign({}, l, {acciones: l.acciones.map(function(a,j){ return j===i ? mut(a) : a; })});
    });
  };
  var guardar = function(){
    if (!lote) return;
    // UNA sola llamada. Si se calculara el resultado sobre `data` y se
    // escribiera sobre `prev`, el panel podria informar sobre un calculo y
    // guardarse otro (p.ej. decir "1 nueva" cuando la escritura dijo "ya
    // existia"). Mismo patron que saveCampaign en esta pantalla: se arma desde
    // los datos del render y se escribe por setData.
    var r = window._campAplicar(data, lote.acciones);
    setData(function(prev){ return Object.assign({}, prev, {campaigns: r.campaigns}); });
    setLote(null); setErr(''); setHecho(r.res);
  };
  var CONF = {alta:null, media:{c:'#F59E0B',t:'revisar'}, baja:{c:'#F44336',t:'poco seguro'}};
  var chip = function(txt, color){
    return React.createElement('span',{style:{fontSize:9,padding:'2px 7px',borderRadius:8,background:color+'22',color:color,fontWeight:700,whiteSpace:'nowrap'}},txt);
  };
  if (hecho) {
    var total = hecho.nuevas + hecho.sumadas + hecho.ampliadas;
    return React.createElement('div',null,
      React.createElement('div',{style:{fontSize:15,fontWeight:800,marginBottom:8}},
        total ? '✅ Listo' : 'No se guardo nada'),
      React.createElement('div',{style:{fontSize:12,color:'var(--text-dim)',marginBottom:10}},
        hecho.nuevas+' campana'+(hecho.nuevas===1?'':'s')+' nueva'+(hecho.nuevas===1?'':'s')+
        ' · '+hecho.sumadas+' tienda'+(hecho.sumadas===1?'':'s')+' sumada'+(hecho.sumadas===1?'':'s')+
        ' · '+hecho.ampliadas+' ampliada'+(hecho.ampliadas===1?'':'s')),
      hecho.detalle.map(function(d,i){
        return React.createElement('div',{key:i,style:{fontSize:12,padding:'3px 0'}},d);
      }),
      hecho.fallos.length ? React.createElement('div',{style:{marginTop:10,padding:8,borderRadius:8,background:'#F59E0B18'}},
        React.createElement('div',{style:{fontSize:11,fontWeight:700,marginBottom:4}},'Omitido:'),
        hecho.fallos.map(function(f,i){
          return React.createElement('div',{key:i,style:{fontSize:11,color:'var(--text-dim)'}},'· '+f);
        })) : null,
      React.createElement('button',{className:'btn btn-primary',style:{marginTop:14,width:'100%'},
        onClick:function(){ onDone && onDone(); }},'Cerrar')
    );
  }
  if (fase==='cargando') {
    return React.createElement('div',{style:{padding:'24px 0',textAlign:'center'}},
      React.createElement('div',{style:{fontSize:28,marginBottom:8}},'📧'),
      React.createElement('div',{style:{fontSize:13,color:'var(--text-dim)'}},'Leyendo tus correos enviados…'));
  }
  if (err || !lote) {
    return React.createElement('div',null,
      React.createElement('div',{style:{fontSize:13,marginBottom:12}}, err || 'Sin novedades.'),
      React.createElement('div',{style:{display:'flex',gap:8}},
        React.createElement('button',{className:'btn btn-secondary',style:{flex:1},onClick:traer},'Reintentar'),
        React.createElement('button',{className:'btn btn-primary',style:{flex:1},onClick:function(){ onDone && onDone(); }},'Cerrar')));
  }
  var marcadas = lote.acciones.filter(function(a){return a.incluir;}).length;
  return React.createElement('div',null,
    React.createElement('div',{style:{fontSize:12,color:'var(--text-dim)',marginBottom:10}},
      lote.correos+' correo'+(lote.correos===1?'':'s')+' leido'+(lote.correos===1?'':'s')+
      ' · '+lote.acciones.length+' propuesta'+(lote.acciones.length===1?'':'s')+
      '. Revisa y destilda lo que no corresponda: nada se guarda hasta que le des Guardar.'),
    lote.acciones.map(function(a,i){
      var cf = CONF[a.confianza];
      var cab = a.tipo==='nueva' ? '🆕 Campana nueva'
              : a.tipo==='suma'  ? '➕ Sumar tiendas a '+(a.nombreCampana||'?')
              :                    '📅 Ampliar '+(a.nombreCampana||'?');
      var frs = a.tipo==='nueva' ? ((a.campana&&a.campana.franchises)||[]) : (a.franchises||[]);
      return React.createElement('div',{key:i,style:{border:'1px solid var(--border)',borderRadius:10,padding:10,marginBottom:8,opacity:a.incluir?1:0.45}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:8,marginBottom:6}},
          React.createElement('input',{type:'checkbox',checked:!!a.incluir,
            onChange:function(){ tocar(i,function(x){return Object.assign({},x,{incluir:!x.incluir});}); },
            style:{width:16,height:16,accentColor:'#9C68D6',cursor:'pointer'}}),
          React.createElement('div',{style:{flex:1,fontSize:12,fontWeight:800}},cab),
          cf ? chip(cf.t, cf.c) : null),
        a.posibleContinuacion ? React.createElement('div',{style:{fontSize:10,color:'#F59E0B',marginBottom:5}},
          '\u26A0 Podria ser la continuacion de \u201c'+a.continuacionDe+'\u201d, mas arriba. Si lo es, destildala y sumale las tiendas a mano.') : null,
        a.tipo==='nueva' ? React.createElement('div',null,
          React.createElement('input',{value:(a.campana&&a.campana.name)||'',
            onChange:function(e){ var v=e.target.value; tocar(i,function(x){return Object.assign({},x,{campana:Object.assign({},x.campana,{name:v})});}); },
            style:{width:'100%',fontSize:13,fontWeight:700,padding:'5px 7px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',marginBottom:5}}),
          React.createElement('div',{style:{display:'flex',gap:6,marginBottom:5}},
            React.createElement('input',{type:'date',value:(a.campana&&a.campana.dateStart)||'',
              onChange:function(e){ var v=e.target.value; tocar(i,function(x){return Object.assign({},x,{campana:Object.assign({},x.campana,{dateStart:v})});}); },
              style:{flex:1,fontSize:11,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)'}}),
            React.createElement('input',{type:'date',value:(a.campana&&a.campana.dateEnd)||'',
              onChange:function(e){ var v=e.target.value; tocar(i,function(x){return Object.assign({},x,{campana:Object.assign({},x.campana,{dateEnd:v})});}); },
              style:{flex:1,fontSize:11,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)'}}),
            React.createElement('select',{value:(a.campana&&a.campana.status)||'PLANIFICADA',
              onChange:function(e){ var v=e.target.value; tocar(i,function(x){return Object.assign({},x,{campana:Object.assign({},x.campana,{status:v})});}); },
              style:{fontSize:11,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)'}},
              CAMP_STATUSES.map(function(s){ return React.createElement('option',{key:s,value:s},s); })))
        ) : null,
        a.tipo==='amplia' ? React.createElement('div',{style:{marginBottom:5}},
          React.createElement('span',{style:{fontSize:11,color:'var(--text-dim)',marginRight:6}},'Nueva fecha de fin:'),
          React.createElement('input',{type:'date',value:a.dateEnd||'',
            onChange:function(e){ var v=e.target.value; tocar(i,function(x){return Object.assign({},x,{dateEnd:v});}); },
            style:{fontSize:11,padding:'4px 6px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)'}})
        ) : null,
        frs.map(function(f,fi){
          return React.createElement('div',{key:fi,style:{fontSize:11,padding:'4px 0 4px 8px',borderLeft:'2px solid var(--border)',marginTop:4}},
            React.createElement('div',{style:{fontWeight:700}},nombreTienda(f.clientId)+
              (f.lines&&f.lines.length?' · '+f.lines.join(', '):'')),
            (f.sublines||[]).map(function(s,si){
              return React.createElement('div',{key:si,style:{display:'flex',gap:5,marginTop:3}},
                React.createElement('input',{value:s.name||'',
                  onChange:function(e){ var v=e.target.value;
                    tocar(i,function(x){
                      var cp=JSON.parse(JSON.stringify(x));
                      var lst = cp.tipo==='nueva' ? cp.campana.franchises : cp.franchises;
                      lst[fi].sublines[si].name=v; return cp;
                    }); },
                  style:{flex:1,fontSize:11,padding:'3px 5px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)'}}),
                React.createElement('input',{value:s.discount||'',
                  onChange:function(e){ var v=e.target.value;
                    tocar(i,function(x){
                      var cp=JSON.parse(JSON.stringify(x));
                      var lst = cp.tipo==='nueva' ? cp.campana.franchises : cp.franchises;
                      lst[fi].sublines[si].discount=v; return cp;
                    }); },
                  style:{width:60,fontSize:11,padding:'3px 5px',borderRadius:5,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)'}}));
            }),
            f.notes ? React.createElement('div',{style:{fontSize:10,color:'var(--text-dim)',marginTop:2}},f.notes) : null);
        }),
        // La cita del correo es lo que hace revisable una propuesta dudosa.
        a.cita && a.confianza!=='alta' ? React.createElement('div',{style:{fontSize:10,fontStyle:'italic',color:'var(--text-dim)',marginTop:6,paddingTop:6,borderTop:'1px dashed var(--border)'}},
          '“'+a.cita+'”'+(a.correo?' — '+a.correo:'')) : null);
    }),
    lote.descartes.length ? React.createElement('details',{style:{marginTop:6}},
      React.createElement('summary',{style:{fontSize:11,color:'var(--text-dim)',cursor:'pointer'}},
        'Descartado por la validacion ('+lote.descartes.length+')'),
      lote.descartes.map(function(d,i){
        return React.createElement('div',{key:i,style:{fontSize:10,color:'var(--text-dim)',padding:'2px 0 2px 10px'}},'· '+d);
      })) : null,
    React.createElement('div',{style:{display:'flex',gap:8,marginTop:14,position:'sticky',bottom:0,background:'var(--card)',paddingTop:8}},
      React.createElement('button',{className:'btn btn-secondary',style:{flex:1},onClick:function(){ onDone && onDone(); }},'Cancelar'),
      React.createElement('button',{className:'btn btn-primary',style:{flex:2},disabled:!marcadas,onClick:guardar},
        marcadas ? ('Guardar '+marcadas) : 'Nada marcado'))
  );
};

"""

html = html.replace(A1, COMPONENTE + A1, 1)

# Estado del modal dentro de CampaignsScreen, junto a los otros useState.
A2 = "  var _cFilter=useState(''),_cFilter2=_slicedToArray(_cFilter,2),cFilter=_cFilter2[0],setCFilter=_cFilter2[1];"
assert html.count(A2) == 1, 'ancla cFilter no unica'
html = html.replace(A2, A2 + "\n  var _corrOpen=useState(false),_corrOpen2=_slicedToArray(_corrOpen,2),corrOpen=_corrOpen2[0],setCorrOpen=_corrOpen2[1];", 1)

# Boton en el encabezado, antes de "Export All".
A3 = "        },'\U0001F4CB Export All'),"
assert html.count(A3) == 1, 'ancla Export All no unica'
BOTON = ("        React.createElement('button',{className:'btn btn-secondary btn-sm',style:{fontSize:11},"
         "title:'Traer campanas de los correos enviados',"
         "onClick:function(){setCorrOpen(true);}},'\U0001F4E7 Del correo'),\n")
html = html.replace(A3, A3 + '\n' + BOTON, 1)

# Modal al final del return de CampaignsScreen: se cuelga del mismo lugar que
# los otros modales de la pantalla. Se ancla en el modal de campana existente.
# Verificado el 14-oct en la linea 18288: seis espacios y SIN espacios
# alrededor de "&&". Asi se renderizan los modales de esta pantalla.
A4 = "      cModal&&React.createElement(Modal,{"
assert html.count(A4) == 1, 'ancla cModal no unica: %d' % html.count(A4)
MODAL = ("      corrOpen&&React.createElement(Modal,{title:'\U0001F4E7 Campanas desde el correo',"
         "onClose:function(){setCorrOpen(false);}},"
         "React.createElement(CampanasCorreo,{data:data,setData:setData,"
         "onDone:function(){setCorrOpen(false);}})),\n")
html = html.replace(A4, MODAL + A4, 1)

html = re.sub(r"window\.LBP_VERSION = '[^']+'", "window.LBP_VERSION = '5.37'", html, count=1)

open(F, 'w', encoding='utf-8').write(html)
print('guardado: %d -> %d bytes' % (original, len(html)))

scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
open('/tmp/check_ui.js', 'w').write(max(scripts, key=len))
r = subprocess.run(['node', '--check', '/tmp/check_ui.js'], capture_output=True, text=True)
print('node --check PASSED' if r.returncode == 0 else 'node --check FAILED:\n' + r.stderr[:900])
