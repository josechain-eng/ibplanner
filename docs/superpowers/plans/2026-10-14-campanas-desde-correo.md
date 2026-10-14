# Campañas desde el correo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las campañas de descuento que Pepe ya comunicó por correo a contabilidad aparezcan en el módulo de Campañas de LB Planner, propuestas para revisar y confirmar, sin volver a tipearlas.

**Architecture:** Cuatro piezas con una sola responsabilidad cada una. El puente local (`campanas.py`) lee la carpeta Enviados de Outlook por AppleScript, filtra por asunto, convierte el HTML de Word a texto y publica en el worker del briefing. El worker del briefing lo guarda en KV y lo expone. El worker de LB Planner arma el contexto (9 tiendas + campañas ya cargadas), llama a Claude, y **valida** lo que devuelve antes de que llegue a la pantalla. La app muestra una tarjeta de confirmación y escribe en `data.campaigns` sólo cuando Pepe acepta.

**Tech Stack:** Python 3 (stdlib únicamente — launchd corre `/usr/bin/python3`), AppleScript/osascript, Cloudflare Workers ESM + KV, React 18 vía `React.createElement` en un único HTML, `node --test` para las pruebas de JS, `unittest` para las de Python.

**Spec:** `docs/superpowers/specs/2026-10-14-campanas-desde-correo-design.html`

---

## Global Constraints

- **`worker.js` (los dos) es ASCII puro.** Nada fuera de 0x20–0x7E. Los acentos y emojis van como `\uXXXX`. Motivo documentado: copiar/pegar el worker en el editor de Cloudflare corrompe los literales no-ASCII. Los textos en español dentro de los prompts se escriben **sin acentos** (así está el prompt de `/email-actions` hoy).
- **`node --check` obligatorio** después de cada cambio en `worker.js` y después de cada parche al HTML. Para el HTML: extraer el `<script>` más grande y chequear ese archivo (ver patrón en `patch_v476.py:147-155`).
- **En los scripts Python de parcheo, nunca un `\n` literal dentro de un string** que se inserta en el HTML: va `\\n`. Un `\n` literal rompe el JavaScript resultante.
- **El puente no puede tener dependencias.** `launchd` corre `/usr/bin/python3` (el de Xcode, más viejo que la Terminal). Sólo stdlib, y `from __future__ import annotations` al inicio de cualquier archivo nuevo que use `str | None`.
- **`wrangler.toml` de `life-planner` NO declara `[vars]` a propósito.** Todo lo sensible es secret. Antes de cualquier `wrangler deploy`, verificar que `[triggers] crons = ["* * * * *"]` sigue en el toml: un deploy reemplaza el set de crons por el del archivo.
- **`wrangler.toml` de `briefing-diario-pepe` tiene `crons = []` a propósito.** No ponerle horario.
- **Estados de campaña válidos, exactamente estos cuatro:** `PLANIFICADA`, `ACTIVA`, `FINALIZADA`, `CANCELADA` (`LifeBusinessPlanner2026.html:18091`). El ejemplo del spec decía `"status":"ACTIVE"` — **el spec está equivocado en ese campo**; manda el código.
- **Líneas válidas, exactamente estas seis:** `Hombre`, `Mujer`, `Niña`, `Niño`, `Kids`, `Toda la Tienda` (`LifeBusinessPlanner2026.html:18093`). «MNG HE» no es una línea válida: se mapea a `Hombre`. Cualquier línea que el modelo invente se descarta en silencio (la campaña entra igual, sin esa línea).
- **Nada se escribe sin confirmación de Pepe.** Ningún camino de este código modifica `data.campaigns` sin un click explícito en la tarjeta.
- **Un commit por tarea**, al final de la tarea, con los archivos que esa tarea tocó.

## Review Focus

Cinco cosas que el spec implica pero no dice, y que muerden a quien usa esto. La prueba de cada una está en la tarea dueña del código:

1. **Outlook cerrado o AppleScript que falla** → si el puente marca el período como corrido igual, esos correos se pierden para siempre. El marcador de estado se escribe sólo después de un POST exitoso. *(Tarea 3)*
2. **La IA no devuelve JSON** (o falta `ANTHROPIC_API_KEY`: `callClaude` devuelve `''` ante cualquier fallo) → la tarjeta no puede mostrar una lista vacía como si estuviera todo revisado. Tiene que decir que no pudo leer. *(Tarea 5, Step 6: `la IA sin responder NO se ve como "nada que cargar"`)*
3. **Una campaña nueva y su continuación en la misma tanda** → el `suma` apunta a un `campanaId` que todavía no existe. No se descarta en silencio: pasa como `nueva` con confianza baja para que Pepe decida. *(Tarea 5)*
4. **Pepe guarda la misma tanda dos veces** (vuelve a abrir la tarjeta, o doble click) → campañas duplicadas. `_campAplicar` omite la `nueva` cuyo nombre + `dateStart` ya existen, y lo informa. *(Tarea 6)*
5. **Una campaña sin tiendas, o con fecha de fin anterior al inicio** → el módulo la renderiza rota y el informe la cuenta mal. La validación la descarta (sin tiendas) o le vacía el `dateEnd` (fin < inicio). *(Tarea 5)*

---

### Task 1: El puente convierte el HTML de Word a texto

Es el riesgo que el spec manda probar primero: *«El HTML de Word. La conversión a texto es donde esto se puede ensuciar. Se prueba primero, con los correos reales, antes de construir el resto.»*

**Files:**
- Create: `~/Documents/Projects/Briefing Diario/bridge/campanas.py`
- Create: `~/Documents/Projects/Briefing Diario/bridge/test_campanas.py`
- Create: `~/Documents/Projects/Briefing Diario/bridge/fixtures/` (HTML real capturado de Outlook)

**Interfaces:**
- Consumes: nada.
- Produces: `campanas.html_a_texto(bruto: str) -> str`, `campanas.es_campana(asunto: str) -> bool`, `campanas.MAX_CUERPO: int`.

- [ ] **Step 1: Capturar los correos reales a fixtures**

Outlook tiene que estar abierto. Este script es de sólo lectura y no publica nada.

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && mkdir -p fixtures && osascript -e '
tell application "Microsoft Outlook"
    set fol to mail folder "Sent Items"
    set total to (count of messages of fol)
    set out to ""
    set n to 0
    set idx to 1
    repeat while n < 6 and idx <= total
        set m to message idx of fol
        set idx to idx + 1
        set subj to ""
        try
            set subj to subject of m
        end try
        if subj contains "ampa" then
            set bod to ""
            try
                set bod to content of m
            end try
            set out to out & "===ASUNTO=== " & subj & return & bod & return & "<<<EOR>>>" & return
            set n to n + 1
        end if
    end repeat
    return out
end tell' > fixtures/enviados_campana.txt; wc -c fixtures/enviados_campana.txt; grep -c "===ASUNTO===" fixtures/enviados_campana.txt
```

Si el nombre de la carpeta no es `Sent Items`, listarlas primero: `osascript -e 'tell application "Microsoft Outlook" to get name of every mail folder'`. Si devuelve 0 registros, el recorrido arranca por la punta vieja: cambiar `set idx to 1` por `set idx to total` y `set idx to idx + 1` por `set idx to idx - 1`.

Esperado: al menos 5 registros, y que uno de ellos contenga `<table` (el del 11-may, con la tabla de 12 filas).

- [ ] **Step 2: Escribir la prueba que falla**

`bridge/test_campanas.py`:

```python
#!/usr/bin/env python3
"""Pruebas del lector de campanas. Solo stdlib, sin red, sin Outlook."""
from __future__ import annotations

import unittest

import campanas


TABLA = (
    '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head>'
    '<style>p.MsoNormal{mso-style-parent:"";font-size:11.0pt}</style></head><body>'
    '<p class=MsoNormal><span style=\'font-size:11.0pt\'>Estimados,<o:p></o:p></span></p>'
    '<p class=MsoNormal>Favor subir la siguiente campa&ntilde;a:<o:p></o:p></p>'
    '<table class=MsoTableGrid border=1>'
    '<tr><td><p class=MsoNormal>TIENDA</p></td><td><p class=MsoNormal>CAMPA&Ntilde;A</p></td>'
    '<td><p class=MsoNormal>DESCUENTO</p></td></tr>'
    '<tr><td><p class=MsoNormal>MNG&nbsp;HE</p></td><td><p class=MsoNormal>Dia de la Madre</p></td>'
    '<td><p class=MsoNormal>30%</p></td></tr>'
    '<tr><td><p class=MsoNormal>CK</p></td><td><p class=MsoNormal>Dia de la Madre</p></td>'
    '<td><p class=MsoNormal>50%</p></td></tr>'
    '</table>'
    '<p class=MsoNormal>Saludos<o:p></o:p></p></body></html>'
)


class TestHtmlATexto(unittest.TestCase):

    def test_tabla_queda_en_filas_con_pipe(self):
        txt = campanas.html_a_texto(TABLA)
        self.assertIn("TIENDA | CAMPAÑA | DESCUENTO", txt)
        self.assertIn("MNG HE | Dia de la Madre | 30%", txt)
        self.assertIn("CK | Dia de la Madre | 50%", txt)

    def test_una_fila_por_linea(self):
        lineas = campanas.html_a_texto(TABLA).split("\n")
        filas = [l for l in lineas if "|" in l]
        self.assertEqual(len(filas), 3)

    def test_sin_ruido_de_word(self):
        txt = campanas.html_a_texto(TABLA)
        for ruido in ("mso-", "MsoNormal", "o:p", "<", ">", "&ntilde;", " "):
            self.assertNotIn(ruido, txt)

    def test_entidades_resueltas(self):
        self.assertIn("campaña", campanas.html_a_texto(TABLA))

    def test_texto_plano_pasa_igual(self):
        self.assertEqual(campanas.html_a_texto("Hola\nmundo"), "Hola\nmundo")

    def test_vacio_no_revienta(self):
        self.assertEqual(campanas.html_a_texto(""), "")
        self.assertEqual(campanas.html_a_texto(None), "")


class TestFiltroAsunto(unittest.TestCase):

    def test_pasan_los_reales(self):
        for a in ("Campaña Matrimonios y Graduados",
                  "Campaña Dia de la Madre",
                  'Ampliacion Campaña "Suit Up Day"',
                  "RE: Campañas de Descuento Realizadas 2024",
                  "campana de invierno",
                  "CAMPAÑA BLACK FRIDAY"):
            self.assertTrue(campanas.es_campana(a), a)

    def test_no_pasan_otros(self):
        for a in ("Informe de ventas semanal", "Pago a proveedores", "", None):
            self.assertFalse(campanas.es_campana(a), a)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Correr la prueba y verificar que falla**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 test_campanas.py -v
```
Esperado: FAIL con `ModuleNotFoundError: No module named 'campanas'`.

- [ ] **Step 4: Escribir el conversor**

`bridge/campanas.py`:

```python
#!/usr/bin/env python3
"""
Campanas de descuento desde la carpeta Enviados de Outlook.

Pepe manda cada campana a contabilidad por correo. Este modulo lee esos
correos, los convierte a texto legible y los publica en el worker del
briefing, para que LB Planner los pueda proponer en el modulo de Campanas.

Por que la conversion HTML->texto pasa ACA y no en el worker: "content of
message" de Outlook devuelve el HTML completo que genero Word, con decenas
de KB de estilos mso-*. Mandarlo crudo por la red es tirar ancho de banda y
tokens. Las tablas se convierten a filas separadas por "|" porque el correo
del 11-may trae la informacion en una tabla de 12 filas y hay que que el
modelo la lea como tabla.

Solo stdlib: launchd corre /usr/bin/python3, no el de la Terminal.
"""
from __future__ import annotations

import html as _html
import re
import unicodedata

# Tope de cuerpo por correo. Lo que pasa de aca es firma, cadena de respuestas
# y disclaimer legal: no aporta y gasta tokens.
MAX_CUERPO = 6000

_RE_BLOQUE = re.compile(r"<(style|script|head)\b.*?</\1>", re.S | re.I)
_RE_COMENTARIO = re.compile(r"<!--.*?-->", re.S)
_RE_OP = re.compile(r"</?o:p\b[^>]*>", re.I)
_RE_TABLA = re.compile(r"<table\b.*?</table>", re.S | re.I)
_RE_TR = re.compile(r"<tr\b.*?</tr>", re.S | re.I)
_RE_TD = re.compile(r"<(td|th)\b[^>]*>(.*?)</\1\s*>", re.S | re.I)
_RE_SALTO = re.compile(r"<\s*br\s*/?\s*>|</\s*(p|div|li|tr|table|h[1-6])\s*>", re.I)
_RE_TAG = re.compile(r"<[^>]+>")
_RE_BLANCOS = re.compile(r"\s+")
_RE_ESPACIOS = re.compile(r"[ \t]+")


def _quitar_tags(s: str) -> str:
    """Tags fuera, salto de linea donde cerraba un bloque. NO resuelve
    entidades: eso va una sola vez al final, para no desescapar dos veces."""
    return _RE_TAG.sub("", _RE_SALTO.sub("\n", s))


def _tabla_a_filas(m) -> str:
    """Una fila de tabla por linea, celdas separadas por ' | '.

    Las tablas se procesan ANTES que el resto y por separado porque Word mete
    un <p class=MsoNormal> dentro de CADA celda. Si dejamos que ese </p> se
    convierta en salto de linea, cada celda termina en su propia linea y la
    fila se desarma: la tabla del correo del 11-may queda ilegible. Ese fue el
    primer intento y falla."""
    filas = []
    for tr in _RE_TR.findall(m.group(0)):
        celdas = [_RE_BLANCOS.sub(" ", _quitar_tags(c)).strip()
                  for _, c in _RE_TD.findall(tr)]
        if any(celdas):
            filas.append(" | ".join(celdas))
    return "\n" + "\n".join(filas) + "\n"


