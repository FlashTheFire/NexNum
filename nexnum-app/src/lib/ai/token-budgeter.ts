/**
 * Token Budgeter & AI Spend Auditor
 * 
 * Tracks token consumption across all Gemini models and enforces 
 * daily/hourly budget constraints to protect the platform's bottom line.
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

// Estimated costs per 1K tokens (Input/Output average in USD)
// These are rough estimates for budgeting purposes
const MODEL_COSTS: Record<string, number> = {
    'gemini-2.5-pro': 0.0035,
    'gemini-2.5-flash': 0.0001,
    'gemini-2.0-flash': 0.0001,
    'gemini-2.0-flash-lite': 0.000075,
    'gemma-3n': 0.00005
}

export class TokenBudgeter {
    private static BUDGET_LIMIT_DAILY = 10.00 // $10 USD per day
    private static REDIS_KEY = 'ai:budget:daily:'

    /**
     * Records token usage and checks if budget allows continuation.
     * @returns boolean - True if within budget, False if limit exceeded.
     */
    static async recordAndCheck(modelId: string, tokens: number): Promise<boolean> {
        const today = new Date().toISOString().split('T')[0]
        const key = `${this.REDIS_KEY}${today}`

        const costPerK = MODEL_COSTS[modelId] || 0.0001
        const estimatedCost = (tokens / 1000) * costPerK

        try {
            // Increment daily spend
            const result = await redis.incrbyfloat(key, estimatedCost)
            const currentSpend = typeof result === 'string' ? parseFloat(result) : result

            // Set 48h expiry for the key if new
            if (currentSpend <= estimatedCost + 0.000001 && currentSpend >= estimatedCost - 0.000001) {
                await redis.expire(key, 172800)
            }

            if (currentSpend > this.BUDGET_LIMIT_DAILY) {
                logger.error(`[TokenBudgeter] DAILY AI BUDGET EXCEEDED: $${currentSpend.toFixed(4)} / $${this.BUDGET_LIMIT_DAILY}`, {
                    modelId,
                    tokens
                })
                return false
            }

            return true
        } catch (error: any) {
            logger.error('[TokenBudgeter] Error auditing token usage', { error: error.message })
            return true // Fail-open on budgeter errors to avoid breaking AI
        }
    }

    /**
     * Get current daily spend
     */
    static async getCurrentSpend(): Promise<number> {
        const today = new Date().toISOString().split('T')[0]
        const key = `${this.REDIS_KEY}${today}`
        const val = await redis.get(key)
        return val ? parseFloat(val as string) : 0
    }

    /**
     * Get remaining budget percentage
     */
    static async getBudgetStatus(): Promise<{ spend: number; limit: number; percentage: number }> {
        const spend = await this.getCurrentSpend()
        return {
            spend,
            limit: this.BUDGET_LIMIT_DAILY,
            percentage: Math.min(100, (spend / this.BUDGET_LIMIT_DAILY) * 100)
        }
    }
}
