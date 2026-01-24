
import * as dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const ENDPOINTS = {
    "getNumber": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "action": "getNumber",
            "country": "$country",
            "service": "$service"
        }
    },
    "getPrices": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "action": "getPrices",
            "country": "$country",
            "service": "$service"
        }
    },
    "getStatus": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "id": "$id",
            "action": "getStatus"
        }
    },
    "setStatus": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "id": "$id",
            "action": "setStatus",
            "status": "$status"
        }
    },
    "getBalance": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "action": "getBalance"
        }
    },
    "getServices": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "action": "getServicesList"
        }
    },
    "cancelNumber": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "id": "$id",
            "action": "setStatus",
            "status": "8"
        }
    },
    "getCountries": {
        "path": "",
        "method": "GET",
        "queryParams": {
            "action": "getCountries"
        }
    }
}

const MAPPINGS = {
    "getNumber": {
        "type": "text_regex",
        "regex": "^ACCESS_NUMBER:(\\d+):(\\d+)$",
        "fields": {
            "phoneNumber": "2",
            "activationId": "1"
        },
        "errorPatterns": {
            "BAD_KEY": "BAD_KEY",
            "NO_BALANCE": "NO_BALANCE",
            "NO_NUMBERS": "NO_NUMBERS",
            "no_numbers": "NO_NUMBERS",
            "BAD_SERVICE": "BAD_SERVICE"
        }
    },
    "getPrices": {
        "path": "$",
        "type": "json_dictionary",
        "fields": {
            "cost": "price|cost",
            "count": "count|quantity",
            "country": "$parentKey",
            "service": "$key",
            "operator": "$operatorKey"
        },
        "nestingLevels": {
            "providersKey": "providers",
            "extractOperators": true
        }
    },
    "getStatus": {
        "type": "text_regex",
        "regex": "^(STATUS_[A-Z_]+)(?::([0-9A-Za-z]+))?$",
        "fields": {
            "code": "2",
            "rawStatus": "1"
        },
        "statusMapping": {
            "STATUS_OK": "received",
            "ACCESS_READY": "pending",
            "ACCESS_CANCEL": "cancelled",
            "STATUS_CANCEL": "cancelled",
            "STATUS_WAIT_CODE": "pending",
            "ACCESS_ACTIVATION": "completed",
            "STATUS_WAIT_RETRY": "pending"
        }
    },
    "setStatus": {
        "type": "text_regex",
        "regex": "(ACCESS_READY|ACCESS_ACTIVATION|ACCESS_CANCEL|ACCESS_RETRY_GET)",
        "fields": {
            "status": "0"
        }
    },
    "getBalance": {
        "type": "text_regex",
        "regex": "ACCESS_BALANCE:([\\d.]+)",
        "fields": {
            "balance": "1"
        }
    },
    "getServices": {
        "type": "json_array",
        "fields": {
            "code": "code",
            "name": "name"
        },
        // Removed "rootPath": "services" because mock API returns array directly
    },
    "cancelNumber": {
        "type": "text_regex",
        "regex": "(ACCESS_CANCEL)|(BAD_.*|ERROR_.*)",
        "fields": {
            "errorMatch": "2",
            "successMatch": "1"
        },
        "errorPatterns": {
            "UNKNOWN_ERROR": "/BAD_.*|ERROR_.*/"
        },
        "conditionalFields": {
            "errorMatch": {
                "message": "2"
            },
            "successMatch": {
                "status": "0"
            }
        }
    },
    "getCountries": {
        "type": "json_dictionary",
        "fields": {
            "id": "id",
            "code": "id",
            "name": "eng|rus|chn"
        }
    }
}

async function main() {
    // Ensure provider exists or update it
    const provider = await prisma.provider.upsert({
        where: { name: 'mock-sms' },
        update: {
            endpoints: ENDPOINTS,
            mappings: MAPPINGS,
            useDynamicMetadata: true,
            apiBaseUrl: 'http://localhost:3000/api/mock-sms',
            authType: 'none',
            providerType: 'rest', // Ensure REST type for dynamic engine
            displayName: 'Mock SMS Provider',
            description: 'Internal simulator for testing',
            isActive: true
        },
        create: {
            name: 'mock-sms',
            displayName: 'Mock SMS Provider',
            description: 'Internal simulator for testing',
            endpoints: ENDPOINTS,
            mappings: MAPPINGS,
            apiBaseUrl: 'http://localhost:3000/api/mock-sms',
            authType: 'none',
            providerType: 'rest',
            currency: 'USD',
            isActive: true,
            priority: 100
        }
    })

    console.log('Successfully updated mock-sms provider configuration');
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
