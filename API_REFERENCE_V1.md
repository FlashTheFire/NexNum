# NexNum API Reference (V1 Provider-Compatible)

> **Base URL**: `https://api.nexnum.com/stubs/handler_api.php`  
> **Authentication**: API Key via `?api_key=`, `Authorization: Bearer`, or `X-API-Key`  
> **Content-Type**: `application/x-www-form-urlencoded` or `multipart/form-data`  
> **Response Format**: Plain text (legacy) or JSON (structured actions)

---

## Quick Reference

| Action | Method | Auth | Success Format | Error Format |
|--------|--------|------|----------------|--------------|
| `getBalance` | GET/POST | `read` | `ACCESS_BALANCE:<points>` | `NO_KEY` / `BAD_KEY` |
| `getNumber` | GET/POST | `numbers` | `ACCESS_NUMBER:<activationId>:<+E164>` | `NO_NUMBERS` / `NO_BALANCE` / `BAD_SERVICE` |
| `setStatus` | GET/POST | `numbers` | `ACCESS_READY` / `ACCESS_RETRY_GET` / `ACCESS_ACTIVATION` / `ACCESS_CANCEL` | `NO_ACTIVATION` / `BAD_STATUS` |
| `getStatus` | GET/POST | `sms` | JSON `{status, message}` | JSON `{status:false, msg}` |
| `getServicesList` | GET/POST | `read` | JSON `{services:[{id,name}]}` | JSON `{services:[]}` |
| `getCountriesList` | GET/POST | `read` | JSON `{countries:[{id,name,...}]}` | JSON `{countries:[]}` |
| `getPrices` | GET/POST | `read` | JSON `{<countryId>:{<serviceId>:{price,count,providers}}}` | JSON `{}` |
| `getNumbersStatus` | GET/POST | `numbers` | JSON `{<activationId>:{phone,sms:[...],...}}` | JSON `{}` |

---

## HTTP Status Codes (Corrected v2026-07-23)

| Scenario | Status Code | Body |
|----------|-------------|------|
| Missing API key | **401** | `NO_KEY` |
| Invalid/expired/revoked key | **403** | `BAD_KEY` |
| Rate limit exceeded | **429** | `RATE_LIMIT_EXCEEDED` |
| Internal server error | **500** | `ERROR_SQL` |
| Success | **200** | Action-specific (see above) |

> **Note**: Prior to v2026-07-23, all errors returned `200 OK` with error body. Clients checking only response body continue to work. Clients checking HTTP status **must** handle 401/403/429/500.

---

## Authentication Details

### API Key Formats
```
nxn_live_<32-chars>   # Production keys
nxn_test_<32-chars>   # Test keys (dev only)
```

### Transmission Methods (Priority Order)
1. Query string: `?api_key=nxn_live_abc123...`
2. Authorization header: `Authorization: Bearer nxn_live_abc123...`
3. Custom header: `X-API-Key: nxn_live_abc123...`
4. POST body (form): `api_key=nxn_live_abc123...`

### Rate Limits (Per Minute)
| Tier | Requests/Minute |
|------|-----------------|
| FREE | 60 |
| PRO | 300 |
| ENTERPRISE | 1000 |

Rate limit headers on **all** responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1721700000
```

---

## Action Specifications

### 1. getBalance
**Permission**: `read`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getBalance
```

**Success Response**:
```
ACCESS_BALANCE:1250.75
```
*Amount in user's display currency (Points: 100 = $1 USD), 2 decimal places.*

---

### 2. getNumber
**Permission**: `numbers`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getNumber&service=1&country=2&operator=3&maxPrice=50
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | numeric ID | Yes | Service ID (from `getServicesList`) |
| `country` | numeric ID | Yes | Country ID (from `getCountriesList`) |
| `operator` | numeric ID | No | Specific operator/server |
| `maxPrice` | float | No | Maximum price in Points |

**Success Response**:
```
ACCESS_NUMBER:act_abc123def456:+15551234567
```
*Format: `ACCESS_NUMBER:<activationId>:<E.164 phone number>`*

**Error Responses**:
| Code | Cause |
|------|-------|
| `NO_NUMBERS` | No stock, price > maxPrice, or provider unavailable |
| `NO_BALANCE` | Insufficient wallet balance |
| `BAD_SERVICE` | Invalid service/country ID |

---

