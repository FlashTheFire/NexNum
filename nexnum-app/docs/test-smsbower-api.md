# SMS Bower API Documentation

**Base URL**: `https://smsbower.page/stubs/handler_api.php`  
**Auth Type**: Query Parameter (`api_key`)

---

## Get Balance
```
GET ?api_key={authKey}&action=getBalance
```

**Response (text):**
```
ACCESS_BALANCE:$yourBalance
```

**Errors:**
- `BAD_KEY` - invalid API key

---

## Get Countries List
```
GET ?api_key={authKey}&action=getCountries
```

**Response (JSON):**
```json
[
    {"id": 1003, "rus": "Бермуды", "eng": "Bermuda", "chn": "百慕大"}
]
```

---

## Get Services List
```
GET ?api_key={authKey}&action=getServicesList
```

**Response (JSON):**
```json
{
    "status": "success",
    "services": [
        {"code": "kt", "name": "KakaoTalk"},
        {"code": "wa", "name": "WhatsApp"},
        {"code": "tg", "name": "Telegram"}
    ]
}
```

---

## Get Prices (v3)
```
GET ?api_key={authKey}&action=getPricesV3&service={service}&country={country}
```

**Response (JSON) - 3-Level Nested:**
```json
{
    "0": {
        "wa": {
            "11": {"count": 100, "price": 0.50, "provider_id": 11},
            "22": {"count": 50, "price": 0.45, "provider_id": 22}
        }
    }
}
```

Structure: `country -> service -> provider_id -> {count, price, provider_id}`

**Errors:**
- `BAD_KEY` - invalid API key
- `BAD_SERVICE` - incorrect service name
- `BAD_COUNTRY` - incorrect country name

---

## Get Number
```
GET ?api_key={authKey}&action=getNumber&service={service}&country={country}&maxPrice={maxPrice}
```

**Optional params:** `providerIds`, `exceptProviderIds`, `phoneException`, `ref`

**Response (text):**
```
ACCESS_NUMBER:$activationId:$phoneNumber
```

**Errors:**
- `BAD_KEY` - invalid API key
- `BAD_ACTION` - incorrect action
- `BAD_SERVICE` - incorrect service name

---

## Get Number V2 (JSON)
```
GET ?api_key={authKey}&action=getNumberV2&service={service}&country={country}&maxPrice={maxPrice}
```

**Response (JSON):**
```json
{
    "activationId": "123456",
    "phoneNumber": "+15551234567",
    "activationCost": 0.50,
    "countryCode": "0",
    "canGetAnotherSms": true,
    "activationTime": "2024-01-01T00:00:00Z",
    "activationOperator": "any"
}
```

---

## Get Status
```
GET ?api_key={authKey}&action=getStatus&id={id}
```

**Response (text):**
- `STATUS_WAIT_CODE` - Waiting for SMS
- `STATUS_WAIT_RETRY:$lastCode` - Waiting for next SMS
- `STATUS_CANCEL` - Activation canceled
- `STATUS_OK:$code` - Code received

**Errors:**
- `BAD_KEY` - invalid API key
- `NO_ACTIVATION` - incorrect activation id

---

## Set Status (Cancel/Complete)
```
GET ?api_key={authKey}&action=setStatus&id={id}&status={status}
```

**Status values:**
- `1` - Inform ready for SMS
- `3` - Request another code (nextSms)
- `6` - Complete activation
- `8` - Cancel activation

**Response (text):**
- `ACCESS_READY` - Ready for SMS
- `ACCESS_RETRY_GET` - Waiting for new SMS
- `ACCESS_ACTIVATION` - Successfully activated
- `ACCESS_CANCEL` - Activation canceled

**Errors:**
- `NO_ACTIVATION` - incorrect activation id
- `BAD_STATUS` - incorrect status
- `EARLY_CANCEL_DENIED` - Cannot cancel within 2 minutes
