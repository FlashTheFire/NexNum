
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function pruneAuditLogs() {
    console.log('🧹 Starting AuditLog pruning...')

    // Cutoff: 90 days ago
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)

    try {
        const { count } = await prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: cutoffDate
                }
            }
        })

        console.log(`✅ Successfully pruned ${count} old audit logs created before ${cutoffDate.toISOString()}`)
    } catch (error) {
        console.error('❌ Failed to prune logs:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

// Execute if run directly
if (require.main === module) {
    pruneAuditLogs()
}
