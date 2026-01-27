# NexNum Infrastructure (AWS EC2 / VPS)

This directory contains the optimized infrastructure scripts for running the NexNum platform on a standard Linux VPS (like the **AWS Free Tier t3.micro**).

## 📁 Contents

- **[setup.sh](./setup.sh)**: One-click initialization script. Hardens the OS, configures 4GB Swap (essential for 1GB RAM), and installs Docker.
- **[deploy.sh](./deploy.sh)**: Fast GitOps-lite deployment script via SSH.

---

## 🚀 Quick Start (Production)

### 1. Provision Server
Launch a **Ubuntu 22.04 LTS** instance on AWS.
- Use **Free Tier** eligible instances (`t2.micro` or `t3.micro`).
- Open Ports: `22` (SSH), `80` (HTTP), `443` (HTTPS).

### 2. Initialize Server
SSH into your server and run the setup directly from your repo:
```bash
git clone https://github.com/FlashTheFire/NexNum.git
cd NexNum/nexnum-app
chmod +x infra/setup.sh
sudo ./infra/setup.sh
```

### 3. Deploy Updates
From your local machine or GitHub Actions:
```bash
./infra/deploy.sh user@host.ip
```

---

## ⚙️ How it Works
NexNum runs as a unified stack via **Docker Compose**.
- **Caddy**: Manages SSL and routes traffic.
- **App**: Next.js Standalone build.
- **MeiliSearch**: Search Engine.
- **Redis**: Caching & Rate Limiting.

See the root `README.md` for the full architecture diagram.
