
import { prisma as db } from '@/lib/core/db'

export type AuditAction =
    | 'BUY_NUMBER'
    | 'CANCEL_NUMBER'
    | 'CREATE_API_KEY'
    | 'REVOKE_API_KEY'
    | 'UPDATE_SETTINGS'
    | 'TOPUP_WALLET'
    | 'LOGIN'
    | 'LOGOUT'
    | 'SYSTEM_ACTION'

export interface AuditContext {
    ipAddress?: string
    userAgent?: string
    [key: string]: any
}

/**
 * Creates an immutable audit log entry.
 * Fire-and-forget (non-blocking) in most cases.
 */
export async function logAudit(
    userId: string | undefined | null,
    action: AuditAction | string,
    resource: { type: string; id: string },
    context?: AuditContext
) {
    try {
        await db.auditLog.create({
            data: {
                userId: userId || null,
                action,
                resourceType: resource.type,
                resourceId: resource.id,
                metadata: context ? (context as any) : undefined,
                ipAddress: context?.ipAddress,
            }
        })
    } catch (error) {
        // Fallback to console error if audit logging fails
        // We don't want to crash the main transaction usually
        console.error('FAILED TO WRITE AUDIT LOG:', error)
    }
}
