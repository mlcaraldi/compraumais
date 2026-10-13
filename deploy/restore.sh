#!/usr/bin/env bash
# Restaura um backup: restore.sh <db-AAAA.dump> [storage-AAAA.tar.gz]
# O banco de destino vem de DATABASE_URL (ou PG*); os arquivos vão para STORAGE_DIR.
# ATENÇÃO: apaga os schemas public, drizzle e pgboss do banco de destino antes de restaurar.
# Em produção, pare o app e o worker antes (docker compose stop app worker).
set -euo pipefail
DB_DUMP="${1:?uso: restore.sh <db.dump> [storage.tar.gz]}"
FILES_TAR="${2:-}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"

TARGET=()
[ -n "${DATABASE_URL:-}" ] && TARGET=(--dbname="$DATABASE_URL")

psql ${TARGET[@]+"${TARGET[@]}"} -v ON_ERROR_STOP=1 -q \
  -c "drop schema if exists public cascade; drop schema if exists drizzle cascade; drop schema if exists pgboss cascade; create schema public;"
pg_restore --no-owner --exit-on-error ${TARGET[@]+"${TARGET[@]}"} "$DB_DUMP"
if [ -n "$FILES_TAR" ]; then
  mkdir -p "$STORAGE_DIR"
  tar -xzf "$FILES_TAR" -C "$STORAGE_DIR"
fi
echo "restore: concluído"
