# NexNum Database Architecture & Business Logic Analysis

This document provides a deep dive into the logical structure of the NexNum database, explaining how specific tables (Models) map to real-world business functions.

## 1. The Supply Core (Provider Engine)
**Goal**: Normalize disparate external APIs into a single internal inventory.

### `Provider` (The Root)
*   **Role**: Represents an external API (e.g., 5sim, SMS-Activate).
*   **Key Logic**:
    *   `endpoints` & `mappings`: Stored JSON configuration that tells the **Dynamic Engine** how to talk to this provider. instead of hardcoding code, the database stores the "driver" logic.
    *   `priority` & `weight`: Traffic shaping. "Use Provider A first, but if busy, spill to B".
    *   `balance` & `lowBalanceAlert`: Financial health monitoring of the upstream source.

### `ProviderPricing` (The Cache / Grid)
*   **Real World Usage**: Browsing 50+ providers in real-time is slow (5-10 seconds).
*   **Logic**: This table is a **Materialized View** of the market.
    *   Cron jobs sync prices here every X hours.
    *   User searches hit *this* table (via MeiliSearch), getting 10ms response times.
    *   **Fields**: `cost` (what we pay), `sellPrice` (what user pays), `stock` (availability).

### `ProviderCountry` & `ProviderService` (Normalization)
*   **Problem**: Provider A calls it "USA", Provider B calls it "United States", Provider C uses ID "187".
*   **Solution**: These tables map `externalId` ("187") to our canonical `code` ("us").
*   **Benefit**: When a user selects "USA", the system knows how to translate that request for *every* connected provider.

---

## 2. The Commerce Layer (Money & transactions)
**Goal**: Secure, audit-ready financial tracking.

### `Wallet` & `WalletTransaction` (Internal Ledger)
*   **Logic**: Single Source of Truth for user funds.
*   **Real World Usage**:
    *   Users deposit Crypto -> `WalletTransaction` (Type: DEPOSIT).
    *   User buys Number -> `WalletTransaction` (Type: SPEND).
    *   **Immutability**: Transactions are never deleted; `balance` in `Wallet` is just a cache of the sum of transactions.

### `OfferReservation` (Inventory Locking)
*   **Problem**: Two users try to buy the last "US WhatsApp Number" at the exact same millisecond.
*   **Solution**: **Two-Phase Commit**.
    1.  User clicks "Buy" -> Create `OfferReservation` (Status: PENDING).
    2.  System checks stock.
    3.  If available -> Update `OfferReservation` (Status: CONFIRMED).
    4.  Then create Purchase Order.
*   **Logic**: Prevents "Race Conditions" and double-spending.

### `PurchaseOrder` (The Receipt)
*   **Role**: Permanent record of "I want to buy X".
*   **Flow**: Created *after* money is deducted but *before* the number is delivered. If delivery fails, this record proves a refund is needed.

---

## 3. The Fulfillment Layer (Product Delivery)
**Goal**: Managing the lifecycle of a verified number.

### `Activation` (The Lifecycle State Machine)
*   **Role**: Tracks a single session of renting a number.
*   **States**:
    *   `INIT`: Starting.
    *   `ACTIVE`: Number received from provider, shown to user.
    *   `RECEIVED`: SMS arrived (Success).
    *   `TIMEOUT/CANCELLED`: Failed or finished without code.
*   **Real World Usage**: This is the heart of the frontend "Active Numbers" table.

### `Number` (The Asset)
*   **Role**: Represents the phone number string itself (`+15550000`).
*   **Logic**: Separated from `Activation` because one `Activation` might try multiple `Numbers` if the first one doesn't work (Re-renting). Or a number might be "Permanent" (Rental) vs "Disposable" (Activation).

### `SmsMessage` (The Value Payload)
*   **Role**: Stores the actual OTP code.
*   **Features**:
    *   `extractedCode`: Regex-parsed login code (e.g., "123456").
    *   `rawPayload`: Full text for debugging.

---

## 4. Operational Reliability (DevOps in Database)
**Goal**: System stability and self-healing.

### `OutboxEvent` (Reliability Pattern)
*   **Problem**: You save to DB, but MeiliSearch update fails. Now Search is out of sync.
*   **Solution**: **The Outbox Pattern**.
    1.  Transaction: [Save User + Insert OutboxEvent].
    2.  Worker process reads `OutboxEvent` and retries pushing to MeiliSearch until success.
*   **Real World Usage**: Guarantees "Eventual Consistency". Search index *will* match Database eventually.

### `ProviderHealthLog` (Circuit Breaker Memory)
*   **Logic**: Tracks error rates per provider.
*   **Usage**: If provider 5sim fails 50% of requests (stored here), the System automatically "Trips the Circuit" (OPEN state), blocking new requests to prevent user frustration/money loss, then auto-heals later.

### `WebhookEvent` (Idempotency)
*   **Role**: Log of every raw callback received from providers.
*   **Logic**: If a provider sends the same "SMS Received" webhook twice (network glitch), `idempotencyKey` prevents us from processing it twice (e.g., charging the user twice or sending two notifications).

---

## 5. Developer API Platform
**Goal**: Selling access to other businesses (B2B).

### `ApiKey`
*   **Logic**: High-performance auth.
*   **Security**: Stores `keyHash` (SHA-256), not the keys themselves. If DB is hacked, keys are safe.
*   **Tiering**: `rateLimit` field enforces Silver/Gold/Enterprise limits.

### `Webhook` & `WebhookDelivery`
*   **Real World Usage**: A reseller using your API needs to know when an SMS arrives.
*   **Logic**:
    *   `Webhook`: Configuration (Url: `client.com/callback`).
    *   `WebhookDelivery`: Audit log of "Did we successfully tell them?". Includes retry logic (`nextRetryAt`) if their server is down.

---

## Summary of Data Flow
1.  **Sync**: `Provider` -> (Dynamic Engine) -> `ProviderPricing`.
2.  **Order**: User -> `OfferReservation` -> `Wallet` (Deduct) -> `PurchaseOrder`.
3.  **Fulfillment**: `PurchaseOrder` -> API Call -> `Activation` + `Number`.
4.  **Delivery**: Provider Webhook -> `SmsMessage` -> `Notification` -> User UI.
