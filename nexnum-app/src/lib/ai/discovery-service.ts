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

// --- HIGH FIDELITY PROMPT FRAGMENTS ---

const PROVIDER_CONTEXT_DOCS = `
### TOP-LEVEL PROVIDER CONFIGURATION FIELDS

**name** (string): Provider display name.
**apiBaseUrl** (string): The root URL for all API requests. NO trailing slash.
**authType** ('query_param' | 'header' | 'bearer'): Transmission method for API key.
**authQueryParam** (string, optional): Parameter name for query_param auth.
**authHeader** (string, optional): Header name for header auth.
`

const STRICT_OUTPUT_SCHEMA = `
### STRICT OUTPUT JSON SCHEMA
You MUST generate a JSON object matching this TypeScript interface exactly. DO NOT use arrays for endpoints or mappings.

\`\`\`typescript
interface ProviderConfig {
  name: string;
  apiBaseUrl: string;
  authType: 'query_param' | 'header' | 'bearer' | 'none';
  authQueryParam?: string;
  authHeader?: string;
  
  endpoints: {
    [key in 'getCountriesList' | 'getServicesList' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance' | 'getPrices']: {
        method: 'GET' | 'POST';
        path: string;
        queryParams?: Record<string, string>;
        headers?: Record<string, string>;
    };
  };

  mappings: {
    [key in 'getCountriesList' | 'getServicesList' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance' | 'getPrices']: any;
  };
}
\`\`\`
`

const SPECIAL_ACCESSORS_REF = `
### 🔧 SPECIAL ACCESSORS (FULL REFERENCE v2.0)

#### Context Hierarchy (Multi-Level Navigation):
| Accessor | Returns | Use Case |
|:---|:---|:---|
| \`$key\` | Current dictionary key | Service/Operator code |
| \`$parentKey\` | Parent level key | Country when at service level |
| \`$grandParentKey\` | Grandparent key | Root at 2 levels up |
| \`$greatGrandParentKey\` | Great-grandparent key | For 4-level nesting |
| \`$rootKey\` | First-level key | Always country in pricing |
| \`$value\` | Current object value | The leaf data |
| \`$parentValue\` | Parent object value | Parent container |
| \`$index\` | Array element position | 0, 1, 2... |
| \`$operatorKey\` | Operator/Provider ID | Provider key in nested |

#### Depth & Path (For Multi-Level Structures):
| Accessor | Returns | Output Field? |
|:---|:---|:---|
| \`$atDepth:N\` | Key at specific depth level | ✅ Yes - USE THIS |
| \`$depth\` | Current nesting level | ❌ Debug only |
| \`$isLeaf\` | Boolean - no children | ❌ Debug only |
| \`$path\` | Full dot-path from root | ❌ Debug only |
| \`$ancestors\` | Array of parent keys | ❌ Debug only |

**CRITICAL**: For 3+ level nesting, prefer \`$atDepth:N\` over hierarchy accessors:
\`\`\`json
"fields": {
  "country": "$atDepth:0",
  "service": "$atDepth:1",
  "operator": "$atDepth:2|'any'",
  "cost": "price",
  "count": "count"
}
\`\`\`

#### Array Operations:
- \`$first\` / \`$last\` - First/last element
- \`$values\` / \`$keys\` - All values/keys as array
- \`$length\` / \`$count\` - Length of array/object
- \`$sum\` / \`$avg\` / \`$min\` / \`$max\` - Numeric aggregations
- \`$unique\` / \`$flatten\` / \`$reverse\` / \`$sort\` - Array transforms
- \`$slice:0:5\` - Array slice

#### String Operations:
- \`$lowercase\` / \`$uppercase\` / \`$trim\`
- \`$split:,\` / \`$join:,\` / \`$replace:old:new\`
- \`$substring:0:5\` / \`$padStart:5:0\` / \`$padEnd:5:0\`

#### Type Conversion:
- \`$number\` / \`$int\` / \`$float\` / \`$string\` / \`$boolean\`
- \`$json\` (parse string to object) / \`$stringify\` (object to string)

#### Conditionals & Defaults:
- \`$default:value\` - Default if null/undefined
- \`$ifEmpty:value\` - Default if empty string
- \`$exists\` - Boolean existence check

#### Metadata:
- \`$firstKey\` / \`$firstValue\` - First key/value in object
`

