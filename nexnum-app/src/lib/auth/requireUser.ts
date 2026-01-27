import { AuthGuard } from './guard'

/**
 * Legacy User Guard Shim
 * Restored for backward compatibility while routing to new industrial Guard.
 */
export async function requireUser(request: Request) {
    const { user, error } = await AuthGuard.requireUser()
    if (error) return { userId: null, error }
    return { userId: user.userId, error: null }
}