def html_a_texto(bruto: str) -> str:
    """HTML de Word -> texto. Las filas de tabla quedan separadas por ' | '."""
    if not bruto:
        return ""
    s = _RE_BLOQUE.sub(" ", bruto)
    s = _RE_COMENTARIO.sub(" ", s)
    s = _RE_OP.sub("", s)
    s = _RE_TABLA.sub(_tabla_a_filas, s)
    s = _quitar_tags(s)
    s = _html.unescape(s)
    s = s.replace(" ", " ")
    salida = []
    for linea in s.split("\n"):
        linea = _RE_ESPACIOS.sub(" ", linea).strip()
        if linea:
            salida.append(linea)
    return "\n".join(salida)


def _sin_acentos(s: str) -> str:
    return (unicodedata.normalize("NFKD", s or "")
            .encode("ascii", "ignore").decode("ascii").lower())


def es_campana(asunto: str) -> bool:
    """Filtro por asunto. De ~300 enviados revisados el 14-oct, todos los de
    campana traen 'Campana' en el asunto; filtrar por destinatario era
    innecesario (y ademas AppleScript no puede leer los destinatarios).
    Lo que no es una campana de verdad ('RE: Campanas de Descuento
    Realizadas 2024' es un pedido de reporte) lo descarta el modelo, no esto:
    aca preferimos pasar de mas."""
    return "campan" in _sin_acentos(asunto)
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 test_campanas.py -v
```
Esperado: 8 tests, OK.

- [ ] **Step 6: Correrlo contra el HTML real capturado**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 -I -c "
import campanas
bruto = open('fixtures/enviados_campana.txt', encoding='utf-8', errors='replace').read()
for i, reg in enumerate(bruto.split('<<<EOR>>>')):
    if '===ASUNTO===' not in reg: continue
    cab, _, cuerpo = reg.partition(chr(10))
    asunto = cab.replace('===ASUNTO===','').strip()
    txt = campanas.html_a_texto(cuerpo)
    print('---', i, '|', asunto, '| filtro:', campanas.es_campana(asunto),
          '|', len(cuerpo), 'bytes HTML ->', len(txt), 'texto')
    print(txt[:700])
    print()
"
```
Esperado: los 5 correos pasan el filtro; ninguna salida contiene `mso-` ni `<`; el del 11-may muestra las filas de la tabla con `|`; la relación de bytes baja fuerte (el HTML de Word suele ser 20–60× el texto).

**Si alguna salida sale sucia, se arregla acá y se le agrega el caso a `test_campanas.py` antes de seguir.** Esto es el riesgo nº1 del spec; el resto del plan asume que esta conversión es legible.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Projects/Briefing\ Diario && git add bridge/campanas.py bridge/test_campanas.py bridge/fixtures/ 2>/dev/null; git add -A bridge/ && git commit -m "Campanas: conversor de HTML de Word a texto + filtro de asunto

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Si `~/Documents/Projects/Briefing Diario` no es un repo git, saltar el commit y anotarlo; el resto del plan no depende de eso.

---

### Task 2: El puente recorre la carpeta Enviados

**Files:**
- Modify: `~/Documents/Projects/Briefing Diario/bridge/campanas.py` (agregar al final)
- Modify: `~/Documents/Projects/Briefing Diario/bridge/test_campanas.py` (agregar clase)

**Interfaces:**
- Consumes: `campanas.html_a_texto`, `campanas.es_campana`, `campanas.MAX_CUERPO` (Tarea 1); de `ventura_bridge.py`: `osa(script, timeout) -> (ok, salida)`, `esc(s) -> str`, `FIELD_SEP = "|~|"`, `RECORD_SEP = "<<<EOR>>>"`, `find_sent_folder() -> str | None`.
- Produces: `campanas.SCRIPT_TMPL: str`, `campanas.parse(raw: str) -> list[dict]`, `campanas.leer(folder: str, dias: int, osa_fn, esc_fn) -> list[dict]`. Cada dict: `{"id": str, "subject": str, "date": "YYYY-MM-DD", "texto": str}`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar al final de `bridge/test_campanas.py`, antes del `if __name__`:

```python
SEP_C = "|~|"
SEP_R = "<<<EOR>>>"

CRUDO = (
    "101" + SEP_C + "Campaña Matrimonios y Graduados" + SEP_C + "2026" + SEP_C + "10" + SEP_C + "3"
    + SEP_C + "<p>Desde hoy y hasta fin de mes<o:p></o:p></p>" + SEP_R
    + "102" + SEP_C + "Informe de ventas" + SEP_C + "2026" + SEP_C + "10" + SEP_C + "2"
    + SEP_C + "<p>adjunto</p>" + SEP_R
    + "103" + SEP_C + "Ampliacion Campaña Suit Up Day" + SEP_C + "2025" + SEP_C + "11" + SEP_C + "7"
    + SEP_C + "<p>ampliar hasta el 16 de Noviembre</p>" + SEP_R
)


class TestParse(unittest.TestCase):

    def test_solo_los_de_campana(self):
        regs = campanas.parse(CRUDO)
        self.assertEqual([r["id"] for r in regs], ["101", "103"])

    def test_fecha_iso_con_cero_adelante(self):
        regs = campanas.parse(CRUDO)
        self.assertEqual(regs[0]["date"], "2026-10-03")
        self.assertEqual(regs[1]["date"], "2025-11-07")

    def test_cuerpo_convertido(self):
        regs = campanas.parse(CRUDO)
        self.assertEqual(regs[0]["texto"], "Desde hoy y hasta fin de mes")
        self.assertNotIn("o:p", regs[0]["texto"])

    def test_cuerpo_con_el_separador_adentro_no_corta_los_campos(self):
        raw = ("201" + SEP_C + "Campaña X" + SEP_C + "2026" + SEP_C + "9" + SEP_C + "1"
               + SEP_C + "<p>a" + SEP_C + "b</p>" + SEP_R)
        regs = campanas.parse(raw)
        self.assertEqual(len(regs), 1)
        self.assertEqual(regs[0]["date"], "2026-09-01")

    def test_cuerpo_recortado_al_tope(self):
        largo = "<p>" + ("x" * (campanas.MAX_CUERPO + 500)) + "</p>"
        raw = "301" + SEP_C + "Campaña Y" + SEP_C + "2026" + SEP_C + "8" + SEP_C + "9" + SEP_C + largo + SEP_R
        self.assertEqual(len(campanas.parse(raw)[0]["texto"]), campanas.MAX_CUERPO)

    def test_fecha_invalida_se_descarta(self):
        raw = "401" + SEP_C + "Campaña Z" + SEP_C + "0" + SEP_C + "0" + SEP_C + "0" + SEP_C + "<p>q</p>" + SEP_R
        self.assertEqual(campanas.parse(raw), [])

    def test_crudo_vacio(self):
        self.assertEqual(campanas.parse(""), [])
        self.assertEqual(campanas.parse(None), [])

    def test_mas_nuevo_primero(self):
        regs = campanas.parse(CRUDO)
        self.assertGreater(regs[0]["date"], regs[1]["date"])


class TestLeer(unittest.TestCase):

    def test_osascript_que_falla_devuelve_lista_vacia(self):
        regs = campanas.leer("Sent", 90,
                             osa_fn=lambda s, timeout=0: (False, "error -1728"),
                             esc_fn=lambda s: s)
        self.assertEqual(regs, [])

    def test_pasa_dias_y_carpeta_al_script(self):
        visto = {}

        def falso_osa(script, timeout=0):
            visto["script"] = script
            return True, CRUDO

        regs = campanas.leer("Elementos enviados", 45, osa_fn=falso_osa, esc_fn=lambda s: s)
        self.assertIn("Elementos enviados", visto["script"])
        self.assertIn("45 * days", visto["script"])
        self.assertEqual(len(regs), 2)
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 test_campanas.py -v 2>&1 | tail -20
```
Esperado: FAIL con `AttributeError: module 'campanas' has no attribute 'parse'`.

- [ ] **Step 3: Escribir el recorrido y el parseo**

Agregar al final de `bridge/campanas.py`:

```python
# ── Recorrido de la carpeta Enviados ─────────────────────────────────────────
#
# Mismo patron que la bandeja en ventura_bridge.py: arrancamos del mensaje mas
# nuevo y caminamos hacia atras, cortando en cuanto cruzamos el limite de dias.
# "messages of fol whose time sent > cutoff" obliga a Outlook a evaluar la
# carpeta historica completa y nunca termina.
#
# El filtro de AppleScript es 'contains "ampa"' a proposito: el "contains" de
# AppleScript ignora mayusculas pero NO los acentos, asi que buscar "Campaña"
# se perderia "Campana" y viceversa. "ampa" matchea los dos y de paso
# "campanas", "CAMPAÑA" y "Ampliacion Campaña". Que entre algun "Pampa" o
# "estampa" no molesta: es_campana() vuelve a filtrar en Python, con acentos
# normalizados.
MAX_CORREOS = 60
MAX_SCAN = 2000
FIELD_SEP = "|~|"
RECORD_SEP = "<<<EOR>>>"

SCRIPT_TMPL = """tell application "Microsoft Outlook"
    set fol to mail folder "{folder}"
    set total to (count of messages of fol)
    if total = 0 then return ""
    set cutoff to (current date) - ({dias} * days)
    set stepDir to -1
    set idx to total
    if total > 1 then
        set d1 to missing value
        set dN to missing value
        try
            set d1 to time sent of message 1 of fol
            set dN to time sent of message total of fol
        end try
        if d1 is missing value then
            try
                set d1 to time received of message 1 of fol
                set dN to time received of message total of fol
            end try
        end if
        if d1 is not missing value and dN is not missing value then
            if d1 > dN then
                set stepDir to 1
                set idx to 1
            end if
        end if
    end if
    set out to ""
    set n to 0
    set scanned to 0
    repeat while n < {maxc} and scanned < {maxs} and idx >= 1 and idx <= total
        set scanned to scanned + 1
        set m to message idx of fol
        set idx to idx + stepDir
        set dt to missing value
        try
            set dt to time sent of m
        end try
        if dt is missing value then
            try
                set dt to time received of m
            end try
        end if
        set yy to 0
        set mm to 0
        set dd to 0
        set tooOld to false
        if dt is not missing value then
            if dt < cutoff then set tooOld to true
            set yy to year of dt
            set mm to (month of dt) as integer
            set dd to day of dt
        end if
        if tooOld then exit repeat
        set subj to ""
        try
            set subj to subject of m
        end try
        if subj contains "ampa" then
            set mid to ""
            set bod to ""
            try
                set mid to (id of m) as string
            end try
            try
                set bod to content of m
            end try
            set out to out & mid & "{fs}" & subj & "{fs}" & yy & "{fs}" & mm & "{fs}" & dd & "{fs}" & bod & "{rs}"
            set n to n + 1
        end if
    end repeat
    return out
end tell
"""


def parse(raw: str) -> list:
    """Crudo de AppleScript -> registros listos para publicar, mas nuevo primero."""
    salida = []
    for registro in (raw or "").split(RECORD_SEP):
        if not registro.strip():
            continue
        # maxsplit=5: el cuerpo es el ultimo campo y puede contener el separador.
        partes = registro.split(FIELD_SEP, 5)
        if len(partes) < 6:
            continue
        mid, asunto, yy, mm, dd, cuerpo = partes
        asunto = (asunto or "").strip()
        if not es_campana(asunto):
            continue
        try:
            fecha = "%04d-%02d-%02d" % (int(yy), int(mm), int(dd))
        except (TypeError, ValueError):
            continue
        if not (1 <= int(mm) <= 12 and 1 <= int(dd) <= 31 and int(yy) >= 2000):
            continue
        texto = html_a_texto(cuerpo)[:MAX_CUERPO]
        if not texto:
            continue
        salida.append({
            "id": (mid or "").strip(),
            "subject": asunto,
            "date": fecha,
            "texto": texto,
        })
    salida.sort(key=lambda r: r["date"], reverse=True)
    return salida


def leer(folder: str, dias: int, osa_fn, esc_fn) -> list:
    """Lee la carpeta por AppleScript. Si osascript falla devuelve [] y lo
    informa: nunca una lista a medias que parezca completa."""
    script = SCRIPT_TMPL.format(
        folder=esc_fn(folder), dias=int(dias),
        maxc=MAX_CORREOS, maxs=MAX_SCAN,
        fs=FIELD_SEP, rs=RECORD_SEP,
    )
    ok, out = osa_fn(script, timeout=240)
    if not ok:
        primera = (out or "?").splitlines()[0] if out else "?"
        print("[campanas] aviso: no pude leer '%s' - %s" % (folder, primera))
        return []
    return parse(out)
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 test_campanas.py -v 2>&1 | tail -8
```
Esperado: 19 tests, OK.

- [ ] **Step 5: Correrlo contra Outlook de verdad**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 -I -c "
import campanas, ventura_bridge as vb
fol = vb.find_sent_folder()
print('carpeta:', fol)
regs = campanas.leer(fol, 90, vb.osa, vb.esc)
print(len(regs), 'correos de campana en 90 dias')
for r in regs:
    print(' ', r['date'], '|', len(r['texto']), 'chars |', r['subject'][:70])
