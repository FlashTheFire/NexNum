import { AppError } from '@/lib/api/response-factory'

export type PaymentErrorCode =
    | 'E_INSUFFICIENT_FUNDS'
    | 'E_PAYMENT_DECLINED'
    | 'E_PROVIDER_ERROR'
    | 'E_INVALID_AMOUNT'
    | 'E_IDEMPOTENCY_CONFLICT'
    | 'E_INTEGRITY_BREACH'

export class PaymentError extends AppError {
    constructor(message: string, code: PaymentErrorCode, status: number = 400) {
        super(message, status, code)
        this.name = 'PaymentError'
    }

    static insufficientFunds(details?: string) {
        return new PaymentError(
            details || 'Insufficient funds to complete transaction',
            'E_INSUFFICIENT_FUNDS',
            402 // Payment Required
        )
    }

    static declined(reason: string) {
        return new PaymentError(
            `Payment declined: ${reason}`,
            'E_PAYMENT_DECLINED',
            402
        )
    }

    static providerError(details: string) {
        return new PaymentError(
            'Payment provider unavailable',
            'E_PROVIDER_ERROR',
            503
        )
    }

    static integrityBreach(userId: string) {
        return new PaymentError(
            'Financial integrity check failed. Account frozen associated with ID: ' + userId,
            'E_INTEGRITY_BREACH',
            423 // Locked
        )
    }
}