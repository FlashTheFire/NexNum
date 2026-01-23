import { logger } from '@/lib/core/logger'
import { MOCK_COUNTRIES, MOCK_SERVICES, COUNTRY_PHONE_CODES } from './mock-data'

export interface MockActivation {
    id: string
    phoneNumber: string
    countryCode: string
    serviceCode: string
    status: 'pending' | 'received' | 'cancelled' | 'completed' | 'refunded'
    cost: number
    smsMessages: Array<{ code: string; text: string; receivedAt: Date }>
    createdAt: Date
    updatedAt: Date
    canGetAnotherSms: boolean

    // Internal simulator state
    nextSmsAt?: number
    isWaitingNext?: boolean
}

// Global singleton for HMR support
const globalForMock = globalThis as unknown as {
    mockSmsProvider: MockSmsProvider | undefined
}

export class MockSmsProvider {
    private orders: Map<string, MockActivation> = new Map()
    private balance: number = 1000.00
    private isSimulatorRunning = false

    private constructor() {
        this.startSimulator()
    }

    static getInstance(): MockSmsProvider {
        if (!globalForMock.mockSmsProvider) {
            globalForMock.mockSmsProvider = new MockSmsProvider()
        }
        return globalForMock.mockSmsProvider
    }

    // ============================================================================
    // Public API Methods
    // ============================================================================

    getBalance(): string {
        return this.balance.toFixed(2)
    }

    async purchaseNumber(countryCode: string, serviceCode: string): Promise<MockActivation> {
        // Validate inputs
        if (!MOCK_COUNTRIES[countryCode as keyof typeof MOCK_COUNTRIES]) {
            throw new Error('NO_NUMBERS') // Invalid country usually returns NO_NUMBERS
        }

        const service = MOCK_SERVICES.find(s => s.code === serviceCode)
        if (!service) {
            throw new Error('BAD_SERVICE')
        }

        // Generate mock data
        const id = Math.floor(Math.random() * 9000000 + 1000000).toString()
        const prefix = COUNTRY_PHONE_CODES[countryCode] || '1'
        const randomDigits = Math.floor(Math.random() * 900000000 + 100000000).toString()
        const phoneNumber = `${prefix}${randomDigits}`

        // Random price between 0.10 and 2.00
        const cost = Number((Math.random() * 1.9 + 0.1).toFixed(2))

        const activation: MockActivation = {
            id,
            phoneNumber,
            countryCode,
            serviceCode,
            status: 'pending',
            cost,
            smsMessages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            canGetAnotherSms: true,

            // Schedule first SMS in 10-30 seconds
            nextSmsAt: Date.now() + (Math.random() * 20000 + 10000)
        }

        this.orders.set(id, activation)
        this.balance -= cost

        logger.info('[MockSMS] Purchased number', {
            id,
            phoneNumber,
            service: serviceCode,
            country: countryCode
        })

        return activation
    }

    getStatus(id: string): string {
        const order = this.orders.get(id)
        if (!order) return 'NO_ACTIVATION'

        if (order.status === 'cancelled' || order.status === 'refunded') {
            return 'STATUS_CANCEL'
        }

        if (order.smsMessages.length > 0) {
            const latestCode = order.smsMessages[order.smsMessages.length - 1].code

            // If we are waiting for retry (user pressed "next sms")
            if (order.isWaitingNext) {
                return `STATUS_WAIT_RETRY:${latestCode}` // Correct protocol per SMS-Activate
            }

            return `STATUS_OK:${latestCode}`
        }

        return 'STATUS_WAIT_CODE'
    }

    setStatus(id: string, status: string): string {
        const order = this.orders.get(id)
        if (!order) return 'NO_ACTIVATION'

        // 8 - Cancel
        if (status === '8') {
            if (order.status === 'received' || order.status === 'completed') {
                return 'ERROR_BAD_STATUS' // Cannot cancel completed order
            }
            order.status = 'cancelled'
            order.updatedAt = new Date()
            this.balance += order.cost // Refund
            logger.info('[MockSMS] Order cancelled', { id })
            return 'ACCESS_CANCEL'
        }

        // 1 - Confirm readiness (optional)
        if (status === '1') {
            return 'ACCESS_READY'
        }

        // 6 - Complete
        if (status === '6') {
            order.status = 'completed'
            order.updatedAt = new Date()
            logger.info('[MockSMS] Order completed', { id })
            return 'ACCESS_ACTIVATION'
        }

        // 3 - Request next SMS
        if (status === '3') {
            if (order.status !== 'received' && order.status !== 'pending') {
                return 'ERROR_BAD_STATUS'
            }

            order.isWaitingNext = true
            // Schedule next SMS in 10-20 seconds
            order.nextSmsAt = Date.now() + (Math.random() * 10000 + 10000)

            logger.info('[MockSMS] Requested next SMS', { id })
            return 'ACCESS_RETRY_GET'
        }

        return 'BAD_STATUS'
    }

    getPrices(countryCode?: string | null, serviceCode?: string | null): any {
        const countries = countryCode
            ? { [countryCode]: MOCK_COUNTRIES[countryCode as keyof typeof MOCK_COUNTRIES] }
            : MOCK_COUNTRIES

        const services = serviceCode
            ? MOCK_SERVICES.filter(s => s.code === serviceCode)
            : MOCK_SERVICES

        const result: Record<string, any> = {}

        Object.keys(countries).forEach(cId => {
            const countryServices: Record<string, any> = {}

            services.forEach(svc => {
                // Random deterministic price based on country+service
                const seed = parseInt(cId) + svc.code.length
                const price = (seed % 50) / 10 + 0.1
                const count = (seed * 100) % 5000 + 100

                countryServices[svc.code] = {
                    cost: price,
                    count: count
                }
            })

            result[cId] = countryServices
        })

        return result
    }

    getCountries(): any {
        return MOCK_COUNTRIES
    }

    getServices(): any {
        return MOCK_SERVICES
    }

    // ============================================================================
    // Internal Simulator
    // ============================================================================

    private startSimulator() {
        if (this.isSimulatorRunning) return
        this.isSimulatorRunning = true

        setInterval(() => {
            const now = Date.now()

            this.orders.forEach(order => {
                // 1. Check for SMS arrival
                if (order.nextSmsAt && now >= order.nextSmsAt) {
                    this.simulateSmsArrival(order)
                    order.nextSmsAt = undefined // Clear schedule
                }

                // 2. Auto-expiry (cleanup old orders > 1 hour)
                if (now - order.createdAt.getTime() > 3600000) {
                    this.orders.delete(order.id)
                }
            })

        }, 1000) // Check every second
    }

    private simulateSmsArrival(order: MockActivation) {
        // Generate realistic code
        const code = Math.floor(Math.random() * 900000 + 100000).toString() // 6 digits
        const serviceName = MOCK_SERVICES.find(s => s.code === order.serviceCode)?.name || 'Service'

        const message = {
            code,
            text: `<#> Your ${serviceName} verification code is: ${code}`,
            receivedAt: new Date()
        }

        order.smsMessages.push(message)
        order.status = 'received'
        order.isWaitingNext = false // Clear waiting flag
        order.updatedAt = new Date()

        logger.info('[MockSMS] SMS Arrived', {
            id: order.id,
            code,
            phone: order.phoneNumber
        })
    }
}