"
```
Esperado: al menos los 5 conocidos, fechas plausibles, ninguno con `texto` vacío. Si tarda más de 4 minutos, bajar `MAX_SCAN`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/Briefing\ Diario && git add -A bridge/ && git commit -m "Campanas: recorrido de Enviados por AppleScript + parseo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: El puente publica, lleva estado y corre el 5 y el 25

**Files:**
- Modify: `~/Documents/Projects/Briefing Diario/bridge/campanas.py` (agregar al final)
- Modify: `~/Documents/Projects/Briefing Diario/bridge/ventura_bridge.py` (hook en `main()` + flag CLI)
- Modify: `~/Documents/Projects/Briefing Diario/bridge/test_campanas.py` (agregar clase)

**Interfaces:**
- Consumes: `campanas.leer`, `campanas.MAX_CORREOS` (Tarea 2); de `ventura_bridge.py`: `STATE_FILE`, `load_state()`, `save_state(state)`, `USER_AGENT`, `keychain(service, account)`.
- Produces: `campanas.periodo(hoy: date) -> str`, `campanas.toca_correr(estado: dict, hoy: date) -> bool`, `campanas.dias_a_mirar(estado: dict, hoy: date) -> int`, `campanas.publicar(correos: list, secret: str, url_fn) -> bool`, `campanas.correr(estado, hoy, folder, osa_fn, esc_fn, secret, url_fn) -> dict`. La clave de estado es `campanas_periodo` (período ya corrido) y `campanas_ultimo` (fecha del correo más nuevo ya publicado).

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `bridge/test_campanas.py` (y `import datetime` arriba):

```python
import datetime


class TestPeriodo(unittest.TestCase):

    def test_del_5_al_24_es_el_05(self):
        for d in (5, 12, 24):
            self.assertEqual(campanas.periodo(datetime.date(2026, 10, d)), "2026-10-05")

    def test_del_25_en_adelante_es_el_25(self):
        for d in (25, 28, 31):
            self.assertEqual(campanas.periodo(datetime.date(2026, 10, d)), "2026-10-25")

    def test_del_1_al_4_sigue_siendo_el_25_del_mes_pasado(self):
        for d in (1, 4):
            self.assertEqual(campanas.periodo(datetime.date(2026, 10, d)), "2026-09-25")

    def test_enero_cae_a_diciembre_anterior(self):
        self.assertEqual(campanas.periodo(datetime.date(2026, 1, 2)), "2025-12-25")


class TestToca(unittest.TestCase):

    def test_sin_estado_corre(self):
        self.assertTrue(campanas.toca_correr({}, datetime.date(2026, 10, 14)))

    def test_mismo_periodo_ya_corrido_no_corre(self):
        est = {"campanas_periodo": "2026-10-05"}
        self.assertFalse(campanas.toca_correr(est, datetime.date(2026, 10, 14)))

    def test_periodo_nuevo_corre(self):
        est = {"campanas_periodo": "2026-10-05"}
        self.assertTrue(campanas.toca_correr(est, datetime.date(2026, 10, 25)))


class TestDias(unittest.TestCase):

    def test_primera_corrida_mira_90(self):
        self.assertEqual(campanas.dias_a_mirar({}, datetime.date(2026, 10, 14)), 90)

    def test_despues_mira_desde_el_ultimo_con_holgura(self):
        est = {"campanas_ultimo": "2026-10-01"}
        # 13 dias + 3 de holgura, piso 10
        self.assertEqual(campanas.dias_a_mirar(est, datetime.date(2026, 10, 14)), 16)

    def test_piso_de_10_dias(self):
        est = {"campanas_ultimo": "2026-10-14"}
        self.assertEqual(campanas.dias_a_mirar(est, datetime.date(2026, 10, 14)), 10)

    def test_techo_de_90_dias(self):
        est = {"campanas_ultimo": "2020-01-01"}
        self.assertEqual(campanas.dias_a_mirar(est, datetime.date(2026, 10, 14)), 90)

    def test_ultimo_corrupto_cae_a_90(self):
        self.assertEqual(campanas.dias_a_mirar({"campanas_ultimo": "ayer"}, datetime.date(2026, 10, 14)), 90)


class TestCorrer(unittest.TestCase):

    HOY = datetime.date(2026, 10, 14)

    def _correr(self, estado, osa_fn, publicar_ok=True, publicados=None):
        def url_fn(payload, secret):
            if publicados is not None:
                publicados.append(payload)
            return publicar_ok
        return campanas.correr(estado, self.HOY, "Sent", osa_fn, lambda s: s, "sec", url_fn)

    def test_applescript_caido_no_marca_el_periodo(self):
        """El caso que mas caro sale: si marcamos el periodo igual, esos
        correos no se vuelven a mirar nunca."""
        est = {}
        r = self._correr(est, lambda s, timeout=0: (False, "error -1728"))
        self.assertEqual(r["correos"], 0)
        self.assertFalse(r["ok"])
        self.assertNotIn("campanas_periodo", est)
        self.assertNotIn("campanas_ultimo", est)

    def test_publicacion_fallida_no_marca_el_periodo(self):
        est = {}
        r = self._correr(est, lambda s, timeout=0: (True, CRUDO), publicar_ok=False)
        self.assertFalse(r["ok"])
        self.assertNotIn("campanas_periodo", est)

    def test_exito_marca_periodo_y_ultimo(self):
        est, pubs = {}, []
        r = self._correr(est, lambda s, timeout=0: (True, CRUDO), publicados=pubs)
        self.assertTrue(r["ok"])
        self.assertEqual(r["correos"], 2)
        self.assertEqual(est["campanas_periodo"], "2026-10-05")
        self.assertEqual(est["campanas_ultimo"], "2026-10-03")
        self.assertEqual(len(pubs[0]["correos"]), 2)

    def test_cero_correos_marca_el_periodo_igual(self):
        """No hubo campanas este mes. Es exito, no fallo: no hay que
        reintentar cada 5 minutos hasta fin de mes."""
        est = {}
        r = self._correr(est, lambda s, timeout=0: (True, ""))
        self.assertTrue(r["ok"])
        self.assertEqual(r["correos"], 0)
        self.assertEqual(est["campanas_periodo"], "2026-10-05")
        self.assertNotIn("campanas_ultimo", est)
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 test_campanas.py -v 2>&1 | tail -20
```
Esperado: FAIL con `AttributeError: module 'campanas' has no attribute 'periodo'`.

- [ ] **Step 3: Escribir el estado y la publicación**

Agregar al final de `bridge/campanas.py`:

```python
# ── Cuando corre y que ya se proceso ─────────────────────────────────────────
#
# El 5 y el 25, o la primera vez que Outlook este abierto despues de esa fecha.
# No puede ser un cron fijo: esto depende de Outlook abierto, que se cierra
# solo tras una hora y pide huella. Misma limitacion que el briefing diario
# (ver el comentario de crons en wrangler.toml).
import datetime as _dt
import json as _json
import urllib.error as _uerror
import urllib.request as _urequest

WORKER_URL = "https://briefing-diario-pepe.josechain.workers.dev/ingest-campanas"
DIAS_PRIMERA = 90
DIAS_PISO = 10
DIAS_HOLGURA = 3


def periodo(hoy: _dt.date) -> str:
    """Etiqueta del periodo vigente: 'YYYY-MM-05' o 'YYYY-MM-25'."""
    if hoy.day >= 25:
        return "%04d-%02d-25" % (hoy.year, hoy.month)
    if hoy.day >= 5:
        return "%04d-%02d-05" % (hoy.year, hoy.month)
    anterior = hoy.replace(day=1) - _dt.timedelta(days=1)
    return "%04d-%02d-25" % (anterior.year, anterior.month)


def toca_correr(estado: dict, hoy: _dt.date) -> bool:
    return (estado or {}).get("campanas_periodo") != periodo(hoy)


def dias_a_mirar(estado: dict, hoy: _dt.date) -> int:
    """Desde el correo mas nuevo ya publicado, con holgura. La primera vez,
    90 dias (lo que pide el spec)."""
    ultimo = (estado or {}).get("campanas_ultimo")
    if not ultimo:
        return DIAS_PRIMERA
    try:
        desde = _dt.date.fromisoformat(str(ultimo))
    except ValueError:
        return DIAS_PRIMERA
    dias = (hoy - desde).days + DIAS_HOLGURA
    return max(DIAS_PISO, min(DIAS_PRIMERA, dias))


def publicar(payload: dict, secret: str) -> bool:
    """POST al worker del briefing. Devuelve si quedo guardado."""
    datos = _json.dumps(payload).encode()
    req = _urequest.Request(
        WORKER_URL, data=datos,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + secret,
            # Cloudflare devuelve 403 (error 1010) al User-Agent de urllib.
            "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/124.0 Safari/537.36 briefing-bridge"),
        })
    try:
        with _urequest.urlopen(req, timeout=60) as r:
            print("[campanas] worker:", r.read().decode()[:160])
            return True
    except _uerror.HTTPError as e:
        print("[campanas] error HTTP %s: %s" % (e.code, (e.read() or b"")[:160]))
        return False
    except Exception as e:
        print("[campanas] no pude publicar:", e)
        return False


def correr(estado: dict, hoy: _dt.date, folder: str,
           osa_fn, esc_fn, secret: str, url_fn=None) -> dict:
    """Lee, publica y recien ahi marca el periodo como hecho.

    El orden importa. Si marcaramos el periodo antes de publicar, un Outlook
    cerrado o un worker caido harian que esos correos no se vuelvan a mirar
    hasta el proximo 5 o 25 - y los del medio se pierden para siempre."""
    enviar = url_fn or publicar
    correos = leer(folder, dias_a_mirar(estado, hoy), osa_fn, esc_fn)
    if not correos:
        # leer() devuelve [] tanto si osascript fallo como si no habia nada, y
        # los dos casos tienen que terminar distinto: "no hubo campanas" es
        # exito (se marca el periodo), "Outlook no responde" es fallo (no se
        # marca, o esos correos se pierden hasta el proximo 5 o 25). Un ping
        # trivial los separa.
        vivo, _ = osa_fn('tell application "Microsoft Outlook" to return "1"', timeout=30)
        if not vivo:
            return {"ok": False, "correos": 0, "motivo": "outlook no responde"}
    if correos:
        ok = enviar({"correos": correos[:MAX_CORREOS]}, secret)
        if not ok:
            return {"ok": False, "correos": 0, "motivo": "publicacion fallida"}
        estado["campanas_ultimo"] = correos[0]["date"]
    else:
        # Outlook contesto y no habia campanas: resultado valido, no fallo. Si
        # lo tratamos como error, --auto reintentaria cada 5 minutos hasta fin
        # de mes.
        print("[campanas] 0 correos de campana en la ventana")
    estado["campanas_periodo"] = periodo(hoy)
    return {"ok": True, "correos": len(correos)}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 test_campanas.py -v 2>&1 | tail -8
```
Esperado: 33 tests, OK.

- [ ] **Step 5: Engancharlo al puente**

En `bridge/ventura_bridge.py`, agregar el flag al parser de `main()` (junto a los que ya existen):

```python
    ap.add_argument("--campanas", action="store_true",
                    help="Lee las campanas de Enviados y las publica (ignora el calendario)")
```

Y dentro de `main()`, después de que el script ya resolvió `folder` (la carpeta de enviados) y tiene el `secret` del Keychain, agregar:

```python
    # ── Campanas de descuento (5 y 25 de cada mes) ──
    # Va en un try propio: que falle esto no puede tumbar el brief diario,
    # que es lo importante.
    try:
        import campanas as _camp
        _hoy = datetime.now().date()
        if folder and (args.campanas or _camp.toca_correr(state, _hoy)):
            print("[puente] campanas: periodo", _camp.periodo(_hoy),
                  "| ventana", _camp.dias_a_mirar(state, _hoy), "dias")
            _r = _camp.correr(state, _hoy, folder, osa, esc, secret)
            print("[puente] campanas:", _r)
            save_state(state)
        else:
            print("[puente] campanas: nada que hacer este periodo")
    except Exception as _e:
        print("[puente] campanas: fallo sin consecuencias para el brief:", _e)
```

**Antes de escribir esto, leer `main()` completa** (`sed -n '657,736p' bridge/ventura_bridge.py`) y confirmar los nombres reales de las variables locales: `folder`, `secret`, `state`, `args`, y si `state` se carga con `load_state()` en `main()` o sólo en `--auto`. Si `state` no está disponible ahí, usar `state = load_state()` al inicio del bloque y `save_state(state)` al final.

- [ ] **Step 6: Probar la corrida real, publicando de verdad**

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 ventura_bridge.py --campanas 2>&1 | tail -25
```
Esperado: `[campanas] worker: OK - N correos de campana recibidos` con N ≥ 5, y `{'ok': True, 'correos': N}`.

Verificar que el estado quedó escrito:
```bash
python3 -c "import json,pathlib;print(json.dumps({k:v for k,v in json.loads(pathlib.Path.home().joinpath('.briefing_bridge_state.json').read_text()).items() if 'campanas' in k}, indent=2))"
```
Esperado: `campanas_periodo` y `campanas_ultimo` presentes.

Y que el brief diario sigue sano:
```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 ventura_bridge.py --dry-run 2>&1 | tail -15
```
Esperado: la misma salida de siempre, sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/Projects/Briefing\ Diario && git add -A bridge/ && git commit -m "Campanas: publicacion, estado del periodo y hook en el puente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: El worker del briefing recibe y expone los correos

