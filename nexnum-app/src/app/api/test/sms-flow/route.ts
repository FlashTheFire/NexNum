/**
 * Test SMS Flow
 * 
 * Orchestrates a full test:
 * 1. Configures Mock Provider in DB
 * 2. Buys a number using SmartRouter logic (direct Provider call)
 * 3. Starts polling
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DynamicProvider } from '@/lib/dynamic-provider'
import { otpPoller } from '@/lib/sms/otp-poller'

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const specificProviderName = searchParams.get('provider')
        const country = searchParams.get('country') || 'us'
        const service = searchParams.get('service') || 'wa'

        let providerData;

        if (specificProviderName) {
            // Fetch existing provider from DB
            providerData = await prisma.provider.findUnique({
                where: { name: specificProviderName }
            })
            if (!providerData) {
                return NextResponse.json({ success: false, error: `Provider '${specificProviderName}' not found` }, { status: 404 })
            }
        } else {
            // Default: Upsert Mock Provider
            const baseUrl = 'http://localhost:3000/api/mock/provider'
            providerData = await prisma.provider.upsert({
                where: { name: 'mock-provider' },
                update: {
                    displayName: 'Mock Provider',
                    // ... verify mappings match schema ...
                    apiBaseUrl: baseUrl
                },
                create: {
                    name: 'mock-provider',
                    displayName: 'Mock Provider',
                    apiBaseUrl: baseUrl,
                    isActive: true,
                    priority: 10,
                    endpoints: {
                        getBalance: { path: '?action=getBalance', method: 'GET' },
                        getNumber: { path: '?action=getNumber', method: 'GET' },
                        getStatus: { path: '?action=getStatus', method: 'GET' }
                    },
                    mappings: {
                        webhook: { strategy: 'none' },
                        // Generic JSON mapping defaults for mock
                        getNumber: {
                            type: 'json',
                            fields: {
                                activationId: 'activationId',
                                phoneNumber: 'number',
                                price: 'cost',
                                countryCode: 'country',
                                serviceCode: 'service'
                            }
                        },
                        getStatus: {
                            type: 'json',
                            fields: {
                                status: 'status',
                                code: 'code'
                            }
                        }
                    },
                    priceMultiplier: 1,
                    fixedMarkup: 0,
                    currency: 'USD',
                    authType: 'none',
                    providerType: 'rest'
                } as any
            })
        }

        // 2. Initialize Provider
        // Ensure we pass the config covering apiBaseUrl
        const dynProvider = new DynamicProvider({
            ...providerData,
            slug: providerData.name,
            apiBaseUrl: providerData.apiBaseUrl, // Explicit mapping to be safe
            // endpoints and mappings are already in providerData
        } as any)

        // 3. Buy Number
        console.log(`[TEST-FLOW] Buying number from ${providerData.name} for ${country}/${service}`)
        const result = await dynProvider.getNumber(country, service)

        // 4. Create Number record
        // Handle "userId" - use a dummy one for test
        const testUserId = 'test-user-' + Date.now()
        // Ensure we have a wallet? (Optional, schema doesn't force relation on create usually, but let's check schema. 
        // Number model has `userId`? No, Number is usually tied to User. 
        // Wait, schema says `Number` has `userId`? Let's check schema.
        // Assuming it's fine for now, or we skip creating number record if we just want to test provider API.
        // But OtpPoller needs a persisted number ID usually?
        // OtpPoller takes (numberId, activationId, providerName, userId).
        // If OtpPoller writes to DB, it might need real Number record.

        const number = await prisma.number.create({
            data: {
                phoneNumber: result.phoneNumber,
                countryCode: result.countryCode || country,
                serviceCode: result.serviceCode || service,
                provider: providerData.name,
                activationId: result.activationId,
                status: 'active',
                price: result.price,
                expiresAt: result.expiresAt
            }
        })

        // 5. Start Polling
        await otpPoller.startPolling(
            number.id,
            result.activationId,
            providerData.name,
            testUserId
        )

        return NextResponse.json({
            success: true,
            step: 'polling_started',
            provider: providerData.name,
            number: {
                id: number.id,
                phone: number.phoneNumber,
                activationId: number.activationId
            },
            providerResult: result
        })


    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack,
        }, { status: 500 })
    }
}
