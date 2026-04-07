import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { api, type SmsMessage, type PhoneNumber } from '@/lib/api/api-client'
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags"

// Request deduplication cache
const pendingFetches = new Map<string, Promise<unknown>>()

function dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (pendingFetches.has(key)) {
        return pendingFetches.get(key)! as Promise<T>
    }
    const promise = fetcher().finally(() => pendingFetches.delete(key))
    pendingFetches.set(key, promise)
    return promise
}

export interface Transaction {
    id: string
    type: 'purchase' | 'topup' | 'refund' | 'manual_credit' | 'manual_debit' | 'referral_bonus'
    amount: number
    currencyPrices?: Record<string, number> // NEW: Multi-currency prices for Zero-Math
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

/**
 * Multi-currency balance for zero client-side calculations
 */
interface MultiCurrencyBalance {
    points: number
    USD: number
    INR: number
    RUB: number
    EUR: number
    GBP: number
    CNY: number
}

interface UserProfile {
    balance: number // Legacy: points value for backward compatibility
    multiBalance?: MultiCurrencyBalance // NEW: Pre-computed multi-currency values
}

interface GlobalState {
    userProfile: UserProfile
    activeNumbers: ActiveNumber[]
    transactions: Transaction[]
    smsMessages: SmsMessage[]
    usageSummary: number[]
    totalSpent: number | MultiCurrencyBalance
    totalDeposited: number | MultiCurrencyBalance

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
    purchaseNumber: (countryCode: string, serviceCode: string, provider?: string, options?: { useBestRoute?: boolean; maxPrice?: number }) => Promise<{ success: boolean; number?: PhoneNumber; error?: string; code?: string; details?: Record<string, unknown> }>
    setCancel: (id: string) => Promise<{ success: boolean; error?: string }>
    setResendCode: (id: string) => Promise<{ success: boolean; error?: string }>
    completeNumber: (id: string) => Promise<{ success: boolean; error?: string }>
    getStatus: (numberId: string) => Promise<SmsMessage[]>

    /** @deprecated Use setCancel instead */
    cancelNumber: (id: string) => Promise<{ success: boolean; error?: string }>
    /** @deprecated Use getStatus instead */
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
            usageSummary: [0, 0, 0, 0, 0, 0, 0],
            totalSpent: 0,
            totalDeposited: 0,

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

                    const result = await api.request<any>('/api/dashboard/state', 'GET', undefined, { headers })

                    // Handle 304 Not Modified optimization
                    if (result.status === 304) {
                        set({ isLoadingDashboard: false })
                        return
                    }

