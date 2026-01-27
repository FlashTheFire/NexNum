#!/bin/bash
set -e

# ==============================================================================
# NexNum VPS Hardening & Setup
# Optimized for AWS Free Tier (1GB RAM)
# ==============================================================================

echo "🚀 Starting NexNum Infrastructure Setup..."

# 1. Update System
sudo apt-get update && sudo apt-get upgrade -y

# 2. Setup 4GB Swap (Critical for build/compile on t3.micro)
if [ ! -f /swapfile ]; then
    echo "💾 Creating 4GB Swap file..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Install Docker
if ! [ -x "$(command -v docker)" ]; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

# 4. Install Fail2Ban
echo "🛡️ Installing Fail2Ban for security..."
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

echo "✅ VPS Hardening Complete. Please log out and back in for Docker groups."
