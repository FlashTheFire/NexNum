import CircuitBreaker from 'opossum'

/**
 * Resilient Adapter Template
 * 
 * Use this pattern when creating a NEW hardcoded provider adapter 
 * instead of using the DynamicProvider engine.
 * 
 * Features:
 * - Circuit Breaker (Opossum)
 * - Automatic Retries (integrated in breaker)
 * - Fallback logic
 */

export abstract class ResilientSmsProvider {
    protected breaker: CircuitBreaker
    protected name: string

    constructor(name: string, options?: CircuitBreaker.Options) {
        this.name = name
        // Initialize Breaker
        this.breaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), {
            timeout: 30000,
            errorThresholdPercentage: 50,
            resetTimeout: 10000,
            ...options
        })

        // Metrics Hooks
        this.breaker.on('open', () => console.warn(`[${this.name}] Circuit OPEN`))
        this.breaker.on('close', () => console.info(`[${this.name}] Circuit CLOSED`))
    }

    /**
     * Wrap execution with resilience
     */
    protected async execute<T>(actionName: string, operation: () => Promise<T>): Promise<T> {
        try {
            return (await this.breaker.fire(operation)) as T
        } catch (err: any) {
            if (err.code === 'EOPEN') {
                console.error(`[${this.name}] fast-failed ${actionName} (Circuit Open)`)
                throw new Error(`Provider ${this.name} is temporarily unavailable`)
            }
            throw err
        }
    }
}

// Example Usage:
/*
export class MyProvider extends ResilientSmsProvider {
    constructor() {
        super('MyProvider')
    }

    async getNumber(country: string, service: string) {
        return this.execute('getNumber', async () => {
             // ... fetch logic ...
             const res = await fetch(...)
             if (!res.ok) throw new Error('API Error')
             return res.json()
        })
    }
}
*/
