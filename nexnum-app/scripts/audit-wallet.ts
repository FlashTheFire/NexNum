/**
 * Audit Wallet Script
 * 
 * Verifies that every user's wallet balance equals the sum of their transactions.
 * Usage: npx ts-node scripts/audit-wallet.ts
 */

import { prisma } from '../src/lib/db'
import { Prisma } from '@prisma/client'

async function run() {
    console.log('Starting Wallet Audit...')

    // 1. Get all wallets
    const wallets = await prisma.wallet.findMany({
        include: { transactions: true }
    })

    console.log(`Checking ${wallets.length} wallets...`)
    let discrepancies = 0

    for (const wallet of wallets) {
        // Calculate expected balance from transactions
        const expectedBalance = wallet.transactions.reduce((acc, tx) => {
            return acc.add(new Prisma.Decimal(tx.amount))
        }, new Prisma.Decimal(0))

        const actualBalance = new Prisma.Decimal(wallet.balance)

        if (!actualBalance.equals(expectedBalance)) {
            console.error(`[MISMATCH] Wallet ${wallet.id} (User ${wallet.userId})`)
            console.error(`  Expected: ${expectedBalance.toFixed(2)}`)
            console.error(`  Actual:   ${actualBalance.toFixed(2)}`)
            console.error(`  Diff:     ${actualBalance.sub(expectedBalance).toFixed(2)}`)
            discrepancies++
        }
    }

    if (discrepancies === 0) {
        console.log('✅ Audit Passed: All wallets consistent.')
    } else {
        console.error(`❌ Audit Failed: ${discrepancies} wallets mismatch.`)
        process.exit(1)
    }
    process.exit(0)
}

run().catch(e => {
    console.error(e)
    process.exit(1)
})
