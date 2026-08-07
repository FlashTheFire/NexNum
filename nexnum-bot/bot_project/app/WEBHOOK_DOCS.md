# SilentGate Webhook & API Documentation
**Version**: 2026.08.06
**Protocol**: HTTP/1.1 POST

This document outlines the implementation details for the Webhook forwarding channel. SilentGate can POST a standardized JSON payload to any custom endpoint whenever a message (SMS or Notification) is captured.

---

## 1. Request Configuration
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Timeout**: 15 Seconds
- **Retry Logic**: Automatic exponential backoff (handled by internal ForwardingEngine).

### Authentication Headers
Every request includes identification headers to verify the source device:

| Header | Description | Example |
| :--- | :--- | :--- |
| `X-Device-ID` | The unique identifier of the sending device. | `606cdbd049fdcad2` |
| `X-API-Key` | A secure hash identifying the device session. | `sha256_hash_string` |
| `User-Agent` | Standard OkHttp user agent. | `okhttp/5.0.0-alpha.11` |

---

## 2. JSON Payload Schema
The payload is a flattened JSON object containing the message content and extracted metadata.

### Example Payload
```json
{
  "deviceId": "606cdbd049fdcad2",
  "timestamp": 1786035029789,
  "sender": "+918084799136",
  "body": "Your login code is 5544",
  "isOtp": true,
  "otpCode": "5544",
  "simSlot": 0,
  "type": "incoming_sms"
}
```

### Field Definitions
| Field | Type | Description |
| :--- | :--- | :--- |
| `deviceId` | String | The hardware-linked ID of the Android device. |
| `timestamp` | Long | Epoch time (ms) when the message was received by the device. |
| `sender` | String | The phone number or package name (e.g., `com.whatsapp`). |
| `body` | String | The full text content of the message or notification. |
| `isOtp` | Boolean | `true` if a verification code was detected. |
| `otpCode` | String | The extracted 4-8 digit code (empty string if none found). |
| `simSlot` | Integer | `0` for SIM 1, `1` for SIM 2. |
| `type` | String | Constant value: `incoming_sms`. |

---

## 3. Server Response Workings
SilentGate expects a standard HTTP response to confirm successful receipt.

### Expected Success
- **HTTP Code**: `200 OK` or `201 Created`
- **Effect**: The message is marked as "Forwarded" locally and no further retries are attempted.

### Failure & Error Handling
If the server returns any non-2xx code, the app will log the error and potentially retry based on the error type:

| HTTP Code | App Action | Reason |
| :--- | :--- | :--- |
| `400 Bad Request` | **ABORT** | Payload format mismatch. |
| `401 Unauthorized`| **ABORT** | Invalid API Key/Device ID. |
| `404 Not Found` | **ABORT** | Incorrect Webhook URL. |
| `500+ Server Error`| **RETRY** | Temporary server-side failure. |
| `Timeout` | **RETRY** | Network congestion or slow server processing. |

---

## 4. Implementation Example (Node.js/Express)
```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
    const deviceId = req.headers['x-device-id'];
    const apiKey = req.headers['x-api-key'];
    const data = req.body;

    console.log(`Received from ${deviceId}: ${data.body}`);
    
    // Process OTP
    if (data.isOtp) {
        console.log(`Extracted OTP: ${data.otpCode}`);
    }

    res.status(200).send('OK');
});

app.listen(3000);
```

---

## Technical Performance Notes
1. **Concurrency**: Webhooks are dispatched asynchronously using Kotlin Coroutines to prevent UI blocking.
2. **Connectivity**: If the device is offline, messages are queued in the local database and dispatched sequentially once a connection is restored.
3. **Loop Prevention**: The app automatically suppresses retries for common configuration errors (400, 404) to avoid unnecessary battery drain.
