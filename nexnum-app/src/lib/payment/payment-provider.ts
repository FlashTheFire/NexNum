import { PaymentError } from './payment-errors'

export interface ChargeResult {
    transactionId: string
    amount: number
    currency: string
    status: 'success' | 'pending' | 'failed'
    metadata?: Record<string, unknown>
}

export interface PaymentProvider {
    name: string
    charge(amount: number, currency: string, sourceId: string): Promise<ChargeResult>
    refund(transactionId: string, amount?: number): Promise<boolean>
}

/**
 * Factory to get configured provider
 */
export function getPaymentProvider(): PaymentProvider {
    // In future, switch on process.env.PAYMENT_PROVIDER
    throw new Error('Payment provider not configured. Please implement a real payment provider for production use.');
}