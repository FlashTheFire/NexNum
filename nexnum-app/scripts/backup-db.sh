#!/bin/bash
# =============================================================================
# NexNum Database Backup Script
# Run daily via cron: 0 2 * * * /path/to/backup-db.sh
# =============================================================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nexnum}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="nexnum_backup_${DATE}.sql.gz"

# Database connection (from environment)
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-nexnum}"
DB_USER="${DATABASE_USER:-nexnum}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Create backup with pg_dump
PGPASSWORD="$DATABASE_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-privileges \
    --format=plain \
    | gzip > "$BACKUP_DIR/$BACKUP_FILE"

# Verify backup was created
if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup created successfully: $BACKUP_FILE ($SIZE)"
else
    echo "[$(date)] ERROR: Backup failed!"
    exit 1
fi

# Cleanup old backups
echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "nexnum_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Count remaining backups
COUNT=$(find "$BACKUP_DIR" -name "nexnum_backup_*.sql.gz" | wc -l)
echo "[$(date)] Backup complete. Total backups: $COUNT"

# Optional: Upload to S3 (uncomment if needed)
# if [ -n "$AWS_S3_BUCKET" ]; then
#     echo "[$(date)] Uploading to S3..."
#     aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$AWS_S3_BUCKET/backups/$BACKUP_FILE"
#     echo "[$(date)] S3 upload complete."
# fi
