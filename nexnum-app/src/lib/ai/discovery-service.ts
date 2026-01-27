/**
 * Universal AI Intelligence Service (NexNum Brain)
 * 
 * Consolidates all AI-driven logic for:
 * - Documentation Analysis (Forensic Reporting)
 * - Full Provider Configuration Generation
 * - Runtime Mapping Discovery (Self-Healing)
 */

import { GeminiKeyPool, TaskType } from './gemini-pool'
import { logger } from '../core/logger'

export type DiscoveryType = 'BALANCE' | 'SMS_RENT' | 'SMS_STATUS' | 'INV_COUNTRY' | 'INV_SERVICE'

// --- INDUSTRIAL PROMPT CONTEXTS ---

const STRICT_OUTPUT_SCHEMA = `
### STRICT OUTPUT JSON SCHEMA
You MUST generate a JSON object matching this TypeScript interface exactly. DO NOT use arrays for endpoints or mappings.

\`\`\`typescript
interface ProviderConfig {
  name: string;
  apiBaseUrl: string; // No trailing slash
  authType: 'query_param' | 'header' | 'bearer';
  authQueryParam?: string; // If authType is query_param
  authHeader?: string; // If authType is header
  
  // Map of Key -> EndpointConfig
  endpoints: {
    [key in 'getCountries' | 'getServices' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance' | 'getPrices']: {
        method: string;
        path: string;
        queryParams?: Record<string, string>;
        headers?: Record<string, string>;
    };
  };

  // Map of Key -> MappingConfig
  mappings: {
    [key in 'getCountries' | 'getServices' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance' | 'getPrices']: any;
  };
}
\`\`\`
`

const SYSTEM_PROMPT_ANALYZE = `You are an Elite API Auditor. Scan the documentation and generate a precise JSON forensic report.

### DETECTION LOGIC
1. **JSON API**: 
   - Responses are clearly JSON objects ({...}) or arrays ([...]).
   - Content-Type mentioned as application/json.
2. **TEXT / REGEX**: 
   - Responses are plain text, pipe-separated (|), colon-separated (:), or just "ACCESS_NUMBER:123".
   - Content-Type text/plain or text/html.

### MANDATORY INSPECTION POINTS
1. **Identity Check**: Extract Service Name and Base URL.
2. **Authentication**: 
   - API Key param name? (api_key, token, key)
   - Header name? (Authorization, X-API-Key)
3. **Endpoint Verification**:
   - Look for standard SMS actions: getBalance, getPrices, getCountries, getServices, getNumber, getStatus.

### OUTPUT FORMAT
return {
  "missing": ["getCountries"],
  "detected": {
    "name": "Service Name",
    "baseUrl": "https://api.example.com/stubs/handler_api.php", 
    "authType": "query_param",
    "authQueryParam": "api_key",
    "endpoints": ["getNumber", "getStatus", "getPrices"]
  },
  "providerType": "json_api", // or text_regex
  "confidence": 0.95
}
`

const SYSTEM_COMMON_STANDARDS = `
### UNIVERSAL ARCHITECTURAL STANDARDS
1. **NO HACKY ROOT PATHS**: Use "json_dictionary" and let the engine recurse naturally.
2. **CONTEXT IS KING**: Use strict context accessors ($key, $parentKey, $grandParentKey).
3. **FALLBACK CHAINS**: Use pipe syntax ("cost": "price|amount") for resilience.
`

export class NormalizationDiscoveryService {

    /**
     * Analyze documentation text to detect API structure/auth.
     */
    static async analyzeDocumentation(prompt: string): Promise<any> {
        return this.executeGemini(SYSTEM_PROMPT_ANALYZE, `DOCUMENTATION:\n${prompt}`, 'analyze')
    }

    /**
     * Generate a full ProviderConfig from documentation and supplements.
     */
    static async generateConfiguration(params: {
        docPrompt: string,
        providerType: 'json_api' | 'text_regex',
        supplements?: any
    }): Promise<any> {
        const systemPrompt = `You are a Senior Data Engineer. Generate a PRODUCTION-GRADE ProviderConfig.
        ${STRICT_OUTPUT_SCHEMA}
        ${SYSTEM_COMMON_STANDARDS}
        ${params.providerType === 'text_regex' ? 'MUST use "text_regex" type with Named Capture Groups.' : ''}
        Output valid JSON only.`

        let userPrompt = `### INPUT DOCUMENTATION:\n${params.docPrompt}`
        if (params.supplements) {
            userPrompt += `\n\n### USER SUPPLEMENTS:\n${JSON.stringify(params.supplements, null, 2)}`
        }

        return this.executeGemini(systemPrompt, userPrompt, 'generate_config')
    }

    /**
     * Analyze a raw response and suggest an industrial MappingConfig (Self-Healing).
     */
    static async discoverMapping(rawResponse: string, context: {
        type: DiscoveryType,
        providerName: string
    }): Promise<any> {
        const systemPrompt = `You are an Elite Infrastructure Architect. Generate a NexNum "MappingConfig" JSON.
        - type: "json_object" | "json_array" | "json_dictionary" | "json_value" | "json_array_positional"
        - rootPath: dot-notation string
        - fields: Map NexNum standard fields to provider keys. Use pipe | for fallbacks.
        Output ONLY the valid JSON MappingConfig object.`

        const userPrompt = `Provider: ${context.providerName}\nDiscovery Goal: ${context.type}\nContent:\n${rawResponse}`

        return this.executeGemini(systemPrompt, userPrompt, 'generate_config')
    }

    private static async executeGemini(systemPrompt: string, userPrompt: string, taskType: TaskType): Promise<any> {
        const startTime = Date.now()
        try {
            logger.debug(`[AI:Brain] Starting Operation: ${taskType}`, {
                taskType,
                sysPromptLen: systemPrompt.length,
                userPromptLen: userPrompt.length
            })

            // Execute via the industrial pool
            const result = await GeminiKeyPool.call(systemPrompt, userPrompt, {
                taskType,
                // Analyze needs higher intelligence, others can tolerate medium
                tier: taskType === 'analyze' ? 'high' : 'medium',
                isJson: true
            })

            const duration = Date.now() - startTime

            // Clean markdown JSON if present
            const cleanResult = result.replace(/```json|```/g, '').trim()

            try {
                const parsed = JSON.parse(cleanResult)
                logger.info(`[AI:Brain] Operation Success: ${taskType}`, { duration })
                return parsed
            } catch (jsonError) {
                logger.error(`[AI:Brain] JSON Parse Failure`, {
                    taskType,
                    rawOutput: cleanResult.slice(0, 200) // Log snippet for debug
                })
                throw new Error('AI_OUTPUT_MALFORMED')
            }

        } catch (error: any) {
            const duration = Date.now() - startTime
            logger.error(`[AI:Brain] Operation Failed: ${taskType}`, {
                error: error.message,
                duration
            })
            // Propagate known errors (budget, timeout) directly
            throw error
        }
    }
}
