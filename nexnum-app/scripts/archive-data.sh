#!/bin/bash

# ==============================================================================
# NexNum Full-Stack Data Archival Script
# Strategy: Isomorphic Volume Snapshoting (Sidecar Architecture)
# ==============================================================================

set -e

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_NAME="nexnum_migration_${TIMESTAMP}.tar.gz"

echo "📦 [NEXNUM] Starting Full-Stack Data Archival..."

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# 1. STOP CONTAINERS (Ensures data consistency)
echo "🛑 [NEXNUM] Stopping data services to ensure consistency..."
docker compose stop redis meilisearch

# 2. PERFORM SNAPSHOT (Using a busybox sidecar)
echo "📸 [NEXNUM] Creating snapshots of self-hosted volumes..."
docker run --rm \
    -v nexnum-app_redis_data:/volume_redis \
    -v nexnum-app_meili_data:/volume_meili \
    -v "$(pwd)/$BACKUP_DIR":/backup \
    busybox \
    tar -czf "/backup/$ARCHIVE_NAME" -C / volume_redis volume_meili

# 3. RESTART CONTAINERS
echo "🚀 [NEXNUM] Restarting data services..."
docker compose start redis meilisearch

echo "✅ [NEXNUM] Archival Complete!"
echo "📄 Snapshot Location: $BACKUP_DIR/$ARCHIVE_NAME"
echo "💡 To migrate: Copy this file to your new server and run restore-data.sh"
