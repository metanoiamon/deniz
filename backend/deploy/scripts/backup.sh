#!/usr/bin/env bash
# Backs up the database and the uploaded images into backups/, and keeps the last KEEP_DAYS days.
#
#   bash deploy/scripts/backup.sh            (from the project folder, or from anywhere: it finds the project)
#
# Nightly with cron (crontab -e as the project's user), 03:30:
#   30 3 * * * cd /home/arvin/deniz-api && mkdir -p backups && bash deploy/scripts/backup.sh >> backups/backup.log 2>&1
#
# Restore a database backup (stop the API first: sudo systemctl stop deniz-api):
#   pg_restore --clean --if-exists --no-owner -d "postgresql://deniz:PASSWORD@localhost:5432/deniz" backups/db-YYYYMMDD-HHMMSS.dump
# Restore images:
#   tar -xzf backups/uploads-YYYYMMDD-HHMMSS.tar.gz
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"
KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_DIR="$PROJECT_DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f .env ]]; then
	echo "backup: .env not found in $PROJECT_DIR" >&2
	exit 1
fi

# DATABASE_URL is read from .env as text, not by sourcing the file: a password with $ or ` in it must not be run
# by the shell. Prisma's own parameters (?schema=…&connection_limit=…) are removed: pg_dump does not know them.
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"
if [[ -z "$DATABASE_URL" ]]; then
	echo "backup: DATABASE_URL is missing in .env" >&2
	exit 1
fi
PG_URL="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

DB_FILE="$BACKUP_DIR/db-$STAMP.dump"
# custom format: compressed, and pg_restore can restore single tables from it
pg_dump --format=custom --no-owner --file="$DB_FILE.part" "$PG_URL"
mv "$DB_FILE.part" "$DB_FILE"

UPLOADS_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
if [[ -d uploads ]]; then
	tar -czf "$UPLOADS_FILE.part" uploads
	mv "$UPLOADS_FILE.part" "$UPLOADS_FILE"
fi

# keep the last KEEP_DAYS days; never delete when the new backup is not there
if [[ -s "$DB_FILE" ]]; then
	find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
fi

echo "backup: $(date '+%F %T') $(du -h "$DB_FILE" | cut -f1) database → $DB_FILE${UPLOADS_FILE:+, images → $UPLOADS_FILE}"
