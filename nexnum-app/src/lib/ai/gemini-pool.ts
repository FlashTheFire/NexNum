/**
 * Gemini Model Registry & Intelligent Selection
 * 
 * Automatically selects the optimal model based on task complexity.
 * Uses tiered approach: Pro for heavy analysis, Flash for medium, Lite for simple tasks.
 */

import { redis } from '@/lib/core/redis'
import { TokenBudgeter } from '@/lib/ai/token-budgeter'
import CircuitBreaker from 'opossum'
import { CIRCUIT_OPTS } from '@/lib/core/circuit-breaker'
import { ai_token_usage_total, ai_budget_spend_usd } from '@/lib/metrics'
import { logger } from '@/lib/core/logger'

// ============================================================================
// MODEL REGISTRY
// ============================================================================

export type ModelTier = 'high' | 'medium' | 'low'

export interface ModelConfig {
    id: string
    name: string
    tier: ModelTier
    rpm: number      // Requests per minute
    tpm: number      // Tokens per minute (input)
    rpd: number      // Requests per day
    maxOutput: number
    endpoint: string
}

// Ordered by preference within each tier
export const MODEL_REGISTRY: ModelConfig[] = [
    // High Tier - Complex analysis, full documentation generation
    {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        tier: 'high',
        rpm: 5,
        tpm: 250_000,
        rpd: 100,
        maxOutput: 8192,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
    },
    // Medium Tier - Standard tasks, config generation
    {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        tier: 'medium',
        rpm: 10,
        tpm: 250_000,
        rpd: 20,
        maxOutput: 8192,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    },
    {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        tier: 'medium',
        rpm: 15,
        tpm: 1_000_000,
        rpd: 250,
        maxOutput: 8192,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    },
    // Low Tier - Simple validations, quick checks
    {
        id: 'gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash Lite',
        tier: 'low',
        rpm: 20,
        tpm: 250_000,
        rpd: 500,
        maxOutput: 4096,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'
    },
    {
        id: 'gemma-3n',
        name: 'Gemma 3n',
        tier: 'low',
        rpm: 50,
        tpm: 250_000,
        rpd: 1000,
        maxOutput: 4096,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemma-3n:generateContent'
    }
]

// ============================================================================
// TASK COMPLEXITY DETECTION
// ============================================================================

export type TaskType =
    | 'analyze'           // Full documentation analysis (HIGH)
    | 'generate_config'   // Generate provider config (MEDIUM-HIGH)
    | 'validate'          // Validate JSON/config (LOW)
    | 'extract'           // Extract specific fields (LOW)
    | 'summarize'         // Summarize text (MEDIUM)
    | 'chat'              // General chat (LOW-MEDIUM)

interface ComplexityFactors {
    taskType?: TaskType
    promptLength?: number
    expectedOutputSize?: 'small' | 'medium' | 'large'
    requiresReasoning?: boolean
}

/**
 * Determine optimal model tier based on task characteristics
 */
export function determineComplexity(factors: ComplexityFactors): ModelTier {
    const { taskType, promptLength = 0, expectedOutputSize, requiresReasoning } = factors

    // Task type overrides
    if (taskType === 'analyze' || taskType === 'generate_config') {
        return 'high'
    }
    if (taskType === 'validate' || taskType === 'extract') {
        return 'low'
    }

    // Reasoning tasks need higher capability
    if (requiresReasoning) {
        return 'high'
    }

    // Large output needs more capable model
    if (expectedOutputSize === 'large') {
        return 'medium'
    }

    // Long prompts might need more context handling
    if (promptLength > 5000) {
        return 'medium'
    }

    // Default to low for simple operations
    return 'low'
}

// ============================================
// AI FORENSICS & INCIDENT TRACKER
// ============================================

export class AIForensics {
    /**
     * Snapshots a failed AI interaction for investigation.
     */
    static async logIncident(modelId: string, error: any, context: any) {
        const incidentId = `ai_incident_${Date.now()}`
        const log = {
            modelId,
            error: error.message || error,
            timestamp: new Date(),
            ...context
        }

        await redis.setex(`ai:incident:${incidentId}`, 86400, JSON.stringify(log))
        logger.error(`[AIForensics] Incident recorded: ${incidentId}`, { modelId, error: error.message })
    }
}

// ============================================================================
// KEY POOL WITH MODEL SELECTION
// ============================================================================

const REDIS_KEY_PREFIX = 'gemini:pool:'
const DEFAULT_COOLDOWN_MS = 60_000

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{ text: string }>
        }
        finishReason?: string
    }>
    usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
    }
}

