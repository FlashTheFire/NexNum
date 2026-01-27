#!/bin/bash

# ==============================================================================
# NexNum Full-Stack Data Restoration Script
# Strategy: Isomorphic Volume Ingestion (Sidecar Architecture)
# ==============================================================================

set -e

# Configuration
BACKUP_DIR="./backups"

echo "📥 [NEXNUM] Starting Full-Stack Data Restoration..."

# Check if an archive was provided
if [ -z "$1" ]; then
    # Look for the latest backup if no argument is provided
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/nexnum_migration_*.tar.gz 2>/dev/null | head -n 1)
    if [ -z "$LATEST_BACKUP" ]; then
        echo "❌ [NEXNUM] Error: No backup archive found in $BACKUP_DIR"
        echo "Usage: $0 [path_to_archive.tar.gz]"
        exit 1
    fi
    ARCHIVE_PATH="$LATEST_BACKUP"
else
    ARCHIVE_PATH="$1"
fi

echo "📦 [NEXNUM] Using archive: $ARCHIVE_PATH"

# 1. STOP CONTAINERS
echo "🛑 [NEXNUM] Stopping target services..."
docker compose stop redis meilisearch

# 2. PERFORM RESTORATION (Sidecar approach)
echo "💉 [NEXNUM] Injecting data into Docker volumes..."
docker run --rm \
    -v nexnum-app_redis_data:/volume_redis \
    -v nexnum-app_meili_data:/volume_meili \
    -v "$(realpath "$ARCHIVE_PATH")":/backup/archive.tar.gz \
    busybox \
    sh -c "rm -rf /volume_redis/* /volume_meili/* && tar -xzf /backup/archive.tar.gz -C /"

# 3. RESTART CONTAINERS
echo "🚀 [NEXNUM] Restarting services..."
docker compose start redis meilisearch

echo "✅ [NEXNUM] Restoration Complete!"
echo "✨ Your self-hosted Redis and Meilisearch data is now 100% recovered."
