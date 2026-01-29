import { headers } from 'next/headers'
import { getCurrentUser, TokenPayload } from './jwt'
import { ResponseFactory } from '@/lib/api/response-factory'

/**
 * Unified Auth Guard (Industrial Edition)
 * 
 * Centralizes all authentication and authorization logic for API routes.
 * Uses high-performance session caching and standardized ResponseFactory.
 */

export class AuthGuard {
    /**
     * Requirement: Authenticated User
     */
    static async requireUser(): Promise<{ user: TokenPayload; error: null } | { user: null; error: Response }> {
        const headerStore = await headers()
        const user = await getCurrentUser(headerStore)

        if (!user) {
            return {
                user: null,
                error: ResponseFactory.error('Authentication required', 401, 'E_UNAUTHORIZED')
            }
        }

        return { user, error: null }
    }

    /**
     * Requirement: Admin Privileges
     */
    static async requireAdmin(): Promise<{ user: TokenPayload; error: null } | { user: null; error: Response }> {
        const { user, error } = await this.requireUser()

        if (error) return { user: null, error }

        if (user.role !== 'ADMIN') {
            return {
                user: null,
                error: ResponseFactory.error('Admin privileges required', 403, 'E_FORBIDDEN')
            }
        }

        return { user, error: null }
    }

    /**
     * Requirement: Verified Email
     */
    static async requireVerifiedEmail(): Promise<{ user: TokenPayload; error: null } | { user: null; error: Response }> {
        const { user, error } = await this.requireUser()

        if (error) return { user: null, error }

        if (!user.emailVerified) {
            return {
                user: null,
                error: ResponseFactory.error('Email verification required', 403, 'E_EMAIL_NOT_VERIFIED')
            }
        }

        return { user, error: null }
    }
}

/**
 * Data Protection Helpers
 */
export function redactProviderSecrets<T extends Record<string, any>>(provider: T) {
    const { authKey, ...safeProvider } = provider
    return safeProvider
}

export function redactProvidersSecrets<T extends Record<string, any>>(providers: T[]) {
    return providers.map(redactProviderSecrets)
}