                    if (result.success && result.data) {
                        const data = result.data
                        // Store new ETag from response
                        const newEtag = result.headers?.get('ETag')

                        // Map API response to store format
                        const numbers: ActiveNumber[] = data.numbers.map((n: Record<string, unknown>) => ({
                            id: n.id as string,
                            number: n.phoneNumber as string,
                            countryCode: n.countryCode as string,
                            countryName: (n.countryName as string) || '',
                            countryIconUrl: (n.countryIconUrl as string) || getCountryFlagUrlSync((n.countryName as string) || (n.countryCode as string)),
                            serviceName: (n.serviceName as string) || '',
                            serviceCode: n.serviceCode as string,
                            serviceIconUrl: n.serviceIconUrl as string,
                            price: Number(n.price) || 0,
                            expiresAt: (n.expiresAt as string) || '',
                            purchasedAt: (n.purchasedAt as string) || undefined,
                            smsCount: (n.smsCount as number) || 0,
                            status: n.status as ActiveNumber['status'],
                            latestSms: n.latestSms as ActiveNumber['latestSms'],
                        }))

                        const transactions: Transaction[] = data.transactions.map((t: Record<string, unknown>) => ({
                            id: t.id as string,
                            type: t.type as Transaction['type'],
                            amount: Math.abs(t.amount as number),
                            currencyPrices: t.currencyPrices as Record<string, number> | undefined,
                            date: t.createdAt as string,
                            createdAt: t.createdAt as string,
                            status: 'completed' as const,
                            description: (t.description as string) || '',
                        }))

                        // Handle both old (number) and new (object) balance formats
                        const balanceData = data.balance
                        const isMultiCurrencyBalance = typeof balanceData === 'object' && balanceData !== null && 'points' in balanceData

                        const userProfileUpdate: UserProfile = isMultiCurrencyBalance
                            ? {
                                balance: balanceData.points, // Legacy compatibility
                                multiBalance: balanceData as MultiCurrencyBalance
                            }
                            : { balance: Number(balanceData) || 0 }

                        set({
                            userProfile: userProfileUpdate,
                            activeNumbers: numbers,
                            transactions,
                            usageSummary: data.usageSummary || [0, 0, 0, 0, 0, 0, 0],
                            totalSpent: data.totalSpent || 0,
                            totalDeposited: data.totalDeposited || 0,
                            dashboardEtag: newEtag,
                            isLoadingDashboard: false,
                            isLoadingBalance: false,
                            isLoadingNumbers: false,
                            isLoadingTransactions: false,
                        })
                    } else {
                        set({ isLoadingDashboard: false })
                    }
                } catch (_error) {
                    console.error('[AppStore] fetchDashboardState error:', _error)
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

                    const numbers: ActiveNumber[] = (result.data.numbers || []).map((n: Record<string, unknown>) => ({
                        id: n.id as string,
                        number: n.phoneNumber as string,
                        countryCode: n.countryCode as string,
                        countryName: (n.countryName as string) || '',
                        countryIconUrl: (n.countryIconUrl as string) || getCountryFlagUrlSync((n.countryName as string) || (n.countryCode as string)),
                        serviceName: (n.serviceName as string) || '',
                        serviceCode: n.serviceCode as string,
                        serviceIconUrl: n.serviceIconUrl as string,
                        price: Number(n.price) || 0,
                        expiresAt: (n.expiresAt as string) || '',
                        purchasedAt: (n.purchasedAt as string) || undefined,
                        smsCount: (n.smsCount as number) || 0,
                        status: n.status as ActiveNumber['status'],
                        latestSms: n.latestSms as ActiveNumber['latestSms'],
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
                    const transactions: Transaction[] = (result.data.transactions || []).map((t: Record<string, unknown>) => ({
                        id: t.id as string,
                        type: t.type as Transaction['type'],
                        amount: Math.abs(t.amount as number),
                        currencyPrices: t.currencyPrices as Record<string, number> | undefined,
                        date: t.createdAt as string,
                        createdAt: t.createdAt as string,
                        status: 'completed' as const,
                        description: (t.description as string) || '',
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
                } catch (error: unknown) {
                    // ROLLBACK
                    set({ userProfile: { balance: prevBalance } })
                    // Remove temp transaction
                    set(state => ({
                        transactions: state.transactions.filter(t => !t.id.startsWith('temp-'))
                    }))
                    return { success: false, error: (error instanceof Error ? error.message : String(error)) }
                }
            },

            // Purchase number via API
            purchaseNumber: async (countryCode: string, serviceCode: string, provider?: string, options?: { useBestRoute?: boolean; maxPrice?: number }) => {
                // OPTIMISTIC BALANCE CHECK (Zero-Math aware)
                const state = get()
                const preferredCurrency = localStorage.getItem('preferredCurrency') || 'USD'
                
                // If we have multi-currency price in options or can infer it
                // For now, we rely on the caller to have checked the balance, 
                // but we can add a safety check here if we have the data.

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
                        const error = new Error(result.error || 'Purchase failed')
                        Object.assign(error, { code: result.code, details: result.details })
                        throw error
                    }
                    return result
                } catch (error: any) {
                    // ROLLBACK
                    set(state => ({
                        activeNumbers: state.activeNumbers.filter(n => n.id !== tempId)
                    }))
                    const err = error as { message: string, code?: string, details?: any };
                    return {
                        success: false,
                        error: (error instanceof Error ? error.message : String(error)),
                        code: err.code,
                        details: err.details
                    }
                }
            },

            // Cancel number via API
            setCancel: async (id: string) => {
                const result = await api.setCancel(id)
                return result
            },

            // Backward compatibility alias
            cancelNumber: async (id: string) => {
                return get().setCancel(id)
            },

            // Request resend code
            setResendCode: async (id: string) => {
                const result = await api.setResendCode(id)
                return result
            },

            completeNumber: async (id: string) => {
                try {
                    const result = await api.completeNumber(id)

                    if (result.success) {
                        set(state => ({
                            activeNumbers: state.activeNumbers.map(n =>
                                n.id === id ? { ...n, status: 'completed' } : n
                            )
                        }))
                        get().fetchDashboardState()
                    }
                    return result
                } catch (error: unknown) {
                    return { success: false, error: (error instanceof Error ? error.message : String(error)) }
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

            // Get SMS status/messages - Standardized v2.0
            getStatus: async (numberId: string) => {
                const result = await api.getStatus(numberId)

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

            // Poll SMS for a number - DEPRECATED
            pollSms: async (numberId: string) => {
                console.warn('[Store] DEPRECATED: pollSms() is deprecated. Use getStatus() instead.');
                return get().getStatus(numberId)
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
