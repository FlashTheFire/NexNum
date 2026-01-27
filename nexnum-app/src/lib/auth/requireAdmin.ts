import { AuthGuard } from './guard'

/**
 * Legacy Admin Guard Shim
 * Restored for backward compatibility while routing to new industrial Guard.
 */
export async function requireAdmin(request: Request) {
    const { user, error } = await AuthGuard.requireAdmin()
    if (error) return { error }
    return { userId: user.userId, email: user.email }
}

export async function checkAdmin(request: Request) {
    const { user, error } = await AuthGuard.requireAdmin()
    if (error) return null
    return { userId: user.userId, email: user.email }
}

export function redactProviderSecrets<T extends Record<string, any>>(provider: T) {
    const { authKey, ...safeProvider } = provider
    return safeProvider
}

export function redactProvidersSecrets<T extends Record<string, any>>(providers: T[]) {
    return providers.map(redactProviderSecrets)
}