import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// Mock redis before importing the module under test
vi.mock('@/lib/core/redis', () => ({
    redis: {
        exists: vi.fn(),
        set: vi.fn()
    }
}))

import { validateRequestSignature, getSigningInstructions } from '@/lib/security/request-signing'
import { redis } from '@/lib/core/redis'

const mockedRedis = redis as unknown as {
    exists: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
}

const SIGNING_SECRET = process.env.REQUEST_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-signing-secret'

function makeHeaders(record: Record<string, string>): Headers {
    const h = new Headers()
    for (const [k, v] of Object.entries(record)) h.set(k, v)
    return h
}

function signHeaders(opts: {
    timestamp?: number
    nonce?: string
    method?: string
    path?: string
    body?: string
    secret?: string
}): { headers: Headers; signature: string; timestamp: number; nonce: string } {
    const timestamp = opts.timestamp ?? Date.now()
    const nonce = opts.nonce ?? `nonce-${Math.random().toString(36).slice(2)}`
    const method = (opts.method ?? 'POST').toUpperCase()
    const path = opts.path ?? '/api/test'
    const body = opts.body ?? ''
    const secret = opts.secret ?? SIGNING_SECRET

    const bodyHash = createHmac('sha256', '') // we'll redo it via crypto
    // Use the same canonicalHashBody approach: sha256(body) hex
    const crypto = require('crypto')
    const bodyHashHex = body ? crypto.createHash('sha256').update(body).digest('hex') : ''

    const payload = `${timestamp}.${nonce}.${method}.${path}.${bodyHashHex}`
    const sig = createHmac('sha256', secret).update(payload).digest('hex')

    return {
        headers: makeHeaders({
            'x-signature': sig,
            'x-timestamp': String(timestamp),
            'x-nonce': nonce,
        }),
        signature: sig,
        timestamp,
        nonce,
    }
}

beforeEach(() => {
    mockedRedis.exists.mockReset()
    mockedRedis.set.mockReset()
    mockedRedis.exists.mockResolvedValue(0) // nonce unused
    mockedRedis.set.mockResolvedValue('OK')
})

// ---------------------------------------------------------------------------
// validateRequestSignature
// ---------------------------------------------------------------------------

describe('validateRequestSignature', () => {
    it('rejects when x-signature header is missing', async () => {
        const h = makeHeaders({ 'x-timestamp': String(Date.now()), 'x-nonce': 'abc' })
        const r = await validateRequestSignature(h, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('Identity headers missing')
    })

    it('rejects when x-timestamp header is missing', async () => {
        const h = makeHeaders({ 'x-signature': 'sig', 'x-nonce': 'abc' })
        const r = await validateRequestSignature(h, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('Identity headers missing')
    })

    it('rejects when x-nonce header is missing', async () => {
        const h = makeHeaders({ 'x-signature': 'sig', 'x-timestamp': String(Date.now()) })
        const r = await validateRequestSignature(h, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('Identity headers missing')
    })

    it('rejects when timestamp is too old (> 5 min drift)', async () => {
        const old = Date.now() - 6 * 60 * 1000
        const { headers } = signHeaders({ timestamp: old })
        const r = await validateRequestSignature(headers, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('expired')
    })

    it('rejects when timestamp is non-numeric', async () => {
        const h = makeHeaders({
            'x-signature': 'a'.repeat(64),
            'x-timestamp': 'not-a-number',
            'x-nonce': 'n',
        })
        const r = await validateRequestSignature(h, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('expired')
    })

    it('rejects when nonce has already been used (replay attack)', async () => {
        mockedRedis.exists.mockResolvedValue(1) // nonce already used
        const { headers } = signHeaders({})
        const r = await validateRequestSignature(headers, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('already consumed')
    })

    it('rejects when signature is wrong', async () => {
        const { headers } = signHeaders({})
        headers.set('x-signature', 'a'.repeat(64)) // wrong sig of correct length
        const r = await validateRequestSignature(headers, 'POST', '/api/test')
        expect(r.valid).toBe(false)
        expect(r.error).toContain('Identity verification failed')
    })

    it('rejects when signature has wrong length (no timing-safe equiv crash)', async () => {
        const { headers } = signHeaders({})
        headers.set('x-signature', 'short')
        const r = await validateRequestSignature(headers, 'POST', '/api/test')
        expect(r.valid).toBe(false)
    })

    it('rejects when signed with a different secret', async () => {
        const { headers } = signHeaders({ secret: 'attacker-secret' })
        const r = await validateRequestSignature(headers, 'POST', '/api/test')
        expect(r.valid).toBe(false)
    })

    it('rejects when method does not match the signed payload', async () => {
        const { headers } = signHeaders({ method: 'POST' })
        const r = await validateRequestSignature(headers, 'GET', '/api/test')
        expect(r.valid).toBe(false)
    })

    it('rejects when path does not match the signed payload', async () => {
        const { headers } = signHeaders({ path: '/api/test' })
        const r = await validateRequestSignature(headers, 'POST', '/api/other')
        expect(r.valid).toBe(false)
    })

    it('rejects when body does not match the signed payload', async () => {
        const { headers } = signHeaders({ body: '{"a":1}' })
        const r = await validateRequestSignature(headers, 'POST', '/api/test', '{"a":2}')
        expect(r.valid).toBe(false)
    })

    it('accepts a correctly signed request and consumes the nonce', async () => {
        const { headers } = signHeaders({})
        const r = await validateRequestSignature(headers, 'POST', '/api/test')
        expect(r.valid).toBe(true)
        expect(mockedRedis.set).toHaveBeenCalledWith(
            expect.stringContaining('security:nonce:'),
            '1',
            'EX',
            600
        )
    })

    it('accepts a correctly signed request with body', async () => {
        const { headers } = signHeaders({ body: '{"x":1}' })
        const r = await validateRequestSignature(headers, 'POST', '/api/test', '{"x":1}')
        expect(r.valid).toBe(true)
    })

    it('accepts object bodies (canonicalized by key sort)', async () => {
        // Sign with body object - the server should canonicalize keys
        const timestamp = Date.now()
        const nonce = 'obj-nonce-123'
        const crypto = require('crypto')

        // Build payload same way as the module: hash of JSON.stringify with sorted keys
        const bodyObj = { b: 2, a: 1 }
        const sortedBody = JSON.stringify(bodyObj, Object.keys(bodyObj).sort())
        const bodyHash = crypto.createHash('sha256').update(sortedBody).digest('hex')
        const payload = `${timestamp}.${nonce}.POST./api/test.${bodyHash}`
        const sig = createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex')

        const headers = makeHeaders({
            'x-signature': sig,
            'x-timestamp': String(timestamp),
            'x-nonce': nonce,
        })
        const r = await validateRequestSignature(headers, 'POST', '/api/test', bodyObj)
        expect(r.valid).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// getSigningInstructions
// ---------------------------------------------------------------------------

describe('getSigningInstructions', () => {
    it('returns the expected shape', () => {
        const i = getSigningInstructions()
        expect(i.algorithm).toBe('HMAC-SHA256')
        expect(i.headers.signature).toBe('x-signature')
        expect(i.headers.timestamp).toBe('x-timestamp')
        expect(i.headers.nonce).toBe('x-nonce')
        expect(i.payload).toBe('timestamp.nonce.METHOD.path.bodyHash')
        expect(i.drift).toBe('300s')
    })
})
