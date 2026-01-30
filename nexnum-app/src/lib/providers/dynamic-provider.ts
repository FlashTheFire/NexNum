
import { SmsProvider, Country, Service, NumberResult, StatusResult, NumberStatus, PriceData } from '@/lib/providers/types'
import { WebhookPayload, WebhookVerificationResult } from '@/lib/sms/types'
import { WebhookVerifier } from '@/lib/webhooks/verify'
import { Provider } from '@prisma/client'
// Retrying import fix
import { prisma } from '../core/db'
import { currencyService } from '../currency/currency-service'
import CircuitBreaker from 'opossum'
import { logger } from '@/lib/core/logger'
import { getTraceId } from '@/lib/api/request-context'
import { redis, cacheGet, CACHE_KEYS, CACHE_TTL } from '@/lib/core/redis'
import { CIRCUIT_OPTS } from '@/lib/core/circuit-breaker'
import { trackProviderRequest } from '@/lib/metrics'

declare var process: any;
declare var require: any;

const MAX_RETRIES = 3;

type EndpointConfig = {
    method: string
    path: string
    queryParams?: Record<string, string>
    headers?: Record<string, string>
}

// Universal error types - consistent across all providers
export type UniversalErrorType =
    | 'NO_NUMBERS'         // No numbers available for this service/country
    | 'NO_BALANCE'         // Insufficient provider balance
    | 'BAD_KEY'            // Invalid API key
    | 'BAD_SERVICE'        // Invalid service code
    | 'BAD_COUNTRY'        // Invalid country code
    | 'NO_ACTIVATION'      // Activation ID not found
    | 'ACTIVATION_EXPIRED' // Activation has expired
    | 'ACTIVATION_CANCELLED' // Activation was cancelled
    | 'RATE_LIMITED'       // Too many requests
    | 'SERVER_ERROR'       // Provider server error
    | 'WAITING'            // Waiting for SMS (not an error, status)
    | 'RECEIVED'           // SMS received (not an error, status)
    | 'UNKNOWN_ERROR'      // Fallback for unrecognized errors

// Error mapping configuration
type ErrorMappingConfig = {
    patterns: Record<string, UniversalErrorType>
    errorField?: string
}

