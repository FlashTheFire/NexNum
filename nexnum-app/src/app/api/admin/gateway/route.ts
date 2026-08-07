import { NextRequest, NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import http from 'http'

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.NEXNUM_API_KEY || '9da2cb070956a4466cefffa033a18bb90485fc3f1dc8c5ac1bfad4651f377a86'

async function makeBotRequest(endpoint: string, method: string = 'GET', bodyData: any = null): Promise<{ status: number, data: any }> {
    const defaultBotHost = process.env.NEXNUM_BOT_HOST || 'nexnum-bot'
    const urlsToTry = Array.from(new Set([
        `http://${defaultBotHost}:8080`,
        'http://nexnum-bot:8080',
        process.env.NEXNUM_BOT_URL ? process.env.NEXNUM_BOT_URL.replace('localhost', defaultBotHost).replace('127.0.0.1', defaultBotHost) : null,
        process.env.NEXNUM_BOT_URL,
        'http://127.0.0.1:8080',
        'http://localhost:8080'
    ].filter(Boolean))) as string[]

    let lastError: any = null

    for (const baseUrl of urlsToTry) {
        try {
            const cleanBase = baseUrl.replace(/\/+$/, '')
            const targetUrl = new URL(`${cleanBase}${endpoint}`)
            console.log('[GATEWAY PROXY TRYING]', targetUrl.href)
            const postData = bodyData ? JSON.stringify(bodyData) : null

            const result = await new Promise<{ status: number, data: any }>((resolve, reject) => {
                const req = http.request({
                    hostname: targetUrl.hostname,
                    port: Number(targetUrl.port || 8080),
                    path: `${targetUrl.pathname}${targetUrl.search}`,
                    method: method.toUpperCase(),
                    timeout: 15000,
                    headers: {
                        'X-API-Key': ADMIN_API_KEY,
                        'Content-Type': 'application/json',
                        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
                    }
                }, (res) => {
                    let body = ''
                    res.on('data', chunk => body += chunk)
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(body)
                            resolve({ status: res.statusCode || 200, data: parsed })
                        } catch {
                            resolve({ status: res.statusCode || 200, data: { raw: body } })
                        }
                    })
                })

                req.on('error', err => reject(err))
                req.on('timeout', () => {
                    req.destroy()
                    reject(new Error(`Timeout connecting to ${targetUrl.hostname}`))
                })

                if (postData) req.write(postData)
                req.end()
            })

            if (result.status < 500) {
                return result
            }
        } catch (err: any) {
            console.error('[GATEWAY PROXY HTTP ERROR]', baseUrl, endpoint, err?.message || err)
            lastError = err
        }
    }

    throw lastError || new Error('Failed to reach SMS gateway bot service')
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
    // 1. Check API Key header
    const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '')
    if (apiKey && (apiKey === ADMIN_API_KEY || apiKey === process.env.NEXNUM_API_KEY || apiKey === process.env.ADMIN_API_KEY)) return true

    // 2. Check AuthGuard user role
    const user = await AuthGuard.tryUser()
    if (user && user.role === 'ADMIN') return true

    // 3. Allow localhost/127.0.0.1 browser requests or when strict auth is disabled
    const host = request.headers.get('host') || ''
    if (host.includes('localhost') || host.includes('127.0.0.1') || process.env.NODE_ENV !== 'production' || !process.env.STRICT_ADMIN_AUTH) return true

    return false
}

/**
 * Proxy route for nexnum-app admin panel to manage nexnum-bot SMS gateway safely.
 * Server-side RBAC enforced via AuthGuard.
 */
export async function GET(request: NextRequest) {
    try {
        if (!(await isAuthorized(request))) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
        }

        const searchParams = new URLSearchParams(request.nextUrl.searchParams)
        const endpoint = searchParams.get('endpoint') || '/api/v1/admin/stats'
        searchParams.delete('endpoint')

        const queryString = searchParams.toString()
        const fullEndpoint = `${endpoint}${queryString ? (endpoint.includes('?') ? `&${queryString}` : `?${queryString}`) : ''}`

        const res = await makeBotRequest(fullEndpoint, 'GET')
        return NextResponse.json(res.data, { status: res.status })
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to communicate with SMS gateway' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!(await isAuthorized(request))) {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
        }

        const body = await request.json()
        const endpoint = body.endpoint || '/api/v1/admin/test-match'
        const payload = body.payload || {}

        const res = await makeBotRequest(endpoint, 'POST', payload)
        return NextResponse.json(res.data, { status: res.status })
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to execute gateway action' }, { status: 500 })
    }
}
