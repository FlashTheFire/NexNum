
import 'dotenv/config'
import { prisma } from '@/lib/core/db'

const BATCH_SIZE = 1000
const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '90', 10)

async function main() {
    console.log('🧹 Starting Audit Log Cleanup...')
    console.log(`   Retention Policy: ${RETENTION_DAYS} days`)

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)
    console.log(`   Cutoff Date: ${cutoffDate.toISOString()}`)

    let totalDeleted = 0
    let hasMore = true

    while (hasMore) {
        try {
            // Find IDs to delete first to avoid long locked transactions on large tables
            // OR just use deleteMany with limit if Prisma supports it (it doesn't directly support limit in deleteMany)
            // Strategy: Find IDs, then delete.

            const logsToDelete = await prisma.auditLog.findMany({
                where: { createdAt: { lt: cutoffDate } },
                select: { id: true },
                take: BATCH_SIZE
            })

            if (logsToDelete.length === 0) {
                hasMore = false
                break
            }

            const ids = logsToDelete.map(l => l.id)
            const { count } = await prisma.auditLog.deleteMany({
                where: { id: { in: ids } }
            })

            totalDeleted += count
            process.stdout.write(`   Deleted ${totalDeleted} logs...\r`)

            // Small pause to let DB breathe
            await new Promise(r => setTimeout(r, 100))

        } catch (error) {
            console.error('\n❌ Error during cleanup batch:', error)
            hasMore = false
            // In cron, we might want to exit(1), but logging is usually enough
        }
    }

    console.log(`\n✅ Audit Log Cleanup Complete. Removed ${totalDeleted} records.`)
    process.exit(0)
}

main()
