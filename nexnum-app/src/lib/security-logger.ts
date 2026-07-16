import { prisma } from '@/lib/core/db'

export class SecurityLog {
  static async logSecurityEvent(data: {
    eventType: string
    ipAddress: string
    details?: string
    userId?: string
  }) {
    await prisma.auditLog.create({
      data: {
        action: data.eventType,
        ipAddress: data.ipAddress,
        metadata: data.details ? { details: data.details } : undefined,
        userId: data.userId,
      }
    })
  }
}