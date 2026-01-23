import React, { useState } from "react"
import { Input } from "@/components/ui/input"
import { Globe, Search } from "lucide-react"

// --- Types & Constants ---

export const ENDPOINT_METHODS = ['getCountries', 'getServices', 'getNumber', 'getStatus', 'getBalance', 'cancelNumber', 'getPrices']
export const METHOD_PARAMS = {
    getCountries: ['{authKey}'],
    getServices: ['{country}', '{authKey}'],
    getNumber: ['{country}', '{service}', '{authKey}'],
    getStatus: ['{id}', '{authKey}'],
    cancelNumber: ['{id}', '{authKey}'],
    getBalance: ['{authKey}'],
    getPrices: ['{country}', '{service}', '{authKey}']
}

export const MAPPING_FIELDS = {
    getCountries: ['id', 'name', 'code'],
    getServices: ['id', 'name', 'code', 'price', 'count'],
    getNumber: ['id', 'phone', 'price'],
    getStatus: ['status', 'code', 'sms'],
    getBalance: ['balance'],
    getPrices: ['cost', 'count', 'country', 'service', 'operator']
}

export function safeParse(jsonString: string) {
    try {
        return JSON.parse(jsonString)
    } catch (e) {
        return {}
    }
}

export const PROVIDER_TEMPLATES = {
    '5sim': {
        name: '5sim',
        displayName: '5sim.net',
        description: 'Official v1 guest/user endpoints. Uses Bearer auth for user actions and guest endpoints for public lists.',
        baseUrl: 'https://5sim.net/v1',
        authType: 'bearer',

        endpoints: '{\n' +
            '  "getCountries": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/guest/countries"\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/guest/products/any/any"\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/user/buy/activation/$country/$operator/$product",\n' +
            '    "queryParams": {\n' +
            '      "forwarding": "$forwarding",\n' +
            '      "number": "$forwardingNumber",\n' +
            '      "reuse": "$reuse",\n' +
            '      "voice": "$voice",\n' +
            '      "ref": "$ref",\n' +
            '      "maxPrice": "$maxPrice"\n' +
            '    }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/user/check/$id"\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/user/cancel/$id"\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/user/profile"\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://5sim.net/v1/guest/prices",\n' +
            '    "queryParams": {\n' +
            '      "country": "$country",\n' +
            '      "product": "$service"\n' +
            '    }\n' +
            '  }\n' +
            '}',

        mappings: '{\n' +
            '  "getCountries": {\n' +
            '    "type": "json_dictionary",\n' +
            '    "fields": {\n' +
            '      "name": "text_en|$key",\n' +
            '      "iso": "iso.$firstKey",\n' +
            '      "prefix": "prefix.$firstKey",\n' +
            '      "countryCode": "$key"\n' +
            '    }\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "type": "json_dictionary",\n' +
            '    "fields": {\n' +
            '      "service": "$key",\n' +
            '      "category": "Category",\n' +
            '      "count": "Qty|count|stock",\n' +
            '      "cost": "Price|cost|amount"\n' +
            '    }\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "type": "json_object",\n' +
            '    "fields": {\n' +
            '      "id": "id",\n' +
            '      "phone": "phone",\n' +
            '      "operator": "operator",\n' +
            '      "service": "product",\n' +
            '      "cost": "price",\n' +
            '      "status": "status",\n' +
            '      "expiresAt": "expires",\n' +
            '      "country": "country",\n' +
            '      "sms": "sms"\n' +
            '    }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "type": "json_object",\n' +
            '    "fields": {\n' +
            '      "id": "id",\n' +
            '      "phone": "phone",\n' +
            '      "operator": "operator",\n' +
            '      "service": "product",\n' +
            '      "cost": "price",\n' +
            '      "status": "status",\n' +
            '      "expiresAt": "expires",\n' +
            '      "country": "country",\n' +
            '      "sms": "sms",\n' +
            '      "code": "sms[0].code",\n' +
            '      "message": "sms[0].text"\n' +
            '    }\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "type": "json_object",\n' +
            '    "fields": {\n' +
            '      "id": "id",\n' +
            '      "phone": "phone",\n' +
            '      "operator": "operator",\n' +
            '      "service": "product",\n' +
            '      "cost": "price",\n' +
            '      "status": "status",\n' +
            '      "expiresAt": "expires",\n' +
            '      "country": "country"\n' +
            '    }\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "type": "json_object",\n' +
            '    "fields": {\n' +
            '      "balance": "balance",\n' +
            '      "id": "id",\n' +
            '      "email": "email",\n' +
            '      "rating": "rating"\n' +
            '    }\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "type": "json_dictionary",\n' +
            '    "nestingLevels": {\n' +
            '      "extractOperators": true\n' +
            '    },\n' +
            '    "fields": {\n' +
            '      "cost": "cost|price|amount|rate|value",\n' +
            '      "count": "count|qty|stock|available|physicalCount",\n' +
            '      "operator": "$key",\n' +
            '      "service": "$parentKey",\n' +
            '      "country": "$grandParentKey"\n' +
            '    }\n' +
            '  }\n' +
            '}'
    },
    'grizzlysms': {
        name: 'grizzlysms',
        displayName: 'GrizzlySMS',
        description: 'Popular provider. Uses JSON API (v2/V3) for best reliability.',
        baseUrl: 'https://api.grizzlysms.com/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',

        endpoints: '{\n' +
            '  "getCountries": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php?action=getCountries&api_key={authKey}"\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php?action=getServicesList&country={country}&lang=en&api_key={authKey}"\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php?action=getNumberV2&service={service}&country={country}&api_key={authKey}"\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php?action=getStatus&id={id}&api_key={authKey}"\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php?action=setStatus&id={id}&status=8&api_key={authKey}"\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php?action=getBalance&api_key={authKey}"\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://api.grizzlysms.com/stubs/handler_api.php",\n' +
            '    "queryParams": {\n' +
            '      "action": "getPricesV3",\n' +
            '      "api_key": "{authKey}",\n' +
            '      "country": "$country",\n' +
            '      "service": "$service"\n' +
            '    }\n' +
            '  }\n' +
            '}',

        mappings: '{\n' +
            '  "getCountries": {\n' +
            '    "type": "json_array",\n' +
            '    "rootPath": "$",\n' +
            '    "fields": {\n' +
            '      "id": "id",\n' +
            '      "code": "id",\n' +
            '      "name": "eng"\n' +
            '    }\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "type": "json_dictionary",\n' +
            '    "fields": {\n' +
            '      "id": "$key",\n' +
            '      "code": "$key",\n' +
            '      "name": "name",\n' +
            '      "price": "cost"\n' +
            '    }\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "type": "json_object",\n' +
            '    "fields": {\n' +
            '      "id": "activationId",\n' +
            '      "phone": "phoneNumber",\n' +
            '      "price": "activationCost"\n' +
            '    }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "STATUS_([A-Z_]+)(:?.*)?",\n' +
            '    "fields": {\n' +
            '      "status": "1",\n' +
            '      "code": "2"\n' +
            '    }\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_CANCEL",\n' +
            '    "fields": {\n' +
            '      "status": "0"\n' +
            '    },\n' +
            '    "errorPatterns": { "UNKNOWN_ERROR": "/BAD_ACTION|BAD_STATUS/" }\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_BALANCE:([\\\\d.]+)",\n' +
            '    "fields": {\n' +
            '      "balance": "1"\n' +
            '    }\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "path": "$",\n' +
            '    "type": "dictionary",\n' +
            '    "nestingLevels": {\n' +
            '      "providersKey": "providers",\n' +
            '      "extractOperators": true\n' +
            '    },\n' +
            '    "fields": {\n' +
            '      "country": "$parentKey",\n' +
            '      "service": "$key",\n' +
            '      "operator": "$operatorKey",\n' +
            '      "cost": "price|cost",\n' +
            '      "count": "count|quantity"\n' +
            '    }\n' +
            '  }\n' +
            '}'
    },

    'smsbower': {
        name: 'smsbower',
        displayName: 'SMSBower',
        description: 'Legacy-style provider with extended v3 pricing and v2 getNumber. Query-param auth.',
        baseUrl: 'https://smsbower.online/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',

        endpoints: '{\n' +
            '  "getCountries": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": { "action": "getCountries" }\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": { "action": "getServicesList" }\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": {\n' +
            '      "action": "getNumberV2",\n' +
            '      "service": "$service",\n' +
            '      "country": "$country",\n' +
            '      "maxPrice": "$maxPrice",\n' +
            '      "providerIds": "$providerIds",\n' +
            '      "exceptProviderIds": "$exceptProviderIds"\n' +
            '    }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": { "action": "getStatus", "id": "$id" }\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": { "action": "setStatus", "status": "8", "id": "$id" }\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": { "action": "getBalance" }\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "https://smsbower.online/stubs/handler_api.php",\n' +
            '    "queryParams": { "action": "getPricesV3", "service": "$service", "country": "$country" }\n' +
            '  }\n' +
            '}',

        mappings: '{\n' +
            '  "getCountries": {\n' +
            '    "type": "json_array",\n' +
            '    "fields": {\n' +
            '      "id": "id",\n' +
            '      "name_en": "eng",\n' +
            '      "name_ru": "rus",\n' +
            '      "name_cn": "chn"\n' +
            '    }\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "type": "json_array",\n' +
            '    "rootPath": "services",\n' +
            '    "fields": {\n' +
            '      "code": "code",\n' +
            '      "name": "name"\n' +
            '    }\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "type": "json_object",\n' +
            '    "fields": {\n' +
            '      "activation_id": "activationId",\n' +
            '      "phone_number": "phoneNumber",\n' +
            '      "cost": "activationCost",\n' +
            '      "country_code": "countryCode",\n' +
            '      "can_get_another_sms": "canGetAnotherSms",\n' +
            '      "activation_time": "activationTime",\n' +
            '      "operator": "activationOperator"\n' +
            '    },\n' +
            '    "transform": {\n' +
            '      "cost": "number",\n' +
            '      "can_get_another_sms": "boolean"\n' +
            '    }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "(?<status>STATUS_WAIT_CODE|STATUS_WAIT_RETRY|STATUS_CANCEL|STATUS_OK)(?::(?<code>.+))?",\n' +
            '    "fields": {\n' +
            '      "status": "status",\n' +
            '      "code": "code"\n' +
            '    },\n' +
            '    "conditionalFields": {\n' +
            '      "STATUS_WAIT_CODE": { \"status\": \"PENDING\" },\n' +
            '      "STATUS_WAIT_RETRY": { \"status\": \"PENDING\", \"message\": \"Waiting for next sms\" },\n' +
            '      "STATUS_CANCEL": { \"status\": \"CANCELLED\" },\n' +
            '      "STATUS_OK": { \"status\": \"RECEIVED\" }\n' +
            '    }\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_CANCEL",\n' +
            '    "fields": { \"status\": \"ACCESS_CANCEL\" },\n' +
            '    "conditionalFields": { \"ACCESS_CANCEL\": { \"status\": \"CANCELLED\" } }\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_BALANCE:(?<balance>[0-9.]+)",\n' +
            '    "fields": { \"balance\": \"balance\" },\n' +
            '    "transform": { \"balance\": \"number\" }\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "type": "json_dictionary",\n' +
            '    "nestingLevels": { \"extractOperators\": true },\n' +
            '    "fields": {\n' +
            '      \"cost\": \"price|cost|rate\",\n' +
            '      \"count\": \"count|qty|stock\",\n' +
            '      \"operator\": \"provider_id|$key\",\n' +
            '      \"service\": \"$parentKey\",\n' +
            '      \"country\": \"$grandParentKey\"\n' +
            '    },\n' +
            '    "transform": { \"cost\": \"number\", \"count\": \"number\" }\n' +
            '  }\n' +
            '}'
    },


    'herosms': {
        name: 'herosms',
        displayName: 'HeroSMS',
        description: 'SMS-Activate Compatible API. Uses query params for auth.',
        baseUrl: 'https://hero-sms.com/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',
        endpoints: '{\n  "getCountries": { "method": "GET", "path": "https://hero-sms.com/stubs/handler_api.php?action=getCountries&api_key={authKey}" },\n  "getServices": { "method": "GET", "path": "https://hero-sms.com/stubs/handler_api.php?action=getServicesList&country={country}&lang=en&api_key={authKey}" },\n  "getNumber": { "method": "GET", "path": "https://hero-sms.com/stubs/handler_api.php?action=getNumber&service={service}&country={country}&api_key={authKey}" },\n  "getStatus": { "method": "GET", "path": "https://hero-sms.com/stubs/handler_api.php?action=getStatus&id={id}&api_key={authKey}" },\n  "cancelNumber": { "method": "GET", "path": "https://hero-sms.com/stubs/handler_api.php?action=setStatus&id={id}&status=8&api_key={authKey}" },\n  "getBalance": { "method": "GET", "path": "https://hero-sms.com/stubs/handler_api.php?action=getBalance&api_key={authKey}" }\n}',
        mappings: '{\n  "getCountries": { "type": "json_array", "rootPath": "$", "fields": { "id": "id", "name": "eng", "code": "id" } },\n  "getServices": { "type": "json_array", "rootPath": "services", "fields": { "id": "code", "name": "name", "code": "code" } },\n  "getNumber": { "type": "text_regex", "regex": "ACCESS_NUMBER:(\\\\d+):(\\\\d+)", "fields": { "id": "1", "phone": "2", "price": "0" } },\n  "getStatus": { "type": "text_regex", "regex": "STATUS_([A-Z_]+)(:?.*)?", "fields": { "status": "1", "code": "2" } },\n  "cancelNumber": { "type": "text_regex", "regex": "ACCESS_CANCEL", "fields": { "status": "0" } },\n  "getBalance": { "type": "text_regex", "regex": "ACCESS_BALANCE:([\\\\d.]+)", "fields": { "balance": "1" } }\n}'
    },

    'mock-sms': {
        name: 'mock-sms',
        displayName: 'Mock SMS (Local)',
        description: 'Local simulation of SMS-Activate protocol. Requires /api/mock-sms to be running.',
        baseUrl: 'http://localhost:3000/api/mock-sms',
        authType: 'none',

        endpoints: '{\n' +
            '  "getCountries": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "getCountries" }\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "getServicesList" }\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "getNumber", "service": "{service}", "country": "{country}" }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "getStatus", "id": "{id}" }\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "setStatus", "id": "{id}", "status": "8" }\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "getBalance" }\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "method": "GET",\n' +
            '    "path": "http://localhost:3000/api/mock-sms",\n' +
            '    "queryParams": { "action": "getPrices", "country": "{country}" }\n' +
            '  }\n' +
            '}',

        mappings: '{\n' +
            '  "getCountries": {\n' +
            '    "type": "json_dictionary",\n' +
            '    "fields": {\n' +
            '      "id": "id",\n' +
            '      "name": "eng|rus|chn",\n' +
            '      "code": "id"\n' +
            '    }\n' +
            '  },\n' +
            '  "getServices": {\n' +
            '    "type": "json_array",\n' +
            '    "rootPath": "services",\n' +
            '    "fields": {\n' +
            '      "code": "code",\n' +
            '      "name": "name"\n' +
            '    }\n' +
            '  },\n' +
            '  "getPrices": {\n' +
            '    "type": "json_nested_dictionary",\n' +
            '    "fields": {\n' +
            '      "cost": "cost",\n' +
            '      "count": "count"\n' +
            '    }\n' +
            '  },\n' +
            '  "getNumber": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_NUMBER:(\\\\d+):(\\\\d+)",\n' +
            '    "fields": {\n' +
            '      "activationId": "$1",\n' +
            '      "phoneNumber": "$2"\n' +
            '    }\n' +
            '  },\n' +
            '  "getStatus": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "(STATUS_WAIT_CODE|STATUS_OK:([0-9A-Za-z]+)|STATUS_WAIT_RETRY:([0-9A-Za-z]+)|STATUS_CANCEL|ACCESS_READY|ACCESS_ACTIVATION)",\n' +
            '    "fields": {\n' +
            '      "rawStatus": "$1",\n' +
            '      "code": "$2"\n' +
            '    },\n' +
            '    "statusMapping": {\n' +
            '      "STATUS_WAIT_CODE": "pending",\n' +
            '      "STATUS_WAIT_RETRY": "pending",\n' +
            '      "STATUS_OK": "received",\n' +
            '      "STATUS_CANCEL": "cancelled",\n' +
            '      "ACCESS_CANCEL": "cancelled",\n' +
            '      "ACCESS_READY": "pending",\n' +
            '      "ACCESS_ACTIVATION": "completed"\n' +
            '    }\n' +
            '  },\n' +
            '  "cancelNumber": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_CANCEL",\n' +
            '    "fields": { "status": "0" },\n' +
            '    "errorPatterns": { "UNKNOWN_ERROR": "/BAD_ACTION|BAD_STATUS|ERROR_BAD_STATUS/" }\n' +
            '  },\n' +
            '  "getBalance": {\n' +
            '    "type": "text_regex",\n' +
            '    "regex": "ACCESS_BALANCE:([0-9.]+)",\n' +
            '    "fields": { "balance": "$1" }\n' +
            '  }\n' +
            '}'
    },

    'empty': {
        name: 'custom',
        displayName: 'Custom Provider',
        description: 'Configure manually for any SMS API.',
        baseUrl: 'https://api.example.com',
        authType: 'bearer',
        endpoints: '{}',
        mappings: '{}'
    }
}

