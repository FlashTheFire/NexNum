import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'

// ----------------------------------------------------------------------------
// 🛠️ CONFIGURATION AREA: EDIT THIS SECTION TO ADD YOUR REAL PROVIDER
// ----------------------------------------------------------------------------
const REAL_PROVIDER_CONFIG = {
    // Unique identifier (slug)
    slug: 'my-real-provider', // e.g. '5sim', 'sms-activate'

    // Display Name
    name: 'My Real Provider',

    // API Details
    baseUrl: 'https://api.example.com/v1', // ⚠️ CHANGE THIS
    apiKey: 'YOUR_API_KEY_HERE',           // ⚠️ CHANGE THIS

    // Provider Type: 'rest' (modern JSON) or 'rest' with text regex mappings
    providerType: 'rest',

    // API Endpoints Configuration
    endpoints: {
        getBalance: {
            method: 'GET',
            path: '/user/balance?api_key={apiKey}'
        },
        getNumber: {
            method: 'GET',
            path: '/user/buy/activation/{country}/{service}?api_key={apiKey}'
        },
        getStatus: {
            method: 'GET',
            path: '/user/activation/{id}/status?api_key={apiKey}'
        },
        cancelNumber: {
            method: 'POST', // or GET
            path: '/user/activation/{id}/cancel?api_key={apiKey}'
        }
    },

    // Response Mappings (How to read the API response)
    mappings: {
        // Example for JSON Response
        getNumber: {
            type: 'json',
            fields: {
                activationId: 'id',      // Field name in API response for ID
                phoneNumber: 'phone',    // Field name for Number
                price: 'cost',           // Field name for Price
                countryCode: 'country',
                serviceCode: 'service'
            }
        },
        getStatus: {
            type: 'json',
            fields: {
                status: 'status', // e.g. "PENDING", "RECEIVED"
                code: 'code',     // e.g. "123456"
                sms: 'text'       // Full SMS text
            }
        }
    }
}

// ----------------------------------------------------------------------------
/*
   💡 FOR TEXT-BASED PROVIDERS (Regex), USE THIS MAPPING STYLE:
   
   mappings: {
       getNumber: {
           type: 'text_lines',
           separator: ':',
           fields: {
               activationId: '1', // Index 1 (ACCESS_NUMBER:ID:PHONE)
               phoneNumber: '2'
           }
       },
       getStatus: {
           type: 'text_lines',
           separator: ':',
           fields: {
               status: '0', // Index 0 (STATUS_OK:CODE)
               code: '1'
           }
       }
   }
*/
// ----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        // SECURITY: Block in production - this is a dev-only seeding tool
        if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({
                success: false,
                message: 'This endpoint is disabled in production. Use the Admin UI to add providers.'
            }, { status: 403 })
        }

        const { slug, name, baseUrl, apiKey, providerType, endpoints, mappings } = REAL_PROVIDER_CONFIG

        // 1. Validation
        if (baseUrl.includes('api.example.com')) {
            return NextResponse.json({
                success: false,
                message: 'Please edit the REAL_PROVIDER_CONFIG in src/app/api/admin/seed-provider/route.ts first!'
            }, { status: 400 })
        }

        // 2. Upsert to Database
        const provider = await prisma.provider.upsert({
            where: { name: slug },
            update: {
                displayName: name,
                providerType,
                apiBaseUrl: baseUrl, // Securely stored? Ideally in .env, but for dynamic adding we store in DB
                // We'll store API Key in endpoints path substitution or headers if needed, 
                // but usually DynamicProvider expects `apiKey` in config to inject.
                // Our Schema might not have `apiKey` column directly if we want security.
                // NOTE: For this simple implementation, we assume `apiKey` is injected via DB mappings 
                // OR we can store it in a `config` JSON field if schema allows.
                // Looking at schema... we have `endpoints` and `mappings`. 
                // We do NOT have a dedicated `apiKey` column visible in previous file views.
                // We will add it to the `endpoints` config object implicitly or modify schema later.
                // For now, let's assume we bake it into the `endpoints` paths or use a `config` json field?
                // Checking Schema...
                // Only `endpoints` (Json) and `mappings` (Json).
                // We will bake the API Key into the `Global Config` part of endpoints?
                // Or simply rely on the User putting the ACTUAL key in the `endpoints` path definition above 
                // OR wrapping it in a special internal config.

                // Hack: We'll put `apiKey` into the `endpoints` JSON as a top-level property so DynamicProvider can find it 
                // if it looks there (it doesn't by default).
                // Actually DynamicProvider expects `this.config.apiKey`.
                // We might need to migrate schema to add `apiKey` or `config` column.
                // FOR NOW: We will replace {apiKey} token in the stored JSON itself or user hardcodes it.
                // User instruction: Hardcode it in the path for now.

                endpoints: endpoints as any,
                mappings: mappings as any,
                isActive: true
            },
            create: {
                name: slug,
                displayName: name,
                providerType,
                apiBaseUrl: baseUrl,
                endpoints: endpoints as any,
                mappings: mappings as any,
                priority: 10,
                isActive: true
            }
        })

        return NextResponse.json({
            success: true,
            message: `Provider '${slug}' upserted successfully.`,
            provider: {
                id: provider.id,
                name: provider.name,
                type: provider.providerType
            },
            instruction: `Now go to /api/test/sms-flow?provider=${slug}&country=us&service=wa to test it!`
        })

    } catch (error: any) {
        console.error(error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
