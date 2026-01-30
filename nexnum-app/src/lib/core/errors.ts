/**
 * Standardized Error Handling for NexNum
 * 
 * Provides consistent error types, handling, and logging across the application.
 * All errors should extend AppError for proper categorization and tracking.
 */

import { logger } from '@/lib/core/logger'

// ═══════════════════════════════════════════════════════════════════════════
// Error Codes - Centralized error code registry
// ═══════════════════════════════════════════════════════════════════════════
export const ErrorCodes = {
    // Authentication Errors (1xxx)
    AUTH_INVALID_TOKEN: 'AUTH_1001',
    AUTH_EXPIRED_TOKEN: 'AUTH_1002',
    AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_1003',
    AUTH_RATE_LIMITED: 'AUTH_1004',

    // Validation Errors (2xxx)
    VALIDATION_INVALID_INPUT: 'VAL_2001',
    VALIDATION_MISSING_FIELD: 'VAL_2002',
    VALIDATION_INVALID_FORMAT: 'VAL_2003',

    // Provider Errors (3xxx)
    PROVIDER_UNAVAILABLE: 'PROV_3001',
    PROVIDER_TIMEOUT: 'PROV_3002',
    PROVIDER_INVALID_RESPONSE: 'PROV_3003',
    PROVIDER_RATE_LIMITED: 'PROV_3004',

    // Financial Errors (4xxx)
    WALLET_INSUFFICIENT_FUNDS: 'WAL_4001',
    WALLET_TRANSACTION_FAILED: 'WAL_4002',
    PAYMENT_FAILED: 'PAY_4003',

    // SMS Errors (5xxx)
    SMS_ACTIVATION_FAILED: 'SMS_5001',
    SMS_NUMBER_UNAVAILABLE: 'SMS_5002',
    SMS_DELIVERY_FAILED: 'SMS_5003',

    // System Errors (9xxx)
    SYSTEM_DATABASE_ERROR: 'SYS_9001',
    SYSTEM_CACHE_ERROR: 'SYS_9002',
    SYSTEM_QUEUE_ERROR: 'SYS_9003',
    SYSTEM_UNKNOWN: 'SYS_9999',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

// ═══════════════════════════════════════════════════════════════════════════
// AppError - Base error class for all application errors
// ═══════════════════════════════════════════════════════════════════════════
export class AppError extends Error {
    public readonly code: ErrorCode
    public readonly statusCode: number
    public readonly isOperational: boolean
    public readonly context?: Record<string, unknown>
    public readonly timestamp: string

    constructor(
        message: string,
        code: ErrorCode = ErrorCodes.SYSTEM_UNKNOWN,
        statusCode: number = 500,
        isOperational: boolean = true,
        context?: Record<string, unknown>
    ) {
        super(message)
        this.name = 'AppError'
        this.code = code
        this.statusCode = statusCode
        this.isOperational = isOperational
        this.context = context
        this.timestamp = new Date().toISOString()

        // Capture stack trace
        Error.captureStackTrace(this, this.constructor)
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            context: this.context,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Specialized Error Classes
// ═══════════════════════════════════════════════════════════════════════════
export class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, ErrorCodes.VALIDATION_INVALID_INPUT, 400, true, context)
        this.name = 'ValidationError'
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
        super(message, ErrorCodes.AUTH_INVALID_TOKEN, 401, true, context)
        this.name = 'AuthenticationError'
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
        super(message, ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS, 403, true, context)
        this.name = 'AuthorizationError'
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, context?: Record<string, unknown>) {
        super(`${resource} not found`, ErrorCodes.VALIDATION_INVALID_INPUT, 404, true, context)
        this.name = 'NotFoundError'
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Rate limit exceeded', context?: Record<string, unknown>) {
        super(message, ErrorCodes.AUTH_RATE_LIMITED, 429, true, context)
        this.name = 'RateLimitError'
    }
}

export class ProviderError extends AppError {
    constructor(
        message: string,
        code: ErrorCode = ErrorCodes.PROVIDER_UNAVAILABLE,
        context?: Record<string, unknown>
    ) {
        super(message, code, 502, true, context)
        this.name = 'ProviderError'
    }
}

export class InsufficientFundsError extends AppError {
    constructor(required: number, available: number, currency: string = 'USD') {
        super(
            `Insufficient funds: required ${currency} ${required.toFixed(2)}, available ${currency} ${available.toFixed(2)}`,
            ErrorCodes.WALLET_INSUFFICIENT_FUNDS,
            402,
            true,
            { required, available, currency }
        )
        this.name = 'InsufficientFundsError'
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Handler - Centralized error processing
// ═══════════════════════════════════════════════════════════════════════════
export function handleError(error: unknown, context: string): AppError {
    // Already an AppError
    if (error instanceof AppError) {
        logger.error(`[${context}] ${error.message}`, {
            code: error.code,
            statusCode: error.statusCode,
            context: error.context,
        })
        return error
    }

    // Standard Error
    if (error instanceof Error) {
        logger.error(`[${context}] Unexpected error: ${error.message}`, {
            stack: error.stack,
        })
        return new AppError(
            error.message,
            ErrorCodes.SYSTEM_UNKNOWN,
            500,
            false,
            { originalError: error.name }
        )
    }

    // Unknown error type
    logger.error(`[${context}] Unknown error type`, { error: String(error) })
    return new AppError(
        'An unexpected error occurred',
        ErrorCodes.SYSTEM_UNKNOWN,
        500,
        false
    )
}

// ═══════════════════════════════════════════════════════════════════════════
// Safe Execution Wrapper
// ═══════════════════════════════════════════════════════════════════════════
export async function safeExecute<T>(
    fn: () => Promise<T>,
    context: string,
    fallback?: T
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
    try {
        const data = await fn()
        return { success: true, data }
    } catch (error) {
        const appError = handleError(error, context)
        if (fallback !== undefined) {
            return { success: true, data: fallback }
        }
        return { success: false, error: appError }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// API Response Helpers
// ═══════════════════════════════════════════════════════════════════════════
export function errorResponse(error: AppError | unknown) {
    const appError = error instanceof AppError ? error : handleError(error, 'API')

    return Response.json(
        {
            success: false,
            error: {
                code: appError.code,
                message: appError.message,
            },
        },
        { status: appError.statusCode }
    )
}

export function isOperationalError(error: unknown): boolean {
    if (error instanceof AppError) {
        return error.isOperational
    }
    return false
}
