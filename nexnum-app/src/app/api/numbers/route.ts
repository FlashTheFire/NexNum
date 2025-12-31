import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/jwt'
import { smsProvider } from '@/lib/sms-providers'

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
            const services = await smsProvider.getServices(countryCode)
            return NextResponse.json({
                success: true,
                countryCode,
                services,
            })
        }

        // Otherwise, get list of countries
        const countries = await smsProvider.getCountries()

        return NextResponse.json({
            success: true,
            countries,
        })

    } catch (error) {
        console.error('Get numbers error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
