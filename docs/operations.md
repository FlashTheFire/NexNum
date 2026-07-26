# Operations Manual

Runbooks for maintaining the NexNum platform in production.

## 🚀 Release Checklist

Before promoting `staging` to `production`:

### 1. Code Logic
- [ ] No `console.log` or debug traces allowed.
- [ ] All new DB schemas have a migration file.
- [ ] Sensitive logic (Payments) is covered by idempotency tests.

### 2. Infrastructure
- [ ] `npm run build` passes locally (Windows Check).
- [ ] Docker image builds successfully.
- [ ] Environment variables (`.env.production`) are synced on the VPS.

### 3. Monitoring
- [ ] Verify Prometheus is scraping `/api/metrics`.
- [ ] Check Sentry for new error spikes.

---

## ⚡ Performance Tuning

### Database (PostgreSQL)
- **Index Health**: Ensure `PurchaseOrder` and `WalletTransaction` have indexes on `userId` and `createdAt`.
- **Connections**: Set `connection_limit` so `pg_bouncer` doesn't choke. Recommended: 50.

### Redis
- **Eviction Policy**: Ensure `maxmemory-policy` is `volatile-lru` (for cache) or `noeviction` (for queues).
- **Latency**: Use `redis-cli --latency` to check for network drag.

### Node.js / Next.js
- **Memory**: Runs on 1GB RAM instances. Set `NODE_OPTIONS="--max-old-space-size=512"` to prevent GC thrashing if memory is tight.
- **Workers**: `nexnum-worker` should run as a single instance to avoid polling race conditions (though strict locking handles it, single instance is safer for simple setups).

---

## 🚨 Incident Response

### Scenario: "Providers Failing" (Circuit Breaker Open)
**Symptom**: API returns `E_PROVIDER_ERROR` or `503`.
**Fix**:
1.  Check `ProviderHealthLog` in DB.
2.  If upstream is down, the system auto-heals after 5 minutes.
3.  **Manual Override**: Update `Provider` table `isActive: false` to force routing to backup providers.

### Scenario: "Worker Stuck"
**Symptom**: SMS not arriving, "Received" status never triggers.
**Fix**:
1.  Restart the container: `docker compose restart nexnum-worker`.
2.  Check logs: `docker logs nexnum-worker`.

### Scenario: "High Purchase Failure Rate" (SEV-1)
**Investigation**:
1.  Check Grafana "Transactions" panel. Is it all providers or one?
2.  If **One Provider**: Check Circuit Breaker status. Disable provider in Admin Panel temporarily.
3.  If **All Providers**: Check Database connection, Wallet Balance, and API latency.

---

## 💾 Backup & Recovery Procedures

### 1. Automated Backups
NexNum uses a daily cron-based backup system.
- **Location**: `scripts/backup-db.sh`
- **Features**: GZIP compression, 30-day retention, optional S3 upload.

**Cron Setup (2 AM daily):**
```bash
0 2 * * * /path/to/nexnum-app/scripts/backup-db.sh >> /var/log/nexnum-backup.log 2>&1
```

### 2. Manual Recovery
To restore from a compressed SQL dump:
```bash
# 1. Unzip
gunzip -c backup_YYYY-MM-DD.sql.gz > restore.sql

# 2. Restore
psql -h <HOST> -U <USER> -d <DB_NAME> -f restore.sql
```
