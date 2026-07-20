import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'

// L-NEW-5: read all config from env so the committed file no longer holds placeholders.
// Required env (all four must be set for seeding to run; otherwise returns 500 with a clear message):
//   SEED_PROVIDER_SLUG, SEED_PROVIDER_NAME, SEED_PROVIDER_BASE_URL, SEED_PROVIDER_API_KEY
// Optional: SEED_PROVIDER_TYPE (default 'rest')

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

        const slug = process.env.SEED_PROVIDER_SLUG
        const name = process.env.SEED_PROVIDER_NAME
        const baseUrl = process.env.SEED_PROVIDER_BASE_URL
        const apiKey = process.env.SEED_PROVIDER_API_KEY
        const providerType = process.env.SEED_PROVIDER_TYPE || 'rest'

        if (!slug || !name || !baseUrl || !apiKey) {
            return NextResponse.json({
                success: false,
                message: 'Missing SEED_PROVIDER_SLUG / SEED_PROVIDER_NAME / SEED_PROVIDER_BASE_URL / SEED_PROVIDER_API_KEY in env'
            }, { status: 500 })
        }

        if (baseUrl.includes('api.example.com') || apiKey === 'YOUR_API_KEY_HERE') {
            return NextResponse.json({
                success: false,
                message: 'Seed provider env still has placeholder values'
            }, { status: 500 })
        }

        // 2. Upsert to Database
        const provider = await prisma.provider.upsert({
            where: { name: slug },
            update: {
                displayName: name,
                providerType,
                apiBaseUrl: baseUrl,
                endpoints: {} as any,
                mappings: {} as any,
                isActive: true
            },
            create: {
                name: slug,
                displayName: name,
                providerType,
                apiBaseUrl: baseUrl,
                endpoints: {} as any,
                mappings: {} as any,
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
