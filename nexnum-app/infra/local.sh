#!/bin/bash

# ==============================================================================
# NexNum Local Development Bootstrapper
# Strategy: Instant-On Containerized Development
# ==============================================================================

set -e

# Configuration
PROJECT_NAME="nexnum-dev"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[LOCAL] $1${NC}"
}

usage() {
    echo "Usage: $0 {up|down|clean|logs}"
    echo ""
    echo "Commands:"
    echo "  up      Start infra and worker in background"
    echo "  down    Stop all local services"
    echo "  clean   Remove all volumes and restart"
    echo "  logs    Tail all logs"
    exit 1
}

if ! [ -x "$(command -v docker)" ]; then
    echo "❌ Error: Docker is not installed or running."
    exit 1
fi

case "$1" in
    up)
        log "🚀 Launching Local Infrastructure..."
        if [ ! -f .env ]; then
            log "⚠️  No .env found. Creating from .env.example..."
            cp .env.example .env
        fi
        docker compose up -d redis meilisearch nexnum-worker
        log "✅ Infrastructure is running. Run 'npm run dev' for the frontend."
        ;;
    down)
        log "🛑 Stopping local services..."
        docker compose down
        ;;
    clean)
        log "🧹 Deep Cleaning environment..."
        docker compose down -v
        docker compose up -d redis meilisearch nexnum-worker
        ;;
    logs)
        docker compose logs -f
        ;;
    *)
        usage
        ;;
esac
