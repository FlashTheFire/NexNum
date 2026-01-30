import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { smsProvider } from '@/lib/providers'
import { logger } from '@/lib/core/logger'

import { unstable_cache } from 'next/cache'

// Cached Data Fetchers
const getCachedCountries = unstable_cache(
    async () => smsProvider.getCountriesList(),
    ['countries-list'],
    { revalidate: 300 } // 5 minutes
)

const getCachedServices = unstable_cache(
    async (country: string) => smsProvider.getServicesList(country),
    ['services-list'],
    { revalidate: 60 } // 1 minute
)

// GET /api/numbers - List available countries and services
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)
        const countryCode = searchParams.get('country')

        // If country specified, get services for that country
        if (countryCode) {
            const services = await getCachedServices(countryCode)
            return NextResponse.json({
                success: true,
                countryCode,
                services,
            })
        }

        // Otherwise, get list of countries
        const countries = await getCachedCountries()

        return NextResponse.json({
            success: true,
            countries,
        })

    } catch (error) {
        logger.error('Get numbers error', { error, context: 'API_NUMBERS' })
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
