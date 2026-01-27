
/**
 * Provider Request Builder
 * 
 * Helper class to construct request URLs, headers, and parameters
 * for DynamicProvider. Separates string manipulation logic from
 * network/flow logic.
 */
export class ProviderRequestBuilder {

    /**
     * Build the final URL with path parameter substitution
     */
    static buildUrl(
        baseUrl: string,
        path: string,
        params: Record<string, any>,
        authKey?: string
    ): URL {
        // 1. Determine base path
        let urlStr = ''
        if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
            urlStr = path
        } else {
            const base = (baseUrl || '').replace(/\/$/, '')
            const pd = (path || '')
            urlStr = base + (pd.startsWith('/') || pd.startsWith('?') || !pd ? pd : '/' + pd)
        }

        // 2. Substitute Path Parameters {param}
        const allParams = { ...params, authKey: authKey || '' }
        for (const [key, value] of Object.entries(allParams)) {
            if (urlStr.includes(`{${key}}`)) {
                urlStr = urlStr.replace(new RegExp(`{${key}}`, 'g'), String(value))
            }
        }

        // 3. Cleanups
        if (urlStr.includes('{operator}')) {
            urlStr = urlStr.replace(/{operator}/g, 'any')
        }

        // --- PHASE 27: PRE-FLIGHT VALIDATION ---
        this.validateTemplate(urlStr, baseUrl);

        urlStr = urlStr.replace(/\/{[^}]*}/g, '') // Remove /{optional}
        urlStr = urlStr.replace(/{[^}]*}/g, '')    // Remove {optional}

        return new URL(urlStr)
    }

    /**
     * Pre-flight Validation: Ensure no required {tokens} remain in the final string
     */
    private static validateTemplate(processedUrl: string, baseUrl: string): void {
        const remainingTokens = processedUrl.match(/{([^}]+)}/g);
        if (remainingTokens) {
            // Filter out tokens that are likely optional (e.g., operator if we allow it to be empty)
            const requiredTokens = remainingTokens.filter(t => !t.includes('?'));

            if (requiredTokens.length > 0) {
                const missing = requiredTokens.join(', ');
                throw new Error(`[REQUEST_BUILDER] Missing required parameters for provider API: ${missing}. Check configuration for Base URL: ${baseUrl}`);
            }
        }
    }

    /**
     * Resolve Query Parameters including variable substitution ($var|fallback)
     */
    static resolveQueryParams(
        configParams: Record<string, string> | undefined,
        runtimeParams: Record<string, any>,
        authKey: string,
        authType: string,
        authQueryParam?: string,
        method: string = 'GET'
    ): URLSearchParams {
        const query = new URLSearchParams()
        const handledKeys = new Set<string>()

        // 1. Process Configured Params
        if (configParams) {
            for (const [paramName, template] of Object.entries(configParams)) {
                if (typeof template !== 'string') continue

                if (template.startsWith('$')) {
                    // Variable substitution: $var1|var2|fallback
                    const parts = template.substring(1).split('|').map(s => s.trim())
                    let resolved: string | undefined

                    for (const varName of parts) {
                        if (runtimeParams[varName] !== undefined && runtimeParams[varName] !== null) {
                            resolved = String(runtimeParams[varName])
                            handledKeys.add(varName)
                            break
                        }
                    }

                    if (resolved !== undefined) {
                        query.append(paramName, resolved)
                    }
                } else {
                    // Static value
                    query.append(paramName, template)
                }
            }
        }

        // 2. Add Auth param if needed
        if (authType === 'query_param' && authQueryParam && authKey) {
            query.append(authQueryParam, authKey)
        }

        // 3. Auto-append remaining runtime params for GET requests
        if (method === 'GET') {
            for (const [key, value] of Object.entries(runtimeParams)) {
                // Skip if handled or special
                if (handledKeys.has(key)) continue
                // Skip if already set
                if (query.has(key)) continue

                query.append(key, String(value))
            }
        }

        return query
    }

    /**
     * Build Headers including Auth
     */
    static buildHeaders(
        configHeaders: Record<string, string> | undefined,
        authType: string,
        authKey: string,
        authHeader?: string,
        originStub: string = 'http://localhost'
    ): Record<string, string> {
        const headers: Record<string, string> = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Referer': originStub,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...configHeaders
        }

        if (authType === 'bearer' && authKey) {
            headers['Authorization'] = `Bearer ${authKey}`
        } else if (authType === 'header' && authHeader && authKey) {
            headers[authHeader] = authKey
        }

        return headers
    }
}
