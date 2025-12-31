// 5sim.net SMS Provider Adapter
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

const API_URL = process.env.FIVESIM_API_URL || 'https://5sim.net/v1'
const API_KEY = process.env.FIVESIM_API_KEY

export class FiveSimProvider implements SmsProvider {
    name = '5sim'

    private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
        if (!API_KEY) {
            throw new Error('FIVESIM_API_KEY is not configured')
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json',
                ...options?.headers,
            },
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`5sim API error: ${response.status} - ${error}`)
        }

        return response.json()
    }

    async getCountries(): Promise<Country[]> {
        const data = await this.request<Record<string, { name: string; iso: string; prefix: string }>>('/guest/countries')
        return Object.values(data).map(info => ({
            id: info.iso,
            code: info.iso.toLowerCase(),
            name: info.name,
        }))
    }

    async getServices(countryCode: string): Promise<Service[]> {
        // Warning: This endpoint returns huge data usually. 
        // We'll limit it or use specific product endpoint if possible, 
        // but getServices interface assumes list for country.
        // We'll try generic /guest/products/{country}/any
        try {
            const data = await this.request<Record<string, { Category: string; Qty: number; Price: number }>>(`/guest/products/${countryCode}/any`)
            return Object.entries(data).map(([name, info]) => ({
                id: name,
                code: name,
                name: name,
                price: info.Price,
            }))
        } catch {
            return []
        }
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        // GET /user/buy/activation/{country}/{operator}/{product}
        // Operator 'any' is common
        const data = await this.request<any>(`/user/buy/activation/${countryCode}/any/${serviceCode}`)

        // Response format: { id, phone, product, price, status, expires, ... }
        return {
            activationId: data.id.toString(),
            phoneNumber: data.phone,
            countryCode,
            countryName: data.country,
            serviceCode,
            serviceName: data.product,
            price: data.price,
            expiresAt: new Date(data.expires),
        }
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // GET /user/check/{id}
        const data = await this.request<any>(`/user/check/${activationId}`)

        const messages: SmsMessage[] = (data.sms || []).map((sms: any) => ({
            id: sms.id ? sms.id.toString() : `sms-${Date.now()}`,
            sender: sms.sender,
            content: sms.text,
            code: sms.code,
            receivedAt: new Date(sms.date),
        }))

        let status: NumberStatus = 'pending'
        if (data.status === 'RECEIVED') status = 'received'
        if (data.status === 'FINISHED') status = 'received' // 5sim finished means done
        if (data.status === 'CANCELED') status = 'cancelled'
        if (data.status === 'TIMEOUT') status = 'expired'
        if (data.status === 'BANNED') status = 'error'

        return { status, messages }
    }

    async cancelNumber(activationId: string): Promise<void> {
        // GET /user/cancel/{id}
        // Alternatively /user/ban/{id} if avoiding payment for bad number
        await this.request(`/user/cancel/${activationId}`)
    }

    async getBalance(): Promise<number> {
        const data = await this.request<{ balance: number; rating: number }>('/user/profile')
        return data.balance
    }
}

