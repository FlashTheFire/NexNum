// HeroSMS Provider Adapter
// Professional Implementation - Based on provider-sync.ts patterns
// API: https://hero-sms.com/api

import type {
    SmsProvider,
    Country,
    Service,
    NumberResult,
    StatusResult,
    NumberStatus
} from './types'
import { normalizeCountryEntry } from '../country-normalizer'

// API Configuration
const API_URL = process.env.HERO_SMS_API_URL || 'https://hero-sms.com/stubs/handler_api.php'
const API_KEY = process.env.HERO_SMS_API_KEY

export class HeroSmsProvider implements SmsProvider {
    name = 'herosms'

    /**
     * Handler API request (SMS-Activate compatible)
     */
    private async request(action: string, params: Record<string, string> = {}): Promise<string> {
        if (!API_KEY) {
            throw new Error('HERO_SMS_API_KEY is not configured')
        }

        const url = new URL(API_URL)
        url.searchParams.set('api_key', API_KEY)
        url.searchParams.set('action', action)

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }

        const response = await fetch(url.toString(), {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })

        if (!response.ok) {
            throw new Error(`HeroSMS API error: ${response.status}`)
        }

        const text = await response.text()

        // Handle error responses
        if (text.startsWith('BAD_') || text.startsWith('NO_') || text.startsWith('ERROR')) {
            throw new Error(`HeroSMS error: ${text}`)
        }

        return text
    }

    /**
     * Fetch available countries
     * Uses same pattern as provider-sync.ts getCountriesLegacy for herosms
     */
    async getCountries(): Promise<Country[]> {
        const response = await this.request('getCountries', { lang: 'en' })
        const data = JSON.parse(response)

        // Handle various response formats
        const list = Array.isArray(data.countries || data)
            ? (data.countries || data)
            : Object.values(data.countries || data)

        const results: Country[] = []

        for (const c of list as any[]) {
            // Extract code from various possible fields
            const providerCode = c.iso || c.country_code || c.id
            if (!providerCode) continue

            const name = c.eng || c.name || 'Unknown'
            const norm = normalizeCountryEntry(name)
            const finalCode = String(providerCode).toLowerCase()

            results.push({
                id: finalCode,
                code: finalCode,
                name: norm.displayName
            })
        }

        return results
    }

    /**
     * Fetch available services
     * Uses same pattern as provider-sync.ts getServicesLegacy for herosms
     */
    async getServices(countryCode: string): Promise<Service[]> {
        const response = await this.request('getServicesList', { lang: 'en' })
        const data = JSON.parse(response)

        const services: Service[] = []
        const list = data.services || []

        for (const s of list as any[]) {
            if (!s.code) continue

            services.push({
                id: s.code.toLowerCase(),
                code: s.code.toLowerCase(),
                name: s.name || s.code,
                price: 0 // Price fetched separately
            })
        }

        return services
    }

    /**
     * Purchase a number for SMS verification
     */
    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        const response = await this.request('getNumber', {
            service: serviceCode,
            country: countryCode
        })

        // Parse ACCESS_NUMBER:id:phone format
        const parts = response.split(':')
        if (parts[0] !== 'ACCESS_NUMBER' || parts.length < 3) {
            throw new Error(`Failed to get number: ${response}`)
        }

        return {
            activationId: parts[1],
            phoneNumber: parts[2],
            countryCode,
            countryName: '',
            serviceCode,
            serviceName: '',
            price: 0,
            expiresAt: new Date(Date.now() + 20 * 60 * 1000) // 20 min default
        }
    }

    /**
     * Check activation status and get SMS code
     */
    async getStatus(activationId: string): Promise<StatusResult> {
        const response = await this.request('getStatus', { id: activationId })

        let status: NumberStatus = 'pending'
        let code: string | undefined

        if (response === 'STATUS_WAIT_CODE') {
            status = 'pending'
        } else if (response.startsWith('STATUS_WAIT_RETRY')) {
            status = 'pending'
        } else if (response.startsWith('STATUS_OK')) {
            status = 'received'
            code = response.split(':')[1]
        } else if (response === 'STATUS_CANCEL') {
            status = 'cancelled'
        }

        const messages = code ? [{
            id: Date.now().toString(),
            sender: 'System',
            content: `Code: ${code}`,
            code,
            receivedAt: new Date()
        }] : []

        return { status, messages }
    }

    /**
     * Cancel/release an activation
     */
    async cancelNumber(activationId: string): Promise<void> {
        await this.request('setStatus', {
            id: activationId,
            status: '8' // Cancel status
        })
    }

    /**
     * Get account balance
     */
    async getBalance(): Promise<number> {
        const response = await this.request('getBalance')

        // Parse ACCESS_BALANCE:123.45 format
        const match = response.match(/ACCESS_BALANCE:(\d+\.?\d*)/)
        if (match) {
            return parseFloat(match[1])
        }

        return 0
    }
}
