
async function getCsrfToken() {
    try {
        console.log('[AuthAPI] Fetching CSRF token...')
        const res = await fetch('/api/csrf', { cache: 'no-store' })
        if (!res.ok) {
            console.error('[AuthAPI] CSRF fetch failed status:', res.status)
            return null
        }
        const data = await res.json()
        console.log('[AuthAPI] CSRF token received:', data.token ? 'YES' : 'NO')
        return data.token
    } catch (e) {
        console.error('[AuthAPI] Failed to fetch CSRF token', e)
        return null
    }
}

export async function login(data: any) {
    const csrfToken = await getCsrfToken()

    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken || ''
        },
        body: JSON.stringify(data)
    })
    return handleResponse(res)
}

export async function register(data: any) {
    const csrfToken = await getCsrfToken()

    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken || ''
        },
        body: JSON.stringify(data)
    })
    return handleResponse(res)
}

async function handleResponse(res: Response) {
    const data = await res.json()
    if (!res.ok) {
        throw new Error(data.error || 'Something went wrong')
    }
    return data
}
