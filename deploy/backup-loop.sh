#!/usr/bin/env bash
# Roda deploy/backup.sh todo dia às 02:00 (horário de Brasília). Usado pelo serviço `backup`.
set -uo pipefail
export TZ=America/Sao_Paulo
if [ -n "${BACKUP_BUCKET:-}" ] && ! command -v aws >/dev/null; then
  apt-get update -qq && apt-get install -y -qq awscli >/dev/null
fi
while true; do
  now=$(date +%s)
  next=$(date -d "today 02:00" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow 02:00" +%s)
  sleep $((next - now))
  bash /deploy/backup.sh || echo "backup: falhou" >&2
done
