
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
            url = baseUrl + (path.startsWith('/') || !path ? path : '/' + path)
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

        try {
            const response = await fetch(urlObj.toString(), {
                method: epConfig.method,
                headers
            })

            if (!response.ok) {
                const text = await response.text()
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
            if (contentType && contentType.includes('application/json')) {
                return { type: 'json', data: await response.json() }
            }

            // Fallback: Try to parse text as JSON
            const text = await response.text()
            try {
                const json = JSON.parse(text)
                if (typeof json === 'object') {
                    return { type: 'json', data: json }
                }
            } catch (e) {
                // Not JSON, keep as text
            }

            return { type: 'text', data: text }
        } catch (error) {
            console.error(`[DynamicProvider:${this.name}] Request failed:`, error)
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
            // Try to intelligently parse common formats
            return this.autoParseResponse(response.data)
        }

        const { type: responseType, data } = response

        // Handle text responses
        if (responseType === 'text') {
            return this.parseTextResponse(data, mapConfig)
        }

        // JSON responses
        let root = data
        if (mapConfig.rootPath && mapConfig.rootPath !== '$') {
            root = this.getValue(data, mapConfig.rootPath)
        }

        if (root === undefined || root === null) {
            console.warn(`[DynamicProvider:${this.name}] Root path ${mapConfig.rootPath} returned null`)
            return []
        }

        switch (mapConfig.type) {
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
                // Map numbered groups to fields
                for (const [field, groupIndex] of Object.entries(mapConfig.fields)) {
                    const idx = parseInt(groupIndex)
                    if (!isNaN(idx) && match[idx]) {
                        item[field] = match[idx]
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
            result[targetField] = this.getValue(item, sourcePath, context)
        }
        return result
    }

    async getCountries(): Promise<Country[]> {
        const response = await this.request('getCountries')
        const items = this.parseResponse(response, 'getCountries')

        return items.map((i, idx) => ({
            id: String(i.id ?? i.code ?? i.name ?? idx),
            code: String(i.code ?? i.id ?? i.name ?? '').toLowerCase(),
            name: i.name || i.text || i.title || i.eng || 'Unknown',
            flag: i.flag || i.icon,
            phoneCode: i.phoneCode ? String(i.phoneCode).replace('+', '') : i.phone_code
        }))
    }

    async getServices(countryCode: string): Promise<Service[]> {
        const response = await this.request('getServices', { country: countryCode })
        const items = this.parseResponse(response, 'getServices')

        return items.map((s, idx) => ({
            id: String(s.id ?? s.code ?? s.name ?? idx),
            code: String(s.code ?? s.id ?? s.name ?? ''),
            name: s.name || s.title || s.service || 'Unknown',
            price: Number(s.price || s.cost || 0)
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
}
