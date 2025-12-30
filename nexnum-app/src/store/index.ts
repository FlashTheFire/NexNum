import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface Transaction {
    id: string
    type: 'purchase' | 'topup'
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
    status?: 'active' | 'expired'
}

interface UserProfile {
    balance: number
}

interface GlobalState {
    userProfile: UserProfile
    // We removed 'user' and 'isAuthenticated' from here as they are managed by authStore
    // But we keep 'balance' effectively as part of userProfile

    activeNumbers: ActiveNumber[]
    transactions: Transaction[]
    cart: ActiveNumber[]
    smsMessages: any[]
    numberHistory: ActiveNumber[]

    // Actions
    updateBalance: (amount: number) => void
    addTransaction: (transaction: Transaction) => void
    addActiveNumber: (number: ActiveNumber) => void
    topUp: (amount: number) => void
    reset: () => void

    sidebarCollapsed: boolean
    toggleSidebar: () => void
    _hasHydrated: boolean
    setHasHydrated: (state: boolean) => void

    addSMS: (numberId: string, message: any) => void
}

export const useGlobalStore = create<GlobalState>()(
    persist(
        (set, get) => ({
            userProfile: {
                balance: 50
            },
            activeNumbers: [],
            transactions: [],
            cart: [],
            smsMessages: [],
            numberHistory: [],

            sidebarCollapsed: true,
            _hasHydrated: false,

            updateBalance: (amount) => set((state) => ({
                userProfile: { ...state.userProfile, balance: state.userProfile.balance + amount }
            })),

            addTransaction: (transaction) => set((state) => ({
                transactions: [transaction, ...state.transactions]
            })),

            addActiveNumber: (number) => set((state) => ({
                activeNumbers: [number, ...state.activeNumbers],
                // Also add to history for record keeping
                numberHistory: [number, ...state.numberHistory]
            })),

            topUp: (amount) => {
                const newTransaction: Transaction = {
                    id: Date.now().toString(),
                    type: 'topup',
                    amount: amount,
                    date: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    status: 'success',
                    description: 'Wallet Top-up'
                }

                set((state) => ({
                    userProfile: { ...state.userProfile, balance: state.userProfile.balance + amount },
                    transactions: [newTransaction, ...state.transactions]
                }))
            },

            reset: () => set({
                userProfile: { balance: 0 },
                activeNumbers: [],
                transactions: [],
                cart: [],
                smsMessages: [],
                numberHistory: []
            }),

            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
            setHasHydrated: (state) => set({ _hasHydrated: state }),

            addSMS: (numberId, message) => set((state) => ({ smsMessages: [message, ...state.smsMessages] }))
        }),
        {
            name: 'nexnum-global-storage',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true)
            },
            partialize: (state) => ({
                userProfile: state.userProfile,
                activeNumbers: state.activeNumbers,
                transactions: state.transactions,
                numberHistory: state.numberHistory,
                // We don't persist UI state like sidebarCollapsed if we don't want to
                // sidebarCollapsed: state.sidebarCollapsed 
            })
        }
    )
)
