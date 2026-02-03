#!/bin/bash

# ==============================================================================
# NexNum Unified Server Management Script (AWS & VPS)
# Strategy: Senior-Grade Production Orchestration & Reliability
# ==============================================================================

set -e

# Configuration
PROJECT_NAME="nexnum"
BACKUP_DIR="/var/backups/nexnum"
LOG_FILE="/var/log/nexnum-deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

usage() {
    echo "Usage: $0 {setup|deploy|archive|restore|backup-db|restore-db} [options]"
    echo ""
    echo "Commands:"
    echo "  setup [--aws]     Hardening, swap, and docker installation"
    echo "  deploy            Full zero-downtime container rollout"
    echo "  archive           Snapshot Redis/MeiliSearch volumes"
    echo "  restore [path]    Restore volume snapshots"
    echo "  backup-db         Create PostgreSQL dump"
    echo "  restore-db [path] Restore PostgreSQL dump"
    exit 1
}

# --- COMMANDS ---

cmd_setup() {
    log "🚀 Starting Environment Setup..."
    
    # 1. Swap Management
    if [ ! -f /swapfile ]; then
        log "💾 Creating 4GB Swap for stability..."
        sudo fallocate -l 4G /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
        sudo swapon /swapfile
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi

    # 2. Kernel Tuning
    log "🔧 Applying production-grade sysctl optimizations..."
    sudo sysctl -w vm.overcommit_memory=1
    echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf > /dev/null
    
    if [[ "$*" == *"--aws"* ]]; then
        log "☁️  Applying AWS-specific optimizations (Disable THP)..."
        sudo bash -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled' || true
    fi

    # 3. Docker Installation
    if ! [ -x "$(command -v docker)" ]; then
        log "🐳 Installing Docker Engine..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
    fi

    log "🛡️  Configuring security (Fail2Ban)..."
    sudo apt-get update -y && sudo apt-get install -y fail2ban
    sudo systemctl enable fail2ban && sudo systemctl start fail2ban

    log "✅ Setup Complete. Please relogin to apply groups."
}

cmd_deploy() {
    log "🚢 Initiating Production Rollout..."
    
    if [ ! -f .env ]; then
        error ".env file missing. Cannot deploy."
    fi

    # Build and restart with minimum downtime
    log "📦 Building and starting core services..."
    sudo docker compose up -d --build --remove-orphans nexnum-app nexnum-worker redis meilisearch caddy

    # Database Sync
    log "💎 Running Database Automigrations..."
    sudo docker exec nexnum-app npx prisma db push --accept-data-loss

    log "✨ System is LIVE."
}

cmd_archive() {
    log "📦 Archiving stateful volumes..."
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    FILE="nexnum_snapshot_${TIMESTAMP}.tar.gz"
    mkdir -p "$BACKUP_DIR"

    docker compose stop redis meilisearch
    docker run --rm \
        -v nexnum_redis_data:/v_redis \
        -v nexnum_meili_data:/v_meili \
        -v "$BACKUP_DIR":/backup \
        busybox tar -czf "/backup/$FILE" -C / v_redis v_meili
    docker compose start redis meilisearch
    
    log "✅ Archive saved to: $BACKUP_DIR/$FILE"
}

cmd_restore() {
    [ -z "$1" ] && error "Restore path required."
    log "📥 Restoring volumes from $1..."
    
    docker compose stop redis meilisearch
    docker run --rm \
        -v nexnum_redis_data:/v_redis \
        -v nexnum_meili_data:/v_meili \
        -v "$(realpath "$1")":/backup.tar.gz \
        busybox sh -c "rm -rf /v_redis/* /v_meili/* && tar -xzf /backup.tar.gz -C /"
    docker compose start redis meilisearch
    
    log "✅ Restoration complete."
}

cmd_backup_db() {
    log "🗄️  Dumping PostgreSQL state..."
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    FILE="nexnum_db_${TIMESTAMP}.sql.gz"
    mkdir -p "$BACKUP_DIR"

    # Extraction via Docker App instance (assumes DATABASE_URL in env)
    docker exec nexnum-app sh -c "pg_dump \$DATABASE_URL | gzip" > "$BACKUP_DIR/$FILE"
    log "✅ Database backup saved to: $BACKUP_DIR/$FILE"
}

# Entrypoint
case "$1" in
    setup) cmd_setup "${@:2}" ;;
    deploy) cmd_deploy ;;
    archive) cmd_archive ;;
    restore) cmd_restore "$2" ;;
    backup-db) cmd_backup_db ;;
    *) usage ;;
esac
