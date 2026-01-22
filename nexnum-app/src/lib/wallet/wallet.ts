import { prisma } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { wallet_transactions_total } from '@/lib/metrics'

export class WalletService {
    /**
     * Get user's current available balance (Balance - Reserved)
     */
    static async getBalance(userId: string): Promise<number> {
        const wallet = await prisma.wallet.findUnique({
            where: { userId },
            select: { balance: true, reserved: true }
        })

        if (!wallet) return 0

        // Available = Balance - Reserved
        const available = wallet.balance.sub(wallet.reserved)
        return available.toNumber()
    }

    /**
     * Phase 1: Reserve Funds
     * Checks (Balance - Reserved) >= Amount
     * Adds to 'reserved' field.
     */
    static async reserve(
        userId: string,
        amount: number,
        refId: string, // e.g. PurchaseOrder ID
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        const decAmount = new Prisma.Decimal(amount)

        // 1. LOCK the wallet row to prevent race conditions (SELECT FOR UPDATE)
        // Only works if inside a transaction.
        if (tx) {
            // Prisma doesn't have native waitForUpdate. We use raw query if postgres.
            await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`
        }

        // 2. Read Fresh State (Logged)
        const wallet = await client.wallet.findUnique({
            where: { userId },
            select: { id: true, balance: true, reserved: true }
        })
        if (!wallet) throw new Error('Wallet not found')

        // 3. Check availability
        const liquid = wallet.balance.sub(wallet.reserved)
        if (liquid.lessThan(decAmount)) {
            throw new Error('Insufficient funds')
        }

        // 4. Update
        await client.wallet.update({
            where: { id: wallet.id },
            data: {
                reserved: { increment: decAmount }
            }
        })

        // Log "Reservation" transaction? 
        // User diagram implies INSERT Purchase, and UPDATE Wallet.
        // It doesn't explicitly show a WalletTransaction for reservation "hold", 
        // but it's good practice to log it or at least relying on PurchaseOrder.
        // We'll stick to updating the numeric field as requested.
        return wallet.id
    }

    /**
     * Phase 2: Commit (Confirm Purchase)
     * Decrements 'reserved' and 'balance'.
     * Creates final 'purchase' transaction.
     */
    static async commit(
        userId: string,
        amount: number,
        refId: string, // Number ID
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        const decAmount = new Prisma.Decimal(amount)

        // Get wallet with full state for guards
        const wallet = await client.wallet.findUnique({
            where: { userId },
            select: { id: true, balance: true, reserved: true }
        })
        if (!wallet) throw new Error('Wallet not found')

        // GUARD: Check reserved amount (warn but don't block - handles race conditions)
        if (wallet.reserved.lessThan(decAmount)) {
            console.warn(`[Wallet] WARN: Reserved (${wallet.reserved}) < Commit (${decAmount}). Proceeding anyway.`)
            // Don't throw - this can happen with concurrent transactions
            // The balance check below is the critical guard
        }

        // GUARD: Balance must be >= amount being committed (CRITICAL)
        if (wallet.balance.lessThan(decAmount)) {
            throw new Error('WALLET_INTEGRITY: Balance is less than commit amount')
        }

        // Calculate decrement amounts (cap to actual reserved to prevent negative)
        const reservedDecrement = wallet.reserved.lessThan(decAmount)
            ? wallet.reserved
            : decAmount

        // Atomic Confirm
        await client.wallet.update({
            where: { id: wallet.id },
            data: {
                reserved: { decrement: reservedDecrement },
                balance: { decrement: decAmount }
            }
        })

        // Log Transaction
        const transaction = await client.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: decAmount.negated(),
                type: 'purchase', // Final record
                description,
                idempotencyKey,
                metadata: { refId } // Store Number ID
            }
        })

        wallet_transactions_total.labels('purchase', 'success').inc()
        return transaction
    }

    /**
     * Phase 2 (Fail): Rollback Reservation
     * Decrements 'reserved' only. Balance stays same.
     */
    static async rollback(
        userId: string,
        amount: number,
        refId: string, // PurchaseOrder ID
        description: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        const decAmount = new Prisma.Decimal(amount)

        const wallet = await client.wallet.findUnique({ where: { userId }, select: { id: true } })
        if (!wallet) throw new Error('Wallet not found')

        await client.wallet.update({
            where: { id: wallet.id },
            data: {
                reserved: { decrement: decAmount }
            }
        })
        wallet_transactions_total.labels('purchase_rollback', 'success').inc()
        // No transaction log for rollback usually, unless we track failed attempts.
    }

    /**
     * Charge a user's wallet ... (Legacy / Single Step)
     */
    static async charge(
        userId: string,
        amount: number,
        type: 'number_purchase' | 'subscription_purchase' | 'manual_debit',
        refId: string, // External reference ID (e.g., numberId, subscriptionId)
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient // Optional external transaction
    ) {
        const client = tx || prisma;

        // 1. Idempotency Check
        if (idempotencyKey) {
            const existing = await client.walletTransaction.findUnique({
                where: { idempotencyKey }
            })
            if (existing) {
                console.log(`[Wallet] Idempotent request merged: ${idempotencyKey}`)
                return existing
            }
        }

        // 2. Get Wallet ID (and check existence)
        const wallet = await client.wallet.findUnique({
            where: { userId },
            select: { id: true, balance: true }
        })

        if (!wallet) {
            // Should verify user exists and create wallet? 
            // Ideally wallet is ensured before, but let's stick to safe logic.
            // If we rely on ensureWallet happening before, we assume it exists.
            throw new Error('Wallet not found for user')
        }

        // 3. Perform Charge (Atomic Update)
        // Check constraint handled via Query logic
        const decAmount = new Prisma.Decimal(amount);

        // Using updateMany to support "where balance >= amount" logic if we wanted, 
        // but since we are targeting a unique ID (wallet.id), `update` is better IF we verify balance.
        // Prisma `update` allows atomic `decrement`.
        // To be SAFE from race conditions (without independent reads), we use:
        // UPDATE "Wallet" SET "balance" = "balance" - X WHERE "id" = Y AND "balance" >= X
        // Prisma `updateMany` supports this filter.

        const result = await client.wallet.updateMany({
            where: {
                id: wallet.id,
                balance: { gte: decAmount } // Ensure sufficient funds
            },
            data: {
                balance: { decrement: decAmount }
            }
        })

        if (result.count === 0) {
            // Either wallet missing (unlikely since we found it) or insufficient funds
            throw new Error('Insufficient funds')
        }

        // 4. Record Transaction
        const transaction = await client.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: decAmount.negated(), // stored as negative
                type,
                description,
                idempotencyKey
            }
        })

        return transaction
    }

    /**
     * Refund a user (e.g., cancelled number).
     */
    static async refund(
        userId: string,
        amount: number, // Keep number, convert to Decimal inside
        type: 'refund' | 'manual_credit',
        refId: string,
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma

        if (idempotencyKey) {
            const existing = await client.walletTransaction.findUnique({ where: { idempotencyKey } })
            if (existing) return existing
        }

        // Verify Wallet exists
        const wallet = await client.wallet.findUnique({
            where: { userId },
            select: { id: true }
        })
        if (!wallet) throw new Error('Wallet not found')

        const decAmount = new Prisma.Decimal(amount);

        // 1. Create Credit Transaction
        const transaction = await client.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: decAmount, // Positive
                type,
                description,
                idempotencyKey
            }
        })

        // 2. Increment Balance
        await client.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { increment: decAmount }
            }
        })

        return transaction
    }
    /**
     * Credit a user's wallet (Top-Up).
     * Atomically increments balance and records transaction.
     */
    static async credit(
        userId: string,
        amount: number,
        type: 'topup' | 'manual_credit' | 'referral_bonus',
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        const decAmount = new Prisma.Decimal(amount)

        if (idempotencyKey) {
            const existing = await client.walletTransaction.findUnique({ where: { idempotencyKey } })
            if (existing) return existing
        }

        // Verify Wallet exists
        const wallet = await client.wallet.findUnique({
            where: { userId },
            select: { id: true }
        })
        if (!wallet) throw new Error('Wallet not found')

        // 1. Increment Balance
        await client.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { increment: decAmount }
            }
        })

        // 2. Create Credit Transaction
        const transaction = await client.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: decAmount, // Positive
                type,
                description,
                idempotencyKey
            }
        })

        wallet_transactions_total.labels(type, 'success').inc()
        return transaction
    }

    /**
     * Debit a user's wallet (Admin/Manual deduction).
     * Atomically decrements balance and records transaction.
     * Throws if insufficient funds.
     */
    static async debit(
        userId: string,
        amount: number,
        type: 'manual_debit' | 'item_purchase',
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        const decAmount = new Prisma.Decimal(amount)

        if (idempotencyKey) {
            const existing = await client.walletTransaction.findUnique({ where: { idempotencyKey } })
            if (existing) return existing
        }

        // Verify Wallet exists
        const wallet = await client.wallet.findUnique({
            where: { userId },
            select: { id: true, balance: true }
        })
        if (!wallet) throw new Error('Wallet not found')

        if (wallet.balance.lessThan(decAmount)) {
            throw new Error('Insufficient funds')
        }

        // 1. Decrement Balance
        await client.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { decrement: decAmount }
            }
        })

        // 2. Create Debit Transaction
        const transaction = await client.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: decAmount.negated(),
                type,
                description,
                idempotencyKey
            }
        })

        wallet_transactions_total.labels(type, 'success').inc()
        return transaction
    }
}
