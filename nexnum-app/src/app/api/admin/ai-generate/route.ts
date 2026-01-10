
import { NextRequest, NextResponse } from 'next/server'
import { GeminiKeyPool } from '@/lib/gemini-pool'

// GeminiKeyPool handles all API key management and rotation
// See src/lib/gemini-pool.ts for configuration

const GEN_CONFIG = {
  temperature: 0.1, // Low temp for precise JSON
  topK: 40,
  topP: 0.8,
  maxOutputTokens: 8192,
}

type AnalysisReport = {
  missing: string[]
  detected: {
    name?: string
    baseUrl?: string
    authType?: string
    endpoints?: string[]
  }
  confidence: number
  providerType: 'json_api' | 'legacy_text' | 'hybrid'
}

// Documentation for Top-Level Provider Fields
const PROVIDER_CONTEXT_DOCS = `
### TOP-LEVEL PROVIDER CONFIGURATION FIELDS

**name** (string):
Provider display name. Use the official API/service name.
Example: "5sim", "SMS-Activate", "GrizzlySMS"

**apiBaseUrl** (string):
The root URL for all API requests. Endpoints will be appended to this.
NO trailing slash. Include version path if applicable.
Examples:
- "https://5sim.net/v1"
- "https://api.sms-activate.org/stubs/handler_api.php"
- "https://api.grizzlysms.com/stubs/handler_api.php"

**authType** ('query_param' | 'header' | 'bearer'):
How the API key is transmitted to the provider:
- "query_param": API key in URL query string (e.g., ?api_key=xxx)
- "header": API key in custom header (e.g., X-API-Key: xxx)
- "bearer": API key as Bearer token (e.g., Authorization: Bearer xxx)

**authQueryParam** (string, optional):
If authType is "query_param", specify the parameter name.
Common values: "api_key", "token", "key", "apiKey"

**authHeader** (string, optional):
If authType is "header", specify the header name.
Common values: "Authorization", "X-API-Key", "Api-Key"
`

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
      method: 'GET' | 'POST';
      path: string; // Path ONLY. Do NOT include "?". Use queryParams for that.
      
      // ENHANCED: queryParams now supports $variable syntax with fallbacks!
      // Variables are resolved from the params passed to the method call.
      // Syntax: "$varName" or "$varName|fallbackVar" 
      // Examples:
      //   "product": "$service"        - Takes value from 'service' param
      //   "product": "$product|service" - Tries 'product' first, then 'service'
      //   "country_id": "$country"      - Takes value from 'country' param
      // If variable not found, param is OMITTED (optional by default)
      queryParams?: Record<string, string>;
    }
  };

  // Map of Key -> MappingConfig (ENHANCED WITH NEW TYPES)
  mappings: {
    [key in 'getCountries' | 'getServices' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance' | 'getPrices']: {
      // ALL AVAILABLE RESPONSE TYPES:
      type: 
        | 'json_object'           // Single JSON object response
        | 'json_array'            // Array of objects
        | 'json_dictionary'       // Object with keys as IDs (recursive)
        | 'json_value'            // Single primitive value (number, string, boolean)
        | 'json_array_positional' // Array with position-based field mapping
        | 'json_keyed_value'      // Key=ID, Value=primitive or object
        | 'json_nested_array'     // 2D array (table-like data)
        | 'text_regex'            // Plain text parsed with regex
        | 'text_lines';           // Line-separated text
      
      rootPath?: string; // Optional JMESPath/DotPath for JSON
      regex?: string; // REQUIRED for text_regex. Use Named Capture Groups!
      
      // Standard field mappings (supports fallback chains: "cost|price|amount")
      fields: Record<string, string>;
      
      // NEW: For json_value - target field name for single value
      valueField?: string; // e.g., "balance" wraps value as { balance: 123.45 }
      
      // NEW: For json_array_positional - map array indices to field names
      positionFields?: Record<string, string>; // e.g., { "0": "id", "1": "phone", "2": "price" }
      
      // NEW: For json_keyed_value - dictionary key becomes this field
      keyField?: string; // e.g., "activationId"
      
      // NEW: For json_nested_array - first row contains headers
      headerRow?: boolean; // If true, first array element is field names
      
      // Multi-level extraction config (for nested structures)
      nestingLevels?: {
        extractOperators?: boolean;
        providersKey?: string;
      };
      
      // Field fallback chains (alternative to pipe syntax)
      fieldFallbacks?: {
        [targetField: string]: string[];
      };
    }
  };
}
\`\`\`
`

