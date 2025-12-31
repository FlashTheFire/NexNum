import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as api from '@/lib/api-client'

export interface Transaction {
    id: string
    type: 'purchase' | 'topup' | 'refund'
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
    serviceName: string
    price: number
    expiresAt: string
    purchasedAt?: string
    smsCount: number
    status?: 'active' | 'expired' | 'cancelled' | 'received'
    latestSms?: {
        content: string | null
        code: string | null
        receivedAt: string
    } | null
}

interface UserProfile {
    balance: number
}

interface GlobalState {
    userProfile: UserProfile
    activeNumbers: ActiveNumber[]
    transactions: Transaction[]
    smsMessages: api.SmsMessage[]

    // Loading states
    isLoadingBalance: boolean
    isLoadingNumbers: boolean
    isLoadingTransactions: boolean

    // Actions - Fetch from API
    fetchBalance: () => Promise<void>
    fetchNumbers: () => Promise<void>
    fetchTransactions: () => Promise<void>

    // Actions - Mutations via API
    topUp: (amount: number) => Promise<{ success: boolean; error?: string }>
    purchaseNumber: (countryCode: string, serviceCode: string) => Promise<{ success: boolean; error?: string }>
    cancelNumber: (id: string) => Promise<{ success: boolean; error?: string }>
    pollSms: (numberId: string) => Promise<api.SmsMessage[]>

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

            sidebarCollapsed: true,
            _hasHydrated: false,

            // Fetch balance from API
            fetchBalance: async () => {
                set({ isLoadingBalance: true })
                const result = await api.getWalletBalance()
                if (result) {
                    set({
                        userProfile: { balance: result.balance },
                        isLoadingBalance: false
                    })
                } else {
                    set({ isLoadingBalance: false })
                }
            },

            // Fetch user's numbers from API
            fetchNumbers: async () => {
                set({ isLoadingNumbers: true })
                const result = await api.getMyNumbers()
                const numbers: ActiveNumber[] = result.numbers.map(n => ({
                    id: n.id,
                    number: n.phoneNumber,
                    countryCode: n.countryCode,
                    countryName: n.countryName || '',
                    serviceName: n.serviceName || '',
                    price: n.price,
                    expiresAt: n.expiresAt || '',
                    purchasedAt: n.purchasedAt || undefined,
                    smsCount: n.smsCount || 0,
                    status: n.status as ActiveNumber['status'],
                    latestSms: n.latestSms,
                }))
                set({ activeNumbers: numbers, isLoadingNumbers: false })
            },

            // Fetch transactions from API
            fetchTransactions: async () => {
                set({ isLoadingTransactions: true })
                const result = await api.getWalletTransactions(1, 50)
                const transactions: Transaction[] = result.transactions.map(t => ({
                    id: t.id,
                    type: t.type as Transaction['type'],
                    amount: Math.abs(t.amount),
                    date: t.createdAt,
                    createdAt: t.createdAt,
                    status: 'completed' as const,
                    description: t.description || '',
                }))
                set({ transactions, isLoadingTransactions: false })
            },

            // Top up wallet via API
            topUp: async (amount: number) => {
                const result = await api.topUpWallet(amount)
                if (result.success && result.newBalance !== undefined) {
                    set({ userProfile: { balance: result.newBalance } })
                    // Refresh transactions
                    get().fetchTransactions()
                }
                return result
            },

            // Purchase number via API
            purchaseNumber: async (countryCode: string, serviceCode: string) => {
                const result = await api.purchaseNumber(countryCode, serviceCode)
                if (result.success && result.number) {
                    // Refresh numbers and balance
                    await Promise.all([
                        get().fetchNumbers(),
                        get().fetchBalance(),
                        get().fetchTransactions(),
                    ])
                }
                return result
            },

            // Cancel number via API
            cancelNumber: async (id: string) => {
                const result = await api.cancelNumber(id)
                if (result.success) {
                    // Refresh numbers and balance
                    await Promise.all([
                        get().fetchNumbers(),
                        get().fetchBalance(),
                        get().fetchTransactions(),
                    ])
                }
                return result
            },

            // Poll SMS for a number
            pollSms: async (numberId: string) => {
                const result = await api.pollSms(numberId)

                // Update the number's status and SMS in the list
                set(state => ({
                    activeNumbers: state.activeNumbers.map(n =>
                        n.id === numberId
                            ? {
                                ...n,
                                smsCount: result.messages.length,
                                status: result.status === 'received' ? 'received' : n.status,
                                latestSms: result.messages[0] ? {
                                    content: result.messages[0].content,
                                    code: result.messages[0].code,
                                    receivedAt: result.messages[0].receivedAt,
                                } : n.latestSms,
                            }
                            : n
                    ),
                    smsMessages: result.messages,
                }))

                return result.messages
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
