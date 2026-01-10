# Incident Response Runbook

## Severity Levels
- **SEV-1 (Critical)**: Purchasing is down, Data loss risk, Security breach.
- **SEV-2 (High)**: High error rates (>5%), Provider outage, Latency > 5s.
- **SEV-3 (Warning)**: Single provider failing, Scheduled tasks delayed.

## Scenarios

### 1. High Purchase Failure Rate (SEV-1)
**Trigger**: Alert `HighPurchaseFailureRate` fires (>10% fail rate).
**Investigation**:
1.  Check Grafana "Transactions" panel. Is it all providers or one?
2.  If **One Provider**:
    *   Check `DynamicProvider` logs. Look for `429` or `5xx`.
    *   Check Circuit Breaker status (Logs: `Circuit OPEN`).
    *   **Action**: Disable provider in Admin Panel temporarily to route traffic elsewhere.
3.  If **All Providers**:
    *   Check Database connection (`kubectl logs deployment/nexnum-app`).
    *   Check Wallet Balance (User wallets empty?).
    *   **Action**: Restart pods if stuck. Scale up DB if CPU high.

### 2. Stuck Reservations (SEV-2)
**Trigger**: Alert `StuckReservations` fires (>50 pending).
**Investigation**:
1.  Check `Reconciliation Worker` logs. Is it running?
2.  Force run: `curl -X POST $API_URL/api/cron/reconcile -H "Authorization: Bearer $CRON_SECRET"`.
3.  If DB locks are high, check for long-running transactions in Postgres:
    ```sql
    SELECT * FROM pg_stat_activity WHERE state = 'active' AND duration > 1000;
    ```

### 3. Provider Circuit Breaker OPEN (SEV-3)
**Trigger**: Logs show `Circuit OPEN for [ProviderName]`.
**Context**: Automation has paused requests to this provider for 15s.
**Action**:
*   Do NOT manually close unless you verify provider is healthy.
*   Monitor. It should auto-recover (HALF-OPEN -> CLOSED).
*   If it flaps (Open/Closed repeatedly), disable provider configuration.

### 4. Outbox Worker Lag (SEV-3)
**Trigger**: `OutboxProcessingFailed` alert.
**Investigation**:
1.  Check `process-outbox` logs.
2.  Common cause: Redis down (if using Redis) or Event Payload invalid.
3.  Retry handling is automatic. If `retryCount` > 5, investigate specific event.

## Emergency Commands

### Flush Redis Locks
If a generic lock (e.g. valid-purchase) is stuck:
```bash
redis-cli DEL "lock:purchase:*"
```

### Force Provider Disable (SQL)
```sql
UPDATE "providers" SET "is_active" = false WHERE "name" = 'bad_provider';
```
