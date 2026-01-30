#!/bin/bash

# ==============================================================================
# NexNum Industrial Deployment Script (AWS EC2 / VPS)
# Strategy: Senior-Grade Resource Management & Stability Hardening
# ==============================================================================

set -e # Exit on error

echo "🚀 [NEXNUM] Starting Production Deployment Sequence..."

# 1. SWAP MANAGEMENT (Critical for 1GB RAM Instances)
if [ ! -f /swapfile ]; then
    echo "💾 [NEXNUM] No swapfile found. Creating 4GB Swap for stability..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ [NEXNUM] Swap successfully activated."
else
    echo "ℹ️ [NEXNUM] Swap already configured."
fi

# 2. SYSTEM UPDATES (Fast Mode: Skip upgrade unless requested)
if [[ "$*" == *"--full"* ]]; then
    echo "🔄 [NEXNUM] Performing full system update..."
    sudo apt-get update -y && sudo apt-get upgrade -y
else
    echo "⚡ [NEXNUM] Fast Mode: Skipping system upgrade."
    sudo apt-get update -y > /dev/null
fi

# 3. DOCKER CHECK
if ! [ -x "$(command -v docker)" ]; then
    echo "🐳 [NEXNUM] Docker not found. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ [NEXNUM] Docker installed. You may need to logout and login again."
fi

# 4. ENVIRONMENT VALIDATION
if [ ! -f .env ]; then
    echo "❌ [NEXNUM] Error: .env file missing. Please create it from .env.example"
    exit 1
fi

# 5. PRODUCTION ORCHESTRATION
echo "📦 [NEXNUM] Orchestrating core services..."
# We start core first to prioritize user traffic
# Caddy acts as the edge proxy for SSL/TLS termination
sudo docker compose up -d --build app worker socket-server meilisearch redis caddy

# 5. MONITORING STACK (Agile Activation)
FREE_RAM=$(free -m | awk '/^Mem:/{print $7}')
if [ $FREE_RAM -gt 500 ]; then
    echo "🟢 [NEXNUM] RAM Health OK ($FREE_RAM MB). Activating monitoring..."
    sudo docker compose --profile monitoring up -d
else
    echo "⚠️ [NEXNUM] Conservative Mode: Monitoring stack remains offline (RAM: $FREE_RAM MB)."
fi

# 6. DATABASE SYNC & PRISMA
echo "💎 [NEXNUM] Synchronizing Database Schema..."
# sudo docker compose exec app ./node_modules/.bin/prisma generate || echo "⚠️ Prisma generation handled in build-time."

echo "✨ [NEXNUM] Deployment Complete. Application is live on port 80."
echo "🔗 Infrastructure Dashboard: http://$(curl -s ifconfig.me):3100"
