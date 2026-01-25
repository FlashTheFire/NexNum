# Secret Manager Migration Guide

Guide for migrating from `.env` files to a production secret manager.

---

## Overview

In production, secrets should be stored in a dedicated secret manager rather than environment files:

| Environment | Secret Storage |
|-------------|----------------|
| Development | `.env` file |
| Staging | Secret manager (same as prod) |
| Production | Secret manager |

---

## Supported Secret Managers

### AWS Secrets Manager (Recommended for AWS)

```bash
# Create secret
aws secretsmanager create-secret \
  --name nexnum/production \
  --secret-string '{"DATABASE_URL":"...", "JWT_SECRET":"..."}'

# Retrieve in app
aws secretsmanager get-secret-value --secret-id nexnum/production
```

**Integration:**
```typescript
import { SecretsManager } from '@aws-sdk/client-secrets-manager'

const client = new SecretsManager({ region: 'us-east-1' })
const secret = await client.getSecretValue({ SecretId: 'nexnum/production' })
const config = JSON.parse(secret.SecretString!)
```

### HashiCorp Vault

```bash
# Store secret
vault kv put secret/nexnum/production \
  DATABASE_URL="postgresql://..." \
  JWT_SECRET="..."

# Read secret
vault kv get secret/nexnum/production
```

**Integration:**
```typescript
import Vault from 'node-vault'

const vault = Vault({ endpoint: process.env.VAULT_ADDR })
const { data } = await vault.read('secret/data/nexnum/production')
```

### Google Cloud Secret Manager

```bash
# Create secret
gcloud secrets create nexnum-production --data-file=secrets.json

# Access secret
gcloud secrets versions access latest --secret=nexnum-production
```

### Azure Key Vault

```bash
# Set secret
az keyvault secret set --vault-name nexnum-vault \
  --name DATABASE-URL --value "postgresql://..."

# Get secret
az keyvault secret show --vault-name nexnum-vault --name DATABASE-URL
```

---

## Secrets to Migrate

### Critical (Must migrate)

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing key (min 32 chars) |
| `ENCRYPTION_KEY` | Data encryption key (min 32 chars) |

### Provider API Keys

| Secret | Description |
|--------|-------------|
| `HERO_SMS_API_KEY` | HeroSMS provider |
| `GRIZZLYSMS_API_KEY` | GrizzlySMS provider |
| `SMSBOWER_API_KEY` | SMSBower provider |
| `FIVESIM_API_KEY` | 5sim provider |
| `ONLINESIM_API_KEY` | OnlineSim provider |

### Monitoring & Integrations

| Secret | Description |
|--------|-------------|
| `SENTRY_DSN` | Error tracking |
| `SENTRY_AUTH_TOKEN` | Sentry API token |
| `SMTP_PASS` | Email service password |
| `GOOGLE_CLIENT_SECRET` | OAuth |

---

## Migration Pattern

### 1. Create Bootstrap Script

```typescript
// scripts/load-secrets.ts
import { loadSecrets } from './secret-manager-client'

export async function bootstrap() {
  const secrets = await loadSecrets('nexnum/production')
  
  // Inject into process.env
  Object.assign(process.env, secrets)
}
```

### 2. Call Before App Start

```typescript
// instrumentation.ts
import { bootstrap } from './scripts/load-secrets'

export async function register() {
  if (process.env.NODE_ENV === 'production') {
    await bootstrap()
  }
}
```

### 3. Update Dockerfile

```dockerfile
# Add secret manager SDK
RUN npm install @aws-sdk/client-secrets-manager

# Set region
ENV AWS_REGION=us-east-1
```

---

## Rotation Strategy

### Automatic Rotation

Configure your secret manager for automatic rotation:

```bash
# AWS example
aws secretsmanager rotate-secret \
  --secret-id nexnum/production \
  --rotation-rules AutomaticallyAfterDays=30
```

### Manual Rotation Procedure

1. Generate new secret value
2. Update secret manager
3. Deploy new version (app reads new value)
4. Verify functionality
5. Remove old secret if applicable

---

## Audit & Compliance

- Enable access logging on secret manager
- Set up alerts for secret access from unknown IPs
- Review access logs quarterly
- Document who has access to production secrets