**Files:**
- Modify: `~/Documents/Projects/Briefing Diario/worker.js` (insertar después del bloque `/ventura-emails`, que termina en la línea ~183)

**Interfaces:**
- Consumes: `campanas.publicar` manda `{correos:[{id,subject,date,texto}]}` con `Authorization: Bearer <INGEST_SECRET>` (Tarea 3).
- Produces: `POST /ingest-campanas` y `GET /campanas-correo?key=<INGEST_SECRET>` → `{"ts":"ISO"|null,"correos":[...]}`. KV key `ingest_campanas` en `BRIEFING_KV`.

- [ ] **Step 1: Escribir la prueba que falla**

`~/Documents/Projects/Briefing Diario/test_worker_campanas.mjs`:

```javascript
// Prueba los dos endpoints nuevos contra el worker.js real, con un KV falso.
// No necesita wrangler ni red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, 'worker.js'), 'utf8');

function kvFalso() {
  const m = new Map();
  return { m, get: async k => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } };
}

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const post = (body, auth) => new Request('https://x/ingest-campanas', {
  method: 'POST',
  headers: auth ? { Authorization: auth } : {},
  body: JSON.stringify(body),
});

test('ingest-campanas sin secreto correcto da 401', async () => {
  const w = await cargar();
  const env = { BRIEFING_KV: kvFalso(), INGEST_SECRET: 'bueno' };
  assert.equal((await w.fetch(post({ correos: [] }, 'Bearer malo'), env)).status, 401);
  assert.equal((await w.fetch(post({ correos: [] }, null), env)).status, 401);
});

test('ingest-campanas sin la lista da 400', async () => {
  const w = await cargar();
  const env = { BRIEFING_KV: kvFalso(), INGEST_SECRET: 'bueno' };
  assert.equal((await w.fetch(post({ nada: 1 }, 'Bearer bueno'), env)).status, 400);
});

test('ingest-campanas guarda y topea en 60', async () => {
  const w = await cargar();
  const kv = kvFalso();
  const env = { BRIEFING_KV: kv, INGEST_SECRET: 'bueno' };
  const correos = Array.from({ length: 70 }, (_, i) => ({ id: 'i' + i, subject: 'Campana', date: '2026-10-01', texto: 't' }));
  const r = await w.fetch(post({ correos }, 'Bearer bueno'), env);
  assert.equal(r.status, 200);
  const guardado = JSON.parse(kv.m.get('ingest_campanas'));
  assert.equal(guardado.correos.length, 60);
  assert.ok(guardado.ts);
});

test('campanas-correo devuelve lo guardado, con CORS', async () => {
  const w = await cargar();
  const kv = kvFalso();
  const env = { BRIEFING_KV: kv, INGEST_SECRET: 'bueno' };
  await w.fetch(post({ correos: [{ id: '1', subject: 'Campana X', date: '2026-10-03', texto: 'hola' }] }, 'Bearer bueno'), env);
  const r = await w.fetch(new Request('https://x/campanas-correo?key=bueno'), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await r.json()).correos[0].subject, 'Campana X');
});

test('campanas-correo con clave mala da 401 y vacio da forma valida', async () => {
  const w = await cargar();
  const env = { BRIEFING_KV: kvFalso(), INGEST_SECRET: 'bueno' };
  assert.equal((await w.fetch(new Request('https://x/campanas-correo?key=malo'), env)).status, 401);
  const r = await w.fetch(new Request('https://x/campanas-correo?key=bueno'), env);
  assert.deepEqual(await r.json(), { ts: null, correos: [] });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd ~/Documents/Projects/Briefing\ Diario && node --test test_worker_campanas.mjs 2>&1 | tail -20
```
Esperado: los tests de 200 fallan (el worker cae a la respuesta de ruta desconocida, que no es 200 con ese cuerpo) — leer la salida real y confirmar que es por los endpoints faltantes, no por un error del harness.

- [ ] **Step 3: Agregar los endpoints**

Insertar en `~/Documents/Projects/Briefing Diario/worker.js` inmediatamente después del cierre del bloque `/ventura-emails` (la línea `}` que sigue a su `return new Response(...)`, ~línea 183) y antes de `if (url.pathname === '/run')`:

```javascript
    // Ingesta de las campanas de descuento leidas en la carpeta Enviados.
    // Mismo secreto y mismo patron que /ingest-ventura. Lo escribe
    // bridge/campanas.py el 5 y el 25 de cada mes.
    if (url.pathname === '/ingest-campanas' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.INGEST_SECRET || auth !== `Bearer ${env.INGEST_SECRET}`) {
        return new Response('No autorizado', { status: 401 });
      }
      try {
        const body = await request.json();
        if (!Array.isArray(body.correos)) {
          return new Response('Se esperaba {correos:[...]}', { status: 400 });
        }
        const correos = body.correos.slice(0, 60);
        await env.BRIEFING_KV.put('ingest_campanas', JSON.stringify({
          ts: new Date().toISOString(),
          correos
        }));
        return new Response(`OK - ${correos.length} correos de campana recibidos`, { status: 200 });
      } catch (err) {
        return new Response(`Error: ${err.message}`, { status: 400 });
      }
    }
    // Lectura de las campanas ya ingeridas. La consume LB Planner por service
    // binding para proponerlas en el modulo de Campanas.
    if (url.pathname === '/campanas-correo' && request.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      if (!env.INGEST_SECRET || key !== env.INGEST_SECRET) {
        return new Response('No autorizado', { status: 401 });
      }
      const raw = await env.BRIEFING_KV.get('ingest_campanas');
      return new Response(raw || '{"ts":null,"correos":[]}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
```

- [ ] **Step 4: Correr las pruebas y el chequeo de sintaxis**

```bash
cd ~/Documents/Projects/Briefing\ Diario && node --check worker.js && node --test test_worker_campanas.mjs 2>&1 | tail -10
```
Esperado: `node --check` sin salida (OK) y 5 tests pasando.

- [ ] **Step 5: Desplegar y verificar en vivo**

```bash
cd ~/Documents/Projects/Briefing\ Diario && grep -A2 "\[triggers\]" wrangler.toml && npx wrangler deploy
```
`crons` tiene que seguir siendo `[]`. Después:

```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 ventura_bridge.py --campanas 2>&1 | grep campanas
```
Esperado: `[campanas] worker: OK - N correos de campana recibidos`.

Y la lectura, con el secreto del Keychain:
```bash
K=$(security find-generic-password -s briefing-ingest-secret -a briefing -w) && curl -s -A "Mozilla/5.0 briefing-bridge" "https://briefing-diario-pepe.josechain.workers.dev/campanas-correo?key=$K" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ts'], len(d['correos']), 'correos'); [print(' ', c['date'], c['subject'][:60]) for c in d['correos']]"
```
Esperado: la misma lista que vio el puente.

Y que el brief diario sigue vivo:
```bash
curl -s "https://briefing-diario-pepe.josechain.workers.dev/view" -o /dev/null -w "%{http_code}\n"
```
Esperado: `200`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/Briefing\ Diario && git add worker.js test_worker_campanas.mjs && git commit -m "Worker briefing: /ingest-campanas y /campanas-correo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: El worker de LB Planner extrae las acciones y las valida

Es la pieza con más reglas y la única que puede inventar cosas. La validación es el muro: nada que no pase por `_campValidar` llega a la pantalla.

**Files:**
- Modify: `/Users/josechain/lbplanner/worker.js` (insertar el endpoint después del bloque `/email-actions`; `_campValidar` y `CAMP_SP` a nivel de módulo, junto a `callClaude` ~línea 813)
- Create: `/Users/josechain/lbplanner/tests/campanas_valida.test.mjs`
- Create: `/Users/josechain/lbplanner/tests/campaign_actions.test.mjs`

**Interfaces:**
- Consumes: `GET /campanas-correo?key=` del worker del briefing vía `env.BRIEFING_SERVICE` (Tarea 4); `env.BRIEFING_KEY`, `env.ANTHROPIC_API_KEY`; `callClaude(env, messages, system, maxTokens)`; `json(obj, status)`.
- Produces: `GET /campaign-actions?key=<syncKey>` → `{ts, correos, acciones:[...], descartes:[...], error?}`. Función `_campValidar(parsed, ctx)` delimitada por los marcadores `// <<<CAMPANAS-VALIDA>>>` / `// <<<FIN CAMPANAS-VALIDA>>>`, para poder evaluarla desde Node sin importar el worker. Forma de cada acción, que consume la Tarea 6:
  - `{tipo:'nueva', confianza, correo, cita, campana:{name,dateStart,dateEnd,status,notes,franchises:[{id,clientId,lines[],sublines:[{id,name,discount}],notes}]}, incluir:true}`
  - `{tipo:'suma', confianza, correo, cita, campanaId, nombreCampana, franchises:[...], incluir:true}`
  - `{tipo:'amplia', confianza, correo, cita, campanaId, nombreCampana, dateEnd, incluir:true}`

- [ ] **Step 1: Escribir la prueba que falla**

`/Users/josechain/lbplanner/tests/campanas_valida.test.mjs`:

```javascript
// Valida _campValidar contra respuestas inventadas del modelo.
// Extrae la funcion de worker.js entre marcadores: worker.js se despliega como
// archivo unico (y se pega en el editor de Cloudflare), asi que no se puede
// partir en modulos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');
const INI = '// <<<CAMPANAS-VALIDA>>>';
const FIN = '// <<<FIN CAMPANAS-VALIDA>>>';
assert.ok(SRC.includes(INI) && SRC.includes(FIN), 'faltan los marcadores en worker.js');
const BLOQUE = SRC.slice(SRC.indexOf(INI) + INI.length, SRC.indexOf(FIN));
const validar = new Function(BLOQUE + '\nreturn _campValidar;')();

const CTX = {
  clientIds: ['cl_ax', 'cl_ck', 'cl_boss', 'cl_mango', 'cl_chilli'],
  lineas: ['Hombre', 'Mujer', 'Nina', 'Nino', 'Kids', 'Toda la Tienda'],
  campanas: [{ id: 'camp_1', name: 'Invierno 2026' }],
};

const nueva = (extra) => ({
  acciones: [Object.assign({
    tipo: 'nueva', confianza: 'alta', correo: 'Campana X', cita: 'desde hoy',
    campana: {
      name: 'Matrimonios y Graduados', dateStart: '2026-10-03', dateEnd: '2026-10-31',
      status: 'ACTIVA', notes: '', franchises: [{ clientId: 'cl_ax', lines: ['Hombre'], sublines: [{ name: 'todas', discount: '30%' }], notes: '' }],
    },
  }, extra || {})],
});

test('una nueva valida pasa entera', () => {
  const r = validar(nueva(), CTX);
  assert.equal(r.acciones.length, 1);
  const a = r.acciones[0];
  assert.equal(a.tipo, 'nueva');
  assert.equal(a.incluir, true);
  assert.equal(a.campana.status, 'ACTIVA');
  assert.equal(a.campana.franchises[0].clientId, 'cl_ax');
  assert.equal(a.campana.franchises[0].sublines[0].discount, '30%');
});

test('tienda inventada se descarta y la campana cae si no queda ninguna', () => {
  const p = nueva();
  p.acciones[0].campana.franchises = [{ clientId: 'cl_inventado', lines: [], sublines: [] }];
  const r = validar(p, CTX);
  assert.equal(r.acciones.length, 0);
  assert.ok(r.descartes.some(d => d.includes('cl_inventado')));
});

test('tienda repetida entra una sola vez', () => {
  const p = nueva();
  p.acciones[0].campana.franchises = [
    { clientId: 'cl_ax', lines: [], sublines: [] },
    { clientId: 'cl_ax', lines: [], sublines: [] },
  ];
  const r = validar(p, CTX);
  assert.equal(r.acciones[0].campana.franchises.length, 1);
  assert.ok(r.descartes.some(d => d.includes('repetida')));
});

test('linea inventada se cae pero la tienda queda', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].lines = ['Hombre', 'MNG HE', 'Gafas'];
  const r = validar(p, CTX);
  assert.deepEqual(r.acciones[0].campana.franchises[0].lines, ['Hombre']);
});

test('estado invalido cae a PLANIFICADA', () => {
  const p = nueva();
  p.acciones[0].campana.status = 'ACTIVE';
  assert.equal(validar(p, CTX).acciones[0].campana.status, 'PLANIFICADA');
});

test('fecha mal formada se vacia; sin fecha de inicio se descarta', () => {
  const p = nueva();
  p.acciones[0].campana.dateEnd = '31/10/2026';
  assert.equal(validar(p, CTX).acciones[0].campana.dateEnd, '');
  const q = nueva();
  q.acciones[0].campana.dateStart = 'manana';
  assert.equal(validar(q, CTX).acciones.length, 0);
});

test('fin antes del inicio: se vacia el fin, no se descarta la campana', () => {
  const p = nueva();
  p.acciones[0].campana.dateStart = '2026-10-10';
  p.acciones[0].campana.dateEnd = '2026-10-01';
  const r = validar(p, CTX);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].campana.dateEnd, '');
  assert.ok(r.descartes.some(d => d.includes('fin antes del inicio')));
});

test('nueva sin nombre se descarta', () => {
  const p = nueva();
  p.acciones[0].campana.name = '   ';
  assert.equal(validar(p, CTX).acciones.length, 0);
});

test('dos descuentos quedan como dos sublineas', () => {
  const p = nueva();
  p.acciones[0].campana.franchises[0].sublines = [
    { name: 'todas las prendas', discount: '50%' },
    { name: 'prendas de invierno', discount: '30%' },
  ];
  const subs = validar(p, CTX).acciones[0].campana.franchises[0].sublines;
  assert.equal(subs.length, 2);
  assert.notEqual(subs[0].id, subs[1].id);
});

test('amplia con campana conocida pasa; con id desconocido se descarta', () => {
  const ok = validar({ acciones: [{ tipo: 'amplia', confianza: 'alta', correo: 'Ampliacion', campanaId: 'camp_1', dateEnd: '2025-11-16' }] }, CTX);
  assert.equal(ok.acciones[0].dateEnd, '2025-11-16');
  assert.equal(ok.acciones[0].nombreCampana, 'Invierno 2026');
  const no = validar({ acciones: [{ tipo: 'amplia', campanaId: 'camp_99', dateEnd: '2025-11-16' }] }, CTX);
  assert.equal(no.acciones.length, 0);
});

test('amplia sin fecha valida se descarta', () => {
  const r = validar({ acciones: [{ tipo: 'amplia', campanaId: 'camp_1', dateEnd: '16 de noviembre' }] }, CTX);
  assert.equal(r.acciones.length, 0);
});

test('suma con campana conocida pasa', () => {
  const r = validar({ acciones: [{ tipo: 'suma', confianza: 'media', correo: 'Continuando', campanaId: 'camp_1', franchises: [{ clientId: 'cl_ck', lines: ['Mujer'], sublines: [{ name: 'todo', discount: '40%' }] }] }] }, CTX);
  assert.equal(r.acciones[0].tipo, 'suma');
  assert.equal(r.acciones[0].campanaId, 'camp_1');
});

test('suma con campana no identificada se vuelve nueva con confianza baja, no se pierde', () => {
  const r = validar({ acciones: [{ tipo: 'suma', confianza: 'alta', correo: 'Continuando con la misma campana', cita: 'para las otras tiendas', campanaId: 'camp_99', campana: { name: 'Dia de la Madre', dateStart: '2026-05-11' }, franchises: [{ clientId: 'cl_ck', lines: [], sublines: [] }] }] }, CTX);
  assert.equal(r.acciones.length, 1);
  assert.equal(r.acciones[0].tipo, 'nueva');
  assert.equal(r.acciones[0].confianza, 'baja');
  assert.equal(r.acciones[0].campana.name, 'Dia de la Madre');
  assert.equal(r.acciones[0].campana.franchises.length, 1);
});

test('suma sin tiendas validas se descarta', () => {
  const r = validar({ acciones: [{ tipo: 'suma', campanaId: 'camp_1', franchises: [] }] }, CTX);
  assert.equal(r.acciones.length, 0);
});

test('tipo desconocido se descarta', () => {
  assert.equal(validar({ acciones: [{ tipo: 'borra', campanaId: 'camp_1' }] }, CTX).acciones.length, 0);
});

test('basura no revienta', () => {
  for (const p of [null, undefined, {}, { acciones: null }, { acciones: [null, 0, 'x'] }]) {
    const r = validar(p, CTX);
    assert.deepEqual(r.acciones, []);
  }
});

test('confianza invalida cae a media', () => {
  const p = nueva({ confianza: 'altisima' });
  assert.equal(validar(p, CTX).acciones[0].confianza, 'media');
});

test('tope de 20 acciones', () => {
  const p = { acciones: Array.from({ length: 30 }, () => nueva().acciones[0]) };
  assert.ok(validar(p, CTX).acciones.length <= 20);
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd /Users/josechain/lbplanner && node --test tests/campanas_valida.test.mjs 2>&1 | tail -10
```
Esperado: FAIL con `faltan los marcadores en worker.js`.

