/**
 * Audit Logger
 * 
 * Centralized audit logging for sensitive actions.
 * Logs to database for compliance and security review.
 */

import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// Audit action types
export type AuditAction =
    | 'USER_LOGIN'
    | 'USER_LOGOUT'
    | 'PASSWORD_CHANGE'
    | 'PASSWORD_RESET'
    | 'API_KEY_CREATE'
    | 'API_KEY_DELETE'
    | 'API_KEY_REVOKE'
    | 'WALLET_TOPUP'
    | 'WALLET_REFUND'
    | 'WALLET_DEBIT'
    | 'PURCHASE_COMPLETE'
    | 'ADMIN_ACTION'
    | 'SETTINGS_CHANGE'
    | 'TWO_FACTOR_ENABLE'
    | 'TWO_FACTOR_DISABLE'
    | 'EMAIL_CHANGE'
    | 'ACCOUNT_DELETE'

export interface AuditLogEntry {
    action: AuditAction
    userId: string
    resourceType?: string
    resourceId?: string
    metadata?: Record<string, unknown>
    ipAddress?: string
}

/**
 * Log a sensitive action to the audit trail
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
    try {
        // Log to database
        await prisma.auditLog.create({
            data: {
                action: entry.action,
                userId: entry.userId,
                resourceType: entry.resourceType,
                resourceId: entry.resourceId,
                metadata: entry.metadata as any,
                ipAddress: entry.ipAddress
            }
        })

        // Also log to structured logger for real-time monitoring
        logger.info(`[AUDIT] ${entry.action}`, {
            userId: entry.userId,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            ip: entry.ipAddress
        })
    } catch (error: any) {
        // Never fail silently on audit logging
        logger.error('[AUDIT] Failed to log audit event', {
            action: entry.action,
            userId: entry.userId,
            error: error.message
        })
    }
}

/**
 * Query audit logs for a user
 */
export async function getAuditLogs(userId: string, limit: number = 50) {
    return prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
    })
}

/**
 * Query audit logs by action type
 */
export async function getAuditLogsByAction(action: AuditAction, limit: number = 100) {
    return prisma.auditLog.findMany({
        where: { action },
        orderBy: { createdAt: 'desc' },
        take: limit
    })
}