const CONFIGURATION_STRATEGIES = `
### 🔑 MAPPING TYPES (8 Total)

| Type | Use Case | Raw Response Example |
|:---|:---|:---|
| \`json_array\` | List of objects | \`[{"id": 1}, {"id": 2}]\` |
| \`json_object\` | Single object result | \`{"balance": 100.50}\` |
| \`json_dictionary\` | Key-value nested | \`{"us": {...}, "uk": {...}}\` |
| \`json_value\` | Single primitive | \`100.50\` |
| \`json_array_positional\` | Ordered tuple | \`["123", "+1555", "0.50"]\` |
| \`json_keyed_value\` | ID to value map | \`{"123": "pending"}\` |
| \`json_nested_array\` | 2D table | \`[["id","phone"],["1","+1"]]\` |
| \`text_regex\` | Plain text | \`ACCESS_OK:123456\` |

### 🔑 CONFIGURATION STRATEGIES (ARCHITECTURAL REFERENCE)

#### STRATEGY A: NUMERICAL NESTED (3-Level) - Use \`$atDepth:N\`
*Structure:* \`Country -> Service -> Operator -> { price, count }\`
*Approach:* Use "json_dictionary" with depth accessors
*Mapping:*
\`\`\`json
{
  "type": "json_dictionary",
  "fields": {
    "country": "$atDepth:0",
    "service": "$atDepth:1",
    "operator": "$atDepth:2|'any'",
    "cost": "price",
    "count": "count"
  },
  "transform": { "cost": "number", "count": "number" }
}
\`\`\`

#### STRATEGY B: STANDARD NESTED (2-Level)
*Structure:* \`Country -> Service -> { price, count }\`
*Mapping:*
\`\`\`json
{
  "type": "json_dictionary",
  "fields": {
    "country": "$parentKey",
    "service": "$key",
    "cost": "price|cost|amount"
  }
}
\`\`\`

#### STRATEGY C: FLAT ARRAY
*Structure:* \`[ { country: "us", service: "wa", price: 1.0 }, ... ]\`
*Mapping:*
\`\`\`json
{
  "type": "json_array",
  "rootPath": "data.items",
  "fields": { "code": "id", "name": "title" }
}
\`\`\`

#### STRATEGY D: TEXT REGEX
*Structure:* \`ACCESS_NUMBER:123456:+15551234567\`
*Mapping:*
\`\`\`json
{
  "type": "text_regex",
  "regex": "ACCESS_NUMBER:(\\\\d+):(\\\\+?\\\\d+)",
  "fields": { "id": "1", "phone": "2" }
}
\`\`\`

#### STRATEGY E: DICTIONARY WITH OPERATOR EXTRACTION
*Structure:* \`{ "whatsapp": { "providers": { "11": {...} } } }\`
*Mapping:*
\`\`\`json
{
  "type": "json_dictionary",
  "nestingLevels": {
    "extractOperators": true,
    "providersKey": "providers",
    "requiredField": "provider_id"
  },
  "fields": {
    "service": "$key",
    "operator": "$operatorKey",
    "cost": "price"
  }
}
\`\`\`

### 🎯 UNIVERSAL OUTPUT FIELDS (Canonical Names)

| Endpoint | Required Fields |
|:---|:---|
| \`getCountriesList\` | \`code\`, \`name\` |
| \`getServicesList\` | \`code\`, \`name\` |
| \`getPrices\` | \`cost\`, \`count\`, \`country\`, \`service\`, \`operator\` |
| \`getNumber\` | \`id\`, \`phone\`, \`price\` |
| \`getStatus\` | \`status\`, \`code\`, \`fullSms\` |
| \`getBalance\` | \`balance\` |

### ⚡ BEST PRACTICES

1. **ALWAYS use fallback chains**: \`"cost": "price|cost|amount|rate"\`
2. **ALWAYS apply transforms** for numeric fields: \`"transform": { "cost": "number" }\`
3. **Use \`$default\`** for optional fields: \`"operator": "operator.$default:'any'"\`
4. **Use \`$atDepth:N\`** for multi-level structures (NOT nestingLevels)
5. **Configure statusMapping** for all status endpoints
`

// --- FULL MASTER PROMPTS ---

