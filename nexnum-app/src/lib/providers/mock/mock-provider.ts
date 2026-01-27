import { logger } from '@/lib/core/logger'
import { MOCK_COUNTRIES, MOCK_SERVICES, COUNTRY_PHONE_CODES } from './mock-data'

// Production guard - prevent accidental use in production
if (process.env.NODE_ENV === 'production' && process.env.ENABLE_MOCK_PROVIDER !== 'true') {
    throw new Error('MockSmsProvider is disabled in production. Set ENABLE_MOCK_PROVIDER=true to override.')
}
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

export interface MockRequestLog {
    id: string
    timestamp: Date
    action: string
    params: Record<string, string>
    response: string
    duration: number
}

export class MockSmsProvider {
    private orders: Map<string, MockActivation> = new Map()
    private balance: number = 1000.00
    private isSimulatorRunning = false
    private requestLogs: MockRequestLog[] = []
    private maxLogs = 100

    private constructor() {
        this.startSimulator()
    }

    static getInstance(): MockSmsProvider {
        // Force recreate if singleton is stale (missing new methods)
        if (globalForMock.mockSmsProvider && (
            typeof globalForMock.mockSmsProvider.logRequest !== 'function' ||
            typeof globalForMock.mockSmsProvider.getAllOrders !== 'function' ||
            typeof globalForMock.mockSmsProvider.setStatus !== 'function' ||
            typeof globalForMock.mockSmsProvider.getActivation !== 'function'
        )) {
            globalForMock.mockSmsProvider = undefined
        }
        if (!globalForMock.mockSmsProvider) {
            globalForMock.mockSmsProvider = new MockSmsProvider()
        }
        return globalForMock.mockSmsProvider
    }

    // Log a request
    logRequest(action: string, params: Record<string, string>, response: string, duration: number) {
        this.requestLogs.unshift({
            id: Math.random().toString(36).substring(2, 10),
            timestamp: new Date(),
            action,
            params,
            response,
            duration
        })
        // Keep only the last N logs
        if (this.requestLogs.length > this.maxLogs) {
            this.requestLogs.pop()
        }
    }

    getRequestLogs(): MockRequestLog[] {
        return this.requestLogs
    }

    // ============================================================================
    // Public API Methods
    // ============================================================================

    getBalance(): string {
        return this.balance.toFixed(2)
    }

    getActivation(id: string): MockActivation | undefined {
        return this.orders.get(id)
    }

    async purchaseNumber(countryCode: string, serviceCode: string): Promise<MockActivation> {
        const spanId = Math.random().toString(36).substring(7)
        logger.info(`[MockSMS] Purchase Start`, { spanId, countryCode, serviceCode })

        // 1. Simulate Network Latency (100-300ms)
        await new Promise(r => setTimeout(r, 100 + Math.random() * 200))

        // 2. Validate inputs
        if (!MOCK_COUNTRIES[countryCode as keyof typeof MOCK_COUNTRIES]) {
            logger.warn(`[MockSMS] Invalid Country`, { spanId, countryCode })
            const error: any = new Error('Country not supported')
            error.code = 'NO_NUMBERS'
            throw error
        }

        const service = MOCK_SERVICES.find(s => s.code === serviceCode)
        if (!service) {
            logger.warn(`[MockSMS] Invalid Service`, { spanId, serviceCode })
            // Simulate provider error code structure
            const error: any = new Error('Service not found')
            error.code = 'BAD_SERVICE'
            throw error
        }

        // 3. Simulate Random Provider Failure (5% chance)
        // Helps verify retry logic and circuit breakers in development
        if (Math.random() < 0.05) {
            logger.warn(`[MockSMS] Simulating Random Provider Failure`, { spanId })
            const error: any = new Error('Simulated upstream congestion')
            error.code = 'NO_NUMBERS' // Common "out of stock" response
            throw error
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
            canGetAnotherSms: true
            // NO auto-scheduled SMS - use admin panel to manually trigger
        }

        this.orders.set(id, activation)
        this.balance -= cost

        logger.info('[MockSMS] Purchased number Success', {
            spanId,
            id,
            phoneNumber,
            service: serviceCode,
            country: countryCode,
            cost
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
    // Internal Timer (Cleanup Only - SMS is MANUAL via admin panel)
    // ============================================================================

    private startSimulator() {
        if (this.isSimulatorRunning) return
        this.isSimulatorRunning = true

        // Only runs cleanup - NO automatic SMS generation
        setInterval(() => {
            const now = Date.now()

            this.orders.forEach(order => {
                // Auto-expiry (cleanup old orders > 1 hour)
                if (now - order.createdAt.getTime() > 3600000) {
                    this.orders.delete(order.id)
                }
            })

        }, 10000) // Check every 10 seconds (just for cleanup)
    }

    getAllOrders(): MockActivation[] {
        return Array.from(this.orders.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }

    forceSms(id: string) {
        const order = this.orders.get(id)
        if (order) {
            this.simulateSmsArrival(order)
            order.nextSmsAt = undefined
        }
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