- [ ] **Step 3: Escribir el prompt y el validador**

Insertar en `/Users/josechain/lbplanner/worker.js` justo **antes** de `async function callClaude(env, messages, system, maxTokens) {` (~línea 813). Todo ASCII puro, español sin acentos:

```javascript
// Prompt de extraccion de campanas desde el correo. Cada regla nace de un
// correo real que la rompe. Ver el spec:
// docs/superpowers/specs/2026-10-14-campanas-desde-correo-design.html
const CAMP_SP = 'Eres el extractor de campanas de descuento de LB Planner, la app de Pepe ' +
  '(gerente de Ventura Mall, La Paz, Bolivia). Recibis correos que Pepe mando a contabilidad ' +
  'pidiendo subir campanas al sistema, con su FECHA DE ENVIO, la lista de TIENDAS con su id, ' +
  'y las CAMPANAS ya cargadas en la app.\n\n' +
  'Hay tres tipos de correo:\n' +
  '1. NUEVA: anuncia una campana que no estaba. tipo "nueva".\n' +
  '2. CONTINUACION: "continuando con la misma campana para las otras tiendas" -> suma tiendas ' +
  'a una campana que YA existe. tipo "suma", con el campanaId de la campana existente.\n' +
  '3. AMPLIACION: "ampliar en sistema la campana de referencia hasta el 16 de Noviembre" -> ' +
  'cambia SOLO la fecha de fin. tipo "amplia", con campanaId y dateEnd.\n\n' +
  'REGLAS DURAS:\n' +
  '- FECHAS RELATIVAS contra la fecha de envio del correo. "Desde hoy y hasta fin de mes" en un ' +
  'correo del 3-oct-2026 es dateStart 2026-10-03 y dateEnd 2026-10-31. "Hasta el domingo 12 de ' +
  'abril (incluido)" es dateEnd 2026-04-12. Siempre YYYY-MM-DD.\n' +
  '- RESPETAR LAS EXCLUSIONES. Si el correo dice "por el momento NO tomar en cuenta BOSS", ' +
  'Boss NO entra.\n' +
  '- VARIOS DESCUENTOS EN UNA CAMPANA son varias sublineas. "50% de descuento (30% las prendas ' +
  'de invierno)" son DOS sublineas, no una.\n' +
  '- "MNG HE" es una LINEA de la tienda Mango, no una tienda. La tienda va en clientId y la ' +
  'linea en lines. Lo mismo "MNG SHE" (Mujer) y "MNG Kids" (Kids). Si el nombre termina en LP ' +
  'es la tienda de La Paz.\n' +
  '- lines SOLO puede contener estos valores exactos: Hombre, Mujer, Nina, Nino, Kids, ' +
  'Toda la Tienda. Si el correo no distingue linea, dejalo vacio.\n' +
  '- SOLO podes usar clientId de la lista de tiendas que te di, copiado tal cual. NUNCA inventes ' +
  'un id ni uses el nombre en su lugar.\n' +
  '- Para "suma" y "amplia", el campanaId tiene que ser uno de la lista de campanas existentes. ' +
  'Si no estas seguro de CUAL campana es, devolvela como "nueva" y pone "confianza":"baja".\n' +
  '- DESCARTAR lo que no es una campana. "RE: Campanas de Descuento Realizadas 2024" es un ' +
  'pedido de reporte, no una campana: no lo devuelvas.\n' +
  '- MEJOR DUDAR QUE EQUIVOCARSE. Si algo no esta claro, "confianza":"baja". En "cita" pone la ' +
  'frase textual del correo que origino la accion, para que Pepe pueda verificarla.\n' +
  '- status solo puede ser PLANIFICADA, ACTIVA, FINALIZADA o CANCELADA.\n\n' +
  'RESPONDE SOLO CON JSON VALIDO, sin texto alrededor ni bloques de codigo:\n' +
  '{"acciones":[' +
  '{"tipo":"nueva","confianza":"alta","correo":"asunto del correo","cita":"frase textual",' +
  '"campana":{"name":"...","dateStart":"2026-10-03","dateEnd":"2026-10-31","status":"ACTIVA",' +
  '"notes":"","franchises":[{"clientId":"...","lines":["Hombre"],' +
  '"sublines":[{"name":"todas las prendas del archivo","discount":"30%"}],"notes":""}]}},' +
  '{"tipo":"suma","confianza":"media","correo":"...","cita":"...","campanaId":"camp_...",' +
  '"franchises":[]},' +
  '{"tipo":"amplia","confianza":"alta","correo":"...","cita":"...","campanaId":"camp_...",' +
  '"dateEnd":"2025-11-16"}]}';

// <<<CAMPANAS-VALIDA>>>
// Muro de contencion entre el modelo y la pantalla. Mismo criterio que
// "Registrar lo hecho": antes descartar algo valido que escribir algo que
// Pepe no dijo. Pura a proposito, para poder probarla en Node sin desplegar
// (tests/campanas_valida.test.mjs la extrae entre estos marcadores).
function _campValidar(parsed, ctx) {
  const ESTADOS = ['PLANIFICADA', 'ACTIVA', 'FINALIZADA', 'CANCELADA'];
  const ids = {}, camps = {}, lineas = {};
  ((ctx && ctx.clientIds) || []).forEach(function (x) { ids[x] = 1; });
  ((ctx && ctx.campanas) || []).forEach(function (c) { if (c && c.id) camps[c.id] = c; });
  ((ctx && ctx.lineas) || []).forEach(function (l) { lineas[l] = 1; });
  const descartes = [], acciones = [];

  function fecha(v) {
    return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '';
  }
  function texto(v, n) {
    return String(v == null ? '' : v).trim().slice(0, n);
  }
  function franquicias(arr, etiqueta) {
    const vistos = {}, out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (f) {
      if (!f || !ids[f.clientId]) {
        descartes.push('tienda desconocida en ' + etiqueta + ': ' + ((f && f.clientId) || '?'));
        return;
      }
      if (vistos[f.clientId]) {
        descartes.push('tienda repetida en ' + etiqueta + ': ' + f.clientId);
        return;
      }
      vistos[f.clientId] = 1;
      out.push({
        id: 'fran_' + f.clientId,
        clientId: f.clientId,
        lines: (Array.isArray(f.lines) ? f.lines : []).filter(function (l) { return lineas[l]; }),
        sublines: (Array.isArray(f.sublines) ? f.sublines : [])
          .filter(function (s) { return s && texto(s.name, 120); })
          .slice(0, 8)
          .map(function (s, k) {
            return { id: 'sl_' + f.clientId + '_' + k, name: texto(s.name, 120), discount: texto(s.discount, 20) };
          }),
        notes: texto(f.notes, 300)
      });
    });
    return out;
  }

  (Array.isArray(parsed && parsed.acciones) ? parsed.acciones : []).slice(0, 20).forEach(function (a) {
    if (!a || typeof a !== 'object') return;
    const conf = (a.confianza === 'alta' || a.confianza === 'baja') ? a.confianza : 'media';
    const correo = texto(a.correo, 160), cita = texto(a.cita, 300);

    if (a.tipo === 'amplia') {
      if (!camps[a.campanaId]) { descartes.push('ampliacion sin campana conocida: ' + (a.campanaId || '?')); return; }
      const fin = fecha(a.dateEnd);
      if (!fin) { descartes.push('ampliacion sin fecha valida: ' + (correo || '?')); return; }
      acciones.push({ tipo: 'amplia', confianza: conf, correo: correo, cita: cita,
        campanaId: a.campanaId, nombreCampana: camps[a.campanaId].name, dateEnd: fin, incluir: true });
      return;
    }

    if (a.tipo === 'suma') {
      const frs = franquicias(a.franchises, 'suma');
      if (!frs.length) { descartes.push('suma sin tiendas validas: ' + (correo || '?')); return; }
      if (camps[a.campanaId]) {
        acciones.push({ tipo: 'suma', confianza: conf, correo: correo, cita: cita,
          campanaId: a.campanaId, nombreCampana: camps[a.campanaId].name, franchises: frs, incluir: true });
        return;
      }
      // El correo dice "continuando con la misma campana" pero no sabemos cual.
      // Descartarla en silencio perderia el correo entero, que es peor:
      // pasa como nueva con confianza baja y Pepe decide.
      descartes.push('suma reconvertida a nueva, campana no identificada: ' + (correo || '?'));
      const c0 = a.campana || {};
      acciones.push({ tipo: 'nueva', confianza: 'baja', correo: correo, cita: cita,
        campana: {
          name: texto(c0.name, 120) || correo || 'Campana sin nombre',
          dateStart: fecha(c0.dateStart), dateEnd: fecha(c0.dateEnd),
          status: 'PLANIFICADA', notes: texto(c0.notes, 300), franchises: frs
        }, incluir: true });
      return;
    }

    if (a.tipo !== 'nueva') { descartes.push('tipo desconocido: ' + (a.tipo || '?')); return; }
    const c = a.campana || {};
    const nombre = texto(c.name, 120);
    const frs2 = franquicias(c.franchises, nombre || 'campana nueva');
    let ini = fecha(c.dateStart), fin2 = fecha(c.dateEnd);
    if (!nombre) { descartes.push('campana nueva sin nombre'); return; }
    if (!frs2.length) { descartes.push('campana nueva sin tiendas validas: ' + nombre); return; }
    if (!ini) { descartes.push('campana nueva sin fecha de inicio: ' + nombre); return; }
    if (fin2 && fin2 < ini) { descartes.push('fin antes del inicio, se deja vacio: ' + nombre); fin2 = ''; }
    acciones.push({ tipo: 'nueva', confianza: conf, correo: correo, cita: cita,
      campana: {
        name: nombre, dateStart: ini, dateEnd: fin2,
        status: ESTADOS.indexOf(c.status) >= 0 ? c.status : 'PLANIFICADA',
        notes: texto(c.notes, 300), franchises: frs2
      }, incluir: true });
  });

  return { acciones: acciones, descartes: descartes };
}
// <<<FIN CAMPANAS-VALIDA>>>
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd /Users/josechain/lbplanner && node --check worker.js && node --test tests/campanas_valida.test.mjs 2>&1 | tail -10 && LC_ALL=C grep -n '[^ -~]' worker.js | head
```
Esperado: 18 tests pasando, `node --check` limpio, y el `grep` de no-ASCII **sin salida**.

