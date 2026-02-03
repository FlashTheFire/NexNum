# Deployment Runbook (VPS / EC2)

This guide documents the "Professional Infrastructure" deployment strategy for NexNum, optimized for cost-efficiency (AWS Free Tier) and reliability.

## Infrastructure Architecture

**The "Smart Startup Stack"**
- **Compute**: AWS EC2 `t3.micro` (or DigitalOcean Droplet).
- **OS**: Ubuntu 22.04 LTS.
- **Orchestration**: Docker Compose (Single Host).
- **Gateway**: Caddy (Auto-HTTPS/SSL).
- **State**:
    - **App**: Stateless (Docker).
    - **DB**: External (Supabase Free Tier) OR Self-hosted Postgres (Docker).
    - **Cache**: Self-hosted Redis (Docker).
    - **Search**: Self-hosted MeiliSearch (Docker).

## 1. Initial Server Setup (One-Time)

### Provisioning
1.  Launch Ubuntu 22.04 Instance.
2.  Open Inbound Ports: `22` (SSH), `80` (HTTP), `443` (HTTPS).

### Initialization Script
We have automated the hardening process. Connect via SSH and run:

```bash
# Clone Repo
git clone https://github.com/FlashTheFire/NexNum.git
cd NexNum/nexnum-app

# Run Setup Wizard
# - Creates 4GB Swap
# - Installs Docker & Compose
# - Optimized Kernel Settings
sudo ./infra/server.sh setup
```

## 2. Configuration (`.env`)

Create the environment file:

```bash
cp .env.example .env
nano .env
```

## 3. Deployment Workflow

We use `server.sh` for a streamlined, one-command deployment.

### Manual Deploy (SSH)
```bash
./infra/server.sh deploy
```

## 4. Troubleshooting

### Logs
View logs for all services:
```bash
docker compose logs -f
```
View specific service:
```bash
docker compose logs -f nexnum-app
```

### "JavaScript Heap Out of Memory"
If the build fails on t2.micro:
1.  Ensure Swap is active: `free -h` (Should show 4GiB Swap).
2.  Re-run setup if needed: `sudo ./infra/vps/setup.sh`.

### SSL Issues
Caddy handles SSL automatically. To debug:
```bash
docker compose logs -f caddy
```
*Note: Ensure your Domain DNS A-Record points to the VPS IP.*
