
import { SmsProvider, Country, Service, NumberResult, StatusResult, NumberStatus } from './sms-providers/types'
import { WebhookPayload, WebhookVerificationResult } from './sms/types'
import { WebhookVerifier } from './webhooks/verify'
import { Provider } from '@prisma/client'
import { prisma } from './db'

declare var process: any;
declare var require: any;

type EndpointConfig = {
    method: string
    path: string
    queryParams?: Record<string, string>
    headers?: Record<string, string>
}

type MappingConfig = {
    type: 'json_object' | 'json_array' | 'json_dictionary' | 'text_regex' | 'text_lines'
    rootPath?: string

    // Field mappings: now supports fallback chains
    // Example: { "cost": "cost|price|amount" } - tries each path in order
    fields: Record<string, string>

    // Advanced extraction options
    regex?: string // For text_regex type
    separator?: string // For text_lines type
    transform?: Record<string, string> // Field transformations

    // NEW: Multi-level extraction config
    nestingLevels?: {
        /** How deep to traverse (1 = country>service, 2 = country>service>operator) */
        depth?: number
        /** Extract operators from nested structures */
        extractOperators?: boolean
        /** Special key to extract nested providers (e.g., "providers") */
        providersKey?: string
        /** NEW: Helper to enforce field presence (e.g., "provider_id") */
        requiredField?: string
    }

    // NEW: Field fallback chains (alternative to pipe syntax in fields)
    fieldFallbacks?: {
        [targetField: string]: string[] // Try each path in order
    }

    // NEW: Conditional extraction based on structure detection
    conditionalFields?: {
        /** If this path exists in the data, use these field mappings */
        [conditionPath: string]: Record<string, string>
    }
}

export class ProviderApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public statusText: string,
        public url: string,
        public responseBody: string,
        public requestHeaders: any
    ) {
        super(message)
        this.name = 'ProviderApiError'
    }
}

export class DynamicProvider implements SmsProvider {
    name: string
    public config: Provider
    private lastRequestTime: number = 0

    // Store last raw response for debugging in test console
    public lastRawResponse: any = null

    public lastRequestTrace: {
        method: string
        url: string
        headers: Record<string, string>
        responseStatus: number
        responseBody: any
        requestTime?: number
    } | null = null

    constructor(config: Provider) {
        this.config = config
        this.name = config.name
    }

    private async request(endpointKey: string, params: Record<string, any> = {}): Promise<any> {
        const endpoints = this.config.endpoints as Record<string, EndpointConfig>
        const epConfig = endpoints[endpointKey]

        if (!epConfig) {
            throw new Error(`Endpoint ${endpointKey} not configured for provider ${this.name}`)
        }

        // 1. Construct URL
        let url = ''
        if (epConfig.path && (epConfig.path.startsWith('http://') || epConfig.path.startsWith('https://'))) {
            url = epConfig.path
        } else {
            const baseUrl = (this.config.apiBaseUrl || '').replace(/\/$/, '')
            const path = (epConfig.path || '')
            url = baseUrl + (path.startsWith('/') || path.startsWith('?') || !path ? path : '/' + path)
        }

        // Replace path params including authKey
        const allParams = { ...params, authKey: this.config.authKey || '' }
        for (const [key, value] of Object.entries(allParams)) {
            if (url.includes(`{${key}}`)) {
                url = url.replace(new RegExp(`{${key}}`, 'g'), String(value))
            }
        }

        const urlObj = new URL(url)

        // 2. Add Auth & Query Params - ENHANCED VARIABLE RESOLUTION
        const resolvedQueryParams: Record<string, string> = {}
        const handledParamKeys = new Set<string>()

        // Step 2a: Resolve configured queryParams with $variable syntax
        if (epConfig.queryParams) {
            for (const [paramName, varTemplate] of Object.entries(epConfig.queryParams)) {
                if (typeof varTemplate !== 'string') continue

                if (varTemplate.startsWith('$')) {
                    // Variable placeholder: $varName or $varName|fallback
                    const varParts = varTemplate.substring(1).split('|').map(s => s.trim())
                    let resolvedValue: string | undefined

                    for (const varName of varParts) {
                        // Check direct match in params
                        if (params[varName] !== undefined) {
                            resolvedValue = String(params[varName])
                            handledParamKeys.add(varName)
                            break
                        }
                    }

                    // Only add if resolved (optional params stay omitted)
                    if (resolvedValue !== undefined) {
                        resolvedQueryParams[paramName] = resolvedValue
                    }
                } else {
                    // Static value
                    resolvedQueryParams[paramName] = varTemplate
                }
            }
        }

        // Step 2b: Add Auth Query Param if configured
        if (this.config.authType === 'query_param' && this.config.authQueryParam && this.config.authKey) {
            resolvedQueryParams[this.config.authQueryParam] = this.config.authKey
        }

        // Step 2c: Add remaining unhandled params (for GET requests without explicit config)
        if (epConfig.method === 'GET') {
            for (const [key, value] of Object.entries(params)) {
                // Skip if already used in path substitution
                if (epConfig.path?.includes(`{${key}}`)) continue
                // Skip if already handled by a configured variable
                if (handledParamKeys.has(key)) continue
                // Skip if this param name is already set (prevents duplicates)
                if (resolvedQueryParams[key] !== undefined) continue

                resolvedQueryParams[key] = String(value)
            }
        }

        // Step 2d: Apply resolved params to URL
        for (const [key, value] of Object.entries(resolvedQueryParams)) {
            urlObj.searchParams.set(key, value)
        }

        // 3. Headers (Enhanced Browser Emulation)
        const headers: Record<string, string> = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Referer': urlObj.origin,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...epConfig.headers
        }

