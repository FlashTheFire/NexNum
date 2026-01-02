/**
 * Gemini Model Registry & Intelligent Selection
 * 
 * Automatically selects the optimal model based on task complexity.
 * Uses tiered approach: Pro for heavy analysis, Flash for medium, Lite for simple tasks.
 */

import { redis } from './redis'

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
    }>
}

class GeminiKeyPoolService {
    private keys: string[] = []
    private initialized = false

    private init() {
        if (this.initialized) return

        const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ''
        this.keys = keysEnv.split(',').map(k => k.trim()).filter(Boolean)

        if (this.keys.length === 0) {
            console.warn('[GeminiPool] No API keys configured')
        } else {
            console.log(`[GeminiPool] Initialized with ${this.keys.length} API key(s)`)
        }

        this.initialized = true
    }

    /**
     * Get models for a specific tier, ordered by preference
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
        const idx = await redis.get(`${REDIS_KEY_PREFIX}active_index`)
        return idx !== null ? parseInt(idx as string, 10) : 0
    }

    private async setActiveKeyIndex(index: number): Promise<void> {
        await redis.set(`${REDIS_KEY_PREFIX}active_index`, index.toString())
    }

    private async isKeyInCooldown(keyIndex: number, modelId: string): Promise<boolean> {
        const cooldownKey = `${REDIS_KEY_PREFIX}cooldown:${keyIndex}:${modelId}`
        const exists = await redis.exists(cooldownKey)
        return exists === 1
    }

    private async markKeyExhausted(keyIndex: number, modelId: string, cooldownMs: number): Promise<void> {
        const cooldownKey = `${REDIS_KEY_PREFIX}cooldown:${keyIndex}:${modelId}`
        const cooldownSeconds = Math.ceil(cooldownMs / 1000)
        await redis.set(cooldownKey, Date.now().toString(), { ex: cooldownSeconds })
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
                    await this.setActiveKeyIndex(index)
                    console.log(`[GeminiPool] Rotated to key #${index + 1}`)
                }
                return { key: this.keys[index], index }
            }
        }

        return null
    }

    /**
     * Intelligent call with automatic model selection and key rotation
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

        // Determine complexity
        const tier = explicitTier || determineComplexity({
            taskType,
            promptLength: systemPrompt.length + userPrompt.length,
            expectedOutputSize: maxOutputTokens && maxOutputTokens > 4000 ? 'large' : 'medium'
        })

        // Get models for this tier (try each if one fails)
        const models = this.getModelsForTier(tier)
        const fallbackModels = tier === 'high'
            ? this.getModelsForTier('medium')
            : tier === 'low'
                ? this.getModelsForTier('medium')
                : []

        const allModels = [...models, ...fallbackModels]

        let lastError: Error | null = null

        for (const model of allModels) {
            // Try each key for this model
            for (let keyAttempt = 0; keyAttempt < this.keys.length; keyAttempt++) {
                const keyInfo = await this.getAvailableKey(model.id)

                if (!keyInfo) {
                    console.log(`[GeminiPool] All keys exhausted for ${model.name}, trying next model...`)
                    break
                }

                try {
                    console.log(`[GeminiPool] Using ${model.name} with key #${keyInfo.index + 1}`)

                    const response = await fetch(`${model.endpoint}?key=${keyInfo.key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [
                                { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
                            ],
                            generationConfig: {
                                temperature,
                                topK: 40,
                                topP: 0.8,
                                maxOutputTokens: maxOutputTokens || model.maxOutput,
                                responseMimeType: isJson ? 'application/json' : 'text/plain'
                            }
                        })
                    })

                    if (response.status === 429) {
                        const errorText = await response.text()
                        const cooldown = this.parseRetryDelay(errorText)

                        console.warn(`[GeminiPool] Rate limit on ${model.name} key #${keyInfo.index + 1}`)
                        await this.markKeyExhausted(keyInfo.index, model.id, cooldown)

                        lastError = new Error(`Rate limit on ${model.name}`)
                        continue
                    }

                    if (!response.ok) {
                        const errorText = await response.text()
                        throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
                    }

                    const data: GeminiResponse = await response.json()
                    return data.candidates[0].content.parts[0].text

                } catch (error) {
                    lastError = error as Error
                    console.error(`[GeminiPool] ${model.name} failed:`, (error as Error).message)
                }
            }
        }

        throw lastError || new Error('All Gemini models and keys exhausted')
    }

    /**
     * Get status of all keys and models (for admin dashboard)
     */
    async getPoolStatus(): Promise<{
        keys: Array<{ key: string; index: number }>
        models: ModelConfig[]
    }> {
        this.init()

        return {
            keys: this.keys.map((k, i) => ({
                key: k.substring(0, 8) + '...',
                index: i
            })),
            models: MODEL_REGISTRY
        }
    }
}

export const GeminiKeyPool = new GeminiKeyPoolService()
