// OnlineSIM Provider Adapter
// Documentation: https://onlinesim.io/docs/api

import { SmsProvider, Country, Service, NumberResult, StatusResult } from './types'

const API_URL = process.env.ONLINESIM_API_URL || 'https://onlinesim.io/api'
const API_KEY = process.env.ONLINESIM_API_KEY

export class OnlineSimProvider implements SmsProvider {
    name = 'onlinesim'

    private async request(endpoint: string, params: Record<string, string> = {}): Promise<any> {
        if (!API_KEY) {
            throw new Error('ONLINESIM_API_KEY is not configured')
        }

        const url = new URL(`${API_URL}/${endpoint}.php`)
        url.searchParams.set('apikey', API_KEY)

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }

        const response = await fetch(url.toString())

        if (!response.ok) {
            throw new Error(`OnlineSIM API error: ${response.status}`)
        }

        const data = await response.json()

        if (data.response === 'ERROR') {
            throw new Error(`OnlineSIM error: ${data.response} - ${JSON.stringify(data)}`)
        }

        return data
    }

    async getCountries(): Promise<Country[]> {
        // TODO: Implement when credentials are available
        // endpoint: getFreeCountryList

        throw new Error('OnlineSIM provider not implemented - add API key to enable')
    }

    async getServices(countryCode: string): Promise<Service[]> {
        // TODO: Implement when credentials are available
        // endpoint: getNumbersStats

        throw new Error('OnlineSIM provider not implemented - add API key to enable')
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        // TODO: Implement when credentials are available
        // endpoint: getNum

        throw new Error('OnlineSIM provider not implemented - add API key to enable')
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // TODO: Implement when credentials are available
        // endpoint: getState

        throw new Error('OnlineSIM provider not implemented - add API key to enable')
    }

    async cancelNumber(activationId: string): Promise<void> {
        // TODO: Implement when credentials are available
        // endpoint: setOperationOk / setOperationRevise / setOperationOver

        throw new Error('OnlineSIM provider not implemented - add API key to enable')
    }

    async getBalance(): Promise<number> {
        // TODO: Implement when credentials are available
        // endpoint: getBalance

        throw new Error('OnlineSIM provider not implemented - add API key to enable')
    }
}
