import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { api, type SmsMessage, type PhoneNumber } from '@/lib/api/api-client'
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags"

// Request deduplication cache
const pendingFetches = new Map<string, Promise<any>>()

function dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (pendingFetches.has(key)) {
        return pendingFetches.get(key)!
    }
    const promise = fetcher().finally(() => pendingFetches.delete(key))
    pendingFetches.set(key, promise)
    return promise
}

export interface Transaction {
    id: string
    type: 'purchase' | 'topup' | 'refund' | 'manual_credit' | 'manual_debit' | 'referral_bonus'
    amount: number
    date: string
    createdAt: string
    status: 'completed' | 'pending' | 'failed' | 'success'
    description: string
}

export interface ActiveNumber {
    id: string
    number: string
    countryCode: string
    countryName: string
    countryIconUrl?: string
    serviceName: string
    serviceCode?: string
    serviceIconUrl?: string
    provider?: string
    price: number
    expiresAt: string
    purchasedAt?: string
    smsCount: number
    status?: 'active' | 'expired' | 'cancelled' | 'received' | 'timeout' | 'completed'
    latestSms?: {
        content: string | null
        code: string | null
        receivedAt: string
    } | null
    isOptimistic?: boolean // New flag for UI spinners
}

interface UserProfile {
    balance: number
}

interface GlobalState {
    userProfile: UserProfile
    activeNumbers: ActiveNumber[]
    transactions: Transaction[]
    smsMessages: SmsMessage[]

    // Loading states
    isLoadingBalance: boolean
    isLoadingNumbers: boolean
    isLoadingTransactions: boolean
    isLoadingDashboard: boolean

    // ETag for conditional fetching
    dashboardEtag: string | null

    // Actions - Fetch from API
    fetchDashboardState: () => Promise<void>  // NEW: Batch fetch
    fetchBalance: () => Promise<void>
    fetchNumbers: () => Promise<void>
    fetchTransactions: () => Promise<void>

    // Actions - Mutations via API
    topUp: (amount: number) => Promise<{ success: boolean; error?: string }>
    purchaseNumber: (countryCode: string, serviceCode: string, provider?: string, options?: { useBestRoute?: boolean; maxPrice?: number }) => Promise<{ success: boolean; number?: PhoneNumber; error?: string; code?: string; details?: any }>
    cancelNumber: (id: string) => Promise<{ success: boolean; error?: string }>
    completeNumber: (id: string) => Promise<{ success: boolean; error?: string }>
    pollSms: (numberId: string) => Promise<SmsMessage[]>
    updateNumber: (id: string, data: Partial<ActiveNumber>) => void

    // UI State
    sidebarCollapsed: boolean
    toggleSidebar: () => void
    _hasHydrated: boolean
    setHasHydrated: (state: boolean) => void

    // Reset (on logout)
    reset: () => void
}