### 3. setStatus
**Permission**: `numbers`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=setStatus&id=act_abc123&status=1
```

| Parameter | Type | Required | Values |
|-----------|------|----------|--------|
| `id` | string | Yes | Activation ID from `getNumber` |
| `status` | int | Yes | `1`, `3`, `6`, `8`, `-1` |

**Status Code Mapping**:
| Input | Output | Behavior |
|-------|--------|----------|
| `1` | `ACCESS_READY` | Mark SMS received, keep rental active |
| `3` | `ACCESS_RETRY_GET` | Request upstream re-send code |
| `6` | `ACCESS_ACTIVATION` | Finalize rental (mark completed) |
| `8` | `ACCESS_ACTIVATION` | "Number used" — finalize, no refund |
| `-1` | `ACCESS_CANCEL` | Cancel rental, refund to wallet |

**Error Responses**:
| Code | Cause |
|------|-------|
| `NO_ACTIVATION` | ID not found or not owned by key |
| `BAD_STATUS` | Invalid status code (not in 1,3,6,8,-1) |

---

### 4. getStatus
**Permission**: `sms`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getStatus&id=act_abc123
```

**Success Response** (JSON):
```json
{
  "status": true,
  "message": "STATUS_OK:123456"
}
```

**Error Response** (JSON):
```json
{
  "status": false,
  "message": "NO_ACTIVATION"
}
```

**Message Codes**:
| Code | Meaning |
|------|---------|
| `STATUS_WAIT_CODE` | Waiting for first SMS |
| `STATUS_OK:<code>` | SMS received, code included |
| `STATUS_WAIT_RETRY` | Re-send requested, waiting |
| `STATUS_WAIT_RESEND` | Upstream is resending |
| `STATUS_CANCEL` | Cancelled by user |
| `STATUS_TIMEOUT` | Expired without code |
| `NO_ACTIVATION` | ID not found |

---

### 5. getServicesList
**Permission**: `read`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getServicesList
```

**Success Response** (JSON):
```json
{
  "services": [
    { "id": 1, "name": "WhatsApp" },
    { "id": 2, "name": "Telegram" },
    { "id": 3, "name": "Discord" }
  ]
}
```
*ID = numeric `serviceId` from internal registry (NOT legacy string codes like "wa", "tg")*

**Universal Format**: Always returns `{services: [{id, name}, ...]}` — only `id` and `name` fields, regardless of filter or data availability.

---

### 6. getCountriesList
**Permission**: `read`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getCountriesList&service=1
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | numeric ID | No | Filter countries by service |

**Success Response** (JSON):
```json
{
  "countries": [
    { "id": 10, "name": "United States", "minPrice": 15.50, "totalStock": 1234, "serverCount": 3 },
    { "id": 20, "name": "India", "minPrice": 8.25, "totalStock": 567, "serverCount": 2 }
  ]
}
```
*Without `service` parameter: returns all countries (id, name only).*

---

### 7. getPrices
**Permission**: `read`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getPrices&service=1&country=10
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | numeric ID | No | Filter by service |
| `country` | numeric ID | No | Filter by country |

**Response Shapes by Filter Mode**:

| Mode | Example Response |
|------|------------------|
| **Both** (`service=1&country=10`) | `{"10":{"1":{"price":29,"count":1280881,"providers":{"5sim":{"count":1280881,"price":29,"provider_id":"5sim"}}}}}` |
| **Service only** (`service=1`) | `{"192":{"1":{"price":29,"count":1280881,"providers":{"5sim":{"count":877956,"price":29,"provider_id":"5sim"}}}}}` |
| **Country only** (`country=10`) | `{"10":{"1":{"price":29,"count":1280881,"providers":{"5sim":{"count":1280881,"price":29,"provider_id":"5sim"}}},"2":{"price":36,"count":392992,"providers":{"5sim":{"count":392992,"price":36,"provider_id":"5sim"}}}}}` |
| **No filter** | `{"192":{"1":{"price":29,"count":1280881,"providers":{...}},"2":{"price":36,"count":392992,"providers":{...}}},"10":{"1":{"price":15,"count":45,"providers":{...}}}}` |

**Universal Format (all modes)**:
```json
{
  "<countryId>": {
    "<serviceId>": {
      "price": <minPrice>,
      "count": <totalStock>,
      "providers": {
        "<providerId>": { "count": <n>, "price": <minPrice>, "provider_id": "<providerId>" }
      }
    }
  }
}
```
*All keys are numeric IDs as strings. Returns `{}` if no matches.*

**Implementation Notes** (v2026-07-23):
- Uses MeiliSearch **facet distribution** for server-side grouping
- `attributesToRetrieve` limits payload to required fields only
- Dynamic hit limits per mode (100–5000) prevent over-fetching
- p95 latency < 100ms, payload < 200KB

---

### 8. getNumbersStatus
**Permission**: `numbers`

**Request**:
```
GET /stubs/handler_api.php?api_key=KEY&action=getNumbersStatus
```

**Success Response** (JSON):
```json
{
  "act_abc123": {
    "phone": "+15551234567",
    "countryId": 10,
    "countryName": "United States",
    "serviceId": 1,
    "serviceName": "WhatsApp",
    "status": "active",
    "sms": [
      { "sender": "WhatsApp", "code": "123456", "content": "Your code: 123456", "receivedAt": "2026-07-23T10:30:00.000Z" }
    ]
  }
}
```
*Returns up to 100 active/received numbers, newest first.*

---

## Error Code Reference

| Code | HTTP Status | Applicable Actions | Description |
|------|-------------|-------------------|-------------|
| `NO_KEY` | 401 | All | API key missing from query/header/body |
| `BAD_KEY` | 403 | All | Key invalid, expired, revoked, or insufficient permissions |
| `BAD_ACTION` | 200 | All | Unknown action parameter |
| `BAD_SERVICE` | 200 | getNumber, getPrices | Invalid service/country ID |
| `BAD_STATUS` | 200 | setStatus | Invalid status code |
| `NO_NUMBERS` | 200 | getNumber | No stock available |
| `NO_BALANCE` | 200 | getNumber | Insufficient wallet balance |
| `NO_ACTIVATION` | 200/JSON | setStatus, getStatus, getNumbersStatus | Activation ID not found |
| `RATE_LIMIT_EXCEEDED` | 429 | All | Tier rate limit exceeded |
| `ERROR_SQL` | 500 | All | Database error |
| `INTERNAL_ERROR` | 500 | All | Unexpected server error |

---

## Client Implementation Guide

### Minimal Python Client
```python
import requests

