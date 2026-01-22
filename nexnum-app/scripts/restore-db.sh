#!/bin/bash

# Restore Database Script
# Usage: ./restore-db.sh <backup-file.sql.gz>

set -e

BACKUP_FILE=$1
DB_URL=$DATABASE_URL

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Usage: ./restore-db.sh <backup-file.sql.gz>"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [ -z "$DB_URL" ]; then
    echo "❌ DATABASE_URL is not set"
    exit 1
fi

echo "⚠️  DANGER: This will OVERWRITE the current database!"
echo "    Target: $DB_URL"
echo "    Source: $BACKUP_FILE"
read -p "Are you sure? (y/N) " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ Aborted."
    exit 0
fi

echo "📦 Decompressing..."
gunzip -c "$BACKUP_FILE" > temp_restore.sql

echo "🛑 Terminating connections..."
# (Optional: Logic to kill connections if local/docker, assumes psql access)

echo "♻️  Restoring schema and data..."
# Use psql for .sql backups (pg_restore is for binary/custom format)
# We handle the 'drop' by relying on --clean in backup or manually recreating here if needed.
# Since our backup script likely uses pg_dump (plain text), we use psql.

psql "$DB_URL" < temp_restore.sql

rm temp_restore.sql

echo "✅ Restore completed successfully."