export const useGlobalStore = create<GlobalState>()(
    persist(
        (set, get) => ({
            userProfile: {
                balance: 0
            },
            activeNumbers: [],
            transactions: [],
            smsMessages: [],

            isLoadingBalance: false,
            isLoadingNumbers: false,
            isLoadingTransactions: false,
            isLoadingDashboard: false,

            sidebarCollapsed: true,
            _hasHydrated: false,

            // ETag for conditional fetching (304 Not Modified optimization)
            dashboardEtag: null as string | null,

            // NEW: Batch fetch dashboard state (production optimized)
            fetchDashboardState: async () => {
                // Request deduplication - prevent concurrent fetches
                const currentState = get()
                if (currentState.isLoadingDashboard) return

                set({ isLoadingDashboard: true })
                try {
                    // Send If-None-Match header with stored ETag for conditional request
                    const headers: HeadersInit = {}
                    const etag = currentState.dashboardEtag
                    if (etag) {
                        headers['If-None-Match'] = etag
                    }

                    const response = await fetch('/api/dashboard/state', { headers })

                    // 304 Not Modified = data unchanged, skip update
                    if (response.status === 304) {
                        set({ isLoadingDashboard: false })
                        return // Data unchanged, no need to update store
                    }

                    const data = await response.json()

                    // Store new ETag from response
                    const newEtag = response.headers.get('ETag')

                    if (data.success) {
                        // Map API response to store format
                        const numbers: ActiveNumber[] = data.numbers.map((n: any) => ({
                            id: n.id,
                            number: n.phoneNumber,
                            countryCode: n.countryCode,
                            countryName: n.countryName || '',
                            countryIconUrl: n.countryIconUrl || getCountryFlagUrlSync(n.countryName || n.countryCode),
                            serviceName: n.serviceName || '',
                            serviceCode: n.serviceCode,
                            serviceIconUrl: n.serviceIconUrl,
                            price: Number(n.price) || 0,
                            expiresAt: n.expiresAt || '',
                            purchasedAt: n.purchasedAt || undefined,
                            smsCount: n.smsCount || 0,
                            status: n.status as ActiveNumber['status'],
                            latestSms: n.latestSms,
                        }))

                        const transactions: Transaction[] = data.transactions.map((t: any) => ({
                            id: t.id,
                            type: t.type as Transaction['type'],
                            amount: Math.abs(t.amount),
                            date: t.createdAt,
                            createdAt: t.createdAt,
                            status: 'completed' as const,
                            description: t.description || '',
                        }))

                        set({
                            userProfile: { balance: data.balance },
                            activeNumbers: numbers,
                            transactions,
                            dashboardEtag: newEtag,
                            isLoadingDashboard: false,
                            isLoadingBalance: false,
                            isLoadingNumbers: false,
                            isLoadingTransactions: false,
                        })
                    } else {
                        set({ isLoadingDashboard: false })
                    }
                } catch (error) {
                    console.error('[AppStore] fetchDashboardState error:', error)
                    set({ isLoadingDashboard: false })
                }
            },

            // Fetch balance from API
            fetchBalance: async () => {
                return dedupe('balance', async () => {
                    set({ isLoadingBalance: true })
                    const result = await api.getBalance()
                    if (result.success && result.data) {
                        set({
                            userProfile: { balance: result.data.balance },
                            isLoadingBalance: false
                        })
                    } else {
                        set({ isLoadingBalance: false })
                    }
                })
            },

            // Fetch user's numbers from API
            fetchNumbers: async () => {
                return dedupe('numbers', async () => {
                    set({ isLoadingNumbers: true })
                    const result = await api.getMyNumbers()

                    if (result.success === false || !result.data) {
                        set({ isLoadingNumbers: false })
                        return
                    }

                    const numbers: ActiveNumber[] = (result.data.numbers || []).map((n: any) => ({
                        id: n.id,
                        number: n.phoneNumber,
                        countryCode: n.countryCode,
                        countryName: n.countryName || '',
                        countryIconUrl: n.countryIconUrl || getCountryFlagUrlSync(n.countryName || n.countryCode),
                        serviceName: n.serviceName || '',
                        serviceCode: n.serviceCode,
                        serviceIconUrl: n.serviceIconUrl,
                        price: Number(n.price) || 0,
                        expiresAt: n.expiresAt || '',
                        purchasedAt: n.purchasedAt || undefined,
                        smsCount: n.smsCount || 0,
                        status: n.status as ActiveNumber['status'],
                        latestSms: n.latestSms,
                    }))
                    set({ activeNumbers: numbers, isLoadingNumbers: false })
                })
            },

            // Fetch transactions from API
            fetchTransactions: async () => {
                return dedupe('transactions', async () => {
                    set({ isLoadingTransactions: true })
                    const result = await api.getTransactions(1, 50)
                    if (result.success === false || !result.data) {
                        set({ isLoadingTransactions: false })
                        return
                    }
                    const transactions: Transaction[] = (result.data.transactions || []).map((t: any) => ({
                        id: t.id,
                        type: t.type as Transaction['type'],
                        amount: Math.abs(t.amount),
                        date: t.createdAt,
                        createdAt: t.createdAt,
                        status: 'completed' as const,
                        description: t.description || '',
                    }))
                    set({ transactions, isLoadingTransactions: false })
                })
            },

            // Top up wallet via API
            topUp: async (amount: number) => {
                // OPTIMISTIC UPDATE
                const prevBalance = get().userProfile.balance
                set(state => ({
                    userProfile: { balance: prevBalance + amount },
                    // Add temp transaction for feedback
                    transactions: [
                        {
                            id: 'temp-' + Date.now(),
                            type: 'topup',
                            amount: amount,
                            date: new Date().toISOString(),
                            createdAt: new Date().toISOString(),
                            status: 'pending',
                            description: 'Top-up (Processing...)'
                        },
                        ...state.transactions
                    ]
                }))

                try {
                    const result = await api.topUp(amount)
                    if (result.success && result.data?.newBalance !== undefined) {
                        set({ userProfile: { balance: result.data.newBalance } })
                        // Refresh via batch endpoint for consistent state
                        get().fetchDashboardState()
                    } else {
                        throw new Error(result.error || 'Top-up failed')
                    }
                    return result
                } catch (error: any) {
                    // ROLLBACK
                    set({ userProfile: { balance: prevBalance } })
                    // Remove temp transaction
                    set(state => ({
                        transactions: state.transactions.filter(t => !t.id.startsWith('temp-'))
                    }))
                    return { success: false, error: error.message }
                }
            },

            // Purchase number via API
            purchaseNumber: async (countryCode: string, serviceCode: string, provider?: string, options?: { useBestRoute?: boolean; maxPrice?: number }) => {
                // OPTIMISTIC UPDATE
                const tempId = 'temp-' + Date.now()
                const optimisticNumber: ActiveNumber = {
                    id: tempId,
                    number: 'Reserve...',
                    countryCode,
                    countryName: 'Processing...',
                    serviceName: 'Processing...',
                    price: 0,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                    smsCount: 0,
                    status: 'active',
                    isOptimistic: true
                }

                set(state => ({
                    activeNumbers: [optimisticNumber, ...state.activeNumbers]
                }))

                try {
                    const result = await api.purchase({ countryCode, serviceCode, provider })

                    if (result.success && result.data?.number) {
                        const n = result.data.number
                        // REPLACE optimistic with real
                        const realNumber: ActiveNumber = {
                            id: n.id,
                            number: n.phoneNumber,
                            countryCode: n.countryCode,
                            countryName: n.countryName || '',
                            countryIconUrl: getCountryFlagUrlSync(n.countryName || n.countryCode),
                            serviceName: n.serviceName || '',
                            serviceCode: n.serviceCode,
                            serviceIconUrl: n.serviceIconUrl,
                            price: n.price,
                            expiresAt: n.expiresAt || '',
                            purchasedAt: n.purchasedAt || undefined,
                            smsCount: n.smsCount || 0,
                            status: n.status as ActiveNumber['status'],
                            latestSms: n.latestSms,
                        }

                        set(state => ({
                            activeNumbers: state.activeNumbers.map(an => an.id === tempId ? realNumber : an)
                        }))

                    } else {
                        // Pass specific error structure for UI handling
                        const error: any = new Error(result.error || 'Purchase failed')
                        error.code = result.code
                        error.details = result.details
                        throw error
                    }
                    return result
                } catch (error: any) {
                    // ROLLBACK
                    set(state => ({
                        activeNumbers: state.activeNumbers.filter(n => n.id !== tempId)
                    }))
                    return {
                        success: false,
                        error: error.message,
                        code: error.code,
                        details: error.details
                    }
                }
            },

            // Cancel number via API
            cancelNumber: async (id: string) => {
                const result = await api.cancelNumber(id)
                return result
            },

            // Complete number via API
            completeNumber: async (id: string) => {
                try {
                    const result = await fetch('/api/numbers/complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ numberId: id })
                    }).then(res => res.json())

                    if (result.success) {
                        set(state => ({
                            activeNumbers: state.activeNumbers.map(n =>
                                n.id === id ? { ...n, status: 'completed' } : n
                            )
                        }))
                        get().fetchDashboardState()
                    }
                    return result
                } catch (error: any) {
                    return { success: false, error: error.message }
                }
            },

            // Update number locally
            updateNumber: (id: string, data: Partial<ActiveNumber>) => {
                set(state => ({
                    activeNumbers: state.activeNumbers.map(n =>
                        n.id === id ? { ...n, ...data } : n
                    )
                }))
            },

            // Poll SMS for a number
            pollSms: async (numberId: string) => {
                const result = await api.pollSms(numberId)

                if (!result.success || !result.data) {
                    return []
                }

                const { messages, status } = result.data
                const msgs = messages || []

                // Update the number's status and SMS in the list
                set(state => ({
                    activeNumbers: state.activeNumbers.map(n =>
                        n.id === numberId
                            ? {
                                ...n,
                                smsCount: msgs.length,
                                status: (status as ActiveNumber['status']) || n.status,
                                latestSms: msgs[0] ? {
                                    content: msgs[0].content,
                                    code: msgs[0].code,
                                    receivedAt: msgs[0].receivedAt,
                                } : n.latestSms,
                            }
                            : n
                    ),
                    smsMessages: msgs,
                }))

                return msgs
            },
            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
            setHasHydrated: (state) => set({ _hasHydrated: state }),

            reset: () => set({
                userProfile: { balance: 0 },
                activeNumbers: [],
                transactions: [],
                smsMessages: [],
            }),
        }),
        {
            name: 'nexnum-global-storage',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true)
            },
            partialize: (state) => ({
                // Only persist UI preferences, not data (data comes from API)
                sidebarCollapsed: state.sidebarCollapsed,
            })
        }
    )
)
