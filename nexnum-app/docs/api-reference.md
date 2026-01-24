# API Reference

NexNum Backend API documentation for consumers and integrators.

---

## Base URLs

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:3000` |
| Staging | `https://staging.nexnum.com` |
| Production | `https://api.nexnum.com` |

---

## Authentication

### JWT Bearer Token
Most endpoints require authentication via JWT bearer token.

```
Authorization: Bearer <access_token>
```

### API Key (v1 Public API)
External consumers use API keys:

```
X-API-Key: <api_key>
```

---

## Core API Endpoints

### Numbers

#### Purchase Number
```http
POST /api/numbers/purchase
```

**Request:**
```json
{
  "countryCode": "us",
  "serviceCode": "telegram",
  "provider": "herosms"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "num_abc123",
    "phone": "+12025551234",
    "expiresAt": "2025-01-24T15:30:00Z",
    "status": "active"
  }
}
```

#### Cancel Number
```http
POST /api/numbers/cancel
```

**Request:**
```json
{
  "numberId": "num_abc123"
}
```

#### Get My Numbers
```http
GET /api/numbers/my
```

#### Get Number by ID
```http
GET /api/numbers/{id}
```

---

### Wallet

#### Get Balance
```http
GET /api/wallet/balance
```

**Response:**
```json
{
  "balance": 25.50,
  "currency": "USD",
  "reserved": 1.50
}
```

#### Get Transactions
```http
GET /api/wallet/transactions?page=1&limit=20
```

#### Top Up (Admin)
```http
POST /api/wallet/topup
```

---

### Search

#### Search Offers
```http
GET /api/search/offers?q=telegram&country=us
```

**Response:**
```json
{
  "hits": [
    {
      "id": "offer_1",
      "service": "Telegram",
      "country": "United States",
      "price": 0.50,
      "provider": "herosms"
    }
  ],
  "total": 1
}
```

---

## Public API (v1)

External API for third-party consumers.

### Get Balance
```http
GET /api/v1/balance
X-API-Key: <api_key>
```

### Get Number
```http
POST /api/v1/numbers
X-API-Key: <api_key>
```

### Get SMS
```http
GET /api/v1/sms/{activationId}
X-API-Key: <api_key>
```

### Webhooks
```http
POST /api/v1/webhooks/sms
```

---

## Admin API

### Providers

#### List Providers
```http
GET /api/admin/providers
```

#### Sync Provider
```http
POST /api/admin/providers/{id}/sync
```

### Users

#### List Users
```http
GET /api/admin/users
```

#### Ban User
```http
POST /api/admin/users/{id}/ban
```

### Analytics

#### Dashboard Stats
```http
GET /api/admin/analytics/dashboard
```

---

## Health & Metrics

### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-24T15:00:00Z"
}
```

### Ready Check
```http
GET /api/health/ready
```

Checks DB + Redis connectivity.

### Prometheus Metrics
```http
GET /api/metrics
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Not enough funds to complete purchase",
    "details": {}
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing auth token |
| `FORBIDDEN` | 403 | Not allowed to access resource |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `INSUFFICIENT_BALANCE` | 400 | Not enough wallet balance |
| `NO_NUMBERS_AVAILABLE` | 503 | Provider has no numbers |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| General API | 100 req/min |
| Purchase | 10 req/min |
| Admin | 60 req/min |
| v1 Public | 30 req/min |

---

## Webhooks

### SMS Received Webhook
```http
POST <your_webhook_url>
Content-Type: application/json
```

**Payload:**
```json
{
  "event": "sms.received",
  "data": {
    "numberId": "num_abc123",
    "phone": "+12025551234",
    "code": "123456",
    "text": "Your code is 123456",
    "sender": "Telegram",
    "receivedAt": "2025-01-24T15:05:00Z"
  }
}
```