- [ ] **Step 5: Agregar el endpoint**

Insertar en `/Users/josechain/lbplanner/worker.js` inmediatamente después del cierre del bloque `if (p === '/email-actions' ...)`, antes del siguiente `if (p === ...)`:

```javascript
    // GET /campaign-actions?key=<syncKey>
    // Trae las campanas que el puente leyo en la carpeta Enviados y hace que
    // Claude las convierta en acciones sobre el modulo de Campanas.
    // NO escribe nada: devuelve propuestas para la tarjeta de confirmacion.
    if (p === '/campaign-actions' && request.method === 'GET') {
      const syncKey = url.searchParams.get('key') || '';
      if (!syncKey) return json({ error: 'Falta key', correos: 0, acciones: [] }, 200);
      const briefKey = env.BRIEFING_KEY;
      if (!briefKey) return json({ error: 'Falta el secreto BRIEFING_KEY en el worker', correos: 0, acciones: [] }, 200);
      let payload;
      const briefPath = '/campanas-correo?key=' + encodeURIComponent(briefKey);
      try {
        // Service binding: un fetch a la URL publica de workers.dev desde otro
        // Worker de la misma cuenta devuelve 404.
        let r;
        if (env.BRIEFING_SERVICE) {
          r = await env.BRIEFING_SERVICE.fetch(new Request('https://briefing.internal' + briefPath));
        } else {
          r = await fetch((env.BRIEFING_URL || 'https://briefing-diario-pepe.josechain.workers.dev') + briefPath);
        }
        if (!r.ok) return json({ error: 'Briefing respondio ' + r.status + (env.BRIEFING_SERVICE ? ' (binding)' : ' (http)'), correos: 0, acciones: [] }, 200);
        payload = await r.json();
      } catch (err) {
        return json({ error: 'No pude leer el briefing: ' + err.message, correos: 0, acciones: [] }, 200);
      }
      const correos = Array.isArray(payload.correos) ? payload.correos.slice(0, 30) : [];
      if (!correos.length) {
        return json({ ts: payload.ts || null, correos: 0, acciones: [], descartes: [], note: 'Sin correos de campana. Abri Outlook y corre el puente.' }, 200);
      }
      let clients = [], campanas = [];
      try {
        const blob = await env.LBP_KV.get('data:' + syncKey);
        const parsedData = blob ? JSON.parse(blob) : {};
        clients = (parsedData.clients || [])
          .filter(function (c) { return c && c.id; })
          .map(function (c) { return { id: c.id, nombre: c.businessName || c.name || c.id }; });
        campanas = (parsedData.campaigns || [])
          .filter(function (c) { return c && c.id; })
          .map(function (c) {
            return { id: c.id, name: c.name || '', dateStart: c.dateStart || '', dateEnd: c.dateEnd || '',
                     status: c.status || '',
                     tiendas: (c.franchises || []).map(function (f) { return f.clientId; }).filter(Boolean) };
          });
      } catch (err) {
        return json({ error: 'No pude leer tus datos: ' + err.message, correos: correos.length, acciones: [] }, 200);
      }
      if (!clients.length) {
        return json({ error: 'No tengo tus tiendas cargadas en la nube. Abri la app para que sincronice.', correos: correos.length, acciones: [] }, 200);
      }
      const LINEAS = ['Hombre', 'Mujer', 'Nina', 'Nino', 'Kids', 'Toda la Tienda'];
      const ctx = { clientIds: clients.map(function (c) { return c.id; }), lineas: LINEAS, campanas: campanas };
      const msg =
        'TIENDAS (usa el id tal cual):\n' +
        clients.map(function (c) { return '- ' + c.id + ' = ' + c.nombre; }).join('\n') + '\n\n' +
        'LINEAS DE MANGO: Mango Mujer (SHE), Mango Hombre (HE), Mango Ninos (Kids). ' +
        'Hay dos tiendas Mango: Santa Cruz y La Paz; las de La Paz llevan LP detras del nombre. ' +
        'El Outlet Express es una minitienda del atrio donde se juntan prendas de varias tiendas, ' +
        'normalmente al 70%.\n\n' +
        'CAMPANAS YA CARGADAS:\n' +
        (campanas.length
          ? campanas.map(function (c) {
              return '- ' + c.id + ' | ' + c.name + ' | ' + (c.dateStart || '?') + ' a ' + (c.dateEnd || '?') +
                     ' | ' + (c.status || '?') + ' | tiendas: ' + (c.tiendas.join(', ') || 'ninguna');
            }).join('\n')
          : '(ninguna)') + '\n\n' +
        'CORREOS ENVIADOS:\n' +
        correos.map(function (e, i) {
          return '[' + (i + 1) + '] FECHA DE ENVIO: ' + (e.date || '?') +
                 '\nASUNTO: ' + String(e.subject || '').slice(0, 160) +
                 '\nCUERPO:\n' + String(e.texto || '').slice(0, 6000);
        }).join('\n\n---\n\n');
      const raw = await callClaude(env, [{ role: 'user', content: msg }], CAMP_SP, 8192);
      if (!raw) {
        // callClaude devuelve '' ante cualquier fallo (falta la key, 429, red).
        // Devolver acciones:[] sin decir nada se veria como "no hay nada que
        // cargar", que es exactamente la conclusion equivocada.
        return json({ ts: payload.ts || null, correos: correos.length, acciones: [], descartes: [],
                      error: 'La IA no respondio. Reintenta en un rato.' }, 200);
      }
      let parsed = null;
      try {
        const m = String(raw).match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      } catch (err) { parsed = null; }
      if (!parsed) {
        return json({ ts: payload.ts || null, correos: correos.length, acciones: [], descartes: [],
                      error: 'La IA no devolvio JSON valido.' }, 200);
      }
      const out = _campValidar(parsed, ctx);
      return json({ ts: payload.ts || null, correos: correos.length,
                    acciones: out.acciones, descartes: out.descartes }, 200);
    }
```

- [ ] **Step 6: Probar el endpoint con un briefing falso**

Es la prueba del punto 2 de Review Focus: `callClaude` devuelve `''` ante cualquier fallo (falta la key, 429, red caída), y una respuesta `{acciones:[]}` sin más se lee en pantalla como «no hay nada que cargar», que es la conclusión exactamente equivocada.

`/Users/josechain/lbplanner/tests/campaign_actions.test.mjs`:

```javascript
// Prueba /campaign-actions contra el worker.js real, con el briefing y el KV
// falsos y SIN llamar a Anthropic. Cubre los caminos de degradacion: lo que
// no se puede leer tiene que decirlo, no devolver una lista vacia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(import.meta.dirname, '..', 'worker.js'), 'utf8');

async function cargar() {
  const tmp = path.join(import.meta.dirname, '.worker_lbp_test.mjs');
  fs.writeFileSync(tmp, SRC);
  try { return (await import('file://' + tmp + '?t=' + Date.now())).default; }
  finally { fs.unlinkSync(tmp); }
}

const CORREO = { id: '1', subject: 'Campana X', date: '2026-10-03', texto: 'Desde hoy y hasta fin de mes en AX' };
const DATOS = JSON.stringify({
  clients: [{ id: 'cl_ax', businessName: 'AX' }, { id: 'cl_ck', name: 'CK' }],
  campaigns: [{ id: 'camp_1', name: 'Invierno 2026', dateStart: '2026-06-01', dateEnd: '2026-07-31', status: 'FINALIZADA', franchises: [{ clientId: 'cl_ax' }] }]
});

function entorno(opts) {
  const o = opts || {};
  return {
    BRIEFING_KEY: o.sinBriefKey ? undefined : 'bk',
    // Sin ANTHROPIC_API_KEY a proposito: callClaude devuelve '' sin salir a la red.
    LBP_KV: { get: async k => (k === 'data:lbp_x' ? (o.datos === undefined ? DATOS : o.datos) : null), put: async () => {} },
    BRIEFING_SERVICE: {
      fetch: async () => (o.briefStatus && o.briefStatus !== 200)
        ? new Response('no', { status: o.briefStatus })
        : new Response(JSON.stringify({ ts: '2026-10-14T10:00:00Z', correos: o.correos === undefined ? [CORREO] : o.correos }), { status: 200 })
    }
  };
}

const pedir = (key) => new Request('https://x/campaign-actions?key=' + (key === undefined ? 'lbp_x' : key));

test('sin key avisa en vez de fallar', async () => {
  const r = await (await cargar()).fetch(pedir(''), entorno());
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.match(b.error, /key/i);
  assert.deepEqual(b.acciones, []);
});

test('sin BRIEFING_KEY lo dice', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ sinBriefKey: true }))).json();
  assert.match(b.error, /BRIEFING_KEY/);
});

test('briefing caido lo dice y marca que fue por binding', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ briefStatus: 500 }))).json();
  assert.match(b.error, /500/);
  assert.match(b.error, /binding/);
});

test('sin correos no es un error: es una nota con instruccion', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ correos: [] }))).json();
  assert.equal(b.error, undefined);
  assert.equal(b.correos, 0);
  assert.deepEqual(b.acciones, []);
  assert.match(b.note, /Outlook/);
});

test('sin tiendas en la nube pide sincronizar', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ datos: JSON.stringify({ clients: [] }) }))).json();
  assert.match(b.error, /tiendas/i);
});

test('datos corruptos en KV no revientan el endpoint', async () => {
  const b = await (await (await cargar()).fetch(pedir(), entorno({ datos: '{no es json' }))).json();
  assert.ok(b.error);
  assert.deepEqual(b.acciones, []);
});

test('la IA sin responder NO se ve como "nada que cargar"', async () => {
  // Este es el caso de Review Focus #2: hay correos, hay tiendas, y callClaude
  // devuelve '' porque falta ANTHROPIC_API_KEY.
  const b = await (await (await cargar()).fetch(pedir(), entorno())).json();
  assert.equal(b.correos, 1);
  assert.deepEqual(b.acciones, []);
  assert.ok(b.error, 'tiene que haber un error visible, no una lista vacia muda');
  assert.match(b.error, /IA/);
});
```

Correr:

```bash
cd /Users/josechain/lbplanner && node --test tests/campaign_actions.test.mjs 2>&1 | tail -10
```
Esperado: 7 tests OK. Si `Response` no existe, el Node de este Mac es viejo: `node --version` tiene que dar 18+ (hoy da v24.14.1).

- [ ] **Step 7: Desplegar y verificar con los correos reales**

```bash
cd /Users/josechain/lbplanner && node --check worker.js && LC_ALL=C grep -c '[^ -~]' worker.js; grep -A2 "\[triggers\]" wrangler.toml && npx wrangler secret list --name life-planner | head -20
```
`grep -c` tiene que dar `0`. `crons` tiene que seguir en `["* * * * *"]`. Después:

```bash
cd /Users/josechain/lbplanner && npx wrangler deploy
```

Y la prueba de verdad — reemplazar `<SYNCKEY>` por el de Pepe (`lbp_0mnvmyv9uh8wciya`):

```bash
curl -s "https://life-planner.josechain.workers.dev/campaign-actions?key=lbp_0mnvmyv9uh8wciya" | python3 -m json.tool | head -80
```

Esperado, y hay que **leerlo contra los correos reales uno por uno**:
- `correos` ≥ 5
- las fechas relativas resueltas contra la fecha de envío
- BOSS excluido donde el correo lo excluye
- dos sublíneas donde hay dos descuentos
- la continuación del 14-jul apuntando a la campaña del 31-jul (o, si no la identifica, como `nueva` con `confianza: "baja"` — eso también es correcto)
- `RE: Campañas de Descuento Realizadas 2024` **no** aparece como acción
- `descartes` legible: lo que se cayó y por qué

Si una regla del prompt no se cumple, se ajusta el prompt y se vuelve a correr **este mismo comando** antes de seguir.

**Desviación declarada respecto al spec.** El spec pide esta capa como «los 5 correos como casos fijos y el resultado esperado escrito a mano». No se hace así: la extracción pasa por Claude, que no es determinista, y un resultado esperado literal daría una prueba que falla por razones que no son errores. Lo que sí queda automatizado es todo lo que **sí** es determinista: la conversión del cuerpo (Tarea 1), la validación de lo que devuelve el modelo (Tarea 5, Step 1 — 18 casos), la degradación cuando el modelo no responde (Step 6) y la escritura (Tarea 6). Esta capa queda como una verificación manual con criterios escritos, que es lo que de verdad se puede sostener. Si más adelante molesta, lo que se puede fijar es el *contrato*: un par de correos de fixture y aserciones laxas (que la fecha resuelta caiga en el mes del envío, que BOSS no aparezca cuando el correo lo excluye) en vez del JSON entero.

- [ ] **Step 8: Commit**

