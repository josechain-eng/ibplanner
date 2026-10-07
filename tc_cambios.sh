#!/bin/bash
# ¿A qué hora cambió el tipo de cambio oficial?
# Lee el registro de cambios del worker life-planner y lo muestra en hora de Bolivia.
# El worker refresca cada 30 min, así que la hora tiene ese margen de error.
curl -s -A "Mozilla/5.0" https://life-planner.josechain.workers.dev/dailyinfo-log \
| python3 -c '
import sys, json
from datetime import datetime, timedelta, timezone

BOL = timezone(timedelta(hours=-4))   # Bolivia es UTC-4 todo el ano, sin horario de verano
d = json.load(sys.stdin)

def bo(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(BOL)

camb = d.get("cambios") or []
print("=" * 64)
print("CAMBIOS DEL TIPO DE CAMBIO OFICIAL  (hora de Bolivia)")
print("=" * 64)
if not camb:
    print("Todavia no se registro ningun cambio.")
else:
    for c in camb:
        print("%s   %5.2f -> %5.2f   cotizacion del %s" % (
            bo(c["t"]).strftime("%a %d-%b %H:%M"),
            c["de"], c["a"], c.get("fecha") or "?"))
    horas = sorted(bo(c["t"]).hour for c in camb)
    print("-" * 64)
    print("franja: entre las %02d:00 y las %02d:59" % (horas[0], horas[-1]))
    print("->", "CONSISTENTE, siempre la misma franja" if horas[-1] - horas[0] <= 2
               else "IRREGULAR, no cae siempre a la misma hora")

log = d.get("log") or []
print()
print("Refrescos en el log: %d." % d.get("count", 0), end=" ")
if log:
    ult = bo(log[0]["t"])
    mins = (datetime.now(BOL) - ult).total_seconds() / 60
    print("Ultimo hace %.0f min (%s)." % (mins, ult.strftime("%H:%M")))
    print("Cron:", "OK" if mins < 45 else "*** PARECE DETENIDO ***")
'
