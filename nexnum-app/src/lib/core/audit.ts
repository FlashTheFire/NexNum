import { prisma } from '@/lib/core/db';
import { logger } from '@/lib/core/logger';

export type AuditAction =
    | 'USER_LOGIN'
    | 'USER_REGISTER'
    | 'PASSWORD_CHANGE'
    | 'API_KEY_CREATE'
    | 'API_KEY_REVOKE'
    | 'WEBHOOK_CREATE'
    | 'WEBHOOK_UPDATE'
    | 'WALLET_DEPOSIT'
    | 'NUMBER_PURCHASE'
    | 'NUMBER_CANCEL'
    | 'ADMIN_ACTION';

export const auditLogger = {
    /**
     * Log a security or business-critical action
     */
    log: async (
        userId: string,
        action: AuditAction,
        metadata: Record<string, any> = {},
        ipAddress?: string
    ) => {
        try {
            await prisma.auditLog.create({
                data: {
                    userId,
                    action,
                    ipAddress: ipAddress || 'unknown',
                    metadata: metadata,
                    resourceType: metadata.resourceType,
                    resourceId: metadata.resourceId
                }
            });
        } catch (error) {
            // Never block the main flow if logging fails
            logger.error('Failed to write audit log', { userId, action, error });
        }
    }
};