```bash
cd /Users/josechain/lbplanner && git add worker.js tests/campanas_valida.test.mjs tests/campaign_actions.test.mjs && git commit -m "Worker: /campaign-actions con extraccion y validacion de campanas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: La app escribe las acciones sobre `data.campaigns`

**Files:**
- Modify: `/Users/josechain/lbplanner/LifeBusinessPlanner2026.html` (insertar `window._campAplicar` justo antes de `window._hechoInventario`, línea 2066)
- Create: `/Users/josechain/lbplanner/tests/camp_aplicar.test.mjs`
- Create: `/Users/josechain/lbplanner/patch_campanas_aplicar.py`

**Interfaces:**
- Consumes: las acciones validadas de la Tarea 5.
- Produces: `window._campAplicar(data, acciones) -> {campaigns: [...], res: {nuevas, sumadas, ampliadas, omitidas, detalle:[], fallos:[]}}`. Pura: no toca estado de React, no muta `data`.

- [ ] **Step 1: Escribir la prueba que falla**

`/Users/josechain/lbplanner/tests/camp_aplicar.test.mjs`:

```javascript
// Prueba window._campAplicar extrayendola del HTML, igual que ya se probaba
// _buildWeeklyReport en Node. No necesita navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');
const INI = 'window._campAplicar = function';
const i = HTML.indexOf(INI);
assert.ok(i > 0, 'no encuentro window._campAplicar en el HTML');
const FIN = '\n};\n';
const j = HTML.indexOf(FIN, i);
assert.ok(j > i, 'no encuentro el cierre de _campAplicar');
const win = {};
new Function('window', HTML.slice(i, j + FIN.length))(win);
const aplicar = win._campAplicar;

const fran = (clientId, lines, subs) => ({
  id: 'fran_' + clientId, clientId,
  lines: lines || [], sublines: subs || [{ id: 'sl_0', name: 'todo', discount: '30%' }], notes: ''
});

const BASE = () => ({
  campaigns: [{
    id: 'camp_vieja', name: 'Invierno 2026', dateStart: '2026-06-01', dateEnd: '2026-07-31',
    status: 'FINALIZADA', notes: '', franchises: [fran('cl_ax')]
  }]
});

const accNueva = (over) => Object.assign({
  tipo: 'nueva', confianza: 'alta', correo: 'Campana X', cita: '', incluir: true,
  campana: { name: 'Matrimonios y Graduados', dateStart: '2026-10-03', dateEnd: '2026-10-31',
             status: 'ACTIVA', notes: '', franchises: [fran('cl_ck', ['Hombre'])] }
}, over || {});

test('una nueva se agrega adelante y no toca las existentes', () => {
  const data = BASE();
  const antes = JSON.stringify(data);
  const r = aplicar(data, [accNueva()]);
  assert.equal(r.campaigns.length, 2);
  assert.equal(r.campaigns[0].name, 'Matrimonios y Graduados');
  assert.equal(r.campaigns[0].origen, 'correo');
  assert.ok(r.campaigns[0].id.startsWith('camp_'));
  assert.deepEqual(r.campaigns[1], data.campaigns[0]);
  assert.equal(r.res.nuevas, 1);
  assert.equal(JSON.stringify(data), antes, 'no debe mutar data');
});

test('las acciones destildadas no se aplican', () => {
  const r = aplicar(BASE(), [accNueva({ incluir: false })]);
  assert.equal(r.campaigns.length, 1);
  assert.equal(r.res.nuevas, 0);
});

test('la misma tanda dos veces no duplica', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const dos = aplicar({ campaigns: uno.campaigns }, [accNueva()]);
  assert.equal(dos.campaigns.length, 2);
  assert.equal(dos.res.nuevas, 0);
  assert.equal(dos.res.omitidas, 1);
  assert.ok(dos.res.fallos.some(f => f.includes('ya existia')));
});

test('mismo nombre con otra fecha de inicio SI entra', () => {
  const data = BASE();
  const uno = aplicar(data, [accNueva()]);
  const otra = accNueva();
  otra.campana = Object.assign({}, otra.campana, { dateStart: '2027-10-03' });
  const dos = aplicar({ campaigns: uno.campaigns }, [otra]);
  assert.equal(dos.campaigns.length, 3);
});

test('suma agrega solo las tiendas que no estaban', () => {
  const r = aplicar(BASE(), [{
    tipo: 'suma', incluir: true, campanaId: 'camp_vieja', nombreCampana: 'Invierno 2026',
    franchises: [fran('cl_ax'), fran('cl_boss'), fran('cl_mango')]
  }]);
  const c = r.campaigns.find(x => x.id === 'camp_vieja');
  assert.deepEqual(c.franchises.map(f => f.clientId), ['cl_ax', 'cl_boss', 'cl_mango']);
  assert.equal(r.res.sumadas, 2);
  assert.equal(r.campaigns.length, 1);
});

test('suma sin tiendas nuevas se informa y no cambia nada', () => {
  const r = aplicar(BASE(), [{
    tipo: 'suma', incluir: true, campanaId: 'camp_vieja', nombreCampana: 'Invierno 2026',
    franchises: [fran('cl_ax')]
  }]);
  assert.equal(r.campaigns[0].franchises.length, 1);
  assert.equal(r.res.omitidas, 1);
});

test('amplia cambia unicamente dateEnd', () => {
  const data = BASE();
  const r = aplicar(data, [{
    tipo: 'amplia', incluir: true, campanaId: 'camp_vieja', nombreCampana: 'Invierno 2026', dateEnd: '2026-11-16'
  }]);
  const c = r.campaigns[0], v = data.campaigns[0];
  assert.equal(c.dateEnd, '2026-11-16');
  assert.equal(c.name, v.name);
  assert.equal(c.dateStart, v.dateStart);
  assert.equal(c.status, v.status);
  assert.deepEqual(c.franchises, v.franchises);
  assert.equal(r.res.ampliadas, 1);
});

test('suma o amplia sobre una campana borrada se informa, no revienta', () => {
  const r = aplicar(BASE(), [
    { tipo: 'suma', incluir: true, campanaId: 'camp_no', nombreCampana: 'Fantasma', franchises: [fran('cl_ck')] },
    { tipo: 'amplia', incluir: true, campanaId: 'camp_no', nombreCampana: 'Fantasma', dateEnd: '2026-12-01' }
  ]);
  assert.equal(r.campaigns.length, 1);
  assert.equal(r.res.fallos.length, 2);
  assert.ok(r.res.fallos[0].includes('ya no existe'));
});

test('ids de campana y de franquicia unicos en la misma tanda', () => {
  const a = accNueva(), b = accNueva();
  b.campana = Object.assign({}, b.campana, { name: 'Otra', franchises: [fran('cl_boss'), fran('cl_mango')] });
  const r = aplicar(BASE(), [a, b]);
  const ids = r.campaigns.map(c => c.id).concat(
    r.campaigns.flatMap(c => (c.franchises || []).map(f => f.id)));
  assert.equal(new Set(ids).size, ids.length);
});

test('sin campanas previas funciona igual', () => {
  const r = aplicar({}, [accNueva()]);
  assert.equal(r.campaigns.length, 1);
});

