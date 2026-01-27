# Security Architecture & Best Practices

## 1. Authentication & Authorization

### JWT Architecture
- **HttpOnly Cookies**: We do not store tokens in `localStorage` to prevent XSS theft.
- **Refresh Rotation**: Access tokens live for 15 minutes. Refresh tokens live for 7 days but rotate on every use (Reuse Detection).
- **Role Enforcement**: `requireAdmin(req)` throws `E_FORBIDDEN` immediately if the JWT payload lacks `role: 'ADMIN'`.

## 2. Secrets Management

### Development
Stored in `.env` (gitignored).

### Production (VPS)
Stored in `.env.production` on the server.
**Permissions**: File permission must be `600` (Owner read/write only).

```bash
chmod 600 .env.production
```

### Required Secrets
| Key | Purpose |
| :--- | :--- |
| `DATABASE_URL` | Connection string to Postgres. |
| `REDIS_URL` | Connection string to Redis. |
| `JWT_SECRET` | 32+ char random string for signing. |
| `ENCRYPTION_KEY` | 32-byte hex for database field encryption (API Keys). |

## 3. Rate Limiting (DDoS Protection)

NexNum implements a multi-tier rate limiter backed by Redis.

| Tier | Limit | Window |
| :--- | :--- | :--- |
| **Standard User** | 100 req | 1 min |
| **Admin** | 1000 req | 1 min |
| **Auth Routes** | 5 req | 1 min |

## 4. Financial Integrity (Audit)

### The "Double Ledger"
We do not simply update `User.balance`.
1.  **WalletTransaction**: Immutable log of credit/debit.
2.  **PurchaseOrder**: Immutable log of intent validation.
3.  **FinancialAudit**: Separate log for compliance events (e.g. "Admin adjusted balance by $50").
