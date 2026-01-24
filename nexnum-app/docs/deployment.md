# Deployment Runbook

Production deployment guide for NexNum Backend API/Admin Service.

---

## Prerequisites

- Docker & Docker Compose
- Access to container registry
- PostgreSQL database provisioned
- Redis instance provisioned
- MeiliSearch instance (cloud or self-hosted)
- Secret manager access (production)

---

## Environment Configuration

### Development (.env)
```bash
cp .env.example .env
# Edit with development values
```

### Production (Secret Manager)
Production secrets should be stored in your secret manager:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- Provider API keys

---

## Build

### Docker Build
```bash
# Build production image
docker build -t nexnum-api:latest .

# Tag for registry
docker tag nexnum-api:latest your-registry/nexnum-api:v1.0.0
docker push your-registry/nexnum-api:v1.0.0
```

### Verify Build
```bash
# Test image locally
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="..." \
  -e REDIS_URL="..." \
  -e JWT_SECRET="..." \
  nexnum-api:latest

# Check health
curl http://localhost:3000/api/health
```

---

## Deploy to Staging

### 1. Update Configuration
Ensure staging secrets are configured in your secret manager.

### 2. Run Migrations
```bash
# Connect to staging DB
DATABASE_URL="staging_url" npx prisma migrate deploy
```

### 3. Seed Data
```bash
DATABASE_URL="staging_url" npx tsx scripts/seeds/run-all.ts
```

### 4. Deploy Container
```bash
# K8s example
kubectl apply -f infra/k8s/staging/

# Or docker-compose
docker-compose -f docker-compose.staging.yml up -d
```

### 5. Verify
```bash
# Health check
curl https://staging.nexnum.com/api/health

# Ready check (includes DB + Redis)
curl https://staging.nexnum.com/api/health/ready
```

---

## Promote to Production

### Pre-Flight Checklist
- [ ] Staging tests passed
- [ ] Database migrations tested
- [ ] Rollback migration prepared
- [ ] Monitoring alerts configured
- [ ] On-call notified

### 1. Database Backup
```bash
pg_dump $PROD_DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Run Migrations
```bash
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
```

### 3. Deploy
```bash
# K8s rolling update
kubectl set image deployment/nexnum-api \
  nexnum-api=your-registry/nexnum-api:v1.0.0

# Monitor rollout
kubectl rollout status deployment/nexnum-api
```

### 4. Verify
```bash
# Health endpoints
curl https://api.nexnum.com/api/health
curl https://api.nexnum.com/api/health/ready

# Smoke test
curl https://api.nexnum.com/api/v1/providers
```

### 5. Monitor
- Check Sentry for errors
- Check Prometheus metrics
- Monitor logs for 15 minutes

---

## Rollback

### Quick Rollback (Container)
```bash
# K8s
kubectl rollout undo deployment/nexnum-api

# Docker
docker-compose down
docker-compose -f docker-compose.yml.backup up -d
```

### Database Rollback
```bash
# Restore from backup
psql $PROD_DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql

# Or run down migration
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate resolve --rolled-back MIGRATION_NAME
```

---

## Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Basic liveness (always 200 if running) |
| `GET /api/health/ready` | Readiness (DB + Redis connected) |
| `GET /api/metrics` | Prometheus metrics |

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs nexnum-api

# Common issues:
# - Missing env vars
# - DB connection failed
# - Port already in use
```

### Database connection issues
```bash
# Test direct connection
psql $DATABASE_URL

# Check Prisma
npx prisma db pull
```

### Redis connection issues
```bash
# Test connection
redis-cli -u $REDIS_URL ping
```
