
import { SmsProvider, Country, Service, NumberResult, StatusResult, NumberStatus } from './sms-providers/types'
import { Provider } from '@prisma/client'
import { prisma } from './db'

type EndpointConfig = {
    method: string
    path: string
    queryParams?: Record<string, string>
    headers?: Record<string, string>
}

type MappingConfig = {
    type: 'json_object' | 'json_array' | 'json_dictionary' | 'text_regex' | 'text_lines'
    rootPath?: string
    fields: Record<string, string>
    // Advanced options
    regex?: string // For text_regex type
    separator?: string // For text_lines type
    transform?: Record<string, string> // Field transformations
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

        // 2. Add Auth & Query Params
        const queryParams = { ...epConfig.queryParams }

        // Add Auth Query Param if configured
        if (this.config.authType === 'query_param' && this.config.authQueryParam && this.config.authKey) {
            queryParams[this.config.authQueryParam] = this.config.authKey
        }

        // Add Request Params to Query if GET
        if (epConfig.method === 'GET') {
            for (const [key, value] of Object.entries(params)) {
                // Skip if already used in path substitution
                if (!epConfig.path?.includes(`{${key}}`)) {
                    queryParams[key] = String(value)
                }
            }
        }

        for (const [key, value] of Object.entries(queryParams)) {
            urlObj.searchParams.set(key, String(value))
        }

        // 3. Headers
        const headers: Record<string, string> = {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...epConfig.headers
        }

        if (this.config.authType === 'bearer' && this.config.authKey) {
            headers['Authorization'] = `Bearer ${this.config.authKey}`
        } else if (this.config.authType === 'header' && this.config.authHeader && this.config.authKey) {
            headers[this.config.authHeader] = this.config.authKey
        }

        // 4. Execute
        const maskedHeaders = { ...headers }
        if (maskedHeaders['Authorization']) maskedHeaders['Authorization'] = maskedHeaders['Authorization'].substring(0, 15) + '...'
        if (maskedHeaders['base64_api_key']) maskedHeaders['base64_api_key'] = '...'

        console.log(`[DynamicProvider:${this.name}] ${epConfig.method} ${urlObj.toString()}`)
        console.log(`[DynamicProvider:${this.name}] Headers:`, JSON.stringify(maskedHeaders))

        const startTime = Date.now()
        let responseData: any = null
        let responseStatus = 0

        try {
            const response = await fetch(urlObj.toString(), {
                method: epConfig.method,
                headers
            })

            responseStatus = response.status

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

    // Helper to extract nested value from object by path "data.user.id"
    private getValue(obj: any, path: string, context: any = {}): any {
        if (!path || path === '$') return obj

        // Handle special accessors
        if (path === '$key') return context.key
        if (path === '$value') return context.value
        if (path === '$index') return context.index

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
            root = this.getValue(data, mapConfig.rootPath)
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
                return this.parseJsonDictionary(root, mapConfig)

            case 'json_object':
                // Heuristic: if it's actually an object with object values, treat as dictionary
                if (typeof root === 'object' && !Array.isArray(root)) {
                    const keys = Object.keys(root)
                    // If it has keys and values are objects, treat as dictionary
                    if (keys.length > 0 && typeof root[keys[0]] === 'object') {
                        return this.parseJsonDictionary(root, mapConfig)
                    }
                    // Single object
                    return [this.mapFields(root, mapConfig.fields)]
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

    private parseJsonDictionary(obj: Record<string, any>, mapConfig: MappingConfig): any[] {
        const results: any[] = []
        for (const [key, value] of Object.entries(obj)) {
            const item = typeof value === 'object' ? value : { value }
            results.push(this.mapFields(item, mapConfig.fields, { key, value }))
        }
        return results
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
                        for (const [targetField, sourceGroup] of Object.entries(mapConfig.fields)) {
                            // If sourceGroup is a name (e.g. "balance"), look in groups
                            if (match.groups[sourceGroup]) {
                                item[targetField] = match.groups[sourceGroup]
                            }
                            // Fallback to numbered groups for mixed usage
                            else {
                                const idx = parseInt(sourceGroup)
                                if (!isNaN(idx) && match[idx]) {
                                    item[targetField] = match[idx]
                                }
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

            result[targetField] = value
        }
        return result
    }

    /**
     * Get countries from provider
     * 
     * STANDARD MAPPING OUTPUT FIELDS (mappings must use these names):
     * - id: unique identifier
     * - code: country code (e.g., "us", "uk")
     * - name: display name
     * - phoneCode: phone prefix (e.g., "1", "44")
     * - flag: optional icon URL
     */
    async getCountries(): Promise<Country[]> {
        const response = await this.request('getCountries')
        const items = this.parseResponse(response, 'getCountries')

        return items.map((i, idx) => ({
            id: String(i.id ?? idx),
            code: String(i.code ?? i.id ?? '').toLowerCase(),
            name: String(i.name ?? 'Unknown'),
            flag: i.flag ?? i.icon ?? undefined,
            phoneCode: i.phoneCode ? String(i.phoneCode).replace('+', '') : undefined
        }))
    }

    /**
     * Get services from provider
     * 
     * STANDARD MAPPING OUTPUT FIELDS (mappings must use these names):
     * - id: unique identifier
     * - code: service code (e.g., "wa", "tg")
     * - name: display name
     * - price: cost per number
     */
    async getServices(countryCode: string): Promise<Service[]> {
        const response = await this.request('getServices', { country: countryCode })
        const items = this.parseResponse(response, 'getServices')

        return items.map((s, idx) => ({
            id: String(s.id ?? s.code ?? idx),
            code: String(s.code ?? s.id ?? ''),
            name: String(s.name ?? 'Unknown'),
            price: Number(s.price ?? 0)
        }))
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        const response = await this.request('getNumber', { country: countryCode, service: serviceCode })
        const items = this.parseResponse(response, 'getNumber')
        const mapped = items[0]

        if (!mapped || (!mapped.id && !mapped.phone)) {
            throw new Error('Failed to parse number response')
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
        const response = await this.request('getStatus', { id: activationId })
        const items = this.parseResponse(response, 'getStatus')
        const mapped = items[0] || {}

        // Map status string to internal NumberStatus
        let status: NumberStatus = 'pending'
        const rawStatus = String(mapped.status || '').toUpperCase()

        if (['RECEIVED', 'OK', 'FINISHED', 'COMPLETE', 'DONE', '1'].includes(rawStatus)) status = 'received'
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

    /**
     * Get current prices from provider
     * 
     * STANDARD MAPPING OUTPUT FIELDS:
     * - cost/price: price per number
     * - count: available quantity
     * - operator: optional operator name
     * 
     * Response formats supported:
     * 1. Nested: { country: { service: { operator: { cost, count } } } }
     * 2. Flat: { country: { service: { cost, count } } }
     * 3. Array: [{ service, cost, count }]
     * 
     * @param countryCode - Optional country filter
     * @param serviceCode - Optional service filter
     */
    async getPrices(countryCode?: string, serviceCode?: string): Promise<PriceData[]> {
        const params: Record<string, string> = {}
        if (countryCode) params.country = countryCode
        if (serviceCode) params.service = serviceCode

        const response = await this.request('getPrices', params)
        return this.parsePricesResponse(response, countryCode, serviceCode)
    }

    /**
     * Parse various price response formats into normalized PriceData[]
     */
    private parsePricesResponse(response: any, countryFilter?: string, serviceFilter?: string): PriceData[] {
        const results: PriceData[] = []

        // Handle string response (shouldn't happen for prices, but just in case)
        if (typeof response === 'string') {
            try {
                response = JSON.parse(response)
            } catch {
                console.warn(`[DynamicProvider:${this.name}] getPrices returned non-JSON response`)
                return results
            }
        }

        // If response is an array, process each item
        if (Array.isArray(response)) {
            for (const item of response) {
                if (item.cost !== undefined || item.price !== undefined) {
                    results.push({
                        country: item.country || countryFilter || '',
                        service: item.service || item.code || serviceFilter || '',
                        operator: item.operator || undefined,
                        cost: Number(item.cost ?? item.price ?? 0),
                        count: Number(item.count ?? item.qty ?? 0)
                    })
                }
            }
            return results
        }

        // Handle nested dictionary format: { country: { service: { [operator]: { cost, count } } } }
        if (typeof response === 'object' && response !== null) {
            for (const [countryKey, countryData] of Object.entries(response)) {
                if (typeof countryData !== 'object' || countryData === null) continue

                for (const [serviceKey, serviceData] of Object.entries(countryData as Record<string, any>)) {
                    if (typeof serviceData !== 'object' || serviceData === null) continue

                    // Check if this level has cost/count directly (flat format)
                    if (serviceData.cost !== undefined || serviceData.price !== undefined || serviceData.count !== undefined) {
                        results.push({
                            country: countryKey,
                            service: serviceKey,
                            cost: Number(serviceData.cost ?? serviceData.price ?? 0),
                            count: Number(serviceData.count ?? serviceData.qty ?? 0)
                        })
                    } else {
                        // Has operators nested inside
                        for (const [operatorKey, opData] of Object.entries(serviceData as Record<string, any>)) {
                            if (typeof opData !== 'object' || opData === null) continue

                            results.push({
                                country: countryKey,
                                service: serviceKey,
                                operator: operatorKey,
                                cost: Number(opData.cost ?? opData.price ?? 0),
                                count: Number(opData.count ?? opData.qty ?? 0)
                            })
                        }
                    }
                }
            }
        }

        return results
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