const SYSTEM_PROMPT_LEGACY = `You are a Legacy Systems Integration Expert specialized in Text/Regex APIs.
Your goal is to generate a **PRODUCTION-GRADE** configuration for the "DynamicProvider" engine using Regex.

${STRICT_OUTPUT_SCHEMA}

${PROVIDER_CONTEXT_DOCS}

### UNIVERSAL ARCHITECTURAL STANDARDS (LEGACY/TEXT)

1. **REGEX BEST PRACTICES**:
   - MUST use "text_regex" type.
   - Use Python/JS compatible Regex.
   - **ALWAYS** use Named Capture Groups for clarity: \`(?<id>\\d+)\`
   - Escape backslashes properly: \`\\d+\` becomes \`\\\\d+\` in JSON string.

2. **FALLBAK CHAINS (NEW)**:
   - You can now use pipe syntax even for Regex groups!
   - Example: \`"cost": "price|cost"\` -> Will look for group (?<price>...) first, then (?<cost>...).

3. **URL CONSTRUCTION**:
   - DO NOT put query parameters in "path". keys.
   - Use "queryParams" object for cleaner config.

### CONFIGURATION STRATEGIES

#### STRATEGY: MULTI-LINE TEXT RESPONSE
*Response:* \`ID:1234:ACCESS_NUMBER:9999\` (Pipe/Colon separated)
*Regex:* \`^ID:(?<id>\\\\d+):ACCESS_NUMBER:(?<phone>\\\\d+)$\`
\`\`\`json
{
  "type": "text_regex",
  "regex": "^ID:(?<id>\\\\d+):ACCESS_NUMBER:(?<phone>\\\\d+)$",
  "fields": {
    "id": "id",
    "phoneNumber": "phone",
    "activationId": "id"
  }
}
\`\`\`

### 🛑 CRITICAL FIELD RULES
- **cost**: "cost|price|balance"
- **count**: "count|qty|stock"
- **phoneNumber**: "phone|number"

GENERATE VALID JSON ONLY. NO MARKDOWN.
`

