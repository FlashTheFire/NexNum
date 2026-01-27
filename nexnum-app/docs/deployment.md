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
3.  **Security**: Do NOT open port 3000 or 6379 to the internet.

### Initialization Script
We have automated the hardening process. Connect via SSH and run:

```bash
# Clone Repo
git clone https://github.com/FlashTheFire/NexNum.git
cd NexNum/nexnum-app

# Run Setup Wizard
# - Creates 4GB Swap (Prevents OOM on 1GB RAM)
# - Installs Docker & Compose
# - Configures Fail2ban
sudo ./infra/vps/setup.sh
```

## 2. Configuration (`.env.production`)

Create the production environment file:

```bash
cp .env.example .env.production
nano .env.production
```

**Critical Variables**:
```ini
NODE_ENV=production
DATABASE_URL="postgres://user:pass@host:5432/db"
REDIS_URL="redis://redis:6379"
MEILI_HOST="http://meilisearch:7700"
DOMAIN_NAME="api.yourdomain.com"
```

## 3. Deployment Workflow ("GitOps Lite")

We use a simple "Pull & Restart" strategy which is robust and requires zero external CI/CD complexity (though GitHub Actions is supported).

### Option A: Manual Deploy (SSH)
```bash
./infra/vps/deploy.sh localhost
```

### Option B: GitHub Actions (Automated)
Push to `main`. The `.github/workflows/deploy.yml` pipeline will:
1.  SSH into your VPS.
2.  Pull the latest code.
3.  Execute `deploy.sh`.

*Requires `VPS_HOST`, `VPS_USER`, `VPS_KEY`, `ENV_PRODUCTION` secrets in GitHub.*

## 4. Troubleshooting

### Logs
View logs for all services:
```bash
docker compose -f docker-compose.prod.yml logs -f
```
View specific service:
```bash
docker compose -f docker-compose.prod.yml logs -f nexnum-api
```

### "JavaScript Heap Out of Memory"
If the build fails on t2.micro:
1.  Ensure Swap is active: `free -h` (Should show 4GiB Swap).
2.  Re-run setup if needed: `sudo ./infra/vps/setup.sh`.

### SSL Issues
Caddy handles SSL automatically. To debug:
```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```
*Note: Ensure your Domain DNS A-Record points to the VPS IP.*