test('basura no revienta', () => {
  for (const acc of [null, undefined, [], [null, 0, 'x', {}, { tipo: 'raro', incluir: true }]]) {
    const r = aplicar(BASE(), acc);
    assert.equal(r.campaigns.length, 1);
  }
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd /Users/josechain/lbplanner && node --test tests/camp_aplicar.test.mjs 2>&1 | tail -8
```
Esperado: FAIL con `no encuentro window._campAplicar en el HTML`.

- [ ] **Step 3: Escribir el parche**

`/Users/josechain/lbplanner/patch_campanas_aplicar.py`. Ojo con la regla: **ningún `\n` literal** en los strings que se insertan; va `\\n`.

```python
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
```

**Antes de correrlo**, verificar el formato real de la versión:
```bash
cd /Users/josechain/lbplanner && grep -n "LBP_VERSION = " LifeBusinessPlanner2026.html | head -3
```
Verificado el 14-oct: línea 25, `window.LBP_VERSION = '5.35';`. Si cambió, ajustar la regex del parche a lo que haya.

- [ ] **Step 4: Aplicar el parche y correr las pruebas**

```bash
cd /Users/josechain/lbplanner && cp LifeBusinessPlanner2026.html /tmp/lbp_antes_v536.html && python3 patch_campanas_aplicar.py && node --test tests/camp_aplicar.test.mjs 2>&1 | tail -8
```
Esperado: `node --check PASSED` y 11 tests OK. Si algo falla, `cp /tmp/lbp_antes_v536.html LifeBusinessPlanner2026.html` y corregir.

- [ ] **Step 5: Correrlo contra los datos reales de la nube**

```bash
cd /Users/josechain/lbplanner && curl -s "https://life-planner.josechain.workers.dev/sync?key=lbp_0mnvmyv9uh8wciya" -o /tmp/lbp_data.json && node -e "
const fs=require('fs');
const html=fs.readFileSync('LifeBusinessPlanner2026.html','utf8');
const i=html.indexOf('window._campAplicar = function'), j=html.indexOf('\n};\n', i);
const win={}; new Function('window', html.slice(i, j+4))(win);
const data=JSON.parse(fs.readFileSync('/tmp/lbp_data.json','utf8'));
const antes=JSON.stringify(data.campaigns||[]);
console.log('campanas antes:', (data.campaigns||[]).length);
const r=win._campAplicar(data, []);
console.log('con 0 acciones ->', r.campaigns.length, 'campanas |', r.res);
console.log('data intacta:', JSON.stringify(data.campaigns||[])===antes);
"
```
Esperado: la misma cantidad de campañas, `res` en cero, `data intacta: true`.

- [ ] **Step 6: Commit**

```bash
cd /Users/josechain/lbplanner && git add LifeBusinessPlanner2026.html patch_campanas_aplicar.py tests/camp_aplicar.test.mjs && git commit -m "App: _campAplicar escribe campanas del correo sobre una copia (v5.36)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: El informe semanal cuenta las campañas

Hueco que encontré al leer el código, no estaba en el spec. El spec justifica la tarjeta de confirmación diciendo *«una campaña mal cargada se propaga al informe semanal»*. **Hoy no se propaga ninguna:** `_buildWeeklyReport` filtra por `status === 'COMPLETED'` y `'ACTIVE' || 'EN_CURSO'` (`LifeBusinessPlanner2026.html:620-625`), pero el módulo sólo escribe `PLANIFICADA | ACTIVA | FINALIZADA | CANCELADA` (`:18091`). Ninguna campaña aparece nunca en el informe — tampoco «Invierno 2026», la única que hay. Sin esto, llenar el módulo no cambia nada en el informe.

**Files:**
- Modify: `/Users/josechain/lbplanner/LifeBusinessPlanner2026.html:619-625`
- Create: `/Users/josechain/lbplanner/tests/informe_campanas.test.mjs`

**Interfaces:**
- Consumes: `data.campaigns` tal como lo escribe el módulo y la Tarea 6.
- Produces: nada nuevo; `rep.campaignsDone` y `rep.campaignsActive` empiezan a traer datos.

- [ ] **Step 1: Escribir la prueba que falla**

`/Users/josechain/lbplanner/tests/informe_campanas.test.mjs`:

```javascript
// Chequea sobre el texto del HTML que los filtros de campanas del informe
// usan los estados que el modulo escribe de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(import.meta.dirname, '..', 'LifeBusinessPlanner2026.html'), 'utf8');

test('los estados del modulo siguen siendo estos cuatro', () => {
  assert.ok(HTML.includes("var CAMP_STATUSES = ['PLANIFICADA','ACTIVA','FINALIZADA','CANCELADA']"),
    'cambiaron los estados del modulo: hay que revisar el informe');
});

test('el informe cuenta las finalizadas', () => {
  const i = HTML.indexOf('var campaignsDone');
  assert.ok(i > 0);
  const bloque = HTML.slice(i, i + 600);
  assert.ok(/FINALIZADA/.test(bloque), 'el informe no reconoce FINALIZADA');
});

test('el informe cuenta las activas y las planificadas', () => {
  const i = HTML.indexOf('var campaignsActive');
  assert.ok(i > 0);
  const bloque = HTML.slice(i, i + 600);
  assert.ok(/'ACTIVA'/.test(bloque), 'el informe no reconoce ACTIVA');
  assert.ok(/'PLANIFICADA'/.test(bloque), 'el informe ignora las planificadas');
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd /Users/josechain/lbplanner && node --test tests/informe_campanas.test.mjs 2>&1 | tail -10
```
Esperado: pasa el primero, fallan los otros dos.

- [ ] **Step 3: Arreglar los filtros**

Reemplazar en `LifeBusinessPlanner2026.html` el bloque de las líneas 619-625. Buscar exactamente:

```javascript
    var campaignsDone = (data.campaigns || []).filter(function(c) {
      return c.status === 'COMPLETED' && inWin((c.dateEnd || c.endDate) ? new Date(c.dateEnd || c.endDate).getTime() : null);
    }).map(function(c) { return c.name + (c.dateEnd ? ' (fin ' + dstr(c.dateEnd) + ')' : ''); });
    var campaignsActive = (data.campaigns || []).filter(function(c) {
      return c.status === 'ACTIVE' || c.status === 'EN_CURSO';
    }).map(function(c) { return c.name + (c.dateStart ? ' (desde ' + dstr(c.dateStart) + ')' : ''); });
```

y poner:

```javascript
    // Los estados que escribe el modulo de Campanas son PLANIFICADA / ACTIVA /
    // FINALIZADA / CANCELADA (CAMP_STATUSES). El informe filtraba por
    // COMPLETED / ACTIVE / EN_CURSO, que nadie escribe nunca: ninguna campana
    // aparecia aca. Se dejan los nombres viejos por si quedo algun dato de
    // antes.
    var campaignsDone = (data.campaigns || []).filter(function(c) {
      return (c.status === 'FINALIZADA' || c.status === 'COMPLETED') &&
        inWin((c.dateEnd || c.endDate) ? new Date(c.dateEnd || c.endDate).getTime() : null);
    }).map(function(c) { return c.name + (c.dateEnd ? ' (fin ' + dstr(c.dateEnd) + ')' : ''); });
    var campaignsActive = (data.campaigns || []).filter(function(c) {
      return c.status === 'ACTIVA' || c.status === 'PLANIFICADA' ||
        c.status === 'ACTIVE' || c.status === 'EN_CURSO';
    }).map(function(c) { return c.name + (c.dateStart ? ' (desde ' + dstr(c.dateStart) + ')' : ''); });
```

Y el bloque de conteo de `/chat` (`:709-711`) usa `c.status==='ACTIVE'` y `c.endDate`: cambiar `c.status==='ACTIVE'` por `(c.status==='ACTIVA'||c.status==='ACTIVE')` y `c.status==='COMPLETED'` por `(c.status==='FINALIZADA'||c.status==='COMPLETED')`, y `c.endDate` por `(c.dateEnd||c.endDate)`. **Leer esas líneas primero** (`sed -n '705,715p'`) y reemplazar sobre el texto exacto.

- [ ] **Step 4: Correr las pruebas**

```bash
cd /Users/josechain/lbplanner && node --test tests/informe_campanas.test.mjs tests/camp_aplicar.test.mjs 2>&1 | tail -8 && python3 -c "
import re,subprocess
h=open('LifeBusinessPlanner2026.html',encoding='utf-8').read()
s=re.findall(r'<script[^>]*>(.*?)</script>',h,re.DOTALL)
open('/tmp/check_inf.js','w').write(max(s,key=len))
r=subprocess.run(['node','--check','/tmp/check_inf.js'],capture_output=True,text=True)
print('node --check PASSED' if r.returncode==0 else r.stderr[:600])
"
```
Esperado: todos los tests OK y `node --check PASSED`.

- [ ] **Step 5: Verificar que ahora sí aparece en el informe real**

```bash
cd /Users/josechain/lbplanner && node -e "
const fs=require('fs');
const html=fs.readFileSync('LifeBusinessPlanner2026.html','utf8');
const i=html.indexOf('var campaignsDone');
console.log(html.slice(i-120, i+900));
" && python3 -c "
import json
d=json.load(open('/tmp/lbp_data.json'))
for c in d.get('campaigns',[]):
    print(c.get('status'), '|', c.get('name'), '|', c.get('dateStart'), '->', c.get('dateEnd'))
"
```
Esperado: ver el estado real de las campañas de Pepe y confirmar que caen en una de las dos listas con los filtros nuevos.

- [ ] **Step 6: Commit**

```bash
cd /Users/josechain/lbplanner && git add LifeBusinessPlanner2026.html tests/informe_campanas.test.mjs && git commit -m "Informe: reconocer los estados reales de campana (ninguna aparecia)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: La tarjeta de confirmación

Mismo criterio que «Registrar lo hecho»: cada acción se destilda, los textos se editan, y lo dudoso sale señalado con la frase del correo que lo originó.

**Files:**
- Modify: `/Users/josechain/lbplanner/LifeBusinessPlanner2026.html` (componente `CampanasCorreo` antes de `var CampaignsScreen` en la línea 18096; botón en el `page-header` de esa pantalla; estado y modal dentro de `CampaignsScreen`)
- Create: `/Users/josechain/lbplanner/patch_campanas_ui.py`

**Interfaces:**
- Consumes: `GET /campaign-actions?key=` (Tarea 5), `window._campAplicar` (Tarea 6), `window.LBP_WORKER_URL`, el `Modal` existente, `CAMP_STATUS_COLORS`, `CAMP_DEFAULT_LINES`.
- Produces: `CampanasCorreo({data, setData, onDone})`.

- [ ] **Step 1: Escribir el parche**

`/Users/josechain/lbplanner/patch_campanas_ui.py`:

```python
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
    var r = window._campAplicar(data, lote.acciones);
    setData(function(prev){ return Object.assign({}, prev, {campaigns: window._campAplicar(prev, lote.acciones).campaigns}); });
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
```

**Antes de correrlo**, confirmar los cuatro anclajes:
```bash
cd /Users/josechain/lbplanner && for a in "var CampaignsScreen = function CampaignsScreen(_ref_camp) {" "var _cFilter=useState('')" "Export All" "      cModal&&React.createElement(Modal,{"; do printf '%-62s -> ' "$a"; grep -cF "$a" LifeBusinessPlanner2026.html; done
```
Los cuatro tienen que dar `1`. El de `cModal` está verificado en la línea 18288 con **seis espacios de sangría y sin espacios alrededor de `&&`** — así se escriben los modales de esta pantalla. Si alguno no da 1, leer el final del `return` de `CampaignsScreen` (`sed -n '18286,18300p'`) y ajustar al texto real. El modal tiene que quedar **dentro** del `React.createElement('div', null, ...)` que devuelve la pantalla, no después.

- [ ] **Step 2: Aplicar y verificar sintaxis**

```bash
cd /Users/josechain/lbplanner && cp LifeBusinessPlanner2026.html /tmp/lbp_antes_v537.html && python3 patch_campanas_ui.py && node --test tests/*.test.mjs 2>&1 | tail -8
```
Esperado: `node --check PASSED` y todos los tests anteriores siguen pasando. Si falla, `cp /tmp/lbp_antes_v537.html LifeBusinessPlanner2026.html`.

- [ ] **Step 3: Verificar los nombres que usa el componente**

El componente usa `useState`, `useEffect`, `Modal`, `CAMP_STATUSES`, `React`, `localStorage`. Confirmar que están en alcance en ese punto del archivo:

```bash
cd /Users/josechain/lbplanner && node -e "
const fs=require('fs');
const h=fs.readFileSync('LifeBusinessPlanner2026.html','utf8');
const pos=h.indexOf('var CampanasCorreo');
for (const n of ['var useState','var useEffect','var Modal =','function Modal','var CAMP_STATUSES']) {
  const i=h.indexOf(n);
  console.log(n, i>0 ? (i<pos ? 'OK (antes)' : 'PROBLEMA: definido despues') : 'no encontrado');
}
"
```
Esperado: `useState`, `useEffect` y `CAMP_STATUSES` antes del componente. `Modal` puede estar definido después si es una `function` izada — verificar cómo se declara y, si es `var Modal = function`, mover el componente después de `Modal` o referenciarlo en tiempo de render (ya lo hace: el modal se crea dentro de `CampaignsScreen`, que corre mucho después).

- [ ] **Step 4: Desplegar y probar en el navegador**

```bash
cd /Users/josechain/lbplanner && git add -A && git commit -m "App: tarjeta de confirmacion de campanas desde el correo (v5.37)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git push
```

Después, en el navegador. **El shell está cacheado por el service worker (SWR): la versión nueva aparece en el SEGUNDO refresh.** Si no aparece: consola → `caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))))` y recargar con `?cb=1`.

1. Abrir `https://josechain-eng.github.io/ibplanner/LifeBusinessPlanner2026.html` (ojo: repo `ibplanner`).
2. Confirmar `v5.37` al fondo del modal Cloud & Sync.
3. Ir a Campaigns → botón **📧 Del correo**.
4. **Abrir la consola ANTES** (regla del proyecto: la consola dice la causa en 2 segundos).
5. Verificar: carga, muestra las propuestas con los nombres reales de las tiendas, las citas aparecen en las de confianza media/baja, destildar baja el contador del botón, editar un descuento se refleja.
6. **Destildar TODO y darle Cancelar.** Confirmar en Campaigns que no se creó nada.
7. Recién entonces, marcar una sola y guardar. Verificar que apareció en el módulo con sus tiendas, líneas y descuentos.
8. Volver a abrir **📧 Del correo** y guardar la misma otra vez: tiene que decir `ya existia`, no duplicar.

- [ ] **Step 5: Verificar que no se tocó nada más**

```bash
cd /Users/josechain/lbplanner && curl -s "https://life-planner.josechain.workers.dev/sync?key=lbp_0mnvmyv9uh8wciya" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('campanas:', len(d.get('campaigns',[])), '| tareas:', len(d.get('tasks',[])), '| reuniones:', len(d.get('meetings',[])), '| clientes:', len(d.get('clients',[])), '| proyectos:', len(d.get('projects',[])))
for c in d.get('campaigns',[]):
    print(' ', c.get('origen','manual'), '|', c.get('status'), '|', c.get('name'), '|', len(c.get('franchises',[])), 'tiendas')
"
```
Esperado: `tareas: 113`, `reuniones: 38`, `clientes: 9`, proyectos sin cambio respecto a la línea base, y las campañas nuevas marcadas `origen: correo`. **Cualquier cambio en tareas o reuniones es un bug y hay que pararlo acá.**

- [ ] **Step 6: Commit del aviso push y cierre**

El spec pide un push: *«3 campañas nuevas detectadas en tus correos»*. Agregar al worker del briefing, dentro de `/ingest-campanas`, justo antes del `return new Response('OK ...')`:

```javascript
        // Aviso a Pepe de que hay campanas esperando revision. Va por el
        // service binding: desde otro Worker de la cuenta, la URL publica de
        // workers.dev devuelve 404.
        if (correos.length && env.LBP_SERVICE) {
          try {
            await env.LBP_SERVICE.fetch(new Request('https://lbp.internal/push-campanas', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ n: correos.length })
            }));
          } catch (err) { /* el aviso es secundario: la ingesta ya quedo guardada */ }
        }
```

Y en `/Users/josechain/lbplanner/worker.js`, junto a `/test-push`:

```javascript
    // POST /push-campanas  {n}  -> aviso a todos los devices registrados.
    // Lo llama el worker del briefing cuando el puente encontro campanas.
    if (p === '/push-campanas' && request.method === 'POST') {
      let n = 0;
      try { n = parseInt((await request.json()).n, 10) || 0; } catch (err) { n = 0; }
      if (!n) return json({ sent: 0, note: 'nada que avisar' });
      const registry = JSON.parse(await env.LBP_KV.get('synckeys_registry') || '[]');
      let sent = 0;
      for (const syncKey of registry) {
        const subs = JSON.parse(await env.LBP_KV.get('subs:' + syncKey) || '[]');
        for (const sub of subs) {
          try {
            await sendPush(sub, {
              title: '🏷 Campanas en tu correo',
              body: n + ' correo' + (n === 1 ? '' : 's') + ' de campana listo' + (n === 1 ? '' : 's') +
                    ' para revisar en Campaigns.',
              alarmId: 'camp_' + Date.now(), vibration: 'long'
            });
            sent++;
          } catch (err) { /* un device caido no frena a los demas */ }
        }
      }
      return json({ sent });
    }
```

Verificar y desplegar los dos:
```bash
cd /Users/josechain/lbplanner && node --check worker.js && LC_ALL=C grep -c '[^ -~]' worker.js && npx wrangler deploy
cd ~/Documents/Projects/Briefing\ Diario && node --check worker.js && node --test test_worker_campanas.mjs 2>&1|tail -4 && grep -A2 "\[triggers\]" wrangler.toml && npx wrangler deploy
```
`grep -c` del worker de LBP tiene que dar `0`; `crons` del briefing tiene que seguir `[]`.

Prueba fin a fin, con Outlook abierto:
```bash
cd ~/Documents/Projects/Briefing\ Diario/bridge && python3 ventura_bridge.py --campanas 2>&1 | grep -i campana
```
Esperado: el POST en 200 y **un push en el teléfono de Pepe**. Si no llega, `GET /push-log?key=lbp_0mnvmyv9uh8wciya` dice el error exacto.

```bash
cd /Users/josechain/lbplanner && git add worker.js && git commit -m "Worker: /push-campanas avisa cuando hay campanas por revisar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git push
cd ~/Documents/Projects/Briefing\ Diario && git add worker.js && git commit -m "Worker briefing: avisar a LB Planner tras ingerir campanas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Lo que queda afuera, igual que en el spec

El Excel adjunto (el módulo no llega a nivel prenda), escribir de vuelta al correo, y cualquier acción sobre el sistema de contabilidad.

## Verificado antes de entregar este plan

El código de este plan no está sólo escrito: se armó y se corrió en un sandbox el 14-oct, con los tests del propio plan.

- **34 pruebas de Python** (Tareas 1, 2 y 3) — OK.
- **18 pruebas del validador** (Tarea 5) — OK.
- **11 pruebas de `_campAplicar`** (Tarea 6) — OK.

Eso **encontró un error real en el primer conversor**: Word mete un `<p class=MsoNormal>` dentro de cada celda, así que convertir `</p>` en salto de línea desarmaba cada fila de tabla en varias líneas (2 de 8 pruebas en rojo). El conversor que quedó en el plan es la versión corregida, que procesa las tablas aparte. La tabla del correo del 11-may es justamente el caso que lo rompía.

Lo que **no** está verificado y sólo se puede comprobar corriéndolo: el AppleScript contra Outlook (Tarea 1 Step 1, Tarea 2 Step 5, Tarea 3 Step 6), los endpoints desplegados, la extracción con Claude, y la pantalla en el navegador. Cada uno tiene su paso con el comando y el resultado esperado.

## Lo que hay que verificarle a Pepe cuando esté todo

- Que las fechas de las 5 campañas conocidas quedaron como él las recuerda (es el único que puede confirmarlo).
- Que «la misma campaña» se identificó bien en la continuación del 14-jul. Si no, el spec ya lo anticipa: sale como nueva con confianza baja y él la destilda.
- Que el 5 o el 25, abriendo Outlook, le llega el push solo.
