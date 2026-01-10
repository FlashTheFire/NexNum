# Provider Onboarding Guide

## Overview
NexNum uses a **Dynamic Provider Engine**. You rarely need to write code to add a provider. You define a **JSON Configuration**.

## Steps to Add a Provider

### 1. Analysis
Gather the provider's API docs. Identify:
*   **Purchase Endpoint**: `GET /sku-endpoint?api_key=...`
*   **Cancel Endpoint**: `GET /cancel?id=...`
*   **Response Format**: JSON or Text?
    *   *JSON*: `{"id": "123", "number": "12345"}`
    *   *Text*: `ACCESS_NUMBER:123:12345`

### 2. Create Configuration (Database)
Insert into `providers` table:

```sql
INSERT INTO providers (name, api_key, api_url, config) VALUES (
  'NewSms',
  'xyz-123',
  'https://api.newsms.com',
  '{
    "endpoints": {
      "getNumber": {
        "method": "GET",
        "path": "/purchase",
        "params": {
          "service": "{service_slug}",
          "country": "{country_code}"
        },
        "mapping": {
          "id": "activationId",
          "number": "phone"
        }
      }
    }
  }'
);
```

### 3. Verification
1.  Use the Admin Interface (or manual purchase) to test.
2.  Check logs: `[DynamicProvider:NewSms] Request ...`
3.  If standard mapping fails (e.g. complex nested JSON), you might need to use `jsonpath` in mapping or extend `DynamicProvider`.

### 4. Circuit Breaker
*   The new provider automatically gets a Circuit Breaker.
*   Default: 50% failure rate triggers 15s cooldown.