const SYSTEM_PROMPT_MODERN = `You are a Senior Data Engineer & API Architect.
Your goal is to generate a **PRODUCTION-GRADE**, **UNIVERSAL** configuration for the "DynamicProvider" engine.
The engine supports deeply nested, recursive extraction. **DO NOT** use fragile JSONPath hacks.

${STRICT_OUTPUT_SCHEMA}

${PROVIDER_CONTEXT_DOCS}

### UNIVERSAL ARCHITECTURAL STANDARDS (STRICT ENFORCEMENT)

1. **NO HACKY ROOT PATHS**:
   - ❌ BAD: "rootPath": "$.$country.$service" (This logic is BANNED).
   - ✅ GOOD: Use "json_dictionary" and let the engine recurse naturally.

2. **RECURSIVE DICTIONARY PATTERN**:
   - Unless the response is a flat list ([...]), ALWAYS use "type": "json_dictionary".
   - The engine automatically traverses down until it finds identifying fields (price/count).
   - DO NOT try to "flatten" the structure using complex paths. Preserving structure preserves context.

3. **CONTEXT IS KING**:
   - Use strict context accessors to map parent keys to fields:
   - \`$key\`: The immediate key (Operator ID / Provider ID).
   - \`$parentKey\`: The parent key (Service Code).
   - \`$grandParentKey\`: The grandparent key (Country Code).

### 🔧 SPECIAL ACCESSORS (FULL REFERENCE)

#### Array/Collection Accessors:
- \`$first\` / \`$last\` - First/last element
- \`$firstKey\` / \`$lastKey\` - First/last key of object
- \`$firstValue\` / \`$lastValue\` - First/last value of object
- \`$values\` / \`$keys\` - All values/keys as array
- \`$length\` / \`$count\` - Length of array/object
- \`$sum\` / \`$avg\` / \`$min\` / \`$max\` - Numeric operations
- \`$unique\` - Deduplicate array
- \`$flatten\` - Flatten nested arrays
- \`$reverse\` / \`$sort\` - Reorder array
- \`$slice:0:5\` - Get subset (first 5 items)
- \`$join:,\` - Join with separator

#### String Manipulation:
- \`$lowercase\` / \`$uppercase\` - Case conversion
- \`$trim\` - Remove whitespace
- \`$split:,\` - Split to array
- \`$replace:old:new\` - Replace substring
- \`$substring:0:5\` - Get substring
- \`$padStart:5:0\` / \`$padEnd:5:0\` - Pad string

#### Type Conversion:
- \`$number\` / \`$int\` / \`$float\` - To number
- \`$string\` / \`$str\` - To string
- \`$boolean\` / \`$bool\` - To boolean
- \`$json\` - Parse JSON string
- \`$stringify\` - Convert to JSON string

#### Conditional:
- \`$default:value\` - Default if null/undefined
- \`$ifEmpty:value\` - Default if empty string
- \`$exists\` - Returns true/false

#### Object:
- \`$entries\` - Get [key, value] pairs
- \`$pick:a,b,c\` - Keep only specified keys
- \`$omit:a,b,c\` - Exclude specified keys
- \`$type\` - Get JavaScript type ("string", "number", "array", etc.)

### 💎 PRO FEATURES (ADVANCED)

1. **CONDITIONAL FIELDS** (Dynamic Mapping)
   Map fields differently based on response type (e.g. success vs error).
   \`\`\`json
   "conditionalFields": {
     "error_code": { "status": "error", "message": "error_msg" },
     "balance": { "status": "success", "balance": "balance" }
   }
   \`\`\`

2. **TRANSFORMATIONS** (Value Modification)
   Modify values before saving. Use **{ value }** for template injection.
   \`\`\`json
   "transform": {
     "status": "uppercase",  // "ok" -> "OK"
     "price": "number",      // "12.50" -> 12.5
     "active": "boolean",     // 1 -> true
     "icon": "https://site.com/img/{value}.png" // Template Injection
   }
   \`\`\`

3. **SMART ACCESSORS**
   - \`$firstKey\`: Get the first key of an object.
   - \`$values\`: Get all values as list.

### 🔥 CONFIGURATION STRATEGIES (CHOOSE ONE)

#### STRATEGY A: THE "NUMERICAL NESTED" STRUCTURE (3-Level Deep)
*Structure:* \`Country -> Service -> Operator -> { price, count }\` (e.g., 5sim, SMSBower)
*Example Data:*
\`\`\`json
{
  "22": {
    "fb": {
      "2266": { "price": 0.07, "count": 1 }
    }
  }
}
\`\`\`
*Approach:* Recurse fully. Use Grandparent context. **DO NOT USE ROOTPATH**.
\`\`\`json
{
  "type": "json_dictionary",
  "nestingLevels": { "extractOperators": true },
  "fields": {
    "cost": "price|cost|rate",
    "count": "count|qty|stock",
    "operator": "$key",      // "2266" (Operator ID)
    "service": "$parentKey", // "fb" (Service Code)
    "country": "$grandParentKey" // "22" (Country Code)
  }
}
\`\`\`

#### STRATEGY B: THE "STANDARD" STRUCTURE (2-Level Deep)
*Structure:* \`Country -> Service -> { price, count }\` (e.g., GrizzlySMS, HeroSMS)
*Approach:* Recurse once. Use Parent context.
\`\`\`json
{
  "type": "json_dictionary",
  "fields": {
    "cost": "price|cost|rate",
    "count": "count|qty|stock",
    "service": "$key",       // The key is the service/product
    "country": "$parentKey"  // The key above is the country
  }
}
\`\`\`

#### STRATEGY C: THE "PROVIDERS OBJECT" STRUCTURE
*Structure:* \`Service -> { price, providers: { "11": { ... } } }\`
*Approach:* Target the specific "providers" key.
\`\`\`json
{
  "type": "json_dictionary",
  "nestingLevels": { "providersKey": "providers" },
  "fields": {
    "cost": "price[0]|price|cost",
    "count": "count|qty|stock",
    "operator": "provider_id|$key",
    "service": "$parentKey"
  }
}
\`\`\`

#### STRATEGY D: THE "FLAT LIST" STRUCTURE (Direct Array)
*Structure:* \`[ { country: "us", service: "wa", price: 1.0 }, ... ]\`
*Approach:* Use json_array with rootPath if needed.
\`\`\`json
{
  "type": "json_array",
  "rootPath": "data.items", // Optional, only if wrapped
  "fields": {
    "cost": "price",
    "count": "count",
    "service": "service_code",
    "country": "country_id"
  }
}
\`\`\`

#### STRATEGY E: SINGLE VALUE RESPONSE (json_value)
*Response:* \`123.45\` or \`{"balance": 123.45}\`
*Use Case:* Balance checks, simple status responses
\`\`\`json
{
  "type": "json_value",
  "valueField": "balance"
}
\`\`\`
*Result:* \`{ balance: 123.45 }\`

#### STRATEGY F: POSITIONAL ARRAY (json_array_positional)
*Response:* \`["12345", "+15551234", "0.50"]\` or \`[["id1", "phone1"], ["id2", "phone2"]]\`
*Use Case:* Compact responses where fields are indexed by position
\`\`\`json
{
  "type": "json_array_positional",
  "positionFields": {
    "0": "activationId",
    "1": "phoneNumber",
    "2": "price"
  }
}
\`\`\`
*Result:* \`{ activationId: "12345", phoneNumber: "+15551234", price: "0.50" }\`

#### STRATEGY G: KEY-VALUE DICTIONARY (json_keyed_value)
*Response:* \`{ "12345": "pending", "12346": "received" }\`
*Use Case:* Batch status lookups where key is the ID
\`\`\`json
{
  "type": "json_keyed_value",
  "keyField": "activationId",
  "valueField": "status"
}
\`\`\`
*Result:* \`[{ activationId: "12345", status: "pending" }, { activationId: "12346", status: "received" }]\`

#### STRATEGY H: TABLE DATA (json_nested_array)
*Response:* \`[["id","phone","price"], ["123","+1555","0.5"], ["456","+1666","0.7"]]\`
*Use Case:* CSV-like or spreadsheet data with headers
\`\`\`json
{
  "type": "json_nested_array",
  "headerRow": true
}
\`\`\`
*Result:* \`[{ id: "123", phone: "+1555", price: "0.5" }, { id: "456", phone: "+1666", price: "0.7" }]\`

### 🛑 CRITICAL FIELD RULES
- **cost**: MUST use fallback chain: "cost|price|amount|rate|value".
- **count**: MUST use fallback chain: "count|qty|stock|available|physicalCount".
- **operator**: If nested, usually "$key" or field "provider_id".
- **service**: If nested, usually "$parentKey" or "$key".
- **country**: If nested, usually "$grandParentKey" or "$parentKey" or request param "@country".
- **icon**: "icon|iconUrl|img". Use transform if URL needs to be constructed from ID.

### 🔎 ENDPOINT INTELLIGENCE
- If endpoints require **parameters**, use the new **$variable** syntax in **queryParams**.
- **"product": "$service"** (Maps 'service' input to 'product' param)
- **"country": "$country|country_id"** (Maps 'country' or 'country_id')

GENERATE ROBUST, FUTURE-PROOF JSON ONLY. NO MARKDOWN.
`

