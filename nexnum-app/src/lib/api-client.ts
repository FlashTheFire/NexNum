// API Client for NexNum Backend

const getAuthToken = (): string | null => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('nexnum_token')
    }
    return null
}

const authHeaders = (): HeadersInit => {
    const token = getAuthToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

// ============================================
// WALLET API
// ============================================

export interface WalletBalance {
    walletId: string
    balance: number
}

export interface WalletTransaction {
    id: string
    amount: number
    type: string
    description: string | null
    createdAt: string
}

export async function getWalletBalance(): Promise<WalletBalance | null> {
    try {
        const response = await fetch('/api/wallet/balance', {
            headers: authHeaders(),
        })
        if (!response.ok) return null
        const data = await response.json()
        return { walletId: data.walletId, balance: data.balance }
    } catch {
        return null
    }
}

export async function topUpWallet(amount: number): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    try {
        const idempotencyKey = crypto.randomUUID()
        const response = await fetch('/api/wallet/topup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(),
            },
            body: JSON.stringify({ amount, idempotencyKey }),
        })
        const data = await response.json()
        if (!response.ok) {
            return { success: false, error: data.error }
        }
        return { success: true, newBalance: data.newBalance }
    } catch {
        return { success: false, error: 'Network error' }
    }
}

export async function getWalletTransactions(page = 1, limit = 20): Promise<{ transactions: WalletTransaction[]; total: number }> {
    try {
        const response = await fetch(`/api/wallet/transactions?page=${page}&limit=${limit}`, {
            headers: authHeaders(),
        })
        if (!response.ok) return { transactions: [], total: 0 }
        const data = await response.json()
        return { transactions: data.transactions, total: data.pagination.total }
    } catch {
        return { transactions: [], total: 0 }
    }
}

// ============================================
// NUMBERS API
// ============================================

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
    serviceName: string | null
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

export async function getCountries(): Promise<Country[]> {
    try {
        const response = await fetch('/api/numbers', {
            headers: authHeaders(),
        })
        if (!response.ok) return []
        const data = await response.json()
        return data.countries || []
    } catch {
        return []
    }
}

export async function getServices(countryCode: string): Promise<Service[]> {
    try {
        const response = await fetch(`/api/numbers?country=${countryCode}`, {
            headers: authHeaders(),
        })
        if (!response.ok) return []
        const data = await response.json()
        return data.services || []
    } catch {
        return []
    }
}

export async function purchaseNumber(
    countryCode: string,
    serviceCode: string
): Promise<{ success: boolean; number?: PhoneNumber; error?: string }> {
    try {
        const idempotencyKey = crypto.randomUUID()
        const response = await fetch('/api/numbers/purchase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(),
            },
            body: JSON.stringify({ countryCode, serviceCode, idempotencyKey }),
        })
        const data = await response.json()
        if (!response.ok) {
            return { success: false, error: data.error }
        }
        return { success: true, number: data.number }
    } catch {
        return { success: false, error: 'Network error' }
    }
}

export async function getMyNumbers(status?: string, page = 1, limit = 20): Promise<{ numbers: PhoneNumber[]; total: number }> {
    try {
        const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() })
        if (status) params.set('status', status)

        const response = await fetch(`/api/numbers/my?${params}`, {
            headers: authHeaders(),
        })
        if (!response.ok) return { numbers: [], total: 0 }
        const data = await response.json()
        return { numbers: data.numbers, total: data.pagination.total }
    } catch {
        return { numbers: [], total: 0 }
    }
}

export async function getNumberDetails(id: string): Promise<PhoneNumber | null> {
    try {
        const response = await fetch(`/api/numbers/${id}`, {
            headers: authHeaders(),
        })
        if (!response.ok) return null
        const data = await response.json()
        return data.number
    } catch {
        return null
    }
}

export async function cancelNumber(id: string): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
    try {
        const response = await fetch(`/api/numbers/${id}/cancel`, {
            method: 'POST',
            headers: authHeaders(),
        })
        const data = await response.json()
        if (!response.ok) {
            return { success: false, error: data.error }
        }
        return { success: true, refundAmount: data.refundAmount }
    } catch {
        return { success: false, error: 'Network error' }
    }
}

// ============================================
// SMS API
// ============================================

export interface SmsMessage {
    id: string
    sender: string | null
    content: string | null
    code: string | null
    receivedAt: string
}

export async function pollSms(numberId: string): Promise<{ status: string; messages: SmsMessage[] }> {
    try {
        const response = await fetch(`/api/sms/${numberId}`, {
            headers: authHeaders(),
        })
        if (!response.ok) return { status: 'error', messages: [] }
        const data = await response.json()
        return { status: data.status, messages: data.messages }
    } catch {
        return { status: 'error', messages: [] }
    }
}