type MappingConfig = {
    type:
    | 'json_object'
    | 'json_array'
    | 'json_dictionary'
    | 'json_value'           // NEW: Single primitive value response
    | 'json_array_positional' // NEW: Array with position-based field mapping
    | 'json_keyed_value'      // NEW: Key=ID, Value=primitive or object
    | 'json_nested_array'     // NEW: 2D array (table-like data)
    | 'text_regex'
    | 'text_lines'
    rootPath?: string

    // Field mappings: now supports fallback chains
    // Example: { "cost": "cost|price|amount" } - tries each path in order
    fields: Record<string, string>

    // Advanced extraction options
    regex?: string // For text_regex type
    separator?: string // For text_lines type
    transform?: Record<string, string> // Field transformations

    // NEW: Status Mapping (Dynamic)
    // Map raw provider status (e.g. "ACCESS_NUMBER", "1", "OK") to NumberStatus
    statusMapping?: Record<string, NumberStatus>

    // Support for specialized error patterns within this specific mapping
    errorPatterns?: Record<string, UniversalErrorType>
    errorField?: string

    // NEW: For json_value - the target field name for the single value
    valueField?: string // e.g., "balance" - wraps value as { balance: 123.45 }

    // NEW: For json_array_positional - map array indices to field names
    positionFields?: Record<string, string> // e.g., { "0": "id", "1": "phone", "2": "price" }

    // NEW: For json_keyed_value - specify key and value field names
    keyField?: string   // e.g., "activationId" - the dictionary key becomes this field
    // valueField reused - the dictionary value (if primitive) becomes this field

    // NEW: For json_nested_array - treat first row as headers
    headerRow?: boolean // If true, first array element is field names

    // Multi-level extraction config
    nestingLevels?: {
        /** How deep to traverse (1 = country>service, 2 = country>service>operator) */
        depth?: number
        /** Extract operators from nested structures */
        extractOperators?: boolean
        /** Special key to extract nested providers (e.g., "providers") */
        providersKey?: string
        /** Helper to enforce field presence (e.g., "provider_id") */
        requiredField?: string
    }

    // Field fallback chains (alternative to pipe syntax in fields)
    fieldFallbacks?: {
        [targetField: string]: string[] // Try each path in order
    }

    // NEW: Template for constructing icon URLs dynamically
    // Example: "https://provider.com/assets/icons/{{id}}.png"
    // Supports {{field}} placeholders from the extracted item
    iconUrlTemplate?: string

    // Conditional extraction based on structure detection
    conditionalFields?: {
        /** If this path exists in the data, use these field mappings */
        [conditionPath: string]: Record<string, string>
    }

    // NEW: Error pattern mappings for detecting provider errors
    errors?: ErrorMappingConfig
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

// Structured error for provider-specific errors with universal types
export class ProviderError extends Error {
    constructor(
        public errorType: UniversalErrorType,
        message: string,
        public rawResponse?: string
    ) {
        super(message)
        this.name = 'ProviderError'
    }

    // Check if error is retryable (might succeed with retry or different provider)
    get isRetryable(): boolean {
        return ['NO_NUMBERS', 'RATE_LIMITED', 'SERVER_ERROR'].includes(this.errorType)
    }

    // Check if error means no stock (for smart routing - try next provider)
    get isNoStock(): boolean {
        return this.errorType === 'NO_NUMBERS'
    }

    // Check if error is a status (not actually an error)
    get isStatus(): boolean {
        return ['WAITING', 'RECEIVED'].includes(this.errorType)
    }

    // Check if this is a permanent failure (don't retry)
    get isPermanent(): boolean {
        return ['BAD_KEY', 'BAD_SERVICE', 'BAD_COUNTRY', 'NO_ACTIVATION', 'ACTIVATION_EXPIRED'].includes(this.errorType)
    }

    // Check if this is a business lifecycle terminal state (not a system error)
    // These should NOT trigger circuit breakers or health degradation
    get isLifecycleTerminal(): boolean {
        return ['NO_ACTIVATION', 'ACTIVATION_EXPIRED', 'ACTIVATION_CANCELLED'].includes(this.errorType)
    }
}

export class DynamicProvider implements SmsProvider {
    name: string
    public config: Provider
    private lastRequestTime: number = 0

    // Circuit Breaker Registry (Static to share across instances of same provider)
    private static breakers = new Map<string, CircuitBreaker>()
    private static latencyHistory = new Map<string, number[]>()
    private static readonly LATENCY_WINDOW = 10
    private static readonly VOLATILITY_THRESHOLD = 0.5



    private getBreaker() {
        if (!DynamicProvider.breakers.has(this.name)) {
            const breaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), {
                ...CIRCUIT_OPTS,
                name: `DynamicProvider:${this.name}`, // Unique name for metrics
            })

            breaker.on('open', () => logger.warn(`[DynamicProvider:${this.name}] Circuit OPEN - Failing fast`))
            breaker.on('halfOpen', () => logger.info(`[DynamicProvider:${this.name}] Circuit HALF-OPEN - Testing`))
            breaker.on('close', () => logger.success(`[DynamicProvider:${this.name}] Circuit CLOSED - Recovered`))

            DynamicProvider.breakers.set(this.name, breaker)
        }
        return DynamicProvider.breakers.get(this.name)!
    }

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

        // Initialize trace variables in outer scope for catch block access
        let urlObj: URL | null = null
        let headers: Record<string, string> = {}
        let maskedHeaders: Record<string, string> = {}
        const startTime = Date.now()

        // Decrypt Auth Key on the fly
        const { decrypt } = await import('@/lib/security/encryption')
        const rawAuthKey = this.config.authKey ? decrypt(this.config.authKey) : ''

        try {


            // 1. Construct Request using Builder
            const { ProviderRequestBuilder } = await import('./provider-request-builder')

            // Build URL
            urlObj = ProviderRequestBuilder.buildUrl(
                this.config.apiBaseUrl || '',
                epConfig.path,
                params,
                rawAuthKey
            )

            // Resolve Query Params
            const queryParams = ProviderRequestBuilder.resolveQueryParams(
                epConfig.queryParams,
                params,
                rawAuthKey,
                this.config.authType,
                this.config.authQueryParam ?? undefined,
                epConfig.method
            )

            // Merge params into URL
            if (urlObj) {
                queryParams.forEach((val, key) => urlObj!.searchParams.append(key, val))
            }

            // Build Headers
            headers = ProviderRequestBuilder.buildHeaders(
                epConfig.headers,
                this.config.authType,
                rawAuthKey ?? undefined,
                this.config.authHeader ?? undefined,
                urlObj?.origin || ''
            )

            // Mask headers for trace (done early so it's available if fetch fails)
            maskedHeaders = this.maskHeaders(headers)

            // 3. Attach common headers (Trace ID)
            headers['X-Trace-ID'] = getTraceId()
            headers['X-App-Version'] = process.env.npm_package_version || '1.0.0'

            // 4. Rate Limiting Enforcer (Distributed)
            const rateLimitDelay = (this.config as any).rateLimitDelay || 1000 // Default to 1000ms

            // Wait for distributed slot
            const { DistributedRateLimiter } = await import('@/lib/core/rate-limit')
            const waitTime = await DistributedRateLimiter.reserveSlot(this.config.id, rateLimitDelay)

            if (waitTime > 0) {
                // logger.debug(`[DynamicProvider:${this.name}] Distributed Rate Limit: Waiting ${waitTime}ms`)
                await new Promise(resolve => setTimeout(resolve, waitTime))
            }

            // 0. Logging Request
            if (urlObj) {
                logger.request(`DynamicProvider:${this.name}`, epConfig.method, urlObj.toString())
            }

            const upstreamStartTime = Date.now()
            let responseData: any = null
            let responseStatus = 0

            // Execute with Circuit Breaker
            const breaker = this.getBreaker()
            let response: Response | undefined

            try {
                response = await breaker.fire(async () => {
                    // Retry Loop (Business Logic)
                    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                        try {
                            const res = await fetch(urlObj!.toString(), {
                                method: epConfig.method,
                                headers,
                                signal: AbortSignal.timeout(30000)
                            });

                            if (res.status === 429) {
                                if (attempt === MAX_RETRIES) return res // Return 429 to handle outside
                                const retryAfter = res.headers.get('Retry-After')
                                let delay = 1000 * Math.pow(2, attempt)
                                if (retryAfter) {
                                    const sec = parseInt(retryAfter, 10)
                                    if (!isNaN(sec)) delay = (sec + 1) * 1000
                                }
                                logger.warn(`[DynamicProvider:${this.name}] 429 Retry in ${delay}ms`)
                                await new Promise(r => setTimeout(r, delay))
                                continue
                            }

                            if (res.status >= 500 && attempt < MAX_RETRIES) {
                                const delay = 1000 * attempt
                                await new Promise(r => setTimeout(r, delay))
                                continue
                            }

                            return res // Success or non-retriable

                        } catch (netErr: any) {
                            const isNetworkError = netErr.name === 'TypeError' || netErr.name === 'TimeoutError' || netErr.code === 'UND_ERR_CONNECT_TIMEOUT'
                            if (isNetworkError && attempt < MAX_RETRIES) {
                                const delay = 1000 * attempt
                                await new Promise(r => setTimeout(r, delay))
                                continue
                            }
                            throw netErr
                        }
                    }
                    throw new Error('Retries exhausted')
                }) as Response
            } catch (breakerErr: any) {
                // Map Opossum errors
                if (breakerErr.code === 'EOPEN') {
                    throw new Error(`Circuit Breaker OPEN for ${this.name}`)
                }

                // CRITICAL FIX: If this is a ProviderError (business error) that we threw in checkForErrors,
                // it might have been caught by the circuit breaker if checkForErrors happened inside fire.
                // But checkForErrors actually happens AFTER fire returns the response.
                // Wait, I need to check WHERE checkForErrors is called.
                throw breakerErr
            }

            if (!response) throw new Error('Request failed')

            responseStatus = response.status;

            // Log Response early
            logger.response(`DynamicProvider:${this.name}`, epConfig.method, urlObj.toString(), responseStatus, { durationMs: Date.now() - upstreamStartTime })

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
                    requestTime: Date.now() - upstreamStartTime
                }



                // Track Failure
                trackProviderRequest(
                    this.name,
                    epConfig.method,
                    response.status,
                    (Date.now() - upstreamStartTime) / 1000
                )

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
                requestTime: Date.now() - upstreamStartTime
            }

            // Save raw response for test console debugging
            this.lastRawResponse = responseData

            // 5. Record Latency for Proactive Monitoring
            this.recordLatency(Date.now() - upstreamStartTime)

            return result

        } catch (error: any) {
            logger.error(`[DynamicProvider:${this.name}] Request failed`, { error: error.message })

            // Record failure latency (if timeout)
            if (error.message.includes('timeout')) this.recordLatency(30000)

            // If we haven't saved trace yet (e.g. network error)
            if (!this.lastRequestTrace) {
                this.lastRequestTrace = {
                    method: epConfig.method,
                    url: urlObj?.toString() ?? 'unknown',
                    headers: maskedHeaders,
                    responseStatus: 0,
                    responseBody: error.message,
                    requestTime: Date.now() - startTime
                }
            }
            throw error
        }
    }

    private recordLatency(latencyMs: number) {
        const history = DynamicProvider.latencyHistory.get(this.name) || []
        history.push(latencyMs)
        if (history.length > DynamicProvider.LATENCY_WINDOW) history.shift()
        DynamicProvider.latencyHistory.set(this.name, history)

        if (history.length >= 5) {
            const avg = history.reduce((a, b) => a + b, 0) / history.length

            // Industrial Tuning: Only warn if it's > 50% above average AND above 2000ms (Latency Floor)
            // This prevents "fast" providers (50ms) from tripping just because they occasionally hit 300ms.
            const threshold = Math.max(avg * (1 + DynamicProvider.VOLATILITY_THRESHOLD), 2000)

            if (latencyMs > threshold) {
                logger.warn(`[DynamicProvider:${this.name}] Proactive Health Warning: Latency Volatility Detected`, {
                    current: `${latencyMs}ms`,
                    average: `${avg.toFixed(0)}ms`,
                    deviation: `${((latencyMs / avg) - 1) * 100}%`
                })

                // QUARANTINE: If 3 out of last 5 requests exceed the threshold, open breaker
                const spikes = history.filter(l => l > threshold).length
                if (spikes >= 3) {
                    logger.error(`[DynamicProvider:${this.name}] ☣️ Industrial Anomaly Quarantine: Tripping circuit due to chronic latency volatility`)
                    this.getBreaker().open()
                }
            }
        }
    }

    private maskHeaders(headers: Record<string, string>): Record<string, string> {
        const masked: Record<string, string> = {}
        const sensitiveKeys = ['authorization', 'api-key', 'apikey', 'token', 'auth-key', 'x-api-key', 'x-auth-token']

        for (const [key, value] of Object.entries(headers)) {
            const lowerKey = key.toLowerCase()
            if (sensitiveKeys.includes(lowerKey) || (this.config.authHeader && lowerKey === this.config.authHeader.toLowerCase())) {
                masked[key] = value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '********'
            } else {
                masked[key] = value
            }
        }
        return masked
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

        // ═══════════════════════════════════════════════════════════════════
        // NEW: Depth & Path Accessors (API Standardization v2.0)
        // ═══════════════════════════════════════════════════════════════════

        // $greatGrandParentKey - 4-level nesting support
        if (path === '$greatGrandParentKey' || path === '$greatGrandparentKey') return context.greatGrandParentKey
        // $parentValue - parent object value
        if (path === '$parentValue') return context.parentValue
        // $rootKey - first-level key (always country in pricing)
        if (path === '$rootKey') return context.rootKey
        // $depth - current nesting level (0-indexed)
        if (path === '$depth') return context.depth ?? 0
        // $isLeaf - boolean: no deeper nesting
        if (path === '$isLeaf') return context.isLeaf ?? false
        // $path - full dot-path from root (debugging only)
        if (path === '$path') return context.path ?? ''
        // $ancestors - array of all parent keys (debugging only)
        if (path === '$ancestors') return context.ancestors ?? []
        // $atDepth:N - key at specific depth level
        if (path.startsWith('$atDepth:')) {
            const depthIndex = parseInt(path.substring(9))
            return context.ancestors?.[depthIndex] ?? context.key
        }

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

            // ==========================================
            // ARRAY/COLLECTION ACCESSORS
            // ==========================================

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
            // $first - first element of array
            if (key === '$first') {
                return Array.isArray(o) ? o[0] : (typeof o === 'object' ? Object.values(o)[0] : o)
            }
            // $lastKey - last key of object
            if (key === '$lastKey') {
                const keys = Object.keys(o)
                return keys.length > 0 ? keys[keys.length - 1] : undefined
            }
            // $lastValue - last value of object
            if (key === '$lastValue') {
                const keys = Object.keys(o)
                return keys.length > 0 ? o[keys[keys.length - 1]] : undefined
            }
            // $last - last element of array
            if (key === '$last') {
                return Array.isArray(o) ? o[o.length - 1] : (typeof o === 'object' ? Object.values(o).pop() : o)
            }
            // $values - get all values as array
            if (key === '$values') {
                return Object.values(o)
            }
            // $keys - get all keys as array
            if (key === '$keys') {
                return Object.keys(o)
            }
            // $length / $count - get length
            if (key === '$length' || key === '$count') {
                return Array.isArray(o) ? o.length : Object.keys(o).length
            }
            // $sum - sum of numeric array
            if (key === '$sum') {
                if (!Array.isArray(o)) return 0
                return o.reduce((acc, val) => acc + (Number(val) || 0), 0)
            }
            // $avg / $average - average of numeric array
            if (key === '$avg' || key === '$average') {
                if (!Array.isArray(o) || o.length === 0) return 0
                const sum = o.reduce((acc, val) => acc + (Number(val) || 0), 0)
                return sum / o.length
            }
            // $min - minimum value
            if (key === '$min') {
                if (!Array.isArray(o) || o.length === 0) return undefined
                return Math.min(...o.map(Number).filter(n => !isNaN(n)))
            }
            // $max - maximum value
            if (key === '$max') {
                if (!Array.isArray(o) || o.length === 0) return undefined
                return Math.max(...o.map(Number).filter(n => !isNaN(n)))
            }
            // $unique - deduplicate array
            if (key === '$unique') {
                return Array.isArray(o) ? [...new Set(o)] : o
            }
            // $flatten - flatten nested arrays
            if (key === '$flatten') {
                return Array.isArray(o) ? o.flat(Infinity) : o
            }
            // $reverse - reverse array
            if (key === '$reverse') {
                return Array.isArray(o) ? [...o].reverse() : o
            }
            // $sort - sort array
            if (key === '$sort') {
                return Array.isArray(o) ? [...o].sort() : o
            }
            // $slice:start:end - get subset of array
            if (key.startsWith('$slice:')) {
                const parts = key.substring(7).split(':')
                const start = parseInt(parts[0]) || 0
                const end = parts[1] ? parseInt(parts[1]) : undefined
                return Array.isArray(o) ? o.slice(start, end) : o
            }
            // $join:separator - join array with separator
            if (key.startsWith('$join:')) {
                const sep = key.substring(6)
                return Array.isArray(o) ? o.join(sep) : o
            }

            // ==========================================
            // STRING MANIPULATION ACCESSORS
            // ==========================================

            // $lowercase / $lower - convert to lowercase
            if (key === '$lowercase' || key === '$lower') {
                return typeof o === 'string' ? o.toLowerCase() : String(o).toLowerCase()
            }
            // $uppercase / $upper - convert to uppercase
            if (key === '$uppercase' || key === '$upper') {
                return typeof o === 'string' ? o.toUpperCase() : String(o).toUpperCase()
            }
            // $trim - remove whitespace
            if (key === '$trim') {
                return typeof o === 'string' ? o.trim() : String(o).trim()
            }
            // $split:separator - split string to array
            if (key.startsWith('$split:')) {
                const sep = key.substring(7)
                return typeof o === 'string' ? o.split(sep) : [o]
            }
            // $replace:old:new - replace substring
            if (key.startsWith('$replace:')) {
                const parts = key.substring(9).split(':')
                const oldStr = parts[0] || ''
                const newStr = parts[1] || ''
                return typeof o === 'string' ? o.replace(new RegExp(oldStr, 'g'), newStr) : o
            }
            // $substring:start:end - get substring
            if (key.startsWith('$substring:')) {
                const parts = key.substring(11).split(':')
                const start = parseInt(parts[0]) || 0
                const end = parts[1] ? parseInt(parts[1]) : undefined
                return typeof o === 'string' ? o.substring(start, end) : String(o).substring(start, end)
            }
            // $padStart:length:char - pad string start
            if (key.startsWith('$padStart:')) {
                const parts = key.substring(10).split(':')
                const len = parseInt(parts[0]) || 0
                const char = parts[1] || ' '
                return String(o).padStart(len, char)
            }
            // $padEnd:length:char - pad string end
            if (key.startsWith('$padEnd:')) {
                const parts = key.substring(8).split(':')
                const len = parseInt(parts[0]) || 0
                const char = parts[1] || ' '
                return String(o).padEnd(len, char)
            }

            // ==========================================
            // TYPE CONVERSION ACCESSORS
            // ==========================================

            // $number / $int / $float - convert to number
            if (key === '$number' || key === '$int' || key === '$float') {
                const num = Number(o)
                if (key === '$int') return Math.floor(num)
                return isNaN(num) ? 0 : num
            }
            // $string / $str - convert to string
            if (key === '$string' || key === '$str') {
                return String(o)
            }
            // $boolean / $bool - convert to boolean
            if (key === '$boolean' || key === '$bool') {
                if (typeof o === 'boolean') return o
                if (typeof o === 'string') {
                    const lower = o.toLowerCase()
                    return lower === 'true' || lower === '1' || lower === 'yes'
                }
                return Boolean(o)
            }
            // $json - parse JSON string
            if (key === '$json') {
                if (typeof o === 'string') {
                    try { return JSON.parse(o) } catch { return o }
                }
                return o
            }
            // $stringify - convert to JSON string
            if (key === '$stringify') {
                try { return JSON.stringify(o) } catch { return String(o) }
            }

            // ==========================================
            // CONDITIONAL ACCESSORS
            // ==========================================

            // $default:value - default if null/undefined
            if (key.startsWith('$default:')) {
                const defaultVal = key.substring(9)
                return (o === undefined || o === null) ? defaultVal : o
            }
            // $ifEmpty:value - default if empty string
            if (key.startsWith('$ifEmpty:')) {
                const defaultVal = key.substring(9)
                return (o === '' || o === undefined || o === null) ? defaultVal : o
            }
            // $exists - check if field exists (returns boolean)
            if (key === '$exists') {
                return o !== undefined && o !== null
            }

            // ==========================================
            // OBJECT ACCESSORS
            // ==========================================

            // $entries - get [key, value] pairs
            if (key === '$entries') {
                return typeof o === 'object' && o !== null ? Object.entries(o) : []
            }
            // $pick:a,b,c - only specific keys
            if (key.startsWith('$pick:')) {
                const keysToKeep = key.substring(6).split(',').map(k => k.trim())
                if (typeof o === 'object' && o !== null) {
                    const obj = o as Record<string, unknown>
                    const result: Record<string, unknown> = {}
                    for (const k of keysToKeep) {
                        if (k in obj) result[k] = obj[k]
                    }
                    return result
                }
                return o
            }
            // $omit:a,b,c - exclude specific keys
            if (key.startsWith('$omit:')) {
                const keysToOmit = key.substring(6).split(',').map(k => k.trim())
                if (typeof o === 'object' && o !== null) {
                    const obj = o as Record<string, unknown>
                    const result: Record<string, unknown> = {}
                    for (const [k, v] of Object.entries(obj)) {
                        if (!keysToOmit.includes(k)) result[k] = v
                    }
                    return result
                }
                return o
            }
            // $type - get JavaScript type
            if (key === '$type') {
                if (o === null) return 'null'
                if (Array.isArray(o)) return 'array'
                return typeof o
            }

            return o[key]
        }, obj)
    }

    /**
     * Check for error patterns in the raw response before attempting to parse.
     * Throws ProviderError if a known error pattern is detected.
     */
    private checkForErrors(response: { type: string, data: any }, mappingKey: string, mapConfig?: MappingConfig): void {
        const { data } = response
        let checkValue = ''

        // 1. Determine error field to check
        const errorConfig = (this.config as any).errorConfig
        const errorField = mapConfig?.errorField || errorConfig?.errorField
        if (errorField && typeof data === 'object') {
            checkValue = String(data[errorField] || '')
        } else if (typeof data === 'string') {
            checkValue = data
        } else {
            // Default heuristics for JSON objects
            checkValue = String(
                data?.error || data?.message || data?.status ||
                (typeof data === 'object' ? '' : data)
            )
        }

        const checkString = checkValue.trim()
        if (!checkString || checkString.length > 500) return

        // 2. LAYER 1: Mapping-specific patterns (High priority)
        if (mapConfig?.errorPatterns) {
            for (const [errorType, pattern] of Object.entries(mapConfig.errorPatterns)) {
                if (this.matchesErrorPattern(checkString, pattern)) {
                    throw new ProviderError(errorType as UniversalErrorType, `Provider returned: ${checkString}`, checkString)
                }
            }
        }

        // 3. LAYER 2: Global provider patterns
        const globalPatterns = errorConfig?.patterns as Record<string, string>
        if (globalPatterns) {
            for (const [errorType, pattern] of Object.entries(globalPatterns)) {
                if (this.matchesErrorPattern(checkString, pattern)) {
                    throw new ProviderError(errorType as UniversalErrorType, `Provider returned: ${checkString}`, checkString)
                }
            }
        }

        // 4. LAYER 3: Universal Fallbacks - REMOVED for Strict Dynamic Mapping
        // Every error MUST be explicitly defined in the provider configuration (Global or Local).
    }

    /**
     * Match a string against an error pattern.
     * Patterns starting with '/' are treated as regex, otherwise case-insensitive includes.
     */
    private matchesErrorPattern(str: string, pattern: string): boolean {
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            // Regex pattern
            try {
                return new RegExp(pattern.slice(1, -1), 'i').test(str)
            } catch {
                return false
            }
        }
        // Exact or includes match (case-insensitive)
        const lowerStr = str.toLowerCase()
        const lowerPattern = pattern.toLowerCase()
        return lowerStr === lowerPattern || lowerStr.includes(lowerPattern)
    }

    private parseResponse(response: { type: string, data: any }, mappingKey: string): any[] {
        const mappings = this.config.mappings as Record<string, MappingConfig>
        const mapConfig = mappings[mappingKey]

        // STEP 0: Check for error patterns BEFORE attempting to parse
        this.checkForErrors(response, mappingKey, mapConfig)

        if (!mapConfig) {
            logger.warn('No mapping found for key, returning auto-parsed data', { context: 'DYNAMIC_PROVIDER', provider: this.name, mappingKey })
            return this.autoParseResponse(response.data)
        }

        const { type: responseType, data } = response

        // Handle text responses
        if (responseType === 'text') {
            return this.parseTextResponse(data as string, mapConfig)
        }

        // JSON responses
        let root = data as any

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
                lowerKey.includes('country') ? 'countries' : null,
                lowerKey.includes('service') ? 'services' : null,
                lowerKey.includes('number') ? 'numbers' : null,
            ].filter(Boolean) as string[]

            for (const wrapperKey of wrapperKeys) {
                if (root[wrapperKey] !== undefined) {
                    logger.debug('Auto-extracted nested data from wrapper', {
                        context: 'DynamicProvider',
                        provider: this.name,
                        wrapperKey
                    })
                    root = root[wrapperKey]
                    break
                }
            }
        }

        if (root === undefined || root === null) {
            logger.warn('Dynamic root path returned null', {
                context: 'DynamicProvider',
                provider: this.name,
                rootPath: mapConfig.rootPath
            })
            return []
        }

        // Step 3: Smart type detection - override if data structure doesn't match declared type
        let effectiveType = mapConfig.type

        if (Array.isArray(root)) {
            // Data is an array, use json_array parsing regardless of declared type
            if (effectiveType !== 'json_array') {
                logger.debug('Auto-switching to json_array (data is array)', {
                    context: 'DynamicProvider',
                    provider: this.name
                })
                effectiveType = 'json_array'
            }
        } else if (typeof root === 'object') {
            // Data is an object
            const keys = Object.keys(root)
            if (keys.length > 0 && typeof root[keys[0]] === 'object') {
                // Object of objects = dictionary
                if (effectiveType !== 'json_dictionary') {
                    if (process.env.DEBUG) {
                        logger.debug('Auto-switching to json_dictionary (object of objects)', {
                            context: 'DynamicProvider',
                            provider: this.name
                        })
                    }
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

            // NEW: Single primitive value response (e.g., balance: 123.45)
            case 'json_value':
                return this.parseJsonValue(root, mapConfig)

            // NEW: Array with position-based field mapping
            case 'json_array_positional':
                return this.parseJsonArrayPositional(root, mapConfig)

            // NEW: Key=ID, Value=primitive or object
            case 'json_keyed_value':
                return this.parseJsonKeyedValue(root, mapConfig)

            // NEW: 2D array (table-like data with optional header row)
            case 'json_nested_array':
                return this.parseJsonNestedArray(root, mapConfig)

            default:
                return this.autoParseResponse(root)
        }
    }

    private parseJsonArray(arr: any[], mapConfig: MappingConfig): any[] {
        if (!Array.isArray(arr)) return []
        return arr.map((item, index) => this.mapFields(item, mapConfig.fields, { index }))
    }

    /**
     * Parse single primitive value response
     * Example: 123.45 → { balance: 123.45 }
     */
    private parseJsonValue(value: any, mapConfig: MappingConfig): any[] {
        const fieldName = mapConfig.valueField || 'value'

        // If it's an object, try to extract the value
        if (typeof value === 'object' && value !== null) {
            // Check for common wrapper patterns
            const wrapperKeys = ['balance', 'amount', 'result', 'data', 'value', 'status']
            for (const key of wrapperKeys) {
                if (value[key] !== undefined) {
                    return [{ [fieldName]: value[key] }]
                }
            }
            // If fields are specified, try to map them
            if (mapConfig.fields && Object.keys(mapConfig.fields).length > 0) {
                return [this.mapFields(value, mapConfig.fields, {})]
            }
            return [value]
        }

        // Primitive value - wrap it
        return [{ [fieldName]: value }]
    }

    /**
     * Parse array with position-based field mapping
     * Example: ["12345", "+15551234", "0.50"] with positionFields: { "0": "id", "1": "phone", "2": "2" }
     * → { id: "12345", phone: "+15551234", price: "0.50" }
     */
    private parseJsonArrayPositional(arr: any, mapConfig: MappingConfig): any[] {
        // Handle both single array and array of arrays
        const arrays = Array.isArray(arr)
            ? (Array.isArray(arr[0]) ? arr : [arr])  // Normalize to array of arrays
            : [[arr]]

        const positionFields = mapConfig.positionFields || {}

        // If no positionFields defined, use fields mapping with numeric keys
        const fieldMap = Object.keys(positionFields).length > 0
            ? positionFields
            : mapConfig.fields

        return arrays.map(item => {
            const result: any = {}
            if (!Array.isArray(item)) {
                return { value: item }
            }

            for (const [indexStr, fieldName] of Object.entries(fieldMap)) {
                const idx = parseInt(indexStr)
                if (!isNaN(idx) && item[idx] !== undefined) {
                    result[fieldName] = item[idx]
                }
            }
            return result
        }).filter(r => Object.keys(r).length > 0)
    }

    /**
     * Parse key-value dictionary where key is an ID and value is data
     * Example: { "12345": "pending", "12346": "received" }
     * → [{ activationId: "12345", status: "pending" }, { activationId: "12346", status: "received" }]
     */
    private parseJsonKeyedValue(obj: any, mapConfig: MappingConfig): any[] {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            return []
        }

        const keyField = mapConfig.keyField || 'id'
        const valueField = mapConfig.valueField || 'value'
        const results: any[] = []

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                // Value is an object - merge key as ID field
                const mapped = this.mapFields(value, mapConfig.fields || {}, { key, value })
                mapped[keyField] = key
                results.push(mapped)
            } else {
                // Value is primitive
                results.push({
                    [keyField]: key,
                    [valueField]: value
                })
            }
        }

        return results
    }

    /**
     * Parse 2D array (table-like data)
     * Example with headerRow=true: [["id","phone","price"], ["123","+1555","0.5"]]
     * → [{ id: "123", phone: "+1555", price: "0.5" }]
     */
    private parseJsonNestedArray(arr: any, mapConfig: MappingConfig): any[] {
        if (!Array.isArray(arr) || arr.length === 0) {
            return []
        }

        // Check if first element is also an array (2D array)
        if (!Array.isArray(arr[0])) {
            // 1D array - use positional parsing
            return this.parseJsonArrayPositional(arr, mapConfig)
        }

        const headerRow = mapConfig.headerRow ?? false
        let headers: string[] = []
        let dataRows: any[][]

        if (headerRow && arr.length > 0) {
            // First row is headers
            headers = arr[0].map(String)
            dataRows = arr.slice(1)
        } else if (mapConfig.positionFields) {
            // Use positionFields as header mapping
            const maxIndex = Math.max(...Object.keys(mapConfig.positionFields).map(Number))
            headers = Array(maxIndex + 1).fill('')
            for (const [idx, name] of Object.entries(mapConfig.positionFields)) {
                headers[parseInt(idx)] = name
            }
            dataRows = arr
        } else {
            // Auto-generate headers (col_0, col_1, etc.)
            headers = arr[0].map((_: any, i: number) => `col_${i}`)
            dataRows = arr
        }

        return dataRows.map(row => {
            if (!Array.isArray(row)) return {}
            const result: any = {}
            row.forEach((val, idx) => {
                if (headers[idx]) {
                    result[headers[idx]] = val
                }
            })
            return result
        }).filter(r => Object.keys(r).length > 0)
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

        // API Standardization v2.0: Track depth and ancestors for $atDepth:N accessor
        const currentDepth = (parentContext.depth ?? -1) + 1
        const currentAncestors = parentContext.ancestors ?? []

        for (const [key, value] of Object.entries(obj)) {
            if (isDebug) {
                logger.debug('Processing mapping key', {
                    context: 'DEBUG_MAPPING',
                    key,
                    extractOperators,
                    providersKey,
                    depth: currentDepth
                })
            }

            // Build enhanced context for new depth accessors
            const enhancedContext = {
                ...parentContext,
                key,
                value,
                depth: currentDepth,
                ancestors: [...currentAncestors, key],
                path: currentAncestors.length > 0 ? `${currentAncestors.join('.')}.${key}` : key,
                rootKey: currentAncestors[0] ?? key,
                parentValue: parentContext.value,
                greatGrandParentKey: parentContext.grandParentKey
            }

            if (typeof value !== 'object' || value === null) {
                // Simple value: wrap it - isLeaf = true
                results.push(this.mapFields({ value }, this.resolveEffectiveFields({ value }, mapConfig), {
                    ...enhancedContext,
                    isLeaf: true
                }))
                continue
            }

            // 1. Providers Check + Required Field Filter
            if (providersKey && value[providersKey]) {
                if (isDebug) {
                    logger.debug('Found providersKey, extracting providers', {
                        context: 'DEBUG_MAPPING',
                        providersKey,
                        key
                    })
                }
                const providersObj = value[providersKey]
                for (const [providerKey, providerData] of Object.entries(providersObj as Record<string, any>)) {
                    if (typeof providerData === 'object' && providerData !== null) {
                        // NEW: Check required field if configured OR default
                        if (requiredField && providerData[requiredField] === undefined) {
                            if (isDebug) {
                                logger.debug('Skipping provider - missing required field', {
                                    context: 'DEBUG_MAPPING',
                                    providerKey,
                                    requiredField
                                })
                            }
                            continue
                        }

                        // Build operator-level context
                        const operatorContext = {
                            ...enhancedContext,
                            operatorKey: providerKey,
                            depth: currentDepth + 1,
                            ancestors: [...currentAncestors, key, providerKey],
                            path: `${currentAncestors.join('.')}.${key}.${providerKey}`.replace(/^\./, ''),
                            isLeaf: true
                        }

                        const mapped = this.mapFields(providerData, this.resolveEffectiveFields(providerData, mapConfig), operatorContext)
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
            enhancedContext.isLeaf = hasData

            if (isDebug) {
                logger.debug('Processed mapping level', {
                    context: 'DEBUG_MAPPING',
                    key,
                    hasData,
                    depth: currentDepth
                })
            }

            if (extractOperators) {
                if (hasData) {
                    // Leaf node with data - extract
                    const mapped = this.mapFields(value, this.resolveEffectiveFields(value, mapConfig), enhancedContext)
                    // Auto-assign operator from key ONLY if NOT in strict operator mode
                    if (!mapped.operator && !extractOperators) mapped.operator = key
                    results.push(mapped)
                } else {
                    // Nested structure - RECURSE deeper with updated context
                    const nestedResults = this.parseJsonDictionary(value, mapConfig, {
                        ...enhancedContext,
                        grandParentKey: parentContext.key || parentContext.parentKey,
                        parentKey: key
                    })
                    results.push(...nestedResults)
                }
                continue
            }

            // Standard dictionary (no extractOperators flag)
            if (hasData) {
                // Leaf node - extract
                const mapped = this.mapFields(value, this.resolveEffectiveFields(value, mapConfig), enhancedContext)
                results.push(mapped)
            } else {
                // Nested structure - RECURSE deeper
                const nestedResults = this.parseJsonDictionary(value, mapConfig, {
                    ...enhancedContext,
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

                // Construct a unify source object for field resolution
                const source: any = { ...match.groups }
                // Add indexed groups
                match.forEach((val: string, idx: number) => { source[String(idx)] = val })

                // Resolve fields dynamically (supports conditionalFields)
                const fields = this.resolveEffectiveFields(source, mapConfig)

                // Support for Named Capture Groups (Modern/Readable)
                if (match.groups) {
                    // Method A: Auto-map named groups if no explicit fields are defined
                    if (!mapConfig.fields || Object.keys(mapConfig.fields).length === 0) {
                        Object.assign(item, match.groups)
                    }
                    // Method B: Map specific fields to named groups
                    else {
                        for (const [targetField, sourceGroupStr] of Object.entries(fields)) {
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
                // Fallback: Numbered Capture Groups
                else {
                    for (const [field, groupIndex] of Object.entries(fields)) {
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

        for (const [targetField, sourcePath] of Object.entries(fields)) {
            let value = this.getValue(item, sourcePath, context)

            // Smart Unwrap: If retrieved value is an object (e.g. from '$value') and contains the target field, extract it
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const subKey = Object.keys(value).find(k => k.toLowerCase() === targetField.toLowerCase())
                if (subKey) {
                    value = value[subKey]
                }
            }

            result[targetField] = value
        }

        // Apply Transformations strictly from config
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
                        else if (rule === 'trim') result[field] = String(val).trim()
                        else if (typeof rule === 'string' && rule.includes('{value}')) {
                            result[field] = rule.replace('{value}', String(val))
                        }
                    }
                }
            }

            // Universal Template-based Fallbacks
            if (mapConfig?.iconUrlTemplate && !result.iconUrl) {
                const template = mapConfig.iconUrlTemplate
                result.iconUrl = template.replace(/{{([^}]+)}}/g, (match: string, fieldName: string) => {
                    const cleanFieldName = fieldName.trim()
                    const val = result[cleanFieldName] ?? item[cleanFieldName] ?? context[cleanFieldName]
                    return val !== undefined && val !== null ? String(val) : match
                })
            }
        }

        return result
    }

    /**
     * Get countries from provider (API Standardization v2.0)
     */
    async getCountriesList(): Promise<Country[]> {
        // Use cache-aside pattern
        const cacheKey = CACHE_KEYS.countryList(this.name)

        return cacheGet(cacheKey, async () => {

            const response = await this.request('getCountriesList')
            const items = this.parseResponse(response, 'getCountriesList')

            return Promise.all(items.map(async (i) => {
                // Determine Code/Name strictly from mapping, no fallbacks
                const code = String(i.code ?? i.id ?? '')
                const name = String(i.name ?? '')
                const flagUrl = i.flagUrl ?? undefined

                return {
                    ...i, // Preserve all mapped fields
                    code,
                    name,
                    flagUrl: (flagUrl && typeof flagUrl === 'string') ? flagUrl : undefined
                }
            }))
        }, CACHE_TTL.COUNTRIES)
    }

    /** @deprecated Use getCountriesList instead */
    async getCountries(): Promise<Country[]> {
        logger.warn('DEPRECATED: getCountries() called. Use getCountriesList() instead.', { provider: this.name })
        return this.getCountriesList()
    }


    /**
     * Resolve a canonical code or numeric ID to the provider's external ID
     */
    private async resolveExternalId(type: 'country' | 'service', internalId: string | number): Promise<string> {
        let slug = String(internalId)

        // 1. If numeric ID provided, resolve to slug first
        if (typeof internalId === 'number') {
            const { resolveNumericIdToName, generateCanonicalCode } = await import('@/lib/normalizers/service-identity')
            const name = await resolveNumericIdToName(type, internalId)
            if (name) slug = generateCanonicalCode(name)
        }

        // 2. Look up the provider-specific external ID
        const table = type === 'country' ? prisma.providerCountry : prisma.providerService
        const result = await (table as any).findFirst({
            where: {
                providerId: this.config.id,
                OR: [
                    { code: slug },
                    { externalId: slug } // Fallback for legacy codes
                ]
            }
        })

        return result?.externalId || slug
    }

    /**
     * Get services from provider (API Standardization v2.0)
     */
    async getServicesList(countryCode: string | number): Promise<Service[]> {
        // Use cache-aside pattern
        const cacheKey = CACHE_KEYS.serviceList(this.name) + `:${countryCode}`

        return cacheGet(cacheKey, async () => {
            // Resolve to external ID first
            const externalCountry = await this.resolveExternalId('country', countryCode)

            // Logic simplified to strict dynamic
            const response = await this.request('getServicesList', { country: externalCountry })

            const items = this.parseResponse(response, 'getServicesList')

            return Promise.all(items.map(async (s) => {
                // Determine Code/Name strictly from mapping, no fallbacks
                const code = String(s.code ?? s.id ?? '')
                const name = String(s.name ?? '')

                const iconUrl = s.iconUrl ?? undefined

                return {
                    ...s, // Preserve all mapped fields
                    code,
                    name,
                    iconUrl: (iconUrl && typeof iconUrl === 'string') ? iconUrl : undefined
                }
            }))
        }, CACHE_TTL.SERVICES)
    }

    /** @deprecated Use getServicesList instead */
    async getServices(countryCode?: string | number): Promise<Service[]> {
        logger.warn('DEPRECATED: getServices() called. Use getServicesList() instead.', { provider: this.name })
        return this.getServicesList(countryCode || '')
    }


    async getNumber(countryCode: string | number, serviceCode: string | number, options?: { operator?: string; maxPrice?: string | number }): Promise<NumberResult> {
        // Strict Mode: No fallback

        // Resolve identifiers to provider-specific codes
        const [externalCountry, externalService] = await Promise.all([
            this.resolveExternalId('country', countryCode),
            this.resolveExternalId('service', serviceCode)
        ])

        // Build params object with consistent naming
        const params: Record<string, string> = {
            country: externalCountry,
            service: externalService
        }

        // Add optional params if provided
        if (options?.operator) params.operator = options.operator
        if (options?.maxPrice) params.maxPrice = String(options.maxPrice)

        const response = await this.request('getNumber', params)
        const items = this.parseResponse(response, 'getNumber')
        const mapped = items[0]

        if (!mapped) {
            throw new Error(`Failed to parse number response. No data returned or mapping failed. Raw: ${JSON.stringify(this.lastRawResponse)}`)
        }

        // Required Fields for NexNum Core
        const activationId = String(mapped.activationId || mapped.id || mapped.orderId || '')
        const phoneNumber = String(mapped.phoneNumber || mapped.phone || mapped.number || '')

        if (!activationId || !phoneNumber) {
            throw new Error(`Failed to parse number response. Missing required fields (mapped activationId or phoneNumber). Got: ${JSON.stringify(mapped)}`)
        }

        // CURRENCY & MARGIN LOGIC (Real-time)
        let normalizedPrice: number | null = null
        let baseCost: number | null = null

        const rawPriceValue = mapped.price ?? mapped.cost
        if (rawPriceValue !== undefined) {
            const rawPriceNum = Number(rawPriceValue || 0)
            baseCost = await currencyService.normalizeProviderPrice(rawPriceNum, this.config.name)

            const multiplier = Number(this.config.priceMultiplier || 1.0)
            const markupUsd = Number(this.config.fixedMarkup || 0.0)
            const markupPoints = await currencyService.convert(markupUsd, 'USD', 'POINTS')

            normalizedPrice = Math.ceil((baseCost * multiplier) + markupPoints)
        }

        return {
            ...mapped, // Preserve ALL mapped fields for universal usage
            activationId,
            phoneNumber,
            countryCode: String(countryCode),
            serviceCode: String(serviceCode),
            price: normalizedPrice,
            rawPrice: baseCost,
            expiresAt: new Date(Date.now() + ((this.config as any).activationExpiryMinutes || 15) * 60 * 1000)
        }
    }

    async getStatus(activationId: string): Promise<StatusResult> {




        const response = await this.request('getStatus', { id: activationId })
        const mappingKey = 'getStatus'
        const mappings = this.config.mappings as Record<string, MappingConfig>
        const mapConfig = mappings[mappingKey]

        const items = this.parseResponse(response, mappingKey)
        const mapped = items[0] || {}

        // Map status string to internal NumberStatus based STRICTLY on configuration
        // Professional approach: No guesswork. If it's not mapped, it stays pending.
        let status: NumberStatus = 'pending'
        const rawStatus = String(mapped.status || '').trim().toUpperCase()

        if (mapConfig?.statusMapping) {
            // Check case-insensitive
            const statusMap = mapConfig.statusMapping as Record<string, NumberStatus>
            const mappedStatus = statusMap[rawStatus] ||
                statusMap[rawStatus.toLowerCase()] ||
                statusMap[String(mapped.status)]

            if (mappedStatus) {
                status = mappedStatus
            }
        }

        const messages = []
        // Strict mapping for SMS content/code
        const smsContent = mapped.sms || mapped.text || mapped.content || mapped.message
        const smsCode = mapped.code || mapped.pin || mapped.otp

        if (smsContent || smsCode) {
            const smsList = Array.isArray(smsContent) ? smsContent : [mapped] // If not array, treat mapped object as single SMS context
            messages.push(...smsList.filter(Boolean).map((s: any) => {
                const code = s.code || smsCode || ''
                const stableId = s.id || s.smsId || `sms_${activationId}_${code}`

                return {
                    ...s, // Preserve all mapped fields in SMS object
                    id: String(stableId),
                    sender: s.sender || s.from || 'System',
                    content: s.text || s.content || s.message || String(smsContent || ''),
                    code: String(code),
                    receivedAt: s.receivedAt ? new Date(s.receivedAt) : new Date()
                }
            }))
        }

        return { ...mapped, status, messages }
    }

    /**
     * Batch status check for multiple activations
     * Reduces API calls when polling many numbers
     * 
     * @param activationIds - Array of activation IDs to check
     * @returns Map of activationId -> StatusResult
     */
    async getStatusBatch(activationIds: string[]): Promise<Map<string, StatusResult>> {
        const results = new Map<string, StatusResult>()

        if (activationIds.length === 0) return results

        // Check if provider supports batch endpoint
        const endpoints = this.config.endpoints as Record<string, EndpointConfig>
        const hasBatchEndpoint = !!endpoints['getStatusBatch']

        if (hasBatchEndpoint) {
            // Provider supports batch - make single request
            try {
                const response = await this.request('getStatusBatch', {
                    ids: activationIds.join(','),
                    activationIds: activationIds // Some providers use array
                })

                const items = this.parseResponse(response, 'getStatusBatch')

                // Map results back to activation IDs
                for (const item of items) {
                    const id = item.id || item.activationId
                    if (id && activationIds.includes(id)) {
                        results.set(id, {
                            status: this.mapStatus(item.status, 'getStatusBatch'),
                            messages: this.extractMessages(item, id)
                        })
                    }
                }

                // Fill in missing with 'pending'
                for (const id of activationIds) {
                    if (!results.has(id)) {
                        results.set(id, { status: 'pending', messages: [] })
                    }
                }

                return results
            } catch (error) {
                logger.warn('[DynamicProvider] Batch status failed, falling back to individual', {
                    provider: this.name,
                    error
                })
            }
        }

        // Fallback: parallel individual requests with concurrency limit
        const CONCURRENCY = 10
        const chunks = this.chunkArray(activationIds, CONCURRENCY)

        for (const chunk of chunks) {
            const chunkResults = await Promise.allSettled(
                chunk.map(id => this.getStatus(id).then(r => ({ id, result: r })))
            )

            for (const result of chunkResults) {
                if (result.status === 'fulfilled') {
                    results.set(result.value.id, result.value.result)
                } else {
                    const id = chunk[chunkResults.indexOf(result)]
                    results.set(id, { status: 'pending', messages: [] })
                }
            }
        }

        return results
    }

    /**
     * Helper: Map raw status to NumberStatus using config
     */
    private mapStatus(rawStatus: string, mappingKey: string): NumberStatus {
        const mappings = this.config.mappings as Record<string, MappingConfig>
        const mapConfig = mappings[mappingKey] || mappings['getStatus']

        if (mapConfig?.statusMapping) {
            const normalized = String(rawStatus).trim().toUpperCase()
            const statusMap = mapConfig.statusMapping as Record<string, NumberStatus>
            return statusMap[normalized] || statusMap[rawStatus] || 'pending'
        }

        return 'pending'
    }

    /**
     * Helper: Extract SMS messages from status response
     */
    private extractMessages(item: any, activationId: string): Array<{ id: string; sender: string; content: string; code?: string; receivedAt: Date }> {
        const messages: Array<{ id: string; sender: string; content: string; code?: string; receivedAt: Date }> = []

        if (item.sms || item.code || item.message) {
            const smsList = Array.isArray(item.sms) ? item.sms : [item.sms || item]
            messages.push(...smsList.filter(Boolean).map((s: any) => {
                const code = s.code || s.text || s.message || ''
                const stableId = s.id || `sms_${activationId}_${code}`

                return {
                    id: String(stableId),
                    sender: s.sender || s.from || 'System',
                    content: s.text || s.content || s.message || '',
                    code: s.code,
                    receivedAt: new Date()
                }
            }))
        }

        return messages
    }

    /**
     * Helper: Chunk array for concurrency control
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = []
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size))
        }
        return chunks
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACTION METHODS (set*) - API Standardization v2.0
    // ═══════════════════════════════════════════════════════════════════════

    async setCancel(activationId: string): Promise<void> {
        const response = await this.request('setCancel', { id: activationId })
        this.checkForErrors(response, 'setCancel', (this.config.mappings as any)?.setCancel)
    }

    /** @deprecated Use setCancel instead */
    async cancelNumber(activationId: string): Promise<void> {
        logger.warn('DEPRECATED: cancelNumber() called. Use setCancel() instead.', { provider: this.name })
        return this.setCancel(activationId)
    }

    /**
     * @deprecated Use setCancel or setComplete instead
     * This method exposed internal provider logic and is now disallowed
     */
    async setStatus(activationId: string, status: string | number): Promise<any> {
        try {
            const response = await this.request('setStatus', { id: activationId, status: String(status) })
            const items = this.parseResponse(response, 'setStatus')
            const mapped = items[0] || {}

            return {
                raw: response.data,
                parsed: mapped,
                success: true
            }
        } catch (e: any) {
            if (e.message?.includes('404')) {
                return { raw: null, parsed: {}, success: false, error: e.message }
            }
            throw e
        }
    }

    async setResendCode(activationId: string): Promise<void> {
        const response = await this.request('setResendCode', { id: activationId })
        this.checkForErrors(response, 'setResendCode', (this.config.mappings as any)?.setResendCode)
    }

    /** @deprecated Use setResendCode instead */
    async nextSms(activationId: string): Promise<void> {
        logger.warn('DEPRECATED: nextSms() called. Use setResendCode() instead.', { provider: this.name })
        return this.setResendCode(activationId)
    }

    /**
     * Mark activation as complete (NEW - API Standardization v2.0)
     * Uses setStatus with status 6 (Complete) or dedicated endpoint
     */
    async setComplete(activationId: string): Promise<void> {
        const endpoints = this.config.endpoints as Record<string, any>

        // Prefer dedicated setComplete endpoint if configured
        if (endpoints['setComplete']) {
            const response = await this.request('setComplete', { id: activationId })
            this.checkForErrors(response, 'setComplete', (this.config.mappings as any)?.setComplete)
            return
        }

        // Fallback: use setStatus with status 6 (Complete activation)
        await this.setStatus(activationId, 6)
    }


    async getBalance(): Promise<number> {

        // If dynamic is disabled BUT no fallback exists (or fallback lacks getBalance),
        // we default to using the Dynamic Engine logic so it works for standard providers.

        const response = await this.request('getBalance')
        const items = this.parseResponse(response, 'getBalance')
        const mapped = items[0] || {}

        // Total control: use only mapped balance or fallback to 0
        return Number(mapped.balance || mapped.amount || 0)
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
        } catch (error: any) {
            logger.error('Failed to sync provider balance', { provider: this.name, error: error.message })
            // throw error // Don't throw, just log so we don't break the loop if one fails
            return 0
        }
    }

    async getPrices(countryCode?: string, serviceCode?: string): Promise<PriceData[]> {
        // Cache Key Strategy: provider:prices:{name}:{country}:{service}
        const cacheKey = `provider:prices:${this.name}:${countryCode || 'all'}:${serviceCode || 'all'}`

        return cacheGet(cacheKey, async () => {


            const params: Record<string, string> = {}
            if (countryCode) params.country = countryCode
            if (serviceCode) params.service = serviceCode

            const response = await this.request('getPrices', params)

            // Use parseResponse to respect mapping configuration
            const items = this.parseResponse(response, 'getPrices')

            // Load settings and apply intelligent operator selection
            const { SettingsService } = await import('@/lib/settings')
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

            const { getOptimizer } = require('@/lib/wallet/price-optimizer')
            const optimizer = getOptimizer({
                costWeight: settings.priceOptimization.costWeight,
                stockWeight: settings.priceOptimization.stockWeight,
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
                    }
                }
            }

            return results
        }, CACHE_TTL.PRICES)
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
        const getVal = (path: string | undefined, defaultKeys: string[], obj: any) => {
            if (path) return path.split('.').reduce((o, x) => (o || {})[x], obj)

            // Fallback to strict defaults only if no path provided
            for (const k of defaultKeys) {
                const val = obj[k]
                if (val !== undefined && val !== null && val !== '') return val
            }
            return undefined
        }

        const activationId = getVal(fields.activationId, ['activationId', 'id', 'order_id'], body)
        const text = getVal(fields.text, ['text', 'message', 'sms'], body)
        const code = getVal(fields.code, ['code', 'pin', 'otp'], body)
        const sender = getVal(fields.sender, ['sender', 'from'], body)
        const receivedAtStr = getVal(fields.receivedAt, ['receivedAt', 'timestamp'], body)

        return {
            provider: this.config.name,
            eventType: 'sms.received',
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


