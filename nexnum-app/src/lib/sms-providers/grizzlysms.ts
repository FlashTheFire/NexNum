// GrizzlySMS Provider Adapter
// Documentation: https://grizzlysms.com/api

import type {
    SmsProvider,
    Country,
    Service,
    NumberResult,
    StatusResult
} from './types'

const API_URL = process.env.GRIZZLYSMS_API_URL || 'https://api.grizzlysms.com/stubs/handler_api.php'
const API_KEY = process.env.GRIZZLYSMS_API_KEY

export class GrizzlySmsProvider implements SmsProvider {
    name = 'grizzlysms'

    // GrizzlySMS uses HeroSMS compatible API
    private async request(action: string, params: Record<string, string> = {}): Promise<string> {
        if (!API_KEY) {
            throw new Error('GRIZZLYSMS_API_KEY is not configured')
        }

        const url = new URL(API_URL)
        url.searchParams.set('api_key', API_KEY)
        url.searchParams.set('action', action)

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }

        const response = await fetch(url.toString())

        if (!response.ok) {
            throw new Error(`GrizzlySMS API error: ${response.status}`)
        }

        const text = await response.text()

        if (text.startsWith('BAD_') || text.startsWith('NO_') || text.startsWith('ERROR')) {
            throw new Error(`GrizzlySMS error: ${text}`)
        }

        return text
    }

    async getCountries(): Promise<Country[]> {
        // TODO: Implement when credentials are available
        // action=getCountries

        throw new Error('GrizzlySMS provider not implemented - add API key to enable')

        // Note: GrizzlySMS uses HeroSMS compatible API
        // Implementation would be similar to herosms.ts
    }

    async getServices(countryCode: string): Promise<Service[]> {
        // TODO: Implement when credentials are available
        // action=getPrices&country={id}

        throw new Error('GrizzlySMS provider not implemented - add API key to enable')
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        // TODO: Implement when credentials are available
        // action=getNumber&service={code}&country={id}

        throw new Error('GrizzlySMS provider not implemented - add API key to enable')
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // TODO: Implement when credentials are available
        // action=getStatus&id={id}

        throw new Error('GrizzlySMS provider not implemented - add API key to enable')
    }

    async cancelNumber(activationId: string): Promise<void> {
        // TODO: Implement when credentials are available
        // action=setStatus&status=8&id={id}

        throw new Error('GrizzlySMS provider not implemented - add API key to enable')
    }

    async getBalance(): Promise<number> {
        // TODO: Implement when credentials are available
        // action=getBalance

        throw new Error('GrizzlySMS provider not implemented - add API key to enable')
    }
}
