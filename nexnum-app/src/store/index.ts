import { create } from 'zustand'

interface Transaction {
    id: string
    type: 'purchase' | 'topup'
    amount: number
    date: string
    createdAt: string
    status: 'completed' | 'pending' | 'failed' | 'success'
    description: string
}

interface ActiveNumber {
    id: string
    number: string
    countryCode: string
    countryName: string
    serviceName: string
    price: number
    expiresAt: string
    purchasedAt?: string
    smsCount: number
}

interface User {
    id: string
    name: string
    email: string
    balance: number
}

interface GlobalState {
    user: User | null
    isAuthenticated: boolean
    activeNumbers: ActiveNumber[]
    transactions: Transaction[]
    cart: ActiveNumber[]
    smsMessages: any[]
    numberHistory: ActiveNumber[]
    setUser: (user: User) => void
    addTransaction: (transaction: Transaction) => void
    topUp: (amount: number) => void
    logout: () => void
    sidebarCollapsed: boolean
    toggleSidebar: () => void
    _hasHydrated: boolean
    addSMS: (numberId: string, message: any) => void
}

export const useGlobalStore = create<GlobalState>((set) => ({
    user: {
        id: "u123",
        name: "Alex Johnson",
        email: "alex@example.com",
        balance: 142.50
    },
    activeNumbers: [
        {
            id: '1',
            number: '+1 (555) 123-4567',
            countryCode: 'us',
            countryName: 'United States',
            serviceName: 'WhatsApp',
            price: 2.50,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins from now
            smsCount: 2
        },
        {
            id: '2',
            number: '+44 7700 900077',
            countryCode: 'gb',
            countryName: 'United Kingdom',
            serviceName: 'Telegram',
            price: 1.20,
            expiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
            smsCount: 0
        }
    ],
    transactions: [
        {
            id: 't1',
            type: 'topup',
            amount: 50.00,
            date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            status: 'success',
            description: 'Wallet Top-up'
        },
        {
            id: 't2',
            type: 'purchase',
            amount: -2.50,
            date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            status: 'success',
            description: 'USA Number Purchase'
        }
    ],
    isAuthenticated: true,
    cart: [],
    smsMessages: [],
    numberHistory: [],
    setUser: (user) => set({ user }),
    addTransaction: (transaction) => set((state) => ({ transactions: [transaction, ...state.transactions] })),
    topUp: (amount) => set((state) => ({
        user: state.user ? { ...state.user, balance: state.user.balance + amount } : null,
        transactions: [{
            id: Date.now().toString(),
            type: 'topup',
            amount: amount,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            status: 'success',
            description: 'Top-up'
        }, ...state.transactions]
    })),
    logout: () => set({ user: null, isAuthenticated: false }),
    sidebarCollapsed: false,
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    _hasHydrated: true,
    addSMS: (numberId, message) => set((state) => ({ smsMessages: [message, ...state.smsMessages] }))
}))
