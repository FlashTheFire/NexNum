/**
 * Professional NexNum API Client
 * 
 * Industrial-grade client infrastructure.
 * Standardized for both class-based usage and legacy functional imports.
 */

// import { getRequestId, getTraceId } from './request-context' // Server-side only

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================================
// Types (Restored for backward compatibility)
// ============================================================================

export interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: string
    code?: string
    details?: any
    status: number
}

export interface PaginatedResponse<T> {
    items: T[]
    total: number
    page: number
    limit: number
}

export interface Country {
    id: string
    code: string
    name: string
    flag?: string
}

export interface Service {
    id: string
    code: string
    name: string
    price: number
}

export interface PhoneNumber {
    id: string
    phoneNumber: string
    countryCode: string
    countryName: string | null
    countryIconUrl?: string
    serviceName: string | null
    serviceCode?: string
    serviceIconUrl?: string
    price: number
    status: string
    expiresAt: string | null
    purchasedAt: string | null
    smsCount?: number
    latestSms?: {
        content: string | null
        code: string | null
        receivedAt: string
    } | null
}

export interface SmsMessage {
    id: string
    sender: string | null
    content: string | null
    code: string | null
    receivedAt: string
}

// ============================================================================
// Core Client Engine
// ============================================================================

class NexNumClient {
    private static instance: NexNumClient

    private constructor() { }

    static getInstance(): NexNumClient {
        if (!NexNumClient.instance) {
            NexNumClient.instance = new NexNumClient()
        }
        return NexNumClient.instance
    }

    private async request<T>(
        path: string,
        method: string = 'GET',
        body?: any,
        options: RequestInit = {}
    ): Promise<ApiResponse<T>> {
        try {
            const headers = new Headers(options.headers)
            const token = typeof window !== 'undefined' ? localStorage.getItem('nexnum_token') : null
            if (token) headers.set('Authorization', `Bearer ${token}`)

            headers.set('X-Request-ID', generateUUID())
            headers.set('X-Trace-ID', generateUUID())

            if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
                const csrf = await this.getCsrfToken()
                if (csrf) headers.set('X-CSRF-Token', csrf)
                if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
            }

            const response = await fetch(path, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                ...options
            })

            const data = await response.json()

            return {
                success: response.ok,
                data: response.ok
                    ? (data.data !== undefined ? data.data : data)
                    : undefined,
                error: !response.ok ? (data.error || 'Request failed') : undefined,
                code: data.code,
                details: data.details,
                status: response.status
            }
        } catch (err: any) {
            return {
                success: false,
                error: err.message || 'Network error',
                status: 500
            }
        }
    }

    private async getCsrfToken(): Promise<string | null> {
        try {
            const res = await fetch('/api/csrf', { cache: 'no-store' })
            if (!res.ok) return null
            const data = await res.json()
            return data.token
        } catch {
            return null
        }
    }

    // Domain methods
    async getBalance() { return this.request<{ walletId: string, balance: number }>('/api/wallet/balance') }
    async topUp(amount: number) { return this.request<{ newBalance: number }>('/api/wallet/topup', 'POST', { amount, idempotencyKey: crypto.randomUUID() }) }
    async getTransactions(page = 1, limit = 20) { return this.request<any>(`/api/wallet/transactions?page=${page}&limit=${limit}`) }
    async getCountriesList() { const res = await this.request<{ countries: Country[] }>('/api/numbers'); return res.data?.countries || [] }
    async getServicesList(countryCode: string) { const res = await this.request<{ services: Service[] }>(`/api/numbers?country=${countryCode}`); return res.data?.services || [] }
    async purchase(input: { countryCode: string, serviceCode: string, provider?: string }) { return this.request<any>('/api/numbers/purchase', 'POST', { ...input, idempotencyKey: crypto.randomUUID() }) }
    async getMyNumbers(status?: string, page = 1, limit = 20) {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) })
        if (status) params.set('status', status)
        return this.request<any>(`/api/numbers/my?${params.toString()}`)
    }
    async getNumberDetails(id: string) { const res = await this.request<{ number: PhoneNumber }>(`/api/numbers/${id}`); return res.data?.number || null }
    async setCancel(id: string) { return this.request<any>(`/api/numbers/${id}/cancel`, 'POST') }
    async cancelNumber(id: string) {
        console.warn('[APIClient] DEPRECATED: cancelNumber() is deprecated. Use setCancel() instead.');
        return this.setCancel(id);
    }

    async getStatus(numberId: string) { return this.request<{ status: string, messages: SmsMessage[] }>(`/api/sms/${numberId}`) }
    async pollSms(numberId: string) {
        console.warn('[APIClient] DEPRECATED: pollSms() is deprecated. Use getStatus() instead.');
        return this.getStatus(numberId);
    }

    async setResendCode(id: string) { return this.request<any>(`/api/numbers/${id}/resend`, 'POST') }
    async login(data: any) { return this.request<any>('/api/auth/login', 'POST', data) }
    async register(data: any) { return this.request<any>('/api/auth/register', 'POST', data) }
}

export const api = NexNumClient.getInstance()

export * from './auth-api'
