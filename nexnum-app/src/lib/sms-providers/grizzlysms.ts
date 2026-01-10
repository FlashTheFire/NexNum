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
                name: norm.displayName,

            })
        }

        return results
    }

    async getServices(countryCode: string): Promise<Service[]> {
        // Use REST API /api/service endpoint - returns ALL services with proper names
        // external_id matches the service codes returned by getPrices
        try {
            // Fetch all services (up to 10000 per page)
            const data = await this.restRequest<Array<{
                id: number
                name: string
                external_id: string
                icon: number | null
                slug: string
            }>>('/service?per-page=10000&page=1')

            if (!Array.isArray(data)) {
                throw new Error(`Invalid service response: expected array`)
            }

            console.log(`[GrizzlySMS] Fetched ${data.length} services from REST API`)

            return data.map(s => ({
                id: s.external_id.toLowerCase(),
                name: s.name || s.slug || s.external_id,
                iconUrl: s.icon ? `https://grizzlysms.com/api/storage/image/${s.icon}.webp` : null
            }))

        } catch (e) {
            console.error('GrizzlySMS getServices failed:', e)
            throw e
        }
    }
}
