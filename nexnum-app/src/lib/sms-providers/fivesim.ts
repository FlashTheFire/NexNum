// 5sim.net SMS Provider Adapter
// Professional Implementation - Based on provider-sync.ts patterns
// Documentation: https://5sim.net/docs

import type {
    SmsProvider,
    Country,
    Service,
    NumberResult,
    StatusResult,
    NumberStatus,
    SmsMessage
} from './types'
import { normalizeCountryEntry } from '../country-normalizer'

// API Configuration
const API_URL = process.env.FIVESIM_API_URL || 'https://5sim.net/v1'
const API_KEY = process.env.FIVESIM_API_KEY

// Response Types
interface FiveSimCountryData {
    iso: { [key: string]: number }
    prefix: { [key: string]: number }
    text_en: string
}

interface FiveSimProductData {
    Category: string
    Qty: number
    Price: number
}

export class FiveSimProvider implements SmsProvider {
    name = '5sim'

    /**
     * Guest API request (no auth required)
     */
    private async guestRequest<T>(endpoint: string): Promise<T> {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`5sim API error: ${response.status} - ${error}`)
        }

        return response.json()
    }

    /**
     * Fetch available countries
     * Uses same pattern as provider-sync.ts getCountriesLegacy for 5sim
     */
    async getCountries(): Promise<Country[]> {
        const data = await this.guestRequest<Record<string, FiveSimCountryData>>('/guest/countries')

        const results: Country[] = []

        for (const [name, d] of Object.entries(data)) {
            const norm = normalizeCountryEntry(d.text_en || name)

            // Use the country name as code since 5sim uses names as keys
            const code = name.toLowerCase().replace(/\s+/g, '_')

            results.push({
                id: code,
                name: norm.displayName
            })
        }

        return results
    }

    /**
     * Fetch available services for a country
     * Uses same pattern as provider-sync.ts getServicesLegacy for 5sim
     */
    async getServices(countryCode: string): Promise<Service[]> {
        try {
            // Use guest products endpoint for all services
            const endpoint = countryCode
                ? `/guest/products/${countryCode}/any`
                : '/guest/products/any/any'

            const data = await this.guestRequest<Record<string, FiveSimProductData>>(endpoint)

            return Object.entries(data).map(([code, info]) => {
                // Convert service code to readable name
                const name = code
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase())

                return {
                    id: code.toLowerCase(),
                    name: name
                }
            })
        } catch {
            return []
        }
    }
}