// --- Components ---

export function VariableHelper({ onInsert, context = 'endpoint' }: { onInsert: (v: string) => void, context?: 'endpoint' | 'mapping' }) {
    const variables = context === 'endpoint' ? [
        { label: 'Auth Key', value: '{authKey}', desc: 'API Key/Token from step 3' },
        { label: 'Country', value: '{country}', desc: 'Selected country code' },
        { label: 'Service', value: '{service}', desc: 'Selected service code' },
        { label: 'Activation ID', value: '{id}', desc: 'Transaction ID' },
        { label: 'Ref ID', value: '{ref}', desc: 'Referral ID (Optional)' },
    ] : [
        { label: 'Root Object', value: '$', desc: 'JSON Root' },
        { label: 'Current Key', value: '$key', desc: 'Object Key Name' },
        { label: 'First Value', value: '$firstValue', desc: 'First Object Value' },
        { label: 'First Key', value: '$firstKey', desc: 'First Object Key' },
    ]

    return (
        <div className="space-y-2 md:space-y-3 p-3 md:p-4 bg-white/5 border border-white/5 rounded-xl">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[9px] md:text-[10px] uppercase font-bold text-white/40 tracking-widest">Available Variables</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
                {variables.map(v => (
                    <button
                        key={v.value}
                        onClick={() => onInsert(v.value)}
                        className="group flex flex-col items-start gap-0.5 p-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left"
                    >
                        <code className="text-[10px] text-blue-300 bg-blue-500/10 px-1 py-0.5 rounded border border-blue-500/20 group-hover:bg-blue-500/20">{v.value}</code>
                        <span className="text-[9px] text-white/30">{v.desc}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

export function EndpointEditor({ endpoints, onChange }: { endpoints: any, onChange: (e: any) => void }) {
    const [activeMethod, setActiveMethod] = useState('getCountries')

    const setEndpoint = (updates: any) => {
        onChange({
            ...endpoints,
            [activeMethod]: {
                ...(endpoints[activeMethod] || { method: 'GET', path: '' }),
                ...updates
            }
        })
    }

    const currentendpoint = endpoints[activeMethod] || { method: 'GET', path: '' }

    return (
        <div className="space-y-2 md:space-y-3">
            {/* Method Tabs - Scrollable on mobile */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                {ENDPOINT_METHODS.map(method => (
                    <button
                        key={method}
                        onClick={() => setActiveMethod(method)}
                        className={`text-[10px] md:text-xs px-2 md:px-3 py-1 md:py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${activeMethod === method ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        {method.replace('get', '').replace('cancel', 'Cancel ')}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {/* Method + Path - Stack on mobile */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="w-full md:w-24 space-y-1.5">
                        <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Method</label>
                        <select
                            title="HTTP Method"
                            className="w-full h-9 px-3 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all cursor-pointer"
                            value={currentendpoint.method || 'GET'}
                            onChange={e => setEndpoint({ method: e.target.value })}
                        >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                    <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">API Path / URL</label>
                            {(currentendpoint.path?.startsWith('http') && currentendpoint.path?.includes('api_key=')) && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-400/10 border border-orange-400/20">
                                    <span className="text-[9px] font-bold text-orange-400 uppercase">Legacy Auth</span>
                                </div>
                            )}
                            {(currentendpoint.path?.startsWith('http://') || currentendpoint.path?.startsWith('https://')) && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20">
                                    <div className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse" />
                                    <span className="text-[9px] font-bold text-yellow-400 uppercase">Hybrid Mode</span>
                                </div>
                            )}
                        </div>
                        <div className="relative group">
                            <Input
                                value={currentendpoint.path || ''}
                                onChange={e => setEndpoint({ path: e.target.value })}
                                placeholder="/v1/user/... OR https://..."
                                className={`bg-black/40 border-white/10 font-mono text-xs h-9 pr-8 transition-all focus:bg-black/60 ${(currentendpoint.path?.startsWith('http://') || currentendpoint.path?.startsWith('https://')) ? 'border-yellow-400/30 text-yellow-100' : ''}`}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
                                <Globe className="w-3.5 h-3.5 text-white/50" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Param Helpers - Smaller on mobile */}
                {METHOD_PARAMS[activeMethod as keyof typeof METHOD_PARAMS]?.length > 0 && (
                    <div className="p-2 bg-blue-500/5 rounded-lg border border-blue-500/10">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-bold text-blue-400/60 uppercase tracking-widest pl-1">Insert Params:</span>
                            {METHOD_PARAMS[activeMethod as keyof typeof METHOD_PARAMS].map(param => (
                                <button
                                    key={param}
                                    type="button"
                                    onClick={() => setEndpoint({ path: (currentendpoint.path || '') + param })}
                                    className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/30 transition-all font-mono"
                                >
                                    {param}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export function MappingEditor({ mappings, onChange }: { mappings: any, onChange: (m: any) => void }) {
    const [activeMethod, setActiveMethod] = useState('getCountries')

    const setMapping = (updates: any) => {
        onChange({
            ...mappings,
            [activeMethod]: {
                ...(mappings[activeMethod] || {}),
                ...updates
            }
        })
    }

    const currentMapping = mappings[activeMethod] || {}

    return (
        <div className="space-y-3">
            {/* Method Tabs - Scrollable */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                {Object.keys(MAPPING_FIELDS).map(method => (
                    <button
                        key={method}
                        onClick={() => setActiveMethod(method)}
                        className={`text-[10px] md:text-xs px-2 md:px-3 py-1 md:py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${activeMethod === method ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        {method.replace('get', '').replace('cancel', 'Cancel ')}
                    </button>
                ))}
            </div>

            {/* Type + Root - Stack on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Response Format</label>
                    <select
                        title="Response Format"
                        className="w-full h-9 px-3 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all cursor-pointer"
                        value={currentMapping.type || 'json_object'}
                        onChange={e => setMapping({ type: e.target.value })}
                    >
                        <option value="json_dictionary">Dictionary (Key-Value)</option>
                        <option value="json_array">Array (List)</option>
                        <option value="json_object">Standard Object</option>
                        <option value="text_regex">Text (Regex Match)</option>
                        <option value="text_lines">Text (Line Split)</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Root Search Path</label>
                    <div className="relative group">
                        <Input
                            placeholder="e.g. data.items"
                            value={currentMapping.rootPath || ''}
                            onChange={e => setMapping({ rootPath: e.target.value })}
                            className="bg-black/40 border-white/10 text-xs h-9 pr-8 focus:bg-black/60 transition-all font-mono"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
                            <Search className="w-3.5 h-3.5 text-white/50" />
                        </div>
                    </div>
                </div>
            </div>

            {currentMapping.type === 'text_regex' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Extraction Pattern (Regex)</label>
                    <div className="relative">
                        <Input
                            placeholder="e.g. ID:(\d+)"
                            value={currentMapping.regex || ''}
                            onChange={e => setMapping({ regex: e.target.value })}
                            className="bg-black/40 border-purple-500/30 font-mono text-xs h-9 text-purple-100"
                        />
                        <p className="mt-1 text-[9px] text-white/30 italic">Use (brackets) for capture groups. First group is $1, etc.</p>
                    </div>
                </div>
            )}

            {/* Field Map - Compact scrollable table */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Field Extractors</label>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                            <div className="w-1 h-1 rounded-full bg-purple-400" />
                            <span className="text-[9px] text-white/50">Dot notation supported</span>
                        </div>
                    </div>
                </div>

                <div className="relative bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                    <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        <table className="w-full text-left text-[11px] md:text-xs border-collapse">
                            <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur-md shadow-sm">
                                <tr>
                                    <th className="p-2 md:p-2.5 font-bold text-white/40 border-b border-white/10 w-24 md:w-32">EXPECTED FIELD</th>
                                    <th className="p-2 md:p-2.5 font-bold text-white/40 border-b border-white/10">PATH / KEY / REGEX GROUP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {MAPPING_FIELDS[activeMethod as keyof typeof MAPPING_FIELDS].map((field: string) => (
                                    <tr key={field} className="group hover:bg-white/5 transition-colors">
                                        <td className="p-2 md:p-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-3 rounded-full bg-purple-500/30 group-hover:bg-purple-500 transition-colors" />
                                                <code className="text-white font-medium text-[10px] md:text-[11px]">{field}</code>
                                            </div>
                                        </td>
                                        <td className="p-2 md:p-2.5">
                                            <input
                                                className="w-full bg-transparent border-none text-white text-[10px] md:text-[11px] focus:outline-none focus:ring-0 placeholder-white/20 font-mono"
                                                placeholder={`path for ${field}...`}
                                                value={currentMapping.fields?.[field] || ''}
                                                onChange={e => setMapping({
                                                    fields: { ...currentMapping.fields, [field]: e.target.value }
                                                })}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
