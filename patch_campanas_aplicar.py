#!/usr/bin/env python3
"""Inserta window._campAplicar antes de window._hechoInventario (v5.36)."""
import re
import subprocess

F = 'LifeBusinessPlanner2026.html'
html = open(F, encoding='utf-8').read()
original = len(html)

ANCLA = 'window._hechoInventario = function(d){'
assert html.count(ANCLA) == 1, 'ancla no unica: %d' % html.count(ANCLA)
assert '_campAplicar' not in html, 'ya esta aplicado'

NUEVO = r"""// Escribe las acciones de campana que vinieron del correo sobre una copia de
// los datos. Pura: recibe data, devuelve {campaigns, res}. No muta data ni
// toca estado de React, asi se puede probar en Node antes de desplegar
// (tests/camp_aplicar.test.mjs).
window._campAplicar = function(data, acciones){
  var ts = Date.now();
  var camps = ((data && data.campaigns) || []).map(function(c){
    return Object.assign({}, c, {franchises:(c.franchises||[]).slice()});
  });
  var res = {nuevas:0, sumadas:0, ampliadas:0, omitidas:0, detalle:[], fallos:[]};
  var buscar = function(id){
    for (var i=0;i<camps.length;i++) if (camps[i].id===id) return i;
    return -1;
  };
  var norm = function(s){ return String(s||'').trim().toLowerCase(); };
  (acciones||[]).forEach(function(a, k){
    if (!a || typeof a !== 'object' || !a.incluir) return;
    if (a.tipo==='nueva') {
      var c = a.campana || {};
      // Guardar dos veces la misma tanda (reabrir la tarjeta, doble click)
      // duplicaria la campana. Mismo nombre y misma fecha de inicio = la misma.
      var dup = camps.filter(function(x){
        return norm(x.name)===norm(c.name) && (x.dateStart||'')===(c.dateStart||'');
      })[0];
      if (dup) { res.omitidas++; res.fallos.push('ya existia: '+(c.name||'?')); return; }
      camps = [Object.assign({}, c, {
        id:'camp_'+ts+'_'+k,
        franchises:(c.franchises||[]).map(function(f,j){
          return Object.assign({}, f, {id:'fran_'+ts+'_'+k+'_'+j});
        }),
        origen:'correo', createdAt:ts, updatedAt:ts
      })].concat(camps);
      res.nuevas++; res.detalle.push('🆕 '+(c.name||'(sin nombre)'));
      return;
    }
    if (a.tipo!=='suma' && a.tipo!=='amplia') { res.fallos.push('accion desconocida'); return; }
    var i = buscar(a.campanaId);
    if (i < 0) { res.fallos.push('la campana ya no existe: '+(a.nombreCampana||a.campanaId||'?')); return; }
    if (a.tipo==='amplia') {
      camps[i] = Object.assign({}, camps[i], {dateEnd:a.dateEnd, updatedAt:ts});
      res.ampliadas++;
      res.detalle.push('📅 '+camps[i].name+' → '+a.dateEnd);
      return;
    }
    var ya = {};
    (camps[i].franchises||[]).forEach(function(f){ if (f) ya[f.clientId]=1; });
    var suma = (a.franchises||[]).filter(function(f){ return f && !ya[f.clientId]; })
      .map(function(f,j){ return Object.assign({}, f, {id:'fran_'+ts+'_'+k+'_'+j}); });
    if (!suma.length) {
      res.omitidas++;
      res.fallos.push('sin tiendas nuevas que sumar a '+camps[i].name);
      return;
    }
    camps[i] = Object.assign({}, camps[i], {
      franchises:(camps[i].franchises||[]).concat(suma), updatedAt:ts});
    res.sumadas += suma.length;
    res.detalle.push('➕ '+suma.length+' tienda'+(suma.length>1?'s':'')+' a '+camps[i].name);
  });
  return {campaigns: camps, res: res};
};

"""

html = html.replace(ANCLA, NUEVO + ANCLA, 1)
html = re.sub(r"window\.LBP_VERSION = '[^']+'", "window.LBP_VERSION = '5.36'", html, count=1)

open(F, 'w', encoding='utf-8').write(html)
print('guardado: %d -> %d bytes' % (original, len(html)))

scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
open('/tmp/check_camp.js', 'w').write(max(scripts, key=len))
r = subprocess.run(['node', '--check', '/tmp/check_camp.js'], capture_output=True, text=True)
print('node --check PASSED' if r.returncode == 0 else 'node --check FAILED:\n' + r.stderr[:800])
