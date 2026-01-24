import { prisma } from '@/lib/core/db'

export type AuditAction =
    | 'PROVIDER_CREATE'
    | 'PROVIDER_UPDATE'
    | 'PROVIDER_DELETE'
    | 'PROVIDER_TOGGLE'
    | 'PROVIDER_PAUSE'
    | 'PROVIDER_RESUME'
    | 'USER_BAN'
    | 'USER_UNBAN'
    | 'WALLET_TOPUP'
    | 'SYNC_TRIGGERED'
    | 'SETTINGS_CHANGE'
    // Command Center Actions
    | 'ADMIN_RETRY_JOBS'
    | 'ADMIN_MARK_INCIDENT'
    | 'ADMIN_RESOLVE_INCIDENT'
    | 'ADMIN_EXPORT_DATA'
    // Inventory Management
    | 'UNHIDE_COUNTRY' | 'HIDE_COUNTRY' | 'DELETE_COUNTRY' | 'DELETE_COUNTRY_PERMANENT' | 'UPDATE_COUNTRY'
    | 'UNHIDE_SERVICE' | 'HIDE_SERVICE' | 'DELETE_SERVICE' | 'DELETE_SERVICE_PERMANENT' | 'UPDATE_SERVICE'
    | `BULK_${string}_COUNTRIES` | `BULK_${string}_SERVICES`

interface AuditLogParams {
    userId: string
    action: AuditAction
    resourceType?: string
    resourceId?: string
    metadata?: Record<string, any>
    ipAddress?: string
}

/**
 * Log an admin action to the audit trail.
 * Call this after any sensitive admin operation.
 * 
 * @example
 * await logAdminAction({
 *     userId: auth.userId,
 *     action: 'PROVIDER_CREATE',
 *     resourceType: 'Provider',
 *     resourceId: newProvider.id,
 *     metadata: { name: newProvider.name }
 * })
 */
export async function logAdminAction({
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress
}: AuditLogParams): Promise<void> {
    try {
        // Check if user exists to prevent FK violation
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })

        if (!userExists) {
            console.warn(`[AuditLog] Skipped logging for non-existent userId: ${userId}`)
            return
        }

        await prisma.auditLog.create({
            data: {
                userId,
                action,
                resourceType,
                resourceId,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
                ipAddress
            }
        })
    } catch (error) {
        // Don't fail the main operation if logging fails
        console.error('[AuditLog] Failed to log action:', error)
    }
}

/**
 * Get IP address from request headers.
 */
export function getClientIP(request: Request): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || '127.0.0.1'
}
