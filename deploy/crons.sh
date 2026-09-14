#!/usr/bin/env bash
# Registra en PM2 todas las tareas periódicas de WhatsPro.
#
# Cada script es un disparador mínimo: le pega a /api/cron/... con
# `Authorization: Bearer $CRON_SECRET`. El trabajo real lo hace la aplicación,
# así que estas tareas no necesitan la base ni el repo compilado, sólo llegar a
# APP_URL. Si no las registrás, la aplicación funciona pero NADA automático
# ocurre: ni mensajes programados, ni recordatorios, ni publicaciones.
#
# Uso:
#   cd /root/whatsaas/deploy && ./crons.sh
#
# Requiere APP_URL y CRON_SECRET; se leen del .env del repo si no están en el
# entorno. PM2 se instala con `npm i -g pm2` y se persiste con `pm2 save`.

set -euo pipefail

REPO="${REPO_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO"

if [ -f .env ]; then
  APP_URL="${APP_URL:-$(grep -E '^APP_URL=' .env | cut -d= -f2- || true)}"
  CRON_SECRET="${CRON_SECRET:-$(grep -E '^CRON_SECRET=' .env | cut -d= -f2- || true)}"
  BASE_URL_ENV="$(grep -E '^BASE_URL=' .env | cut -d= -f2- || true)"
fi

# La app se sirve en 127.0.0.1:3000: los crons entran por ahí y no salen a
# internet ni dependen del certificado.
APP_URL="${APP_URL:-http://localhost:3000}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "✖ Falta CRON_SECRET (ponelo en el .env del repo). Sin eso las rutas de cron responden 401."
  exit 1
fi

echo "▸ APP_URL=$APP_URL   (dominio público: ${BASE_URL_ENV:-sin BASE_URL})"

registrar() {
  local nombre="$1" script="$2" cron="$3"
  pm2 delete "$nombre" >/dev/null 2>&1 || true
  APP_URL="$APP_URL" CRON_SECRET="$CRON_SECRET" \
    pm2 start "$REPO/scripts/$script" --name "$nombre" --cron "$cron" --no-autorestart
  echo "  ✓ $nombre  ($cron)"
}

# nombre                   script                      cron          qué hace
registrar scheduled-messages-cron  send-scheduled.js          "* * * * *"    # mensajes programados
registrar notifications            notifications.js           "* * * * *"    # avisos push/WhatsApp
registrar sales-ops-radar          sales-ops-radar.js         "*/2 * * * *"  # respuestas nuevas del radar
registrar publish-social           publish-social.js          "*/2 * * * *"  # publicaciones de FB/IG
registrar audio-insights           audio-insights.js          "*/10 * * * *" # transcripción de audios
registrar social-comments          social-comments.js         "*/10 * * * *" # comentarios de FB/IG
registrar sales-ops-classify       sales-ops-classify.js      "*/15 * * * *" # clasificación de chats
registrar aapp-sync                aapp-sync.js               "0 */12 * * *" # sincronía con aapp.space
registrar sales-ops-housekeeping   sales-ops-housekeeping.js  "15 4 * * *"   # limpieza diaria
registrar sync-meta-ads            sync-meta-ads.js           "17 6 * * *"   # métricas de Meta Ads
registrar membership-reminders     membership-reminders.js    "30 9 * * *"   # avisos de vencimiento

pm2 save
echo
echo "✔ Tareas registradas. Ver con: pm2 list    Registro de una: pm2 logs <nombre>"
echo "  Para que sobrevivan a un reinicio del servidor: pm2 startup   (y seguir la instrucción que imprime)"
