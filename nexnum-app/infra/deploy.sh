#!/bin/bash
set -e

# ==============================================================================
# NexNum Professional Deployment Script
# Usage: ./deploy.sh [user@host] [--with-monitoring]
# ==============================================================================

TARGET=$1
WITH_MONITORING=false

if [ -z "$TARGET" ]; then
    echo "Usage: ./deploy.sh [user@host] [--with-monitoring]"
    exit 1
fi

if [[ "$*" == *"--with-monitoring"* ]]; then
    WITH_MONITORING=true
fi

SSH_OPTS="-o StrictHostKeyChecking=no"
if [ ! -z "$SSH_KEY" ]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

echo "🚀 Deploying NexNum to $TARGET..."

# 1. Sync necessary files
echo "📦 Syncing core configuration..."
scp $SSH_OPTS docker-compose.prod.yml Caddyfile .env.production $TARGET:~/nexnum-app/

if [ "$WITH_MONITORING" = true ]; then
    echo "📊 Syncing monitoring configuration..."
    ssh $SSH_OPTS $TARGET "mkdir -p ~/nexnum-app/monitoring"
    scp -r $SSH_OPTS monitoring/* $TARGET:~/nexnum-app/monitoring/
fi

# 2. Remote execution
echo "⚡ Executing remote commands..."
ssh $SSH_OPTS $TARGET << EOF
    cd ~/nexnum-app
    
    # Pull latest images
    docker compose -f docker-compose.prod.yml pull
    
    # Restart core stack
    echo "🔄 Restarting core application..."
    docker compose -f docker-compose.prod.yml up -d --remove-orphans
    
    # Optional Monitoring stack
    if [ "$WITH_MONITORING" = true ]; then
        echo "👁️  Restarting observability stack..."
        docker compose -f docker-compose.prod.yml -f monitoring/docker-compose.monitoring.yml up -d --remove-orphans
    fi
    
    # Cleanup
    echo "🧹 Cleaning up old images..."
    docker image prune -f
EOF

echo "✨ Deployment successful!"