class NexNumV1:
    def __init__(self, api_key: str, base_url: str = "https://api.nexnum.com"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
    
    def _post(self, action: str, **params) -> str:
        data = {'api_key': self.api_key, 'action': action, **params}
        r = requests.post(f"{self.base_url}/stubs/handler_api.php", data=data)
        r.raise_for_status()  # Handles 401/403/429/500
        return r.text
    
    def get_balance(self) -> float:
        return float(self._post('getBalance').split(':')[1])
    
    def get_number(self, service_id: int, country_id: int, max_price: float = None) -> tuple:
        params = {'service': service_id, 'country': country_id}
        if max_price: params['maxPrice'] = max_price
        resp = self._post('getNumber', **params)
        _, act_id, phone = resp.split(':')
        return act_id, phone
    
    def set_status(self, activation_id: str, status: int) -> str:
        return self._post('setStatus', id=activation_id, status=status)
    
    def get_status(self, activation_id: str) -> dict:
        import json
        return json.loads(self._post('getStatus', id=activation_id))
    
    def get_prices(self, service_id: int = None, country_id: int = None) -> dict:
        import json
        params = {}
        if service_id: params['service'] = service_id
        if country_id: params['country'] = country_id
        return json.loads(self._post('getPrices', **params))
```

### Handling Rate Limits
```python
import time

def with_retry(client, action, **params):
    for attempt in range(3):
        try:
            return client._post(action, **params)
        except requests.HTTPError as e:
            if e.response.status_code == 429:
                reset = int(e.response.headers.get('X-RateLimit-Reset', time.time() + 60))
                sleep = max(reset - time.time(), 1)
                time.sleep(sleep)
                continue
            raise
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| **2026-07-23** | v2.1.0 | **HTTP semantics corrected**: 401/403/429/500 status codes; body format preserved |
| 2026-06-15 | v2.0.0 | Numeric IDs for all services/countries; dropped legacy string codes |
| 2026-05-01 | v1.0.0 | Initial provider-compatible API |

---

*Generated: Phase 7 of 7-phase audit*  
*See also: `ARCHITECTURE_DECISIONS.md` for implementation rationale*