        if (this.config.authType === 'bearer' && this.config.authKey) {
            headers['Authorization'] = `Bearer ${this.config.authKey}`
        } else if (this.config.authType === 'header' && this.config.authHeader && this.config.authKey) {
            headers[this.config.authHeader] = this.config.authKey
        }

        // 4. Rate Limiting Enforcer (Reservation Token Bucket)
        // Ensure strictly NO requests are sent faster than rateLimitDelay
        // "nextSlot" logic handles concurrency by pushing the marker forward for each request
        const rateLimitDelay = (this.config as any).rateLimitDelay || 1000 // Default to 1000ms

        const now = Date.now()
        // Calculate when this request is allowed to fire
        const targetTime = Math.max(now, this.lastRequestTime + rateLimitDelay)

        // Reserve this slot immediately so next request sees it
        this.lastRequestTime = targetTime

        const waitTime = targetTime - now
        if (waitTime > 0) {
            // console.log(`[DynamicProvider:${this.name}] Rate limiting: waiting ${waitTime}ms`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
        }

        const maskedHeaders = { ...headers }
        if (maskedHeaders['Authorization']) maskedHeaders['Authorization'] = maskedHeaders['Authorization'].substring(0, 15) + '...'
        if (maskedHeaders['base64_api_key']) maskedHeaders['base64_api_key'] = '...'

        console.log(`[DynamicProvider:${this.name}] ${epConfig.method} ${urlObj.toString()}`)
        console.log(`[DynamicProvider:${this.name}] Headers:`, JSON.stringify(maskedHeaders))

        const startTime = Date.now()
        let responseData: any = null
        let responseStatus = 0

        try {
            // Increase timeout to 30s
            // implementing retry logic for robust sync
            const MAX_RETRIES = 3
            let response: Response | undefined

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    response = await fetch(urlObj.toString(), {
                        method: epConfig.method,
                        headers,
                        signal: AbortSignal.timeout(30000)
                    });

                    // Handle 429 explicitly inside loop
                    if (response.status === 429) {
                        if (attempt === MAX_RETRIES) break // Let it fail below

                        // Check Retry-After header
                        const retryAfter = response.headers.get('Retry-After')
                        let delay = 1000 * Math.pow(2, attempt) // Exponential: 2s, 4s, 8s (attempt 1 is 2^1=2s? No, default was linear. Let's do 2s, 4s, 8s)

                        // If Retry-After is present (seconds), use it
                        if (retryAfter) {
                            const seconds = parseInt(retryAfter, 10)
                            if (!isNaN(seconds)) delay = (seconds + 1) * 1000 // Add 1s buffer
                        }

                        console.warn(`[DynamicProvider:${this.name}] Rate limited (429). Retrying in ${delay}ms...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue
                    }

                    // Treat 5xx server errors as retriable too? Maybe safely.
                    if (response.status >= 500 && attempt < MAX_RETRIES) {
                        const delay = 1000 * attempt
                        console.warn(`[DynamicProvider:${this.name}] Server error ${response.status}. Retrying in ${delay}ms...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue
                    }

                    break; // Success or non-retriable status, exit loop
                } catch (err: any) {
                    const isLastAttempt = attempt === MAX_RETRIES
                    const isNetworkError = err.name === 'TypeError' || err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT'

                    if (isNetworkError && !isLastAttempt) {
                        const delay = 1000 * attempt // Linear backoff: 1s, 2s, 3s
                        console.warn(`[DynamicProvider:${this.name}] Request failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${delay}ms...`)
                        await new Promise(resolve => setTimeout(resolve, delay))
                        continue
                    }

                    // If we're here, we either ran out of retries or it's a non-retriable error
                    throw err
                }
            }

            if (!response) {
                // Should logically be unreachable if we throw on error, but for type safety:
                throw new Error('Request failed after retries')
            }

            responseStatus = response.status;

            if (!response.ok) {
                const text = await response.text()
                responseData = text

                // Save trace before throwing
                this.lastRequestTrace = {
                    method: epConfig.method,
                    url: urlObj.toString(),
                    headers: maskedHeaders,
                    responseStatus,
                    responseBody: text,
                    requestTime: Date.now() - startTime
                }

                throw new ProviderApiError(
                    `API Request Failed (${response.status} ${response.statusText})`,
                    response.status,
                    response.statusText,
                    urlObj.toString(),
                    text,
                    maskedHeaders
                )
            }

            // Detect response type
            const contentType = response.headers.get('content-type')
            let result: { type: 'json' | 'text', data: any }

