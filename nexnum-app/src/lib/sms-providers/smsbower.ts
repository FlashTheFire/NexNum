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
        try {
            const response = await fetch(`${SERVICES_API_URL}?serviceId=5&withPopular=true`, {
                headers: { 'Accept': 'application/json' }
            })

            const json = await response.json()
            const list = Array.isArray(json.services) ? json.services : Object.values(json.services || {})

            console.log(`[SmsBower] Fetched ${list.length} services from JSON API`)

            const services: Service[] = []

            for (const s of list as any[]) {
                const code = (s.activate_org_code || s.slug || s.code)?.toLowerCase()
                if (!code) continue

                let iconUrl = s.img_path
                if (iconUrl && !iconUrl.startsWith('http')) {
                    iconUrl = `${iconUrl}`
                }

                services.push({
                    id: code,
                    name: s.title || s.name || code,
                    iconUrl: iconUrl || null
                })
            }

            return services
        } catch (e) {
            console.error('SmsBower getServices failed:', e)
            return []
        }
    }

    /**
     * Purchase a number for SMS verification
     */
    // Removed legacy methods (getNumber, getStatus, etc) as requested
}

