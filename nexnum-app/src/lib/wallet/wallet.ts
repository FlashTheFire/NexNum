import { prisma } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { wallet_transactions_total } from '@/lib/metrics'
import { EventDispatcher } from '@/lib/core/event-dispatcher'
import { FinancialSentinel } from './sentinel'
import { PaymentError } from '@/lib/payment/payment-errors'
import { logger } from '@/lib/core/logger'
import { WalletTransactionType } from './types'

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
        // Helper to execute the reservation logic
        const performReservation = async (client: Prisma.TransactionClient) => {
            const decAmount = new Prisma.Decimal(amount)

            // 1. LOCK the wallet row to prevent race conditions (SELECT FOR UPDATE)
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`

            // 2. ELITE INTEGRITY CHECK (Sentinel)
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(userId, client);
            if (!isIntegrityIntact) {
                throw PaymentError.integrityBreach(userId);
            }

            // 3. Read Fresh State
            const wallet = await client.wallet.findUnique({
                where: { userId },
                select: { id: true, balance: true, reserved: true }
            })
            if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

            // 3. Check availability
            const liquid = wallet.balance.sub(wallet.reserved)
            if (liquid.lessThan(decAmount)) {
                throw PaymentError.insufficientFunds()
            }

            // 4. Update
            await client.wallet.update({
                where: { id: wallet.id },
                data: {
                    reserved: { increment: decAmount }
                }
            })

            return wallet.id
        }

        // Use provided transaction OR create a new one to guarantee locking
        if (tx) {
            return performReservation(tx)
        } else {
            return prisma.$transaction(async (newTx) => {
                return performReservation(newTx)
            })
        }
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
        if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

        // GUARD: Check reserved amount (warn but don't block - handles race conditions)
        if (wallet.reserved.lessThan(decAmount)) {
            logger.warn('Reserved amount less than commit amount - proceeding', {
                reserved: wallet.reserved.toString(),
                commitAmount: decAmount.toString(),
                userId
            })
            // Don't throw - this can happen with concurrent transactions
            // The balance check below is the critical guard
        }

        // GUARD: Balance must be >= amount being committed (CRITICAL)
        if (wallet.balance.lessThan(decAmount)) {
            throw PaymentError.insufficientFunds('Commit failed: Balance less than amount')
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

        // LOW BALANCE ALERT (Enterprise Event)
        const finalBalance = wallet.balance.sub(decAmount)
        if (finalBalance.lessThan(10.0)) { // Standard threshold
            await EventDispatcher.dispatch(userId, 'balance.low', {
                balance: finalBalance.toNumber(),
                threshold: 10.0,
                currency: 'POINTS' // Default
            })
        }

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
        if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

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
     * Charge a user's wallet ... (Single Step)
     */
    static async charge(
        userId: string,
        amount: number,
        type: WalletTransactionType,
        refId: string,
        description: string,
        idempotencyKey?: string,
        tx?: Prisma.TransactionClient
    ) {
        const performCharge = async (client: Prisma.TransactionClient) => {
            const decAmount = new Prisma.Decimal(amount);

            // 1. Idempotency Check
            if (idempotencyKey) {
                const existing = await client.walletTransaction.findUnique({
                    where: { idempotencyKey }
                })
                if (existing) return existing;
            }

            // 2. LOCK and Get Wallet
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`

            const wallet = await client.wallet.findUnique({
                where: { userId },
                select: { id: true, balance: true }
            })
            if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

            // 3. Integrity Check
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(userId, client);
            if (!isIntegrityIntact) throw PaymentError.integrityBreach(userId);

            // 4. Check Funds
            if (wallet.balance.lessThan(decAmount)) {
                throw PaymentError.insufficientFunds()
            }

            // 5. Update Balance
            await client.wallet.update({
                where: { id: wallet.id },
                data: { balance: { decrement: decAmount } }
            })

            // 6. Record Transaction
            return await client.walletTransaction.create({
                data: {
                    walletId: wallet.id,
                    amount: decAmount.negated(),
                    type,
                    description,
                    idempotencyKey
                }
            })
        }

        return tx ? performCharge(tx) : prisma.$transaction(performCharge);
    }

    /**
     * Refund a user (e.g., cancelled number).
     */
    static async refund(
        userId: string,
        amount: number,
        type: WalletTransactionType,
        refId: string,
        description: string,
        idempotencyKey: string,
        tx?: Prisma.TransactionClient
    ) {
        const performRefund = async (client: Prisma.TransactionClient) => {
            const decAmount = new Prisma.Decimal(amount);

            if (idempotencyKey) {
                const existing = await client.walletTransaction.findUnique({ where: { idempotencyKey } })
                if (existing) return existing
            }

            // Lock and Get Wallet
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`
            const wallet = await client.wallet.findUnique({ where: { userId }, select: { id: true } })
            if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

            // Integrity Check
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(userId, client);
            if (!isIntegrityIntact) throw PaymentError.integrityBreach(userId);

            // 1. Increment Balance
            await client.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: decAmount } }
            })

            // 2. Create Refund Transaction
            return await client.walletTransaction.create({
                data: {
                    walletId: wallet.id,
                    amount: decAmount,
                    type,
                    description,
                    idempotencyKey
                }
            })
        }

        return tx ? performRefund(tx) : prisma.$transaction(performRefund);
    }
    /**
     * Credit a user's wallet (Top-Up).
     * Atomically increments balance and records transaction.
     */
    static async credit(
        userId: string,
        amount: number,
        type: WalletTransactionType,
        description: string,
        idempotencyKey: string,
        tx?: Prisma.TransactionClient
    ) {
        const performCredit = async (client: Prisma.TransactionClient) => {
            const decAmount = new Prisma.Decimal(amount)

            if (idempotencyKey) {
                const existing = await client.walletTransaction.findUnique({ where: { idempotencyKey } })
                if (existing) return existing
            }

            // Lock and Get Wallet
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`
            const wallet = await client.wallet.findUnique({ where: { userId }, select: { id: true } })
            if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

            // Integrity Check
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(userId, client);
            if (!isIntegrityIntact) throw PaymentError.integrityBreach(userId);

            // 1. Increment Balance
            await client.wallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: decAmount } }
            })

            // 2. Create Credit Transaction
            const transaction = await client.walletTransaction.create({
                data: {
                    walletId: wallet.id,
                    amount: decAmount,
                    type,
                    description,
                    idempotencyKey
                }
            })

            wallet_transactions_total.labels(type, 'success').inc()
            return transaction
        }

        return tx ? performCredit(tx) : prisma.$transaction(performCredit);
    }

    /**
     * Debit a user's wallet (Admin/Manual deduction).
     * Atomically decrements balance and records transaction.
     * Throws if insufficient funds.
     */
    static async debit(
        userId: string,
        amount: number,
        type: WalletTransactionType,
        description: string,
        idempotencyKey: string,
        tx?: Prisma.TransactionClient
    ) {
        const performDebit = async (client: Prisma.TransactionClient) => {
            const decAmount = new Prisma.Decimal(amount)

            if (idempotencyKey) {
                const existing = await client.walletTransaction.findUnique({ where: { idempotencyKey } })
                if (existing) return existing
            }

            // Lock and Get Wallet
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`
            const wallet = await client.wallet.findUnique({
                where: { userId },
                select: { id: true, balance: true }
            })
            if (!wallet) throw new PaymentError('Wallet not found', 'E_PROVIDER_ERROR', 404)

            // Integrity Check
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(userId, client);
            if (!isIntegrityIntact) throw PaymentError.integrityBreach(userId);

            // Check Funds
            if (wallet.balance.lessThan(decAmount)) {
                throw PaymentError.insufficientFunds()
            }

            // 1. Decrement Balance
            await client.wallet.update({
                where: { id: wallet.id },
                data: { balance: { decrement: decAmount } }
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

            // LOW BALANCE ALERT
            const finalBalance = wallet.balance.sub(decAmount)
            if (finalBalance.lessThan(10.0)) {
                await EventDispatcher.dispatch(userId, 'balance.low', {
                    balance: finalBalance.toNumber(),
                    threshold: 10.0,
                    currency: 'POINTS'
                })
            }

            return transaction
        }

        return tx ? performDebit(tx) : prisma.$transaction(performDebit);
    }

    /**
     * Atomic Peer-to-Peer Transfer
     * Moves balance from one user to another with total consistency.
     */
    static async transfer(
        fromUserId: string,
        toUserId: string,
        amount: number,
        description: string,
        idempotencyKey: string,
        tx?: Prisma.TransactionClient
    ) {
        const performTransfer = async (client: Prisma.TransactionClient) => {
            const decAmount = new Prisma.Decimal(amount)

            // 1. LOCK BOTH WALLETS (Ordered by ID to prevent deadlocks)
            const users = [fromUserId, toUserId].sort()
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" IN (${users[0]}, ${users[1]}) FOR UPDATE`

            // 2. ELITE INTEGRITY CHECK (Sentinel) - Source User
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(fromUserId, client);
            if (!isIntegrityIntact) {
                throw PaymentError.integrityBreach(fromUserId);
            }

            // 3. Verify both wallets exist
            const [fromWallet, toWallet] = await Promise.all([
                client.wallet.findUnique({ where: { userId: fromUserId } }),
                client.wallet.findUnique({ where: { userId: toUserId } })
            ])

            if (!fromWallet) throw new PaymentError('Source wallet not found', 'E_PROVIDER_ERROR', 404)
            if (!toWallet) throw new PaymentError('Destination wallet not found', 'E_PROVIDER_ERROR', 404)

            // 3. Balance Check
            if (fromWallet.balance.lessThan(decAmount)) {
                throw PaymentError.insufficientFunds('Insufficient funds for transfer')
            }

            // 4. Atomic Balance Update
            await client.wallet.update({
                where: { id: fromWallet.id },
                data: { balance: { decrement: decAmount } }
            })

            await client.wallet.update({
                where: { id: toWallet.id },
                data: { balance: { increment: decAmount } }
            })

            // 5. Create Transactions
            // Debit from source
            await client.walletTransaction.create({
                data: {
                    walletId: fromWallet.id,
                    amount: decAmount.negated(),
                    type: 'p2p_transfer_out',
                    description: `P2P to ${toUserId}: ${description}`,
                    idempotencyKey: `p2p_out_${idempotencyKey}`,
                    metadata: { recipientId: toUserId }
                }
            })

            // Credit to destination
            const creditTx = await client.walletTransaction.create({
                data: {
                    walletId: toWallet.id,
                    amount: decAmount,
                    type: 'p2p_transfer_in',
                    description: `P2P from ${fromUserId}: ${description}`,
                    idempotencyKey: `p2p_in_${idempotencyKey}`,
                    metadata: { senderId: fromUserId }
                }
            })

            wallet_transactions_total.labels('p2p_transfer', 'success').inc()
            return creditTx
        }

        if (tx) {
            return performTransfer(tx)
        } else {
            return prisma.$transaction(async (newTx) => {
                return performTransfer(newTx)
            })
        }
    }

    /**
     * Confirm a pending deposit.
     * Atomically increments balance and updates transaction record.
     */
    static async confirmDeposit(
        transactionId: string,
        actualAmount?: number,
        externalTxId?: string,
        tx?: Prisma.TransactionClient
    ) {
        const performConfirm = async (client: Prisma.TransactionClient) => {
            // 1. Get transaction and user
            const transaction = await client.walletTransaction.findUnique({
                where: { id: transactionId },
                include: { wallet: true }
            })

            if (!transaction) throw new PaymentError('Transaction not found', 'E_PROVIDER_ERROR', 404)
            // Note: In some systems 'deposit' might be the pending type
            // If it's already 'topup', it might be a duplicate call
            if (transaction.type === 'topup' && (transaction.metadata as any)?.completedAt) {
                return { userId: transaction.wallet.userId, amount: Number(transaction.amount), alreadyProcessed: true }
            }

            const userId = transaction.wallet.userId
            const amount = new Prisma.Decimal(actualAmount ?? transaction.amount)

            // 2. LOCK Wallet
            await client.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId} FOR UPDATE`

            // 3. Integrity Check
            const isIntegrityIntact = await FinancialSentinel.verifyIntegrity(userId, client);
            if (!isIntegrityIntact) throw PaymentError.integrityBreach(userId);

            // 4. Update Transaction metadata
            await client.walletTransaction.update({
                where: { id: transactionId },
                data: {
                    type: 'topup',
                    amount: amount,
                    metadata: {
                        ...(transaction.metadata as any || {}),
                        completedAt: new Date().toISOString(),
                        externalTxId
                    }
                }
            })

            // 5. Increment Balance
            await client.wallet.update({
                where: { id: transaction.walletId },
                data: { balance: { increment: amount } }
            })

            wallet_transactions_total.labels('topup', 'success').inc()

            return { userId, amount: amount.toNumber(), alreadyProcessed: false }
        }

        return tx ? performConfirm(tx) : prisma.$transaction(performConfirm)
    }

    /**
     * Mark a deposit as failed.
     */
    static async failDeposit(
        transactionId: string,
        reason: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        return await client.walletTransaction.update({
            where: { id: transactionId },
            data: {
                type: 'failed_deposit',
                description: `Failed: ${reason}`,
                metadata: {
                    failedAt: new Date().toISOString(),
                    reason
                }
            }
        })
    }

    /**
     * Mark a deposit as expired.
     */
    static async expireDeposit(
        transactionId: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma
        return await client.walletTransaction.update({
            where: { id: transactionId },
            data: {
                type: 'expired_deposit',
                description: 'Transaction expired',
                metadata: {
                    expiredAt: new Date().toISOString()
                }
            }
        })
    }
}