            if (contentType && contentType.includes('application/json')) {
                const json = await response.json()
                responseData = json
                result = { type: 'json', data: json }
            } else {
                // Fallback: Try to parse text as JSON
                const text = await response.text()
                responseData = text
                try {
                    const json = JSON.parse(text)
                    if (typeof json === 'object') {
                        responseData = json
                        result = { type: 'json', data: json }
                    } else {
                        result = { type: 'text', data: text }
                    }
                } catch (e) {
                    // Not JSON, keep as text
                    result = { type: 'text', data: text }
                }
            }

            // Save trace
            this.lastRequestTrace = {
                method: epConfig.method,
                url: urlObj.toString(),
                headers: maskedHeaders,
                responseStatus,
                responseBody: responseData,
                requestTime: Date.now() - startTime
            }

            // Save raw response for test console debugging
            this.lastRawResponse = responseData

            return result

        } catch (error: any) {
            console.error(`[DynamicProvider:${this.name}] Request failed:`, error)

            // If we haven't saved trace yet (e.g. network error)
            if (!this.lastRequestTrace) {
                this.lastRequestTrace = {
                    method: epConfig.method,
                    url: urlObj.toString(),
                    headers: maskedHeaders,
                    responseStatus: 0,
                    responseBody: error.message,
                    requestTime: Date.now() - startTime
                }
            }
            throw error
        }
    }

    // Helper to extract flattened values using wildcards "data.*.items"
    private getValuesByPath(obj: any, path: string): any[] {
        const parts = path.split('.')
        let current = [obj]

        for (const part of parts) {
            if (part === '$') continue
            const next: any[] = []
            for (const item of current) {
                if (item === null || item === undefined) continue

                if (part === '*') {
                    if (typeof item === 'object') {
                        next.push(...Object.values(item))
                    }
                } else if (item[part] !== undefined) {
                    next.push(item[part])
                }
            }
            current = next
        }
        return current
    }

    // Helper to extract nested value from object by path "data.user.id"
    // NOW SUPPORTS FALLBACK CHAINS: "cost|price|amount" tries each until one succeeds
    private getValue(obj: any, path: string, context: any = {}): any {
        if (!path || path === '$') return obj

        // Handle special accessors
        if (path === '$key') return context.key
        if (path === '$value') return context.value
        if (path === '$index') return context.index
        if (path === '$parentKey') return context.parentKey
        if (path === '$grandParentKey' || path === '$grandparentKey') return context.grandParentKey
        if (path === '$operatorKey') return context.operatorKey

        // NEW: Handle fallback chains (cost|price|amount)
        if (path.includes('|')) {
            const fallbacks = path.split('|').map(p => p.trim())
            for (const fallbackPath of fallbacks) {
                const value = this.getValue(obj, fallbackPath, context)
                if (value !== undefined && value !== null) {
                    return value
                }
            }
            return undefined
        }

        return path.split('.').reduce((o, key) => {
            if (o === undefined || o === null) return undefined

            // $firstKey - get first key of object
            if (key === '$firstKey') {
                const keys = Object.keys(o)
                return keys.length > 0 ? keys[0] : undefined
            }
            // $firstValue - get first value of object
            if (key === '$firstValue') {
                const keys = Object.keys(o)
                return keys.length > 0 ? o[keys[0]] : undefined
            }
            // $values - get all values as array
            if (key === '$values') {
                return Object.values(o)
            }
            // $keys - get all keys as array
            if (key === '$keys') {
                return Object.keys(o)
            }
            // $length - get length
            if (key === '$length') {
                return Array.isArray(o) ? o.length : Object.keys(o).length
            }
            // $join:, - join array with separator
            if (key.startsWith('$join:')) {
                const sep = key.substring(6)
                return Array.isArray(o) ? o.join(sep) : o
            }

            return o[key]
        }, obj)
    }

    private parseResponse(response: { type: string, data: any }, mappingKey: string): any[] {
        const mappings = this.config.mappings as Record<string, MappingConfig>
        const mapConfig = mappings[mappingKey]

        if (!mapConfig) {
            console.warn(`[DynamicProvider:${this.name}] No mapping for ${mappingKey}, returning raw`)
            return this.autoParseResponse(response.data)
        }

        const { type: responseType, data } = response

        // Handle text responses
        if (responseType === 'text') {
            return this.parseTextResponse(data, mapConfig)
        }

        // JSON responses
        let root = data

        // Step 1: Apply explicit rootPath if defined
        if (mapConfig.rootPath && mapConfig.rootPath !== '$') {
            if (mapConfig.rootPath.includes('*')) {
                const flat = this.getValuesByPath(data, mapConfig.rootPath)
                // If dictionary mode, merge flattened objects to iterate all keys
                if (mapConfig.type === 'json_dictionary' && Array.isArray(flat)) {
                    root = Object.assign({}, ...flat)
                } else {
                    root = flat
                }
            } else {
                root = this.getValue(data, mapConfig.rootPath)
            }
        }

        // Step 2: Auto-detect nested wrappers if root is still an object with common wrapper keys
        if (root && typeof root === 'object' && !Array.isArray(root)) {
            // Check for common wrapper patterns based on mapping key
            const lowerKey = mappingKey.toLowerCase()
            const wrapperKeys = [
                'data', 'result', 'results', 'items', 'list', 'response',
                // Context-specific wrappers
                lowerKey.includes('countr') ? 'countries' : null,
                lowerKey.includes('service') ? 'services' : null,
                lowerKey.includes('number') ? 'numbers' : null,
            ].filter(Boolean) as string[]

            for (const wrapperKey of wrapperKeys) {
                if (root[wrapperKey] !== undefined) {
                    console.log(`[DynamicProvider:${this.name}] Auto-extracted nested data from '${wrapperKey}'`)
                    root = root[wrapperKey]
                    break
                }
            }
        }

        if (root === undefined || root === null) {
            console.warn(`[DynamicProvider:${this.name}] Root path ${mapConfig.rootPath} returned null`)
            return []
        }

        // Step 3: Smart type detection - override if data structure doesn't match declared type
        let effectiveType = mapConfig.type

        if (Array.isArray(root)) {
            // Data is an array, use json_array parsing regardless of declared type
            if (effectiveType !== 'json_array') {
                console.log(`[DynamicProvider:${this.name}] Auto-switching to json_array (data is array)`)
                effectiveType = 'json_array'
            }
        } else if (typeof root === 'object') {
            // Data is an object
            const keys = Object.keys(root)
            if (keys.length > 0 && typeof root[keys[0]] === 'object') {
                // Object of objects = dictionary
                if (effectiveType !== 'json_dictionary') {
                    console.log(`[DynamicProvider:${this.name}] Auto-switching to json_dictionary (object of objects)`)
                    effectiveType = 'json_dictionary'
                }
            }
        }

        switch (effectiveType) {
            case 'json_array':
                return this.parseJsonArray(root, mapConfig)

            case 'json_dictionary':
                return this.parseJsonDictionary(root, mapConfig, { mappingKey })

            case 'json_object':
                // Heuristic: if it's actually an object with object values, treat as dictionary
                if (typeof root === 'object' && !Array.isArray(root)) {
                    const keys = Object.keys(root)
                    // If it has keys and values are objects, treat as dictionary
                    if (keys.length > 0 && typeof root[keys[0]] === 'object') {
                        return this.parseJsonDictionary(root, mapConfig, { mappingKey })
                    }
                    // Single object
                    return [this.mapFields(root, mapConfig.fields, { mappingKey })]
                }
                if (Array.isArray(root)) {
                    return this.parseJsonArray(root, mapConfig)
                }
                return []

            default:
                return this.autoParseResponse(root)
        }
    }

    private parseJsonArray(arr: any[], mapConfig: MappingConfig): any[] {
        if (!Array.isArray(arr)) return []
        return arr.map((item, index) => this.mapFields(item, mapConfig.fields, { index }))
    }

    private parseJsonDictionary(obj: Record<string, any>, mapConfig: MappingConfig, parentContext: any = {}): any[] {
        const results: any[] = []

        // Debug logging enabled
        const isDebug = false // Toggle true if needed for tough cases

        const nestingConfig = mapConfig.nestingLevels
        const extractOperators = nestingConfig?.extractOperators ?? false
        const providersKey = nestingConfig?.providersKey

        // Universal Logic: Default requiredField to 'provider_id' if extractOperators is true
        // This filters out garbage nodes (like "Prcl") that lack a valid provider ID
        const requiredField = nestingConfig?.requiredField ?? (extractOperators ? 'provider_id' : undefined)

        for (const [key, value] of Object.entries(obj)) {
            if (isDebug) console.log(`[DEBUG_MAPPING] Processing Key="${key}" (ExtractOps=${extractOperators}, ProvidersKey=${providersKey})`)

            if (typeof value !== 'object' || value === null) {
                // Simple value: wrap it
                results.push(this.mapFields({ value }, this.resolveEffectiveFields({ value }, mapConfig), { ...parentContext, key, value }))
                continue
            }

            // 1. Providers Check + Required Field Filter
            if (providersKey && value[providersKey]) {
                if (isDebug) console.log(`[DEBUG_MAPPING] Found providersKey "${providersKey}" in "${key}", extracting providers.`)
                const providersObj = value[providersKey]
                for (const [providerKey, providerData] of Object.entries(providersObj as Record<string, any>)) {
                    if (typeof providerData === 'object' && providerData !== null) {
                        // NEW: Check required field if configured OR default
                        if (requiredField && providerData[requiredField] === undefined) {
                            if (isDebug) console.log(`[DEBUG_MAPPING] Skipping provider "${providerKey}" - missing required field "${requiredField}"`)
                            continue
                        }

                        // IMPORTANT: Use 'operatorKey' for the provider ID, keep 'key' as service
                        // This prevents $key from resolving to the operator ID
                        const mapped = this.mapFields(providerData, this.resolveEffectiveFields(providerData, mapConfig), {
                            ...parentContext,
                            key: key,              // Service code (e.g., "aez") - NOT providerKey!
                            operatorKey: providerKey, // Operator/Provider ID (e.g., "11", "145")
                            value: providerData,
                            parentKey: parentContext.parentKey || parentContext.key
                        })
                        // Always set service from outer key (the actual service code)
                        mapped.service = key
                        // Set operator from providerKey if not already mapped
                        if (!mapped.operator) mapped.operator = providerKey
                        results.push(mapped)
                    }
                }
                continue
            }

            // Check if this level contains actual data fields
            const hasData = this.hasDataFields(value)

            // RELAXED LOGIC: Process entry even if requiredField is missing, just don't treat it as a valid operator
            // Previous strict skip logic removed as per user request (Phase 11)

            if (isDebug) console.log(`[DEBUG_MAPPING] Key="${key}" hasData=${hasData}`)

            if (extractOperators) {
                if (hasData) {
                    // Leaf node with data - extract
                    const mapped = this.mapFields(value, this.resolveEffectiveFields(value, mapConfig), {
                        ...parentContext,
                        key,
                        value
                    })
                    // Auto-assign operator from key ONLY if NOT in strict operator mode
                    // If we are extracting operators, we expect explicit IDs (e.g. via provider_id mapping).
                    // If missing, leave generic (undefined), don't fallback to key (e.g. "Prcl").
                    if (!mapped.operator && !extractOperators) mapped.operator = key

                    results.push(mapped)
                } else {
                    // Nested structure - RECURSE deeper
                    const nestedResults = this.parseJsonDictionary(value, mapConfig, {
                        ...parentContext,
                        grandParentKey: parentContext.key || parentContext.parentKey, // Best guess at grandfather
                        parentKey: key
                    })
                    results.push(...nestedResults)
                }
                continue
            }

            // Standard dictionary (no extractOperators flag)
            if (hasData) {
                // Leaf node - extract
                const mapped = this.mapFields(value, this.resolveEffectiveFields(value, mapConfig), { ...parentContext, key, value })
                results.push(mapped)
            } else {
                // Nested structure - RECURSE deeper even in standard mode
                const nestedResults = this.parseJsonDictionary(value, mapConfig, {
                    ...parentContext,
                    grandParentKey: parentContext.key || parentContext.parentKey,
                    parentKey: key
                })
                results.push(...nestedResults)
            }
        }

        return results
    }

    /**
     * Helper: Detect if object contains actual data fields vs. nested structure
     */
    private hasDataFields(obj: any): boolean {
        if (typeof obj !== 'object' || obj === null) return false

        // Common data field names that indicate this is a leaf node
        const dataFieldNames = [
            'cost', 'price', 'amount', 'value', 'balance',
            'count', 'qty', 'stock', 'quantity', 'available', 'physicalCount',
            'rate', 'rate720', 'rate168', 'rate72', 'rate24', 'rate1',
            'id', 'code', 'name', 'provider_id', 'activation', 'phone', 'status'
        ]

        // If object has ANY of these fields AND they are primitives, it's a data node
        // (Prevents false positives if a container has a key like "count" that is actually an object/list)
        return dataFieldNames.some(fieldName => {
            const val = obj[fieldName]
            return val !== undefined && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
        })
    }

    private parseTextResponse(text: string, mapConfig: MappingConfig): any[] {
        if (mapConfig.type === 'text_regex' && mapConfig.regex) {
            const regex = new RegExp(mapConfig.regex, 'gm')
            const results: any[] = []
            let match
            while ((match = regex.exec(text)) !== null) {
                const item: any = {}

                // Support for Named Capture Groups (Modern/Readable)
                if (match.groups) {
                    // Method A: Auto-map named groups if no explicit fields are defined
                    if (!mapConfig.fields || Object.keys(mapConfig.fields).length === 0) {
                        Object.assign(item, match.groups)
                    }
                    // Method B: Map specific fields to named groups
                    else {
                        for (const [targetField, sourceGroupStr] of Object.entries(mapConfig.fields)) {
                            // Support fallback chains "price|cost"
                            const possibleGroups = sourceGroupStr.split('|').map(s => s.trim())
                            let value = undefined

                            for (const groupName of possibleGroups) {
                                // Try named group
                                if (match.groups[groupName] !== undefined) {
                                    value = match.groups[groupName]
                                    break
                                }
                                // Try numbered group index
                                const idx = parseInt(groupName)
                                if (!isNaN(idx) && match[idx] !== undefined) {
                                    value = match[idx]
                                    break
                                }
                            }

                            if (value !== undefined) {
                                item[targetField] = value
                            }
                        }
                    }
                }
                // Fallback: Numbered Capture Groups (Legacy)
                else if (mapConfig.fields) {
                    for (const [field, groupIndex] of Object.entries(mapConfig.fields)) {
                        const idx = parseInt(groupIndex)
                        if (!isNaN(idx) && match[idx]) {
                            item[field] = match[idx]
                        }
                    }
                }
                results.push(item)
            }
            return results
        }

        if (mapConfig.type === 'text_lines') {
            const lines = text.trim().split('\n')
            const sep = mapConfig.separator || ':'
            return lines.map(line => {
                const parts = line.split(sep)
                const item: any = {}
                for (const [field, indexStr] of Object.entries(mapConfig.fields)) {
                    const idx = parseInt(indexStr)
                    if (!isNaN(idx) && parts[idx]) {
                        item[field] = parts[idx].trim()
                    }
                }
                return item
            }).filter(item => Object.keys(item).length > 0)
        }

        return []
    }

    private autoParseResponse(data: any): any[] {
        // Intelligent auto-parsing for unknown formats
        if (Array.isArray(data)) {
            return data.map((item, i) => {
                if (typeof item === 'object') return item
                return { id: i, value: item }
            })
        }

        if (typeof data === 'object' && data !== null) {
            // Check for common wrapper patterns
            if (data.data) return this.autoParseResponse(data.data)
            if (data.countries) return this.autoParseResponse(data.countries)
            if (data.services) return this.autoParseResponse(data.services)
            if (data.items) return this.autoParseResponse(data.items)
            if (data.result) return this.autoParseResponse(data.result)
            if (data.list) return this.autoParseResponse(data.list)

            // If object with object values, treat as dictionary
            const keys = Object.keys(data)
            if (keys.length > 0 && typeof data[keys[0]] === 'object') {
                return keys.map(key => ({ id: key, ...data[key] }))
            }

            return [data]
        }

        return []
    }

    private mapFields(item: any, fields: Record<string, string>, context: any = {}): any {
        const result: any = {}

        // Common field name fallbacks (ordered by priority)
        const fieldFallbacks: Record<string, string[]> = {
            'name': ['name', 'eng', 'title', 'text', 'label', 'rus', 'chn'],
            'countryName': ['name', 'eng', 'title', 'country_name', 'rus'],
            'serviceName': ['name', 'title', 'service', 'service_name'],
            'id': ['id', 'code', 'key', 'value'],
            'code': ['code', 'id', 'short_name', 'iso'],
            'countryId': ['id', 'code', 'country_id', 'country_code'],
            'countryISO': ['iso', 'iso2', 'code', 'country_code'],
            'serviceId': ['id', 'code', 'service_id', 'service_code'],
        }

        for (const [targetField, sourcePath] of Object.entries(fields)) {
            let value = this.getValue(item, sourcePath, context)

            // If value is undefined and we have fallbacks for this target field, try them
            if (value === undefined || value === null) {
                const fallbacks = fieldFallbacks[targetField]
                if (fallbacks) {
                    for (const fb of fallbacks) {
                        // Try direct property
                        if (item[fb] !== undefined) {
                            value = item[fb]
                            break
                        }
                        // Try with value. prefix (for dictionary context)
                        if (context.value && context.value[fb] !== undefined) {
                            value = context.value[fb]
                            break
                        }
                    }
                }
            }

            // Smart Unwrap: If retrieved value is an object (e.g. from '$value') and contains the target field, extract it
            // This fixes cases where mapping points to a wrapper object { cost: 10.54 } instead of the value 10.54
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Case-insensitive check for robustness
                const subKey = Object.keys(value).find(k => k.toLowerCase() === targetField.toLowerCase())
                if (subKey) {
                    value = value[subKey]
                }
            }

            result[targetField] = value
        }

        // Apply Transformations
        if (this.config.mappings && context.mappingKey) {
            const mapConfig = (this.config.mappings as any)[context.mappingKey]
            if (mapConfig?.transform) {
                for (const [field, rule] of Object.entries(mapConfig.transform)) {
                    if (result[field] !== undefined && result[field] !== null) {
                        const val = result[field]
                        if (rule === 'number') result[field] = Number(val)
                        else if (rule === 'string') result[field] = String(val)
                        else if (rule === 'boolean') result[field] = Boolean(val)
                        else if (rule === 'uppercase') result[field] = String(val).toUpperCase()
                        else if (rule === 'lowercase') result[field] = String(val).toLowerCase()
                        // NEW: urlTemplate - e.g., "https://example.com/image/{value}.webp"
                        else if (typeof rule === 'string' && rule.includes('{value}')) {
                            result[field] = rule.replace('{value}', String(val))
                        }
                    }
                }
            }
        }

        return result
    }

    /**
     * Get countries from provider
     * 
     * - id: unique identifier
     * - code: country code (e.g., "us", "uk")
     * - name: display name
     * - flag: optional icon URL
     */
    /**
     * Get countries from provider
     */
    async getCountries(): Promise<Country[]> {
        const response = await this.request('getCountries')
        const items = this.parseResponse(response, 'getCountries')

        // Import image proxy
        const { proxyImage } = await import('./image-proxy')

        return Promise.all(items.map(async (i, idx) => {
            const id = String(i.id ?? idx)
            const code = String(i.code ?? i.id ?? '').toLowerCase()

            // Proxy flag URL to hide provider URLs
            let flagUrl = i.flagUrl ?? i.flag ?? i.icon ?? undefined
            if (flagUrl) {
                const result = await proxyImage(flagUrl)
                flagUrl = result.url || flagUrl
            }

            return {
                id,
                code: code !== id ? code : undefined,
                name: String(i.name ?? 'Unknown'),
                flagUrl
            }
        }))
    }

    /**
     * Get services from provider
     */
    async getServices(countryCode: string): Promise<Service[]> {
        const response = await this.request('getServices', { country: countryCode })
        const items = this.parseResponse(response, 'getServices')

        // Import image proxy
        const { proxyImage } = await import('./image-proxy')

        return Promise.all(items.map(async (s, idx) => {
            const id = String(s.id ?? s.code ?? idx)
            const code = String(s.code ?? s.id ?? '')

            // Proxy icon URL to hide provider URLs
            let iconUrl = s.iconUrl ?? s.icon ?? undefined
            if (iconUrl) {
                const result = await proxyImage(iconUrl)
                iconUrl = result.url || iconUrl
            }

            return {
                id,
                code: code !== id ? code : undefined,
                name: String(s.name ?? 'Unknown'),
                iconUrl
            }
        }))
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        const response = await this.request('getNumber', { country: countryCode, service: serviceCode })
        const items = this.parseResponse(response, 'getNumber')
        const mapped = items[0]

        // Check for presence of ANY valid ID or phone number field
        const hasId = mapped.id || mapped.activationId || mapped.orderId
        const hasPhone = mapped.phone || mapped.phoneNumber || mapped.number

        if (!mapped || (!hasId && !hasPhone)) {
            // Detailed error for debugging
            const missing = []
            if (!mapped) missing.push('result=null')
            else {
                if (!hasId) missing.push('id/activationId')
                if (!hasPhone) missing.push('phone/number')
            }
            throw new Error(`Failed to parse number response. Missing: ${missing.join(', ')}. Got: ${JSON.stringify(mapped)}`)
        }

        return {
            activationId: String(mapped.id || mapped.activationId || mapped.orderId),
            phoneNumber: String(mapped.phone || mapped.phoneNumber || mapped.number),
            countryCode,
            countryName: '',
            serviceCode,
            serviceName: '',
            price: Number(mapped.price || mapped.cost || 0),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        }
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // Handle mock activations for testing
        if (activationId.startsWith('mock_')) {
            console.log(`[DynamicProvider:${this.name}] Checking MOCK status for ${activationId} (No fake SMS generated)`)
            return {
                status: 'pending',
                messages: []
            }
        }

        const response = await this.request('getStatus', { id: activationId })
        const items = this.parseResponse(response, 'getStatus')
        const mapped = items[0] || {}

        // Map status string to internal NumberStatus
        let status: NumberStatus = 'pending'
        const rawStatus = String(mapped.status || '').toUpperCase()

        if (['RECEIVED', 'OK', 'STATUS_OK', 'FINISHED', 'COMPLETE', 'DONE', '1'].includes(rawStatus)) status = 'received'
        if (['CANCELED', 'CANCELLED', 'REFUNDED', '-1'].includes(rawStatus)) status = 'cancelled'
        if (['TIMEOUT', 'EXPIRED', '0'].includes(rawStatus)) status = 'expired'

        const messages = []
        if (mapped.sms || mapped.code || mapped.message) {
            const smsList = Array.isArray(mapped.sms) ? mapped.sms : [mapped.sms || mapped]
            messages.push(...smsList.filter(Boolean).map((s: any) => ({
                id: s.id || Date.now().toString(),
                sender: s.sender || s.from || 'System',
                content: s.text || s.content || s.message || '',
                code: s.code,
                receivedAt: new Date()
            })))
        }

        return { status, messages }
    }

    async cancelNumber(activationId: string): Promise<void> {
        await this.request('cancelNumber', { id: activationId })
    }

    async getBalance(): Promise<number> {
        const response = await this.request('getBalance')
        const items = this.parseResponse(response, 'getBalance')
        const mapped = items[0] || {}
        return Number(mapped.balance || mapped.amount || mapped.value || 0)
    }

    async syncBalance(): Promise<number> {
        try {
            const balance = await this.getBalance()
            // Update DB
            await prisma.provider.update({
                where: { id: this.config.id },
                data: {
                    balance: balance,
                    lastBalanceSync: new Date()
                }
            })
            return balance
        } catch (error) {
            console.error(`[DynamicProvider:${this.name}] Failed to sync balance:`, error)
            // throw error // Don't throw, just log so we don't break the loop if one fails
            return 0
        }
    }

    async getPrices(countryCode?: string, serviceCode?: string): Promise<PriceData[]> {
        const params: Record<string, string> = {}
        if (countryCode) params.country = countryCode
        if (serviceCode) params.service = serviceCode

        const response = await this.request('getPrices', params)

        // Use parseResponse to respect mapping configuration
        const items = this.parseResponse(response, 'getPrices')

        // Load settings and apply intelligent operator selection
        const { SettingsService } = await import('./settings')
        const settings = await SettingsService.getSettings()

        if (!settings.priceOptimization.enabled) {
            // Optimization disabled
            return items.map(item => ({
                country: String(item.country || countryCode || ''),
                service: String(item.service || serviceCode || ''),
                operator: item.operator || undefined,
                cost: Number(item.cost ?? item.price ?? 0),
                count: Number(item.count ?? item.qty ?? 0)
            }))
        }

        // Group by (country, service) to detect multiple operators
        const groups = new Map<string, typeof items>()
        for (const item of items) {
            const key = `${item.country || countryCode}:${item.service || serviceCode}`
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(item)
        }

        const { getOptimizer } = require('./price-optimizer')
        const optimizer = getOptimizer({
            costWeight: settings.priceOptimization.costWeight,
            stockWeight: settings.priceOptimization.stockWeight,
            rateWeight: settings.priceOptimization.rateWeight,
            minStock: settings.priceOptimization.minStock
        })

        const results: PriceData[] = []
        for (const [, group] of groups) {
            if (group.length === 1) {
                const item = group[0]
                results.push({
                    country: String(item.country || countryCode || ''),
                    service: String(item.service || serviceCode || ''),
                    operator: item.operator,
                    cost: Number(item.cost ?? item.price ?? 0),
                    count: Number(item.count ?? item.qty ?? 0)
                })
            } else {
                // Select best from multiple operators
                const best = optimizer.selectBestOption(group.map(i => ({
                    operator: i.operator,
                    cost: Number(i.cost ?? i.price ?? 0),
                    count: Number(i.count ?? i.qty ?? 0),
                    metadata: i
                })))

                if (best) {
                    results.push({
                        country: String(group[0].country || countryCode || ''),
                        service: String(group[0].service || serviceCode || ''),
                        operator: best.operator,
                        cost: best.cost,
                        count: best.count
                    })
                    // console.log(`[PriceOptim:${this.name}] ${group[0].service}: "${best.operator}" (${(best.score * 100).toFixed(0)}%)`)
                }
            }
        }
        return results
    }

    /**
     * Helper: Resolve effective fields based on conditional logic
     */
    private resolveEffectiveFields(item: any, mapConfig: MappingConfig): Record<string, string> {
        let effectiveFields = mapConfig.fields
        if (mapConfig.conditionalFields) {
            for (const [path, fields] of Object.entries(mapConfig.conditionalFields)) {
                // Check if the condition path exists and is truthy in the item
                if (this.getValue(item, path)) {
                    effectiveFields = { ...effectiveFields, ...fields }
                }
            }
        }
        return effectiveFields
    }
    /**
     * Verify webhook signature
     */
    public verifyWebhook(
        body: string,
        headers: Record<string, string | string[] | undefined>,
        ip: string
    ): WebhookVerificationResult {
        const mappings = this.config.mappings as any
        const webhookConfig = mappings?.webhook || {}
        const strategy = webhookConfig.strategy || 'none'

        // Get secret
        const secretEnv = webhookConfig.secretEnvVar
        const secret = secretEnv ? process.env[secretEnv] : null

        if (strategy === 'ip_whitelist') {
            const allowedIps = webhookConfig.ipWhitelist || []
            if (allowedIps.includes(ip)) return { valid: true }
            return { valid: false, error: `IP not allowed: ${ip}` }
        }

        if (strategy === 'hmac') {
            if (!secret) return { valid: false, error: 'Webhook secret not configured' }
            const headerName = webhookConfig.signatureHeader || 'x-signature'
            const signature = headers[headerName.toLowerCase()]

            if (!signature) return { valid: false, error: `Missing signature header: ${headerName}` }

            // Handle array headers
            const sigStr = Array.isArray(signature) ? signature[0] : signature

            return WebhookVerifier.verifyHmac(body, sigStr, secret, webhookConfig.algorithm)
        }

        if (strategy === 'custom_header') {
            if (!secret) return { valid: false, error: 'Webhook secret not configured' }
            const headerName = webhookConfig.signatureHeader || 'x-token'
            const token = headers[headerName.toLowerCase()]

            if (token !== secret) return { valid: false, error: 'Invalid token' }
            return { valid: true }
        }

        return { valid: true }
    }

    /**
     * Parse webhook payload
     */
    public parseWebhook(body: any): WebhookPayload {
        const mappings = this.config.mappings as any
        const webhookConfig = mappings?.webhook || {}
        const fields = webhookConfig.fields || {}

        // Helper to get value with multiple potential keys/paths
        const getAny = (keys: string[], obj: any) => {
            for (const k of keys) {
                if (!k) continue
                // Handle dot notation
                const val = k.split('.').reduce((o, x) => (o || {})[x], obj)
                if (val !== undefined && val !== null && val !== '') return val
            }
            return undefined
        }

        // Smart defaults covering standard provider formats (5sim, Grizzly, SMSBower, etc.)
        const activationId = getAny([fields.activationId, 'activationId', 'id', 'activation_id', 'order_id', 'orderId'], body)
        const text = getAny([fields.text, 'text', 'smsText', 'message', 'content', 'sms_text', 'msg'], body)
        const code = getAny([fields.code, 'code', 'smsCode', 'verification_code', 'pin', 'otp'], body)
        const sender = getAny([fields.sender, 'sender', 'from', 'service', 'app', 'origin'], body)
        const receivedAtStr = getAny([fields.receivedAt, 'receivedAt', 'received_at', 'timestamp', 'dateTime', 'time'], body)

        return {
            provider: this.config.name,
            eventType: 'sms.received', // Default for now, can be mapped if needed
            activationId: String(activationId || Date.now()),
            sms: {
                text: String(text || ''),
                code: code ? String(code) : undefined,
                sender: String(sender || 'Unknown'),
                receivedAt: receivedAtStr ? new Date(receivedAtStr) : new Date(),
            },
            rawPayload: body,
            timestamp: new Date(),
        }
    }
}

// Price data interface
export interface PriceData {
    country: string
    service: string
    operator?: string
    cost: number
    count: number
}
