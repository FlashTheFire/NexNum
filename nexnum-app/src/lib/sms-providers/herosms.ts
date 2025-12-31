// HeroSMS Provider Adapter
// Documentation: https://herosms.one/api

import { SmsProvider, Country, Service, NumberResult, StatusResult } from './types'

const API_URL = process.env.HERO_SMS_API_URL || 'https://herosms.one/stubs/handler_api.php'
const API_KEY = process.env.HERO_SMS_API_KEY

export class HeroSmsProvider implements SmsProvider {
    name = 'herosms'

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

        const response = await fetch(url.toString())

        if (!response.ok) {
            throw new Error(`HeroSMS API error: ${response.status}`)
        }

        const text = await response.text()

        // HeroSMS returns errors as plain text prefixed with error codes
        if (text.startsWith('BAD_') || text.startsWith('NO_') || text.startsWith('ERROR')) {
            throw new Error(`HeroSMS error: ${text}`)
        }

        return text
    }

    async getCountries(): Promise<Country[]> {
        // TODO: Implement when credentials are available
        // action=getCountries

        throw new Error('HeroSMS provider not implemented - add API key to enable')
    }

    async getServices(countryCode: string): Promise<Service[]> {
        // TODO: Implement when credentials are available
        // action=getPrices&country={id}

        throw new Error('HeroSMS provider not implemented - add API key to enable')
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        // TODO: Implement when credentials are available
        // action=getNumber&service={code}&country={id}

        throw new Error('HeroSMS provider not implemented - add API key to enable')
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // TODO: Implement when credentials are available
        // action=getStatus&id={id}

        throw new Error('HeroSMS provider not implemented - add API key to enable')
    }

    async cancelNumber(activationId: string): Promise<void> {
        // TODO: Implement when credentials are available
        // action=setStatus&status=8&id={id}

        throw new Error('HeroSMS provider not implemented - add API key to enable')
    }

    async getBalance(): Promise<number> {
        // TODO: Implement when credentials are available
        // action=getBalance

        throw new Error('HeroSMS provider not implemented - add API key to enable')
    }
}
