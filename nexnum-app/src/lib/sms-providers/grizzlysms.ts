// GrizzlySMS Provider Adapter
// Professional Implementation - Based on provider-sync.ts patterns
// API: https://grizzlysms.com/api

import type {
    SmsProvider,
    Country,
    Service,
    NumberResult,
    StatusResult,
    NumberStatus
} from './types'
import { normalizeCountryEntry } from '../country-normalizer'

// API Endpoints
const BASE_URL = 'https://grizzlysms.com/api'
const HANDLER_URL = process.env.GRIZZLYSMS_API_URL || 'https://api.grizzlysms.com/stubs/handler_api.php'
const API_KEY = process.env.GRIZZLYSMS_API_KEY

// Response Types
interface GrizzlyCountry {
    id: number
    name: string
    phone_code: string
    external_id: string
    icon: string
    iso?: string
}

interface GrizzlyService {
    id: number
    name: string
    external_id: string
    icon: string | number | null
}

export class GrizzlySmsProvider implements SmsProvider {
    name = 'grizzlysms'

    /**
     * Handler API request (SMS-Activate compatible)
     */
    private async handlerRequest(action: string, params: Record<string, string> = {}): Promise<string> {
        if (!API_KEY) {
            throw new Error('GRIZZLYSMS_API_KEY is not configured')
        }

        const url = new URL(HANDLER_URL)
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
            throw new Error(`GrizzlySMS API error: ${response.status}`)
        }

        const text = await response.text()

        if (text.startsWith('BAD_') || text.startsWith('NO_') || text.startsWith('ERROR')) {
            throw new Error(`GrizzlySMS error: ${text}`)
        }

        return text
    }

    /**
     * REST API request (Grizzly proprietary)
     */
    private async restRequest<T>(endpoint: string): Promise<T> {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        })

        if (!response.ok) {
            throw new Error(`GrizzlySMS REST API error: ${response.status}`)
        }

        return response.json()
    }

    /**
     * Fetch available countries using the REST API
     * Uses the same pattern as provider-sync.ts getCountriesLegacy
     */
    async getCountries(): Promise<Country[]> {
        const data = await this.restRequest<GrizzlyCountry[]>('/country')

        const results: Country[] = []

        for (const c of data) {
            // Use ID as the primary code because getPrices uses numeric IDs
            const providerCode = String(c.id)
            if (!providerCode) continue

            const norm = normalizeCountryEntry(c.name)
            const finalCode = providerCode.toLowerCase()

            results.push({
                id: finalCode,
                code: finalCode, // '22', '1', etc.
                name: norm.displayName,
                flag: c.icon
            })
        }

        return results
    }

    async getServices(countryCode: string): Promise<Service[]> {
        // Use Handler API (SMS-Activate compatible) as it contains ALL services
        // The REST API was missing some services (e.g. acx, aco)

        try {
            const response = await this.handlerRequest('getServicesList')

            // Response format: { status: "success", services: [{ "code": "vk", "name": "Vk.com" }, ...] }
            let data: any
            try {
                data = JSON.parse(response)
            } catch (e) {
                // Sometimes it might return just the array or different format?
                throw new Error(`Failed to parse getServicesList JSON: ${response ? response.substring(0, 50) : 'empty'}`)
            }

            if (data.status !== 'success' || !Array.isArray(data.services)) {
                // Fallback: check if it returns array directly (some implementations differ)
                if (Array.isArray(data)) {
                    // Assume direct array
                    return data.map((s: any) => ({
                        id: s.code.toLowerCase(),
                        code: s.code.toLowerCase(),
                        name: s.name || s.slug,
                        price: 0
                    }))
                }
                throw new Error(`Invalid getServicesList response: ${JSON.stringify(data).substring(0, 100)}`)
            }

            return data.services.map((s: any) => ({
                id: s.code.toLowerCase(),
                code: s.code.toLowerCase(),
                name: s.name || s.slug, // Fallback to code if name missing
                price: 0
            }))

        } catch (e) {
            console.error('GrizzlySMS getServices failed:', e)
            throw e
        }
    }

    /**
     * Purchase a number for SMS verification
     */
    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        const response = await this.handlerRequest('getNumber', {
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
        const response = await this.handlerRequest('getStatus', { id: activationId })

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
        await this.handlerRequest('setStatus', {
            id: activationId,
            status: '8' // Cancel status
        })
    }

    /**
     * Get account balance
     */
    async getBalance(): Promise<number> {
        const response = await this.handlerRequest('getBalance')

        // Parse ACCESS_BALANCE:123.45 format
        const match = response.match(/ACCESS_BALANCE:(\d+\.?\d*)/)
        if (match) {
            return parseFloat(match[1])
        }

        return 0
    }
}
