
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
    console.log('🗑️  Starting User Data Cleanup...')

    try {
        // 1. Delete dependent records (Audit Logs)
        const deletedLogs = await prisma.auditLog.deleteMany({})
        console.log(`- Deleted ${deletedLogs.count} audit logs`)

        // 2. Delete Offer Reservations (Required User FK)
        const deletedReservations = await prisma.offerReservation.deleteMany({})
        console.log(`- Deleted ${deletedReservations.count} reservations`)

        // 3. Delete Purchase Orders (Cascade should handle, but being safe)
        // actually deleteMany on User cascades to PurchaseOrder, so we skip explicit delete if cascade is on.
        // PurchaseOrder has onDelete: Cascade.

        // 4. Release Numbers (Set ownerId = null)
        const releasedNumbers = await prisma.number.updateMany({
            where: { ownerId: { not: null } },
            data: {
                ownerId: null,
                status: 'available',
                expiresAt: null,
                purchasedAt: null
            }
        })
        console.log(`- Released ${releasedNumbers.count} numbers`)

        // 5. Delete Users (Cascades to Wallet, Notifications, ApiKeys, etc.)
        const deletedUsers = await prisma.user.deleteMany({})
        console.log(`✅ Deleted ${deletedUsers.count} users and related data`)

    } catch (error) {
        console.error('❌ Data cleanup failed:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
