#!/usr/bin/env bash
# Backup do banco (pg_dump) e dos arquivos enviados (tar de STORAGE_DIR).
# Destino: BACKUP_BUCKET (S3, via aws cli) ou, sem bucket, BACKUP_LOCAL_DIR.
# Retenção: apaga backups com mais de BACKUP_RETENTION_DAYS dias (padrão 14).
# Variáveis do Postgres: PGHOST, PGUSER, PGPASSWORD, PGDATABASE (ou DATABASE_URL).
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-./backups}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

DB_FILE="$WORK/db-$STAMP.dump"
FILES_FILE="$WORK/storage-$STAMP.tar.gz"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --no-owner --file="$DB_FILE" "$DATABASE_URL"
else
  pg_dump --format=custom --no-owner --file="$DB_FILE"
fi
if [ -d "$STORAGE_DIR" ]; then
  tar -czf "$FILES_FILE" -C "$STORAGE_DIR" .
else
  tar -czf "$FILES_FILE" --files-from /dev/null
fi

if [ -n "${BACKUP_BUCKET:-}" ]; then
  command -v aws >/dev/null || { echo "backup: aws cli não encontrado" >&2; exit 1; }
  PREFIX="s3://${BACKUP_BUCKET#s3://}"
  aws s3 cp "$DB_FILE" "$PREFIX/db-$STAMP.dump" --only-show-errors
  aws s3 cp "$FILES_FILE" "$PREFIX/storage-$STAMP.tar.gz" --only-show-errors
  CUTOFF="$(date -u -d "-$RETENTION days" +%Y-%m-%dT%H:%M:%S)"
  aws s3api list-objects-v2 --bucket "${BACKUP_BUCKET#s3://}" \
    --query "Contents[?LastModified<'$CUTOFF' && (starts_with(Key,'db-') || starts_with(Key,'storage-'))].Key" \
    --output text | tr '\t' '\n' | while read -r key; do
      [ -n "$key" ] && [ "$key" != "None" ] && aws s3 rm "$PREFIX/$key" --only-show-errors
    done
  echo "backup: $STAMP enviado para $PREFIX"
else
  mkdir -p "$LOCAL_DIR"
  mv "$DB_FILE" "$LOCAL_DIR/db-$STAMP.dump"
  mv "$FILES_FILE" "$LOCAL_DIR/storage-$STAMP.tar.gz"
  find "$LOCAL_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) \
    -mtime "+$RETENTION" -delete
  echo "backup: $STAMP gravado em $LOCAL_DIR"
fi
