# Phase 6: Verification Test Plans for P0/P1 Fixes

> **Scope**: 6 fixes across wallet, sentinel, V1 auth, test dispenser, DynamicProvider, MeiliSearch
> **Goal**: Prove each fix works via unit, integration, and contract tests

---

## 1. Wallet Idempotency Keys (P0)

**Files**: `nexnum-app/src/lib/wallet/wallet.ts`

### Unit Tests
| ID | Scenario | Expected |
|----|----------|----------|
| W-01 | `reserve()` with same `idempotencyKey` twice | 2nd call returns existing reservation, no double-charge |
| W-02 | `commit()` with unknown idempotency key | Creates new commit (no dedup, key only for reserve) |
| W-03 | `rollback()` with same `idempotencyKey` twice | 2nd call is no-op, returns success |
| W-04 | `charge()` with same `idempotencyKey` twice | 2nd call returns existing transaction |
| W-05 | `refund()` with same `idempotencyKey` twice | 2nd call returns existing refund |
| W-06 | `credit()` / `debit()` with same key | 2nd call dedups via `walletTransaction.idempotencyKey` unique index |
| W-07 | Concurrent `reserve()` same key (2 parallel requests) | DB unique constraint wins, one succeeds, one gets existing |

### Integration Tests
| ID | Flow | Assertions |
|----|------|------------|
| W-INT-01 | `getNumber` → provider fails → rollback | Wallet balance unchanged, `WalletService.rollback` called with correct idempotency key |
| W-INT-02 | `setStatus -1` (cancel) → refund | `WalletService.refund` called with `v1_refund_<numberId>` idempotency key |
| W-INT-03 | Purchase → commit → retry commit (idempotent) | Balance deducted once, single `walletTransaction` row |

### E2E Contract Test (V1 API)
```bash
# Reserve idempotency: call getNumber twice rapidly with same correlation
curl -X POST /stubs/handler_api.php \
  -d "api_key=$KEY&action=getNumber&service=1&country=2" \
  -d "api_key=$KEY&action=getNumber&service=1&country=2"
# Both should return ACCESS_NUMBER with same activationId
```

---

## 2. Sentinel Atomic Checkpoint Updates (P0)

**Files**: `nexnum-app/src/lib/wallet/sentinel.ts`, `nexnum-app/src/lib/metrics.ts`

### Unit Tests
| ID | Scenario | Expected |
|----|----------|----------|
| S-01 | `updateCheckpoint()` succeeds | `ledgerChecksum` incremented, `ledgerChecksumAt` = now, metric `wallet_sentinel_checkpoint_total{outcome="success"}` +1 |
| S-02 | `updateCheckpoint()` DB error | Exception thrown (no try/catch), metric NOT incremented |
| S-03 | `verifyIntegrity()` with 0 delta transactions | Returns `true`, drift = 0, metric `wallet_sentinel_status` = 0 |
| S-04 | `verifyIntegrity()` with drift > 0.01 | Returns `false`, user banned, metric `wallet_sentinel_drift_total` set, `wallet_sentinel_status` = 1 |
| S-05 | `verifyIntegrity()` DB error | Throws `AppError(500, SYSTEM_UNKNOWN)`, metric NOT set (fail-closed) |

### Integration Tests
| ID | Flow | Assertions |
|----|------|------------|
| S-INT-01 | `WalletService.reserve` → commit → `verifyIntegrity` | Checkpoint advanced, delta = 0, integrity healthy |
| S-INT-02 | Direct DB balance tamper + `verifyIntegrity` | Drift detected, user banned, audit log written, socket revoked |
| S-INT-03 | Concurrent transactions (5 parallel reserves) | Each advances checkpoint atomically, final checksum = sum of amounts |

### Metrics Verification
```promql
# Checkpoint success rate
rate(wallet_sentinel_checkpoint_total{outcome="success"}[5m]) 
/ rate(wallet_sentinel_checkpoint_total[5m]) == 1

# Drift alert
wallet_sentinel_drift_total > 0.01
```

---

## 3. V1 Auth HTTP Semantics (P0)

**Files**: `nexnum-app/src/lib/api/api-middleware.ts` (lines 179-267)

### Unit Tests
| ID | Input | Expected Status | Expected Body |
|----|-------|-----------------|---------------|
| V1A-01 | No `api_key` anywhere | 401 | `NO_KEY` |
| V1A-02 | Invalid/expired key | 403 | `BAD_KEY` |
| V1A-03 | Valid key, rate limited | 429 | `RATE_LIMIT_EXCEEDED` + rate headers |
| V1A-04 | Valid key, no perms | 403 | `BAD_KEY` (per `requirePerm` behavior) |
| V1A-05 | Valid key + perms | 200 | Handler response |

