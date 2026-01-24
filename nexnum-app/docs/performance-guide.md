# Performance Optimization Guide

Overview of caching strategies, database optimization, and performance best practices for the NexNum platform.

---

## 1. Caching Strategy (Redis)

### Architecture
We use a multi-layer caching strategy powered by Redis:
- **Cache-Aside**: Used for database entities (`cacheGet` helper)
- **TTL-Based**: Expiry set based on volatility
- **Stampede Protection**: Basic protection via single-flight fetching (future optimization)

### Key Cache Patterns

| Data Type | Cache Key Pattern | TTL | Strategy |
|-----------|------------------|-----|----------|
| **Prices** | `cache:prices:{provider}:{country}:{service}` | 60s | Short TTL for dynamic pricing |
| **Countries** | `cache:countries:{provider}` | 1h | Stable reference data |
| **Services** | `cache:services:{provider}` | 1h | Stable reference data |
| **User Balance** | `cache:balance:{userId}` | 30s | Frequent updates, high consistency need |
| **Auth Session** | `session:{id}` | 15m | Security critical, slide on access |

### Optimization Tips
1. **Use `cacheGet`**: Always use the helper to ensure consistent error handling and metrics.
2. **Bulk Fetch**: Use `cacheGetMultiple` for lists to avoid N+1 network calls.
3. **Invalidation**: Invalidate related keys on mutation (e.g., clear balance cache on purchase).

---

## 2. Database Optimization

### Connection Pooling
- **Production**: Max 10 connections per container
- **Timeouts**: 30s idle, 10s connection timeout
- **Scaling**: Use PgBouncer if scaling beyond 50 containers

### Query Best Practices
1. **Select Fields**: Always use `select` in Prisma to fetch only needed columns.
   ```typescript
   // ✅ Good
   prisma.user.findUnique({ where: { id }, select: { id: true, email: true } })
   // ❌ Bad
   prisma.user.findUnique({ where: { id } })
   ```

2. **Indexes**: Ensure indexes exist for all foreign keys and query filters.
   - `Activation`: `userId`, `numberId`, `providerActivationId`, `status`
   - `Transaction`: `userId`, `type`, `createdAt`

3. **Batching**: Use `Promise.all` or Prisma's batching for parallel queries.

---

## 3. Rate Limiting

### Tiers & Limits

| Scope | Limit | Window | Store |
|-------|-------|--------|-------|
| **API** | 1000 | 60s | Redis Sliding Window |
| **Auth** | 600 | 60s | Redis Sliding Window |
| **Admin** | 100 | 60s | Redis Sliding Window |
| **Ops** | 10 | 10s | Fixed Window (Atomic) |

### optimization
- **Fail Open**: If Redis is down, rate limits fail open (= allow request) to prevent downtime.
- **Atomic Operations**: Lua scripts ensure race-condition-free counting.

---

## 4. Frontend Performance (Vercel/Next.js)

1. **Image Optimization**: Use `next/image` requires explicit width/height.
2. **Dynamic Imports**: Lazy load heavy admin components.
3. **Edge Caching**: Use suitable `Cache-Control` headers for public API responses.

---

## 5. Monitoring Checklist

Before high-traffic events:
- [ ] Check Redis memory usage (<70%)
- [ ] Check DB active connections (<80% max)
- [ ] Review Sentry for rising error trends
- [ ] Verify auto-scaling limits in AWS ECS
