# NexNum Production Deployment Guide
**Target:** AWS EC2 (Ubuntu LTS) managed by a local Coolify instance  
**Domain:** `nx1.in` (you own) with sub‑domain `socket.nx1.in`  
**Stack:** Next.js app, Node worker, Socket.IO server, PostgreSQL, Redis, Meilisearch, Traefik (via Coolify)

---

## Table of Contents
1. [Prerequisites](#prerequisites)  
2. [EC2 Provisioning](#ec2-provisioning)  
3. [DNS Setup](#dns-setup)  
4. [Add EC2 to Coolify](#add-ec2-to-coolify)  
5. [Create Coolify Project](#create-coolify-project)  
6. [Environment Variables](#environment-variables)  
7. [Domain Mapping in Coolify](#domain-mapping-in-coolify)  
8. [Deploy & Verify](#deploy--verify)  
9. [Optional Post‑Deploy Steps](#optional-post-deploy-steps)  
10. [Troubleshooting Quick Reference](#troubleshooting-quick-reference)  

---

## Prerequisites
- **AWS account** with permission to launch EC2, allocate Elastic IP, and edit security groups.  
- **Domain `nx1.in`** registered (Hostinger or any registrar).  
- **Coolify** installed and running locally (on your Windows 11 machine via WSL2/Docker Desktop or a separate VM).  
- **GitHub repository**: `FlashTheFire/NexNum` (push access).  
- **Supabase project** (PostgreSQL) – obtain `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_DIRECT`.  
- **OpenSSL** (or similar) to generate strong random secrets.  
- **Basic CLI tools**: `ssh`, `dig`/`nslookup`, `curl`.

---

## EC2 Provisioning
Launch an Ubuntu LTS EC2 instance that will host the Docker containers.

| Setting | Value |
|---------|-------|
| **Name / Tag** | `nexnum-production` (or any) |
| **AMI** | Ubuntu Server **22.04 LTS** (HVM‑SSD) **x86_64** *(or 24.04 LTS – both work)* |
| **Instance Type** | **t3.medium** (2 vCPU, 4 GiB RAM) – recommended MVP; t3.small works only with tight memory monitoring |
| **Storage** | **40 GB gp3** (SSD) – root volume; encrypted optional |
| **VPC / Subnet** | Default VPC (or your own) – AZ in `ap-south-1` (Mumbai) |
| **Key Pair** | Create/new: `nexnum-key.pem` (download & keep safe) |
| **Security Group** | Name: `nexnum-sg`<br>Inbound rules:<br>• SSH (port – **My IP (recommended))<br>• HTTP (80) – 0.0.0.0/0<br>• HTTPS (443) • SSH (22) – **My IP** (or 0.0.0.0/0 for simplicity)<br>• HTTP (80) – 0.0.0.0/0<br>• HTTPS (443) – 0.0.0.0/0 |
| **IAM Role** | None (default) |
| **Shutdown behavior** | Stop |
| **Termination protection** | Disabled (can enable later) |
| **Elastic IP** | Allocate **immediately after launch** and attach to the instance (replace auto‑assigned public IP). Note the Elastic IP – you’ll need it for DNS. |
| **Docker Engine** (optional pre‑install) | Not required – Coolify will install it during server validation, but you can run:<br>`sudo apt update && sudo apt install -y ca-certificates curl gnupg lsb-release`<br>`sudo mkdir -p /etc/apt/keyrings`<br>`curl -fsSL https://download.docker.com/linux/ubuntu/gpg \| sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg`<br>`echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable\" \| sudo tee /etc/apt/sources.list.d/docker.list`<br>`sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin`<br>`sudo usermod -aG docker $USER` (log out/in or `newgrp docker`) |

**Verify after launch**  
```bash
chmod 400 ~/Downloads/nexnum-key.pem
ssh -i ~/Downloads/nexnum-key.pem ubuntu@<ELASTIC_IP>
# you should see a prompt like: ubuntu@ip-...:~$
```

---

## DNS Setup
Point your domain and sub‑domain to the Elastic IP.

In Hostinger (or your DNS provider) → **Manage DNS records** for `nx1.in`:

| Type | Name (Host) | Value (points to) | TTL |
|------|-------------|-------------------|-----|
| A    | `@` (or leave blank) | `<ELASTIC_IP>` | 300 s |
| A    | `socket`   | `<ELASTIC_IP>` | 300 s |
| CNAME| `www`      | `nx1.in`        | 300 s *(optional)* |

*Delete any existing AAAA record for `@` unless you have assigned an IPv6 address to the EC2.*

After saving, verify:
```bash
dig +short nx1.in
dig +short socket.nx1.in
```
Both should return your Elastic IP.

---

## Add EC2 to Coolify
1. Open Coolify UI → **Servers** → **Add Server**.  
2. Fill in:  
   - **Name:** `nexnum-ec2` (or any)  
   - **Host:** `<ELASTIC_IP>`  
   - **Port:** `22`  
   - **Username:** `ubuntu`  
   - **Authentication:** **Private key** – paste the contents of the `.pem` file you downloaded (or upload the key).  
3. Click **Validate**. Coolify will SSH in, check that Docker is available (installing it if needed), and mark the server **Online**.

---

## Create Coolify Project
1. In Coolify → **Projects** → **Add Project**.  
2. Set:  
   - **Project name:** `nexnum` (or any)  
   - **Repository:** `FlashTheFire/NexNum` (HTTPS or SSH URL – give Coolify a token with `repo` scope)  
   - **Branch:** `main` (or desired branch)  
   - **Build context:** `nexnum-app/` *(important: the compose file lives inside this sub‑folder)*  
   - **Deployment type:** **Docker Compose**  
   - **Compose file:** leave blank (Coolify auto‑detects `docker-compose.yml` in the build context)  
   - **Environment:** (we’ll fill in the next step)  
   - **Domains:** (we’ll set per‑service later)  
   - **Auto‑deploy on push:** *(optional) enable if you want every `git push` to trigger a redeploy – copy the webhook URL Coolify provides and add it to GitHub → Settings → Webhooks.*  

Click **Create Project**. Coolify will clone the repo and wait for environment variables and domain mapping.

---

## Environment Variables
In the Coolify project → **Settings → Environment Variables**, add the following (generate strong random strings with `openssl rand -hex 32` where indicated). Never commit these values; they live only in Coolify.

| Variable | Value (example) | Notes |
|----------|----------------|-------|
| `DATABASE_URL` | `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=4` | From Supabase → Settings → Database → Connection string (use **Session pooler** on port 5432 — not the transaction pooler on 6543. `connection_limit=4` keeps the three services — app/worker/socket — under Supabase's 15-connection session-mode cap.) |
| `DIRECT_URL` | `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres` | Same as above, port 5432 |
| `DATABASE_URL_DIRECT` | Same as `DIRECT_URL` | (duplicate for compatibility) |
| `REDIS_PASSWORD` | `<32‑byte‑hex>` | Use the same value in `REDIS_URL` |
| `MEILISEARCH_API_KEY` | `<32‑byte‑hex>` | |
| `JWT_SECRET` | `<32‑byte‑hex>` | |
| `ENCRYPTION_KEY` | `<32‑byte‑hex>` | |
| `NEXTAUTH_SECRET` | `<32‑byte‑hex>` | |
| `SMS_FINGERPRINT_SECRET` | `<32‑byte‑hex>` | |
| `FINGERPRINT_SALT` | `<32‑byte‑hex>` | |
| `CSRF_SECRET` | `<32‑byte‑hex>` | |
| `ADMIN_API_KEY` | `<32‑byte‑hex>` | |
| `NEXT_PUBLIC_APP_URL` | `https://nx1.in` | Must match the domain you will use for the frontend |
| `NEXTAUTH_URL` | `https://nx1.in` | Same as above (Needed for NextAuth) |
| `NEXT_PUBLIC_SOCKET_URL` | `wss://socket.nx1.in` | **Important:** use the **socket** sub‑domain; keep the `wss://` scheme |
| `NODE_ENV` | `production` | |
| `GEMINI_API_KEYS` | `"key1,key2,key3"` (your actual Gemini keys, comma‑separated, **quoted** as a string) | Required for the AI config assistant |
| *(At least one SMS provider key – e.g. `FIVESIM_API_KEY`)* | `<your‑key>` | Without an SMS provider the core “rent‑a‑number” flow won’t actually send OTPs. |
| `OUTBOX_WORKER_ENABLED` | `true` | Already the default; keep unless you deliberately want to disable outbound SMS processing. |
| `ENABLE_MOCK_PROVIDER`, `DEBUG`, `MAINTENANCE_MODE`, `ENABLE_HEALTH_MONITORING` | `false` (default) | Leave as‑is for MVP. |

*Tip:* Copy the block below into Coolify’s “Environment Variables” textarea (one per line) and replace the placeholders:

```
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=4
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
DATABASE_URL_DIRECT=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
REDIS_PASSWORD=YOUR_32BYTE_HEX_REDIS_PASS
MEILISEARCH_API_KEY=YOUR_32BYTE_HEX_MEILI_KEY
JWT_SECRET=YOUR_32BYTE_HEX_JWT_SECRET
ENCRYPTION_KEY=YOUR_32BYTE_HEX_ENC_KEY
NEXTAUTH_SECRET=YOUR_32BYTE_HEX_NEXTAUTH_SECRET
SMS_FINGERPRINT_SECRET=YOUR_32BYTE_HEX_FINGERPRINT_SECRET
FINGERPRINT_SALT=YOUR_32BYTE_HEX_FINGERPRINT_SALT
CSRF_SECRET=YOUR_32BYTE_HEX_CSRF_SECRET
ADMIN_API_KEY=YOUR_32BYTE_HEX_ADMIN_API_KEY
NEXT_PUBLIC_APP_URL=https://nx1.in
NEXTAUTH_URL=https://nx1.in
NEXT_PUBLIC_SOCKET_URL=wss://socket.nx1.in
NODE_ENV=production
GEMINI_API_KEYS="key1,key2,key3"
FIVESIM_API_KEY=YOUR_FIVESIM_KEY   # (or whichever SMS provider you use)
OUTBOX_WORKER_ENABLED=true
```

Save the variables. Coolify will automatically inject them into each container at runtime.

---

## Domain Mapping in Coolify (Traefik Routing)
Coolify creates a Traefik router for each service you expose.

1. Go to **Project → Services**. You should see: `nexnum-app`, `nexnum-worker`, `nexnum-socket`, `redis`, `meilisearch`.  
   *(Redis and Meilisearch have no exposed ports – they are internal only.)*

2. **nexnum-app**  
   - Click the service → **Domain** tab.  
   - **Domain:** `nx1.in`  
   - (Optionally add `www.nx1.in` as an alias – Coolify will automatically forward it to the same container.)  
   - Save. Traefik will issue a Let’s Encrypt certificate for `nx1.in` (and `www.nx1.in` if added) and route HTTP(S) traffic to port 3000 inside the container.

3. **nexnum-socket**  
   - Domain tab → **Domain:** `socket.nx1.in`  
   - Save. Traefik will issue a cert for the socket sub‑domain and forward traffic to port 3951 inside the container.

4. **(Optional) Worker** – No domain needed; it’s internal only.

5. **Healthchecks** – Already configured in the compose file:  
   - App: `curl -f http://localhost:3000/api/health`  
   - Socket: `curl -f http://localhost:3951/health`  
   - Worker: uses `pgrep node` (process check) – no external port needed.  
   - Redis & Meili: use their native healthchecks.

After saving the domains, click **Deploy** (or wait for auto‑deploy if you enabled it). Coolify will:

* Pull the latest code (if any).  
* Re‑build images if Dockerfiles changed.  
* Start the stack with the env vars you supplied.  
* Trigger Traefik to request/renew TLS certificates for the two domains.

You can watch the logs in Coolify → **Project → Logs** to verify everything boots without error.

---

## Deploy & Verify
Once the deploy finishes:

| Check | Command / Action | Expected Result |
|-------|------------------|-----------------|
| **Frontend loads** | Open browser → `https://nx1.in` | Next.js UI loads (landing page / login). |
| **Health endpoint** | `curl -s https://nx1.in/api/health` | `{"status":"ok"}` |
| **Socket health** | `curl -s https://socket.nx1.in/api/health` | `{"status":"ok"}` (or similar) |
| **Socket.IO connection** | Open browser devtools → Network → WS → should see a connection attempt to `wss://socket.nx1.in` (or a 400 if not yet connected via JS – that’s expected). |
| **Docker ps (via SSH)** | `ssh -i ~/Downloads/nexnum-key.pem ubuntu@<ELASTIC_IP> docker ps` | You should see containers for `nexnum-app`, `nexnum-worker`, `nexnum-socket`, `redis`, `meilisearch`, and the Traefik proxy launched by Coolify. |
| **Logs** | In Coolify → Project → Logs (or `docker logs <container>` via SSH) | No crash loops; services start successfully. |

If any of the above fails, consult the **Troubleshooting Quick Reference** below.

---

## Optional Post‑Deploy Steps
Once the MVP is stable, consider adding:

1. **Uptime Kuma** (external monitoring)  
   - In Coolify → Services → Add Service → Choose **Uptime Kuma** (one‑click).  
   - Add two monitors: `https://nx1.in` and `https://socket.nx1.in`.  

2. **Automated Backups** (daily)  
   - **PostgreSQL:** `pg_dump -Fc -h localhost -U postgres -d postgres > /backup/db_$(date +%F).dump`  
   - **Redis:** `redis-cli bgsave` then copy the dump file.  
   - **Meilisearch:** Use the snapshot API (`/snapshots`) via a cron job.  
   - Upload the artifacts to an S3 bucket (AWS CLI or SDK).  

3. **Grafana + Prometheus** (deeper metrics)  
   - Deploy Prometheus (scrape `https://nx1.in/api/metrics`) and Grafana via Coolify’s custom service or Docker compose.  

4. **Scale Up**  
   - Monitor `docker stats`. If memory usage consistently > 80 % of 4 GiB, stop the instance, change type to `t3.large` (2 vCPU, 8 GiB RAM), start again. No config changes needed.  

5. **Enable UFW with Docker helper** (optional host firewall)  
   ```bash
   sudo apt install -y ufw
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   # To avoid Docker bypassing UFW:
   sudo apt install -y ufw-docker
   sudo ufw-docker install
   ```

---

## Troubleshooting Quick Reference
| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **502 Bad Gateway** (Traefik) | App container crashed or not started | Check Coolify service logs for `nexnum-app`; look for Node.js errors (missing env, DB connection). Fix env vars or redeploy. |
| **Socket client fails to connect (websocket error)** | Wrong `NEXT_PUBLIC_SOCKET_URL` or socket service unhealthy | Verify URL matches exactly `wss://socket.nx1.in` (no trailing slash). Check `nexnum-socket` logs for startup errors. Ensure healthcheck passes. |
| **Meilisearch OOM kills container** | Memory cap missing or set too low | Confirm compose has `MEILI_ENV: production` and `deploy.resources.limits.memory: 512M` (or lower). |
| **Worker marked unhealthy continuously** | Still using broken HTTP healthcheck | Verify worker healthcheck is `test: ["CMD", "pgrep", "node"]` (we fixed it). If old compose, edit and redeploy. |
| **Login/NextAuth loop** | `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL` mismatch with actual domain | Both must be `https://nx1.in` (or `http://` if you deliberately disabled TLS). Also ensure cookies are set with correct domain – NextAuth handles this automatically if URLs match. |
| **Data never refreshes after SMS received** | Socket disabled or not receiving Redis stream | If socket disabled, rely on visibility‑based refresh (minimize/restore browser window). If enabled, confirm `nexnum-socket` logs show `sms.received` events arriving from the worker (worker should publish to Redis channel/stream). |
| **Let’s Encrypt cert not issuing** | DNS not resolving to EC2 IP, or port 80/443 blocked | Double‑check A records, wait a few minutes for propagation, confirm security group allows inbound 80/443 from `0.0.0.0/0`. |
| **High memory usage on t3.medium** | Burst credits exhausted (if you switched to limited mode) | Ensure instance is in **Unlimited** mode (default). You can see CPU Credit Balance in EC2 monitoring; if constantly zero, consider upgrading to `t3.large` or enabling Unlimited. |
| **Permission denied when accessing volumes** | Container user mismatch | The Dockerfiles create dedicated non‑root users (`nextjs`, `worker`, `socket`). Ensure volume permissions allow those users (the compose file sets proper ownership). |

---

## TL;DR – One‑Page Checklist
```
[ ] Launch EC2 t3.medium Ubuntu 22.04 LTS (or 24.04), 40GB gp3, SG 22/80/443, Elastic IP attached.
[ ] DNS: A @ → <EIP>, A socket → <EIP>, (optional) CNAME www → nx1.in.
[ ] Add EC2 to Coolify (SSH with ubuntu + .pem key).
[ ] Create Coolify project: repo FlashTheFire/NexNum, build context nexnum-app/, deployment type Docker Compose.
[ ] Set environment variables (secrets via openssl rand -hex 32, URLs pointing to nx1.in and socket.nx1.in).
[ ] Map domains: nexnum-app → nx1.in, nexnum-socket → socket.nx1.in.
[ ] Deploy → verify https://nx1.in and https://socket.nx1.in work, healthchecks ok.
[ ] (Optional) Add Uptime Kuma, set up backups, monitor logs, scale to t3.large if needed.
```

Follow these steps and you’ll have a clean, reproducible NexNum deployment managed entirely from your local Coolify instance, with TLS handled automatically by Traefik and your domain `nx1.in` fully operational. 🚀

--- 

*Generated on 2026‑07‑15.*