### Integration Tests (via `withV1Auth` wrapper)
| ID | Endpoint | Setup | Assert |
|----|----------|-------|--------|
| V1A-INT-01 | `GET /stubs/handler_api.php?api_key=bad&action=getBalance` | Invalid key | 403, body `BAD_KEY` |
| V1A-INT-02 | `GET /stubs/handler_api.php?action=getBalance` | No key | 401, body `NO_KEY` |
| V1A-INT-03 | `POST /stubs/handler_api.php` (form `api_key=valid`) | Valid key, `numbers` perm | 200, `ACCESS_BALANCE:100.00` |
| V1A-INT-04 | Rate limit burst (61 req/min on FREE) | Valid FREE key | 429 on 61st, `RATE_LIMIT_EXCEEDED` |

### Regression Guard
```typescript
// tests/v1-auth-http-semantics.test.ts
it('NEVER returns 200 on auth failure', async () => {
  const res = await app.inject({ method: 'GET', url: '/stubs/handler_api.php?action=getBalance' })
  expect(res.statusCode).not.toBe(200)
  expect(['NO_KEY', 'BAD_KEY', 'RATE_LIMIT_EXCEEDED']).toContain(res.body)
})
```

---

## 4. Test Dispenser Hardening (P0)

**Files**: `nexnum-app/src/app/api/keys/test/route.ts`

### Unit Tests
| ID | Scenario | Expected |
|----|----------|----------|
| TD-01 | `NODE_ENV=production` | 404, `Endpoint disabled` |
| TD-02 | `ENABLE_TEST_KEY_DISPENSER != 'true'` | 404 |
| TD-03 | Missing CSRF header | 403, `CSRF validation failed` |
| TD-04 | Body > 1KB (`content-length: 2000`) | 413, `Request body too large` |
| TD-05 | Valid CSRF + small body + auth | 200, new key returned, old keys deleted |
| TD-06 | Redis cache invalidation on key delete | `redis.del` called for each old key |

### Integration Tests
| ID | Flow | Assertions |
|----|------|------------|
| TD-INT-01 | Login → CSRF → POST /api/keys/test | `deletedPreviousKeys > 0`, `rawKey` present once |
| TD-INT-02 | Call twice rapidly | 2nd call returns different key, 1st key revoked |

---

## 5. DynamicProvider Accessor Registry (P1)

**Files**: `nexnum-app/src/lib/providers/dynamic-provider.ts` (lines ~598-950)

### Unit Tests (Accessor Registry)
| ID | Accessor | Input | Expected Output |
|----|----------|-------|-----------------|
| DP-01 | `$first` | `[{a:1},{a:2}]` | `{a:1}` |
| DP-02 | `$last` | `[1,2,3]` | `3` |
| DP-03 | `$sum` | `[1,2,3]` | `6` |
| DP-04 | `$avg` | `[2,4,6]` | `4` |
| DP-05 | `$min` / `$max` | `[5,1,9]` | `1` / `9` |
| DP-06 | `$count` | `['a','b']` | `2` |
| DP-07 | `$lowercase` | `'HELLO'` | `'hello'` |
| DP-08 | `$uppercase` | `'hello'` | `'HELLO'` |
| DP-09 | `$trim` | `'  hi  '` | `'hi'` |
| DP-10 | `$slice:0:2` | `[1,2,3,4]` | `[1,2]` |
| DP-11 | `$slice:-2` | `[1,2,3,4]` | `[3,4]` |
| DP-12 | `$replace:foo:bar` | `'foo foo'` | `'bar bar'` |
| DP-13 | `$pick:a,b` | `{a:1,b:2,c:3}` | `{a:1,b:2}` |
| DP-14 | `$omit:a` | `{a:1,b:2}` | `{b:2}` |
| DP-15 | `$merge` | `[{a:1},{b:2}]` | `{a:1,b:2}` |
| DP-16 | `$coalesce` | `[null, undefined, 5]` | `5` |
| DP-17 | `$int` | `'42'` | `42` (number) |
| DP-18 | `$float` | `'3.14'` | `3.14` |
| DP-19 | `$bool` | `'true'` / `'false'` / `0` | `true` / `false` / `false` |
| DP-20 | `$exists:field` | `{field: 'x'}` | `true` |
| DP-21 | `$eq:a:b` | `a='x', b='x'` | `true` |
| DP-22 | `$if:cond:then:else` | `cond=true` | `then` branch |
| DP-23 | Fallback chain `cost|price|amount` | `{price: 10}` | `10` |
| DP-24 | Unknown accessor | `$unknown` | `undefined` (falls through) |

