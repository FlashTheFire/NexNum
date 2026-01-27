import { PaymentError } from './payment-errors'

export interface ChargeResult {
    transactionId: string
    amount: number
    currency: string
    status: 'success' | 'pending' | 'failed'
    metadata?: Record<string, any>
}

export interface PaymentProvider {
    name: string
    charge(amount: number, currency: string, sourceId: string): Promise<ChargeResult>
    refund(transactionId: string, amount?: number): Promise<boolean>
}

/**
 * Mock Provider for Development/Testing
 */
export class MockPaymentProvider implements PaymentProvider {
    name = 'MockProvider'

    async charge(amount: number, currency: string, sourceId: string): Promise<ChargeResult> {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 500))

        if (sourceId === 'simulate_error') {
            throw PaymentError.declined('Mock bank declined transaction')
        }

        return {
            transactionId: `mock_tx_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            amount,
            currency,
            status: 'success',
            metadata: { source: 'mock', env: process.env.NODE_ENV }
        }
    }

    async refund(transactionId: string): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 300))
        return true
    }
}

// Factory to get configured provider
export function getPaymentProvider(): PaymentProvider {
    // In future, switch on process.env.PAYMENT_PROVIDER
    return new MockPaymentProvider()
}