const SYSTEM_PROMPT_ANALYZE = `You are an Elite API Auditor. Scan the documentation and generate a precise JSON forensic report.

### DETECTION LOGIC
1. **JSON API**: 
   - Responses are clearly JSON objects ({...}) or arrays ([...]).
   - Content-Type mentioned as application/json.
2. **LEGACY TEXT**: 
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
  "missing": ["getCountries"], // Critical missing endpoints
  "detected": {
    "name": "Service Name",
    "baseUrl": "https://api.example.com/stubs/handler_api.php", 
    "authType": "query_param", // or header/bearer
    "authQueryParam": "api_key",
    "endpoints": ["getNumber", "getStatus", "getPrices"]
  },
  "providerType": "json_api", // or legacy_text
  "confidence": 0.95
}
`

import type { TaskType } from '@/lib/gemini-pool'

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  options: { isJson?: boolean; taskType?: TaskType } = {}
) {
  const { isJson = true, taskType } = options
  return GeminiKeyPool.call(systemPrompt, userPrompt, { isJson, taskType })
}

async function handleAnalysis(prompt: string) {
  try {
    // Analysis uses HIGH tier (Gemini 2.5 Pro)
    const text = await callGemini(
      SYSTEM_PROMPT_ANALYZE,
      "DOCUMENTATION:\n" + prompt,
      { isJson: true, taskType: 'analyze' }
    )
    return JSON.parse(text) as AnalysisReport
  } catch (e) {
    console.error("Analysis failed:", e)
    throw e
  }
}

