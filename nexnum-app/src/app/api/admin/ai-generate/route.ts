
import { NextRequest, NextResponse } from 'next/server'

// Using Google Gemini API (free tier)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

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
    [key in 'getCountries' | 'getServices' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance']: {
      method: 'GET' | 'POST';
      path: string; // Path ONLY. Do NOT include "?". Use queryParams for that.
      queryParams?: Record<string, string>;
    }
  };

  // Map of Key -> MappingConfig
  mappings: {
    [key in 'getCountries' | 'getServices' | 'getNumber' | 'getStatus' | 'cancelNumber' | 'getBalance']: {
      type: 'json_object' | 'json_array' | 'json_dictionary' | 'text_regex' | 'text_lines';
      rootPath?: string; // Optional JMESPath/DotPath for JSON
      regex?: string; // REQUIRED for text_regex. Use Named Capture Groups!
      fields: Record<string, string>; // Map internal field to extraction path/group
    }
  };
}
\`\`\`
`

const SYSTEM_PROMPT_LEGACY = `You are a Legacy Systems Integration Expert specialized in SMS/OTP APIs.
Your job is to generate a configuration for the "DynamicProvider" engine.

${STRICT_OUTPUT_SCHEMA}

### ARCHITECTURAL CONSTRAINTS (LEGACY/TEXT)
1. **Parser Type**: MUST use "text_regex".
2. **Regex Patterns**: use Python/JS compatible Regex with NAMED CAPTURE GROUPS only.
   - Pattern: ^ACCESS_NUMBER:(?<id>\\d+):(?<phone>\\d+)$
   - Fields: { "id": "id", "phone": "phone" }
   - ESCAPE BACKSLASHES: "\\d+" not "\d+".
3. **Structure**: 
   - 'endpoints' is a DICTIONARY (Key-Value), NOT an Array.
   - 'mappings' is a DICTIONARY (Key-Value), separate from endpoints.
4. **Auth**: Typically 'query_param' with 'api_key'.
5. **URL Construction**:
   - DO NOT put query parameters (starting with ?) in "path".
   - USE "queryParams" for ALL query parameters.
   - Example: path: "", queryParams: { "action": "getBalance" }
`

const SYSTEM_PROMPT_MODERN = `You are a Modern API Architect specialized in JSON APIs.
Your job is to generate a configuration for the "DynamicProvider" engine.

${STRICT_OUTPUT_SCHEMA}

### ARCHITECTURAL CONSTRAINTS (MODERN/JSON)
1. **Parser Type**: Use "json_dictionary", "json_array", or "json_object".
2. **Extraction**: Use Dot Notation (e.g. "data.balance").
3. **Structure**: 
   - 'endpoints' is a DICTIONARY (Key-Value), NOT an Array.
   - 'mappings' is a DICTIONARY (Key-Value), separate from endpoints.
`

const SYSTEM_PROMPT_ANALYZE = `You are an API Auditor.Scan the documentation and return a JSON object report.

DETECT THE ARCHITECTURE TYPE:
- 'json_api': Responses are JSON objects / arrays.Content - Type: application / json.
- 'legacy_text': Responses are plain text, often pipe - separated or colon - separated(e.g., access_number: 123).Content - Type: text / plain.
- 'hybrid': Mix of both.

MANDATORY CHECKS:
1. ** Identity **: Name, Base URL ?
    2. ** Auth **: Method found ? (Query param, Header, Bearer)
3. ** Endpoints **: Are these 6 present ?
    - getBalance
    - getCountries
    - getServices
    - getNumber(Order)
    - getStatus(Check activation)
    - cancelNumber(Set status 8 / cancel)

Return JSON:
{
    "missing": ["getCountries", "auth"], // List missing keys
        "detected": {
        "name": "SMS Act",
            "baseUrl": "...",
                "authType": "api_key",
                    "endpoints": ["getNumber", "getStatus"]
    },
    "providerType": "json_api" | "legacy_text",
        "confidence": 0.0 to 1.0
} `

async function callGemini(systemPrompt: string, userPrompt: string, isJson: boolean = true) {
    if (!GEMINI_API_KEY) throw new Error("API Key missing")

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
            ],
            generationConfig: {
                ...GEN_CONFIG,
                responseMimeType: isJson ? "application/json" : "text/plain"
            }
        })
    })

    if (!response.ok) {
        throw new Error(await response.text())
    }

    const data = await response.json()
    return data.candidates[0].content.parts[0].text
}

async function handleAnalysis(prompt: string) {
    try {
        const text = await callGemini(SYSTEM_PROMPT_ANALYZE, "DOCUMENTATION:\n" + prompt, true)
        return JSON.parse(text) as AnalysisReport
    } catch (e) {
        console.error("Analysis failed:", e)
        throw e
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { prompt, step, mode, supplements, providerType } = body

        if (!process.env.GEMINI_API_KEY) {
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
        let systemPrompt = SYSTEM_PROMPT_MODERN // Default
        if (providerType === 'legacy_text') systemPrompt = SYSTEM_PROMPT_LEGACY

        // Inject supplements if any
        let finalPrompt = prompt
        if (supplements && Object.keys(supplements).length > 0) {
            finalPrompt += "\n\n### USER SUPPLEMENTS (MISSING DATA PROVIDED):\n" + JSON.stringify(supplements, null, 2)
        }

        const taskPrompt = "### TASK: " + (step === 'full' ? 'Generate Full Configuration' : `Step ${step}`) + "\n### INPUT DOCUMENTATION:\n" + finalPrompt

        const responseText = await callGemini(systemPrompt, taskPrompt, true)

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

