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

# 3. KERNEL TUNING (Redis/Production Stability)
echo "🔧 [NEXNUM] Applying Kernel optimizations..."
if [[ $(cat /proc/sys/vm/overcommit_memory) -ne 1 ]]; then
    sudo sysctl -w vm.overcommit_memory=1
    echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf > /dev/null
fi
# Disable THP for Redis if present (Advanced Tuning)
sudo bash -c 'echo never > /sys/kernel/mm/transparent_hugepage/enabled' || true

# 4. DOCKER CHECK
if ! [ -x "$(command -v docker)" ]; then
    echo "🐳 [NEXNUM] Docker not found. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ [NEXNUM] Docker installed. You may need to logout and login again."
fi

# 5. ENVIRONMENT VALIDATION
if [ ! -f .env ]; then
    echo "❌ [NEXNUM] Error: .env file missing. Please create it from .env.example"
    exit 1
fi

# 6. DEEP CLEANUP (Optional)
if [[ "$*" == *"--prune"* ]]; then
    echo "🧹 [NEXNUM] Performing deep Docker cleanup..."
    sudo docker system prune -a --volumes -f
fi

# 7. PRODUCTION ORCHESTRATION
echo "📦 [NEXNUM] Orchestrating core services..."
sudo docker compose up -d --build app worker socket-server meilisearch redis caddy

# 8. MONITORING STACK (Agile Activation)
FREE_RAM=$(free -m | awk '/^Mem:/{print $7}')
if [ $FREE_RAM -gt 500 ]; then
    echo "🟢 [NEXNUM] RAM Health OK ($FREE_RAM MB). Activating monitoring..."
    sudo docker compose --profile monitoring up -d
else
    echo "⚠️ [NEXNUM] Conservative Mode: Monitoring stack remains offline (RAM: $FREE_RAM MB)."
fi

# 9. DATABASE SYNC & PRISMA (Senior-Level Integration)
echo "💎 [NEXNUM] Synchronizing Database Schema..."
# Safety Check: Fix users preferred_currency NULL values if they block sysnc
sudo docker exec nexnum-app npx prisma db execute --stdin <<SQL
UPDATE users SET preferred_currency = 'INR' WHERE preferred_currency IS NULL;
SQL

sudo docker exec nexnum-app npx prisma db push --accept-data-loss

echo "✨ [NEXNUM] Deployment Complete. Application is live on port 80."
echo "🔗 Infrastructure Dashboard: http://$(curl -s ifconfig.me):3100"