const SYSTEM_PROMPT_ANALYZE = `You are an Elite API Auditor. Scan the documentation and generate a precise JSON forensic report.

${PROVIDER_CONTEXT_DOCS}

### DETECTION LOGIC
1. **JSON API**: Responses are objects/arrays. Content-Type: application/json.
2. **TEXT/REGEX**: Responses are pipe/colon separated or plain text.

### INSPECTION POINTS
1. Identity & Base URL (Use the names defined in Provider Context).
2. Authentication details (Header names, Query params).
3. Availability of standard SMS endpoints.

### OUTPUT FORMAT
return { "missing": ["getBalance", "getStatus"], "detected": { "name": "", "baseUrl": "", "authType": "", "endpoints": [] }, "providerType": "json_api", "confidence": 0.95 }
`

const SYSTEM_PROMPT_MODERN = `You are a Senior Data Engineer & API Master Architect.
Your goal is to generate a PRO-GRADE, UNIVERSAL configuration for the NexNum "DynamicProvider" engine.

${STRICT_OUTPUT_SCHEMA}
${PROVIDER_CONTEXT_DOCS}
${SPECIAL_ACCESSORS_REF}
${CONFIGURATION_STRATEGIES}

### UNIVERSAL STANDARDS
1. **NO FRAGILE JSONPATH**: Use "json_dictionary" for recursive extraction. BANNED: "$.root".
2. **CONTEXT ACCESS**: Prefer $key, $parentKey, $grandParentKey over hardcoded paths.
3. **FALLBACKS**: Use pipe syntax ("cost": "price|amount") for resilience.
4. **PARAM SYNTAX**: In queryParams, use "$service" or "$country" for dynamic values.

GENERATE ROBUST JSON ONLY. NO MARKDOWN.
`

const SYSTEM_PROMPT_TEXT_REGEX = `You are a Systems Integration Expert specialized in Text/Regex APIs.

${STRICT_OUTPUT_SCHEMA}
${PROVIDER_CONTEXT_DOCS}

### REGEX STANDARDS
1. **NAMED CAPTURE GROUPS**: MUST use (?<name>regex) for all extracted fields.
2. **JSON ESCAPING**: Backslashes MUST be double-escaped (e.g., \\d becomes \\\\d).
3. **TYPE**: MUST use "text_regex" as the mapping type.
4. **FALLBACKS**: Pipe syntax works for named groups: "cost": "price|rate".

GENERATE VALID JSON ONLY.
`

const PERSONA_MAP: Record<string | number, string> = {
    2: "Elite API Architect focusing on Provider Identity (Name, Slug, Base URL).",
    3: "Elite Security Consultant focusing on Authentication Protocols.",
    5: "Principal Integration Engineer focusing on Endpoint & Response Mapping Architecture.",
    'full': "Lead Master Architect for NexNum, generating a complete, production-ready configuration bundle."
}

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
        supplements?: any,
        step?: string | number
    }): Promise<any> {
        const systemPromptBase = params.providerType === 'text_regex'
            ? SYSTEM_PROMPT_TEXT_REGEX
            : SYSTEM_PROMPT_MODERN

        const personaDescription = PERSONA_MAP[params.step || 'full'] || PERSONA_MAP['full']
        const systemPrompt = `PERSONA: ${personaDescription}\n\n${systemPromptBase}`

        let userPrompt = `### INPUT DOCUMENTATION:\n${params.docPrompt}`
        if (params.supplements) {
            userPrompt += `\n\n### USER SUPPLEMENTS (MISSING DATA PROVIDED):\n${JSON.stringify(params.supplements, null, 2)}`
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
        ${SPECIAL_ACCESSORS_REF}
        ${CONFIGURATION_STRATEGIES}
        - type: "json_object" | "json_array" | "json_dictionary" | "json_value" | "json_array_positional"
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

            const result = await GeminiKeyPool.call(systemPrompt, userPrompt, {
                taskType,
                tier: taskType === 'analyze' ? 'high' : 'medium',
                isJson: true
            })

            const duration = Date.now() - startTime
            const cleanResult = result.replace(/```json|```/g, '').trim()

            try {
                const parsed = JSON.parse(cleanResult)
                logger.info(`[AI:Brain] Operation Success: ${taskType}`, { duration })
                return parsed
            } catch (jsonError) {
                logger.error(`[AI:Brain] JSON Parse Failure`, {
                    taskType,
                    rawOutput: cleanResult.slice(0, 200)
                })
                throw new Error('AI_OUTPUT_MALFORMED')
            }

        } catch (error: any) {
            const duration = Date.now() - startTime
            logger.error(`[AI:Brain] Operation Failed: ${taskType}`, {
                error: error.message,
                duration
            })
            throw error
        }
    }
}