class GeminiKeyPoolService {
    private keys: string[] = []
    private initialized = false
    private static breakers = new Map<ModelTier, CircuitBreaker>()

    private init() {
        if (this.initialized) return

        const { decrypt } = require('@/lib/security/encryption')
        const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ''
        this.keys = keysEnv.split(',').map(k => k.trim()).filter(Boolean)

        if (this.keys.length === 0) {
            logger.warn('[GeminiPool] No API keys configured')
        } else {
            logger.info(`[GeminiPool] Initialized with ${this.keys.length} API key(s)`)
        }

        this.initialized = true
    }

    private getBreaker(tier: ModelTier): CircuitBreaker {
        if (!GeminiKeyPoolService.breakers.has(tier)) {
            const breaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), {
                ...CIRCUIT_OPTS,
                name: `GeminiPool:${tier}`
            })

            breaker.on('open', () => logger.warn(`[GeminiPool:${tier}] Circuit OPEN - Failing over`))
            breaker.on('close', () => logger.success(`[GeminiPool:${tier}] Circuit CLOSED - Recovered`))

            GeminiKeyPoolService.breakers.set(tier, breaker)
        }
        return GeminiKeyPoolService.breakers.get(tier)!
    }

    /**
     * Get models for a specific tier
     */
    getModelsForTier(tier: ModelTier): ModelConfig[] {
        return MODEL_REGISTRY.filter(m => m.tier === tier)
    }

    /**
     * Select the optimal model based on complexity
     */
    selectModel(tier: ModelTier): ModelConfig {
        const models = this.getModelsForTier(tier)

        // For now, return first available. Could add load balancing later.
        if (models.length === 0) {
            // Fallback to medium tier if requested tier unavailable
            const fallback = MODEL_REGISTRY.find(m => m.tier === 'medium')
            return fallback || MODEL_REGISTRY[0]
        }

        return models[0]
    }

    // Key pool methods (same as before)
    private async getActiveKeyIndex(): Promise<number> {
        const val = await redis.get(`${REDIS_KEY_PREFIX}active_index`)
        return val !== null ? parseInt(val as string, 10) : 0
    }

    private async rotateKeyIndex(): Promise<number> {
        // Atomic rotation using INCR
        const next = await redis.incr(`${REDIS_KEY_PREFIX}active_index`)
        return next % this.keys.length
    }

    private async isKeyInCooldown(keyIndex: number, modelId: string): Promise<boolean> {
        const cooldownKey = `${REDIS_KEY_PREFIX}cooldown:${keyIndex}:${modelId}`
        const exists = await redis.exists(cooldownKey)
        return exists === 1
    }

    private async markKeyExhausted(keyIndex: number, modelId: string, cooldownMs: number): Promise<void> {
        const cooldownKey = `${REDIS_KEY_PREFIX}cooldown:${keyIndex}:${modelId}`
        const cooldownSeconds = Math.ceil(cooldownMs / 1000)
        await redis.set(cooldownKey, Date.now().toString(), 'EX', cooldownSeconds)
        console.log(`[GeminiPool] Key #${keyIndex + 1} + ${modelId} in cooldown for ${cooldownSeconds}s`)
    }

    private parseRetryDelay(errorText: string): number {
        try {
            const match = errorText.match(/retry in (\d+(?:\.\d+)?)s/i)
            if (match) {
                return Math.ceil(parseFloat(match[1]) * 1000) + 1000
            }
        } catch { }
        return DEFAULT_COOLDOWN_MS
    }

    async getAvailableKey(modelId: string): Promise<{ key: string; index: number } | null> {
        this.init()
        if (this.keys.length === 0) return null

        const startIndex = await this.getActiveKeyIndex()

        for (let i = 0; i < this.keys.length; i++) {
            const index = (startIndex + i) % this.keys.length
            const inCooldown = await this.isKeyInCooldown(index, modelId)

            if (!inCooldown) {
                if (index !== startIndex) {
                    await this.rotateKeyIndex()
                    logger.debug(`[GeminiPool] Rotated to key #${index + 1}`)
                }
                return { key: this.keys[index], index }
            }
        }

        return null
    }

    /**
     * Industrial AI call with tiered fail-over and circuit breakers.
     */
    async call(
        systemPrompt: string,
        userPrompt: string,
        options: {
            isJson?: boolean
            temperature?: number
            maxOutputTokens?: number
            taskType?: TaskType
            tier?: ModelTier
        } = {}
    ): Promise<string> {
        this.init()

        const {
            isJson = true,
            temperature = 0.1,
            maxOutputTokens,
            taskType,
            tier: explicitTier
        } = options

        // 1. Determine Target Tier
        const targetTier = explicitTier || determineComplexity({
            taskType,
            promptLength: systemPrompt.length + userPrompt.length,
            expectedOutputSize: maxOutputTokens && maxOutputTokens > 4000 ? 'large' : 'medium'
        })

        // 2. Cascade Tiers (Target -> Medium -> Low)
        const tiersToTry: ModelTier[] = [targetTier]
        if (targetTier === 'high') tiersToTry.push('medium', 'low')
        if (targetTier === 'medium') tiersToTry.push('low')

        // Remove duplicates and respect ordering
        const uniqueTiers = [...new Set(tiersToTry)]

        for (const tier of uniqueTiers) {
            const breaker = this.getBreaker(tier)

            if (breaker.opened) {
                logger.debug(`[GeminiPool] Skipping ${tier} tier - Circuit is OPEN`)
                continue
            }

            try {
                return await (breaker.fire(async () => {
                    const models = this.getModelsForTier(tier)

                    for (const model of models) {
                        // Rotation strategy: Try current, then rotate if 429
                        for (let attempt = 0; attempt < Math.min(this.keys.length, 3); attempt++) {
                            const keyInfo = await this.getAvailableKey(model.id)
                            if (!keyInfo) break

                            try {
                                const response = await fetch(`${model.endpoint}?key=${keyInfo.key}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        contents: [
                                            { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
                                        ],
                                        generationConfig: {
                                            temperature,
                                            maxOutputTokens: maxOutputTokens || model.maxOutput,
                                            responseMimeType: isJson ? 'application/json' : 'text/plain'
                                        }
                                    }),
                                    signal: AbortSignal.timeout(60000) // 60s max for AI
                                })

                                if (response.status === 429) {
                                    const errorText = await response.text()
                                    const cooldown = this.parseRetryDelay(errorText)
                                    await this.markKeyExhausted(keyInfo.index, model.id, cooldown)
                                    await this.rotateKeyIndex() // Move to next key for next time
                                    continue
                                }

                                if (!response.ok) {
                                    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
                                }

                                const data: GeminiResponse = await response.json()
                                const text = data.candidates[0]?.content?.parts?.[0]?.text

                                if (!text) throw new Error('EMPTY_AI_RESPONSE')

                                // 3. Token Budget Audit & Telemetry
                                if (data.usageMetadata) {
                                    const { promptTokenCount, candidatesTokenCount, totalTokenCount } = data.usageMetadata

                                    // Telemetry reporting
                                    ai_token_usage_total.inc({ model: model.id, type: 'prompt' }, promptTokenCount || 0)
                                    ai_token_usage_total.inc({ model: model.id, type: 'completion' }, candidatesTokenCount || 0)

                                    const budget = await TokenBudgeter.getBudgetStatus()
                                    ai_budget_spend_usd.set(budget.spend)

                                    const ok = await TokenBudgeter.recordAndCheck(model.id, totalTokenCount)
                                    if (!ok) logger.warn(`[GeminiPool] Budget threshold reached during request for ${model.name}`)
                                }

                                return text

                            } catch (err: any) {
                                if (err.name === 'AbortError') throw new Error('AI_TIMEOUT')
                                throw err
                            }
                        }
                    }
                    throw new Error(`Exhausted all models in tier ${tier}`)
                }) as Promise<string>)
            } catch (error: any) {
                const isPermanent = error.message.includes('400') || error.message.includes('403')
                if (isPermanent) {
                    await AIForensics.logIncident(String(tier), error, { systemPrompt, userPrompt })
                    throw error // Don't fail-over for bad requests
                }
                logger.warn(`[GeminiPool] Tier ${tier} failed: ${error.message} - Trying next...`)
            }
        }

        throw new Error('ELITE_AI_ORCHESTRATOR_FAILURE: All tiers exhausted')
    }

    async getPoolStatus() {
        this.init()
        const budget = await TokenBudgeter.getBudgetStatus()

        return {
            keys: this.keys.length,
            tiers: (['high', 'medium', 'low'] as ModelTier[]).map(t => ({
                tier: t,
                status: this.getBreaker(t).opened ? 'OPEN (FAILED)' : 'CLOSED (HEALTHY)'
            })),
            budget
        }
    }
}

export const GeminiKeyPool = new GeminiKeyPoolService()
