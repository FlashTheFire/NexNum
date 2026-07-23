# NexNum V1 API — Provider-Compatible Interface

The NexNum V1 API is a **provider-style REST surface** exposed at
`/stubs/handler_api.php` that is wire-compatible with the legacy SMS provider
contract used by community bots (notably the FlashSmsRobot bot project). It
exists so existing automation code can point at NexNum with no client-side
changes.

> **V2 (5sim-style REST) is not exposed at this endpoint.** A separate
> `/api/v1/*` REST surface exists in the app for the modern web client. The
> `/stubs/handler_api.php` path is the *only* way to call the V1 contract.

---

## 1. Endpoint

```
GET  /stubs/handler_api.php?api_key=...&action=...
POST /stubs/handler_api.php      (form fields: api_key, action, ...)
```

Both `GET` and `POST` are accepted. `POST` is recommended for `getNumber`
because the country / service / operator inputs can be long and may contain
special characters.

The route is implemented in `src/app/stubs/handler_api.php/route.ts`.

---

## 2. Authentication

V1 uses the same `nxn_live_*` / `nxn_test_*` API keys issued in
**Settings → Developers → API Keys**.

The key may be passed two ways (query string is preferred to match legacy
clients):

```
?api_key=nxn_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Authorization: Bearer nxn_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are SHA-256 hashed and looked up via `validateApiKey(rawKey, requestIp)`
in `src/lib/api/api-keys.ts`. Rate limits are applied per-key per-tier:

| Tier       | Requests / minute |
|------------|-------------------|
| FREE       | 60                |
| PRO        | 300               |
| ENTERPRISE | 1000              |

V1 responses are **always HTTP 200** with a plain-text or JSON body. Errors
are signalled by the response body, not the status code. This matches the
behaviour of the legacy provider.

---

## 3. Response shape conventions

| Category       | Body (text / JSON)                |
|----------------|------------------------------------|
| Success        | Provider token, JSON object, or `STATUS_OK:<code>` |
| Client error   | `BAD_KEY`, `BAD_ACTION`, `BAD_SERVICE`, `BAD_STATUS` |
| Business error | `NO_NUMBERS`, `NO_BALANCE`, `NO_ACTIVATION`        |
| Server error   | `ERROR_SQL`                       |

`ERROR_SQL` is the literal text the legacy clients expect — we return it for
any unexpected Prisma / database exception so existing retries / parsers behave
the same way.

---

## 4. Actions

| #  | Action             | Required params (besides `api_key`)      | Success body                                                |
|----|--------------------|-------------------------------------------|--------------------------------------------------------------|
| 1  | `getBalance`       | —                                         | `ACCESS_BALANCE:<amount>`                                    |
| 2  | `getNumber`        | `service=<serviceId>`, `country=<countryId>` [, `operator`] | `ACCESS_NUMBER:<id>:<+E164>`                |
| 3  | `setStatus`        | `id`, `status`                            | `ACCESS_READY` / `ACCESS_RETRY_GET` / `ACCESS_ACTIVATION` / `ACCESS_CANCEL` |
| 4  | `getStatus`        | `id`                                      | `STATUS_OK:<code>` (JSON `{status:true,...}`) or status token |
| 5  | `getPrices`        | optional `country` / `service` (**numeric IDs**) | JSON `{<serviceId>: {cost, count, ...}}`                  |
| 6  | `getNumbersStatus` | —                                         | JSON `{<activationId>: {phone, serviceId, countryId, ...}}` |
| 7  | `getServicesList`  | —                                         | JSON `{services: [{id: <serviceId>, name, ...}]}`            |
| 8  | `getCountriesList` | —                                         | JSON `{countries: [{id: <countryId>, name, ...}]}`           |

> **All IDs in V1 are numeric.** The contract never emits legacy string codes
> (`tg`, `wa`, `6`, `0`). See [§ 6 Universal ID contract](#6-universal-id-contract).

### 4.1 `getBalance`

```
GET /stubs/handler_api.php?api_key=...&action=getBalance
→  ACCESS_BALANCE:25.50
```

Balance is the user's **display amount** in the configured wallet currency
(point value at the user's tier is converted before display).

### 4.2 `getNumber`

```
GET /stubs/handler_api.php?api_key=...&action=getNumber&service=wa&country=6
→  ACCESS_NUMBER:1234567:+14155551234
```

`operator` is optional (free-form provider-side filter).

Errors:
* `NO_BALANCE` — wallet does not have enough to cover the price.
* `NO_NUMBERS` — no provider currently has stock.
* `BAD_SERVICE` / `BAD_ACTION` — service code unknown or action typo.

The returned `id` is the upstream provider's **activation id**; use it as
the `id` parameter for `setStatus` and `getStatus`.

### 4.3 `setStatus`

| Status code | Meaning              | Response                  | Side-effects |
|-------------|----------------------|---------------------------|--------------|
| `1`         | Mark ready (received) | `ACCESS_READY`            | —             |
| `3`         | Request new SMS       | `ACCESS_RETRY_GET`        | Calls `smsProvider.setResendCode?(id)` |
| `6`         | Complete activation   | `ACCESS_ACTIVATION`       | Marks activation as COMPLETED, commits wallet, no refund |
| `8`         | Mark used             | `ACCESS_ACTIVATION`       | Same as 6     |
| `-1`        | Cancel                | `ACCESS_CANCEL`           | Calls `smsProvider.setCancel?(id)`, refunds wallet, marks CANCELLED |

Anything else returns `BAD_STATUS`.

### 4.4 `getStatus`

For a valid `id` the response is one of:

| State                                  | Body                                                            |
|----------------------------------------|------------------------------------------------------------------|
| Active, no SMS yet                     | JSON `{status:true, message:"STATUS_WAIT_CODE"}`                |
| SMS received                           | JSON `{status:true, message:"STATUS_OK:<code>"}`                |
| Waiting for resend (after status 3)    | JSON `{status:true, message:"STATUS_WAIT_RESEND"}`              |
| User cancelled                         | JSON `{status:false, message:"STATUS_CANCEL"}`                  |
| Activation timed out                   | JSON `{status:false, message:"STATUS_TIMEOUT"}`                 |
| Wrong code, request another            | JSON `{status:true, message:"STATUS_WAIT_RETRY"}`               |
| Unknown / not owned                    | JSON `{status:false, message:"NO_ACTIVATION"}`                  |

### 4.5 `getPrices`

> **Inputs are numeric IDs** (`serviceId`, `countryId`) — not legacy string
> codes. See the [Universal ID contract](#6-universal-id-contract) below.

```
GET /stubs/handler_api.php?api_key=...&action=getPrices
→ {
  "12": {                                                 // serviceId
    "cost": 0.15, "count": 142,
    "serviceName": "WhatsApp",
    "countries": {
      "89": { "cost": 0.15, "count": 142, "countryName": "India" }
    }
  }
}

