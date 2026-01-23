
/**
 * Shared Circuit Breaker Configuration
 * 
 * Standardizes Opossum settings across DynamicProvider and NumberLifecycleManager
 * for consistent resilience behavior.
 */

export const CIRCUIT_OPTS = {
    timeout: 45000,               // 45s timeout (aligns with provider timeouts)
    errorThresholdPercentage: 50, // Open breaker if 50% of requests fail
    resetTimeout: 30000,          // Wait 30s before testing half-open state
    volumeThreshold: 5,           // Minimum 5 requests before breaker can open

    // Default rolling window (10s) is usually fine, but can be tuned if needed
    // rollingCountTimeout: 10000 
} as const;
