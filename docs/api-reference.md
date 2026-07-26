# API Reference

This document outlines the standard interaction model for the NexNum API.
The API is fully documented via **OpenAPI 3.0** (Auto-generated).

## 📊 Standard Response Envelope

All API endpoints return data in a consistent JSON structure (`ApiResponse<T>`).

### Success Response
```json
{
  "success": true,
  "data": {
    "phoneNumber": "15550123456",
    "country": "us"
  },
  "code": "OK"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Insufficient funds to complete purchase",
  "code": "E_INSUFFICIENT_FUNDS",
  "details": {
    "currentBalance": 0.50,
    "required": 1.00
  },
  "status": 402
}
```

## 🛠️ Error Codes Dictionary

| Code | HTTP | Description |
| :--- | :--- | :--- |
| `E_VALIDATION_ERROR` | 400 | Invalid input (see `details` for field errors). |
| `E_UNAUTHORIZED` | 401 | Missing or invalid JWT token. |
| `E_FORBIDDEN` | 403 | Valid token but insufficient permissions. |
| `E_NOT_FOUND` | 404 | Resource does not exist. |
| `E_INSUFFICIENT_FUNDS` | 402 | Wallet balance too low. |
| `E_NO_NUMBERS` | 503 | Provider is out of stock for this service. |
| `E_Provider_ERROR` | 502 | Upstream provider failed. |

## 🔑 Authentication

Include the JWT in the `Authorization` header:
`Authorization: Bearer <your_token>`

## 📚 OpenAPI / Swagger
The full interactive documentation is available locally at:
`http://localhost:3000/api/docs`

Or via the raw JSON spec:
`GET /api/docs/openapi.json`
