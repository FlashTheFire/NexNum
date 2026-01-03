// SMSBower Provider Adapter
// Professional Implementation - Based on provider-sync.ts patterns
// API: https://smsbower.com/api

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
const API_URL = process.env.SMSBOWER_API_URL || 'https://smsbower.org/stubs/handler_api.php'
const SERVICES_API_URL = 'https://smsbower.org/activations/getPricesByService'
const API_KEY = process.env.SMSBOWER_API_KEY

export class SmsBowerProvider implements SmsProvider {
    name = 'smsbower'

    /**
     * Handler API request (SMS-Activate compatible)
     */
    private async request<T>(params: Record<string, string>): Promise<T> {
        if (!API_KEY) {
            throw new Error('SMSBOWER_API_KEY is not configured')
        }

        const url = new URL(API_URL)
        url.searchParams.set('api_key', API_KEY)

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

        const text = await response.text()

        // Handle plain text errors
        if (text === 'BAD_KEY') throw new Error('Invalid API Key')
        if (text === 'BAD_ACTION') throw new Error('Invalid Action')
        if (text === 'BAD_SERVICE') throw new Error('Invalid Service')
        if (text === 'NO_NUMBERS') throw new Error('No numbers available')
        if (text === 'NO_BALANCE') throw new Error('Insufficient balance')

        try {
            return JSON.parse(text)
        } catch {
            // Some responses are plain text
            return text as unknown as T
        }
    }

    /**
     * Fetch available countries
     * Uses same pattern as provider-sync.ts getCountriesLegacy for smsbower
     */
    async getCountries(): Promise<Country[]> {
        const data = await this.request<any>({ action: 'getCountries' })

        // Handle various response formats
        const list = Array.isArray(data) ? data : Object.values(data)

        const results: Country[] = []

        for (const c of list as any[]) {
            // Extract code from various possible fields
            // SMS-Activate clones often return "iso" (e.g. "us", "ru") or "id"
            const providerCode = c.iso || c.code || c.id
            if (!providerCode) continue

            const norm = normalizeCountryEntry(c.eng || c.rus || c.name || 'Unknown')
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
     * Uses same pattern as provider-sync.ts getServicesLegacy for smsbower
     */
    async getServices(countryCode: string): Promise<Service[]> {
        const response = await fetch(`${SERVICES_API_URL}?serviceId=5&withPopular=true`, {
            headers: { 'Accept': 'application/json' }
        })

        const json = await response.json()
        const list = Array.isArray(json.services) ? json.services : Object.values(json.services || {})

        const services: Service[] = []

        for (const s of list as any[]) {
            const code = (s.activate_org_code || s.slug || s.code)?.toLowerCase()
            if (!code) continue

            let iconUrl = s.img_path
            if (iconUrl && !iconUrl.startsWith('http')) {
                iconUrl = `https://smsbower.org${iconUrl}`
            }

            services.push({
                id: code,
                code: code,
                name: s.title || s.name || code,
                price: 0 // Price fetched separately
            })
        }

        return services
    }

    /**
     * Purchase a number for SMS verification
     */
    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        const response = await this.request<string>({
            action: 'getNumber',
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
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 min default
        }
    }

    /**
     * Check activation status and get SMS code
     */
    async getStatus(activationId: string): Promise<StatusResult> {
        const response = await this.request<string>({
            action: 'getStatus',
            id: activationId
        })

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
        await this.request<string>({
            action: 'setStatus',
            status: '8',
            id: activationId
        })
    }

    /**
     * Get account balance
     */
    async getBalance(): Promise<number> {
        const response = await this.request<string>({ action: 'getBalance' })

        // Parse ACCESS_BALANCE:123.45 format
        if (typeof response === 'string') {
            const match = response.match(/ACCESS_BALANCE:(\d+\.?\d*)/)
            if (match) {
                return parseFloat(match[1])
            }
        }

        return 0
    }
}