GET ...&action=getPrices&service=12
→ {
  "12": {
    "cost": 0.15, "count": 142,
    "serviceName": "WhatsApp",
    "countries": {
      "89": { "cost": 0.15, "count": 142, "countryName": "India" },
      "0":  { "cost": 0.18, "count":  60, "countryName": "—"        }
    }
  }
}

GET ...&action=getPrices&country=89
→ {
  "12": { "cost": 0.15, "count": 142,
          "serviceName": "WhatsApp",
          "countryId": 89, "countryName": "India" }
}

GET ...&action=getPrices&service=12&country=89
→ {
  "12": {
    "cost": 0.15, "count": 142,
    "serviceName": "WhatsApp",
    "countryId": 89, "countryName": "India",
    "operators": {
      "any":       { "operator_name": "any",       "price": 0.15 },
      "airtel":    { "operator_name": "airtel",    "price": 0.18 }
    }
  }
}
```

`cost` is in user points, `count` is total available stock across all matching
operators. When both `service` and `country` are supplied, the response is
keyed by **operator** to match the legacy provider format; otherwise the
response is keyed by the missing dimension. The output never contains legacy
string codes (`tg`, `wa`, `6`, `0`) — only numeric IDs and resolved names.

### 4.6 `getNumbersStatus`

```
GET ...&action=getNumbersStatus
→ {
  "1234567": {
    "phone":     "+14155551234",
    "serviceId": 12, "serviceName": "WhatsApp",
    "countryId": 89, "countryName": "India",
    "sms": [{ "code": "12345", "receivedAt": "..." }]
  }
}
```

Returns a map of every active (non-cancelled, non-expired) `Number` row for
the calling user, keyed by `activationId` (the upstream provider's id). The
`sms` array contains every `SmsMessage` received against the number.

### 4.7 `getServicesList`

```
GET ...&action=getServicesList
→ {
  "services": [
    { "id": 12, "name": "WhatsApp",
      "lowestPrice": 17, "totalStock": 22131320,
      "countryCount": 126, "providerCount": 3 }
  ]
}
```

`id` is the **numeric** `serviceId` (internal MeiliDocs ID). Legacy `code`
fields are intentionally not emitted.

### 4.8 `getCountriesList`

```
GET ...&action=getCountriesList
→ {
  "countries": [
    { "id": 89, "name": "India" }
  ]
}
```

When called with `?service=<serviceId>`, the result is restricted to countries
that have at least one live offer for that service and includes `minPrice`,
`totalStock`, and `serverCount`:

```
GET ...&action=getCountriesList&service=12
→ {
  "countries": [
    { "id": 89, "name": "India",
      "minPrice": 0.15, "totalStock": 142, "serverCount": 2 }
  ]
}
```

`id` is the **numeric** `countryId` (internal MeiliDocs ID).

The list is derived from `CountryLookup` and the current MeiliSearch
index, so a country only appears if it is both known and has at least one
operator currently serving it.

---

## 5. Status / error code reference

| Code                | Meaning                                                  |
|---------------------|-----------------------------------------------------------|
| `ACCESS_BALANCE`    | Successful balance read. Format: `ACCESS_BALANCE:<num>`.  |
| `ACCESS_NUMBER`     | Successful number purchase. Format: `ACCESS_NUMBER:<id>:<+E164>`. |
| `ACCESS_READY`      | setStatus(1) acknowledged.                                |
| `ACCESS_RETRY_GET`  | setStatus(3) acknowledged, resend requested upstream.     |
| `ACCESS_ACTIVATION` | setStatus(6 or 8) acknowledged, activation finalised.      |
| `ACCESS_CANCEL`     | setStatus(-1) acknowledged, refund issued.                |
| `STATUS_OK`         | getStatus has a code. Format: `STATUS_OK:<code>`.         |
| `STATUS_WAIT_CODE`  | Activation active, waiting for the first SMS.             |
| `STATUS_WAIT_RETRY` | A code was received and rejected — bot wants a new one.   |
| `STATUS_WAIT_RESEND`| setStatus(3) was called; waiting for the resend.          |
| `STATUS_CANCEL`     | Activation was cancelled.                                 |
| `STATUS_TIMEOUT`    | Activation expired before any code arrived.               |
| `NO_ACTIVATION`     | `id` not found / not owned by the API key's user.         |
| `NO_NUMBERS`        | No upstream provider currently has stock.                 |
| `NO_BALANCE`        | Wallet does not have enough to cover the price.           |
| `BAD_KEY`           | API key is missing, malformed, or revoked.                |
| `BAD_ACTION`        | `action` parameter is missing or unknown.                 |
| `BAD_SERVICE`       | `service` parameter is not a known service.               |
| `BAD_STATUS`        | `status` parameter is not one of -1, 1, 3, 6, 8.          |
| `ERROR_SQL`         | Internal database / provider failure.                     |

---

## 6. Universal ID contract

The V1 contract has been standardized on **internal numeric IDs** so that the
same response shape works for every payload — no more carrying both a
provider-supplied slug and an internal name.

* `serviceId` — internal MeiliDocs `serviceId` (an `Int` from
  `ServiceLookup.serviceId`).
* `countryId` — internal MeiliDocs `countryId` (an `Int` from
  `CountryLookup.countryId`).
* The legacy `providerServiceCode` (`wa`, `tg`, `full`) and
  `providerCountryCode` (`91`, `0`, `6`) strings are **never** emitted by V1.
  They are still used internally as the *key* on which MeiliDocs documents are
  joined to the lookup tables, but the *response* only carries numeric IDs.
* Resolved `serviceName` and `countryName` are returned alongside every
  numeric ID so that downstream UIs do not need a second lookup round-trip.

Clients that previously passed string slugs (e.g. `?service=tg&country=6`) must
migrate to the numeric form (`?service=12&country=89`). The endpoint is
forgiving: an unparseable ID yields an empty result (`{}` or `[]`) rather than
an error, so a graceful migration is possible.

Use the **list endpoints** to translate between human-readable names and
numeric IDs:

```
GET /stubs/handler_api.php?action=getServicesList
GET /stubs/handler_api.php?action=getCountriesList
```

---

## 7. Implementation notes

* **Auth flow** — `withV1Auth` (in `src/lib/api/api-middleware.ts`) extracts
  the key from query string first, then `Authorization: Bearer`, hashes it
  via `validateApiKey`, checks rate limits, and returns a `V1AuthContext`
  with `userId`, `tier`, `keyId`, and `permissions`.

* **Purchase pipeline** — `actionGetNumber` runs the same seven-phase
  pipeline as the in-app `/api/numbers/purchase` route (validate →
  eligibility → lock → quote → reserve → provider call → commit) but
  reuses the **shared primitives** in `src/lib/purchase/security.ts` and
  `src/lib/wallet/wallet.ts` rather than the session-cookie bound
  `getCurrentUser` helper.

* **Idempotency** — every `getNumber` call generates a fresh
  `generatePurchaseCorrelationId()` and stores it on the `Activation.idempotencyKey`
  field (which has a `@unique` constraint in the Prisma schema). Duplicate
  client retries within the same key produce the same activation row.

* **Atomic purchase lock** — `acquireAtomicPurchaseLock(userId)` is acquired
  for the duration of the purchase to prevent two concurrent `getNumber`
  calls from racing on balance / reservation.

* **Balance** — `getBalance` reads from
  `getCachedBalance(userId)` (`src/lib/cache/user-cache.ts`) and **always
  invalidates after every mutation** via `invalidateBalanceCache(userId)`.

* **Provider errors** — `PaymentError.code === 'E_INSUFFICIENT_FUNDS'`
  maps to the V1 token `NO_BALANCE` so legacy clients that look for that
  literal continue to work.

* **Logging** — every V1 request logs `{requestId, userId, action, keyId}`
  in structured form (`logger.info('[V1] ...')`); provider failures and
  refund errors are logged at `warn`/`error` levels with no PII or token
  data.
