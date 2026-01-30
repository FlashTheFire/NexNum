/**
 * Core Module - Central exports for all core infrastructure
 * 
 * This barrel file provides clean imports for the most commonly used core utilities.
 * Import from '@/lib/core' instead of individual files.
 */

// Database
export { prisma } from './db'

// Cache
export { redis } from './redis'
export { getCachedActiveProviders, invalidateCache, getCacheStats } from './cache'

// Queue
export { queue } from './queue'

// Logging
export { logger } from './logger'

// Errors
export {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    ProviderError,
    InsufficientFundsError,
    ErrorCodes,
    handleError,
    safeExecute,
    errorResponse,
    isOperationalError,
    type ErrorCode,
} from './errors'

// Orchestrator
export { orchestrator } from './orchestrator'
