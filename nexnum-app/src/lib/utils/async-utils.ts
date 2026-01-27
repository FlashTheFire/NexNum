
/**
 * Smart Rate Limiter / Queue
 * Enforces both max concurrency and max requests per second (RPS).
 */
export class RateLimitedQueue {
    private queue: { fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }[] = []
    private active = 0
    private lastRequestTime = 0
    private intervalMs: number

    constructor(
        private maxConcurrency: number,
        requestsPerMinute: number
    ) {
        this.intervalMs = 60000 / requestsPerMinute
    }

    add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject })
            this.process()
        })
    }

    private process() {
        // 1. Check concurrency limit
        if (this.active >= this.maxConcurrency) return

        // 2. Check queue empty
        if (this.queue.length === 0) return

        // 3. Check Rate Limit (Leaky Bucket / Shaper)
        const now = Date.now()
        const timeSinceLast = now - this.lastRequestTime
        const wait = Math.max(0, this.intervalMs - timeSinceLast)

        if (wait > 0) {
            // Wait for the token to regenerate
            setTimeout(() => this.process(), wait)
            return
        }

        // Execute
        const item = this.queue.shift()
        if (!item) return

        this.active++
        this.lastRequestTime = now

        item.fn()
            .then(item.resolve)
            .catch(item.reject)
            .finally(() => {
                this.active--
                this.process()
            })

        // Try to trigger the next item immediately (it will wait if needed)
        this.process()
    }
}

/**
 * Helper to pause execution
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Simple Semaphore for concurrency control
 */
export class Semaphore {
    private tasks: (() => void)[] = []
    private count: number

    constructor(max: number) {
        this.count = max
    }

    async acquire(): Promise<void> {
        if (this.count > 0) {
            this.count--
            return Promise.resolve()
        }

        return new Promise(resolve => {
            this.tasks.push(resolve)
        })
    }

    release(): void {
        if (this.tasks.length > 0) {
            const next = this.tasks.shift()
            next?.()
        } else {
            this.count++
        }
    }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number
        initialDelay?: number
        maxDelay?: number
        factor?: number
        onRetry?: (error: any, attempt: number) => void
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        factor = 2,
        onRetry
    } = options

    let lastError: any
    let delay = initialDelay

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (attempt > maxRetries) break

            if (onRetry) onRetry(error, attempt)

            await sleep(delay)
            delay = Math.min(delay * factor, maxDelay)
        }
    }

    throw lastError
}

/**
 * Wrap a promise with a timeout guard
 */
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string = 'Operation timed out'
): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        })
    ])
}
