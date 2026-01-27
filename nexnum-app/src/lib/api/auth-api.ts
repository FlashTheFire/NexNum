/**
 * Auth API (Industrial Edition)
 * 
 * Proxies auth requests to the unified NexNumClient.
 * Benefit: Automatic CSRF, Correlation IDs, and Normalized Error Handling.
 */

import { api } from './api-client'

export async function login(data: any) {
    const res = await api.login(data)
    if (!res.success) {
        throw new Error(res.error || 'Login failed')
    }
    return res.data
}

export async function register(data: any) {
    const res = await api.register(data)
    if (!res.success) {
        throw new Error(res.error || 'Registration failed')
    }
    return res.data
}
