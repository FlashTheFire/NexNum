// SMSBower Provider Adapter
// Documentation: https://smsbower.com/api

import type {
    SmsProvider,
    Country,
    Service,
    NumberResult,
    StatusResult,
    NumberStatus
} from './types'

const API_URL = process.env.SMSBOWER_API_URL || 'https://smsbower.org/stubs/handler_api.php'
const API_KEY = process.env.SMSBOWER_API_KEY

export class SmsBowerProvider implements SmsProvider {
    name = 'smsbower'

    private async request<T>(params: Record<string, string>): Promise<T> {
        if (!API_KEY) {
            throw new Error('SMSBOWER_API_KEY is not configured')
        }

        const url = new URL(API_URL)
        url.searchParams.set('api_key', API_KEY)

        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }

        const response = await fetch(url.toString())
        const text = await response.text()

        // Handle plain text errors common in this protocol
        if (text === 'BAD_KEY') throw new Error('Invalid API Key')
        if (text === 'BAD_ACTION') throw new Error('Invalid Action')
        if (text === 'BAD_SERVICE') throw new Error('Invalid Service')
        if (text === 'NO_NUMBERS') throw new Error('No numbers available')
        if (text === 'NO_BALANCE') throw new Error('Insufficient balance')

        try {
            return JSON.parse(text)
        } catch {
            // Some responses are plain text (e.g. ACCESS_READY)
            return text as unknown as T
        }
    }

    async getCountries(): Promise<Country[]> {
        // Standard protocol usually doesn't have good countries list endpoint returning names
        // But we can try action=getCountries if supported or return empty
        return []
    }

    async getServices(countryCode: string): Promise<Service[]> {
        return []
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        // action=getNumber&service={service}&country={country}
        // Response: ACCESS_NUMBER:$id:$phone

        const response = await this.request<string>({
            action: 'getNumber',
            service: serviceCode,
            country: countryCode
        })

        const parts = response.split(':')
        if (parts[0] !== 'ACCESS_NUMBER') {
            throw new Error(`Failed to get number: ${response}`)
        }

        return {
            activationId: parts[1],
            phoneNumber: parts[2],
            countryCode,
            countryName: '', // Protocol doesn't return this
            serviceCode,
            serviceName: '',
            price: 0, // Protocol doesn't return price in getNumber response usually
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15-20 mins default
        }
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // action=getStatus&id={id}
        // Responses: STATUS_WAIT_CODE, STATUS_WAIT_RETRY, STATUS_OK:code, STATUS_CANCEL

        const response = await this.request<string>({
            action: 'getStatus',
            id: activationId
        })

        let status: NumberStatus = 'pending'
        let code: string | undefined

        if (response === 'STATUS_WAIT_CODE') status = 'pending'
        else if (response.startsWith('STATUS_WAIT_RETRY')) {
            status = 'pending'
            // Might have last code
        }
        else if (response.startsWith('STATUS_OK')) {
            status = 'received'
            code = response.split(':')[1]
        }
        else if (response === 'STATUS_CANCEL') status = 'cancelled'

        const messages = code ? [{
            id: Date.now().toString(),
            sender: 'System',
            content: `Code: ${code}`,
            code,
            receivedAt: new Date()
        }] : []

        return { status, messages }
    }

    async cancelNumber(activationId: string): Promise<void> {
        // action=setStatus&status=8&id={id}
        await this.request<string>({
            action: 'setStatus',
            status: '8',
            id: activationId
        })
    }
}