export async function POST(req: NextRequest) {
  // Import at top won't work at runtime, so dynamic import
  const { requireAdmin } = await import('@/lib/requireAdmin')
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { prompt, step, mode, supplements, providerType } = body

    if (!process.env.GEMINI_API_KEYS && !process.env.GEMINI_API_KEY) {
      // Mock Fallback for checking logic without API
      await new Promise(r => setTimeout(r, 1500))
      if (mode === 'analyze') {
        // Simple heuristic for mock: check for "json" string
        const isJson = prompt.toLowerCase().includes('json')
        return NextResponse.json({
          result: {
            missing: [],
            detected: { name: "Mock Provider" },
            confidence: 0.9,
            providerType: isJson ? 'json_api' : 'legacy_text'
          },
          mock: true
        })
      }
      return NextResponse.json({
        result: { mock: "config" },
        mock: true
      })
    }

    if (mode === 'analyze') {
      const report = await handleAnalysis(prompt)
      return NextResponse.json({ result: report })
    }

    // GENERATE MODE
    let systemPrompt = body.systemPromptOverride || SYSTEM_PROMPT_MODERN // Default or Override
    if (!body.systemPromptOverride && providerType === 'legacy_text') systemPrompt = SYSTEM_PROMPT_LEGACY

    // Inject supplements if any
    let finalPrompt = prompt
    if (supplements && Object.keys(supplements).length > 0) {
      finalPrompt += "\n\n### USER SUPPLEMENTS (MISSING DATA PROVIDED):\n" + JSON.stringify(supplements, null, 2)
    }

    const taskPrompt = "### TASK: " + (step === 'full' ? 'Generate Full Configuration' : `Step ${step}`) + "\n### INPUT DOCUMENTATION:\n" + finalPrompt

    const responseText = await callGemini(systemPrompt, taskPrompt, { isJson: true, taskType: 'generate_config' })

    let jsonResult
    try {
      jsonResult = JSON.parse(responseText)
    } catch {
      jsonResult = { error: "Failed to parse JSON", raw: responseText }
    }

    return NextResponse.json({ result: jsonResult })

  } catch (error) {
    console.error("Gemini API error:", error)
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}