### Integration Tests
| ID | Scenario | Assert |
|----|----------|--------|
| DP-INT-01 | `getPrices` with `$slice:0:5` on operator list | Returns max 5 operators |
| DP-INT-02 | `getBalance` with `$float` on string balance | Returns number |
| DP-INT-03 | Conditional mapping `$if:isActive:true:false` | Maps to correct boolean |
| DP-INT-04 | Provider response with nested `$first.$pick:id,name` | Extracts correctly |

---

## 6. MeiliSearch Server-Side Filtering in getPrices (P1)

**Files**: `nexnum-app/src/lib/api/v1-actions.ts` (actionGetPrices)

### Unit Tests (Mock MeiliSearch)
| ID | Mode | Filters | Facets Called | Hits Limit | Assertions |
|----|------|---------|---------------|------------|------------|
| MS-01 | Both (svc+cty) | `serviceId=1 AND countryId=2` | None | 100 | Operators map built, minCost/totalCount correct |
| MS-02 | Service only | `serviceId=1` | `countryId` | 500 | Countries map built, facet distribution used |
| MS-03 | Country only | `countryId=2` | `serviceId` | 500 | Services map built, facet distribution used |
| MS-04 | No filter | `isActive=true` | `serviceId` | 5000 | Full matrix, nested countries per service |

### Integration Tests (Real MeiliSearch)
| ID | Setup | Query | Expected Shape |
|----|-------|-------|----------------|
| MS-INT-01 | 3 services × 4 countries × 2 operators | `service=1&country=2` | `{ "1": { cost, count, operators: {...} } }` |
| MS-INT-02 | 10 services, 50 countries | `service=5` | `{ "5": { cost, count, countries: {...} } }` |
| MS-INT-03 | Empty index | any | `{}` |
| MS-INT-04 | Invalid numeric IDs | `service=abc` | `{}` (400 not returned, empty JSON per V1 contract) |

### Performance Benchmarks
| Metric | Before (5000 hits) | After (facet + limited hits) | Target |
|--------|-------------------|------------------------------|--------|
| Latency (p95) | ~450ms | ~80ms | <100ms |
| Network payload | ~2.5MB | ~150KB | <200KB |
| MeiliSearch CPU | High (full scan) | Low (facet + small hits) | 80% reduction |

---

## Test Execution Matrix

| Layer | Tool | Command |
|-------|------|---------|
| Unit | Vitest | `pnpm test:unit --run wallet/sentinel tests/wallet/*.test.ts tests/sentinel/*.test.ts tests/v1-auth/*.test.ts tests/dynamic-provider/*.test.ts tests/meilisearch/*.test.ts` |
| Integration | Vitest + Testcontainers (Postgres, MeiliSearch, Redis) | `pnpm test:integration --run tests/integration/*.test.ts` |
| E2E Contract | Vitest + Next.js test server | `pnpm test:e2e --run tests/e2e/v1-contract.test.ts` |
| Load | k6 | `k6 run tests/load/getprices.js` |

---

## Acceptance Criteria (All Must Pass)

| Fix | Criteria |
|-----|----------|
| Wallet Idempotency | Zero double-charges under 100 concurrent requests with same key |
| Sentinel Atomic | Checkpoint metric 100% success; drift detection triggers ban within 100ms |
| V1 Auth HTTP | No 200 on auth failure; 401/403/429 correct; wire format body preserved |
| Test Dispenser | 404 in prod; 413 on >1KB; CSRF before body read; old keys purged from Redis |
| DynamicProvider | All 60+ accessors unit-tested; fallback chains work; param syntax `$slice:0:2` works |
| MeiliSearch getPrices | p95 < 100ms; facet distribution used; no 5000-hit fallback in normal modes |

---

## Regression Detection (CI Gate)

```yaml
# .github/workflows/p0-p1-regression.yml
jobs:
  p0-p1-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit --run --reporter=verbose
      - run: pnpm test:integration --run
      - run: pnpm test:e2e --run
      - name: Load test getPrices
        run: k6 run tests/load/getprices.js --vus 50 --duration 30s
```

---

*Generated: Phase 6 of 7-phase audit*
*Next: Phase 7 - Documentation updates*