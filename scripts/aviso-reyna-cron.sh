#!/bin/bash
# Aviso único a Reyna: 09:01 de Buenos Aires = 12:01 UTC (el servidor corre en UTC).
# El script decide solo si corresponde avisar; si ya no queda nada pendiente, calla.
cd /root/whatsaas || exit 1
export NODE_OPTIONS="--conditions=react-server"
/usr/bin/npx tsx --env-file=/root/whatsaas/.env \
  /root/whatsaas/scripts/aviso-reyna-modo-noelia.mts \
  >> /var/log/aviso-reyna.log 2>&1
