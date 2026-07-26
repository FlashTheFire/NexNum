# NexNum Data Transformation Flow: A Deep Dive

This document outlines the professional architectural flow of data synchronization in NexNum, using the real-world example of the **smsbower** provider.

---

## 1. Raw Data (Provider API)
The data originates from external provider REST APIs. At this stage, it is unstructured and uses provider-specific terminology.

**Example Response:**
```json
{
  "7": {
    "wa": { "cost": 10.5, "count": 520 },
    "tg": { "cost": 8.2, "count": 120 }
  }
}
```
*Note: In this example, "7" represents Russia, "wa" represents WhatsApp, and "cost" is the provider's net price in their currency (e.g., RUB).*

---

## 2. Mapped Data (NexNum Adapter)
The `ProviderEngine` adapter (e.g., `SmsBowerEngine`) normalizes this into a standard NexNum `PriceEntry` interface.

**Internal Logic:**
```typescript
interface PriceEntry {
    country: string;  // "7"
    service: string;  // "wa"
    price: number;    // 10.5
    count: number;    // 520
}
```
*Purpose: Disconnects the core sync logic from the unique JSON structures of different providers.*

---

## 3. SQL Data (PostgreSQL Registry)
The `provider-sync.ts` service reconciles the mapped data with the SQL database. It computes margins, applies exchange rates, and links to canonical lookup tables.

**Computed Data:**
- **Raw Cost:** 10.5 RUB
- **Exchange Rate:** 0.011 (RUB -> USD)
- **Markup:** 1.5x (Multiplier) + 0.50 (Fixed)
- **Final Sell Price:** (10.5 * 0.011) * 1.5 + 0.50 = **$0.67**

**Database Record (`ProviderService` table):**
```json
{
  "id": "clxb1...",
  "providerId": "smsbower_id",
  "countryId": "russia_sql_id",
  "serviceId": "whatsapp_sql_id",
  "price": 0.67,
  "rawPrice": 10.5,
  "stock": 520,
  "isActive": true,
  "lastSyncedAt": "2026-01-31T05:30:00Z"
}
```

---

## 4. MeiliSearch Index (Deep Search)
To achieve sub-50ms search performance, the data is flattened into an `OfferDocument`. This document contains all metadata (icons, names) required to render the UI without additional SQL queries.

**Indexed Document (`offers` index):**
```json
{
  "id": "smsbower_7_wa",
  "provider": "smsbower",
  "serviceName": "WhatsApp",
  "countryName": "Russia",
  "countryIcon": "/assets/flags/ru.svg",
  "serviceIcon": "/assets/icons/services/whatsapp.webp",
  "price": 67, 
  "stock": 520,
  "isActive": true,
  "lastSyncedAt": 1769817600
}
```
*Note: Prices are often stored as integers (cents/coins) in MeiliSearch for faster sorting.*

---

## Summary of Complexity
| Stage | Responsibility | Optimization |
|-------|----------------|--------------|
| **Raw** | Ingestion | Rate-limited API calls |
| **Mapped** | Normalization | Zero-dependency interfaces |
| **SQL** | Consistency | Relational integrity (FKs) |
| **Meili** | Performance | Faceted search & Geo-atomic swaps |
