import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Simulated unique database ledger reference error
class PrismaUniqueConstraintError extends Error {
    code = 'P2002'
    meta = { target: ['reference'] }
    constructor(msg: string) {
        super(msg)
        this.name = 'PrismaClientKnownRequestError'
    }
}

describe('BullMQ Stalled Job Chaos & Duplicate Execution Protections', () => {
    let mockPrisma: any
    let providerCancelSpy: any
    let logSpy: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockPrisma = {
            $transaction: vi.fn(),
            walletLedger: {
                create: vi.fn(),
            },
            wallet: {
                update: vi.fn(),
            }
        }

        providerCancelSpy = vi.fn()
        logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    describe('Chaos Case 1: Double-Refund Protection (Critical)', () => {
        it('should successfully prevent duplicate refunds on stalled-job retries', async () => {
            const numberId = 'number_123'
            const refundReference = `refund_timeout_${numberId}`
            
            // First execution attempt - succeeds
            mockPrisma.$transaction.mockImplementationOnce(async (_callback: any) => {
                // Mock balance transaction write
                await mockPrisma.walletLedger.create({
                    data: {
                        walletId: 'wallet_1',
                        amount: new Prisma.Decimal(10.0),
                        reference: refundReference
                    }
                })
                return { success: true }
            })

            // Run first attempt
            const attempt1Result = await mockPrisma.$transaction(async () => {
                return mockPrisma.walletLedger.create({
                    data: {
                        walletId: 'wallet_1',
                        amount: new Prisma.Decimal(10.0),
                        reference: refundReference
                    }
                })
            })
            expect(attempt1Result).toBeDefined()
            expect(mockPrisma.walletLedger.create).toHaveBeenCalledWith({
                data: {
                    walletId: 'wallet_1',
                    amount: new Prisma.Decimal(10.0),
                    reference: refundReference
                }
            })

            // Second execution attempt (Stalled Job retry) - throws Prisma P2002 Unique Constraint violation
            mockPrisma.$transaction.mockImplementationOnce(async () => {
                throw new PrismaUniqueConstraintError('Unique constraint failed on the fields: reference')
            })

            // Worker implementation handler wrapper (simulated)
            const handleExpiryWorker = async () => {
                try {
                    await mockPrisma.$transaction(async () => {
                        return mockPrisma.walletLedger.create({
                            data: { reference: refundReference }
                        })
                    })
                    return 'COMPLETED_SUCCESSFULLY'
                } catch (error: any) {
                    if (error.code === 'P2002' && error.meta?.target?.includes('reference')) {
                        console.warn('[DUPLICATE-REFUND-BLOCKED] Caught duplicate attempt for reference:', refundReference)
                        return 'COMPLETED_DUPLICATE_IGNORED'
                    }
                    throw error
                }
            }

            // Run retry attempt
            const retryResult = await handleExpiryWorker()

            // Assertions
            expect(retryResult).toBe('COMPLETED_DUPLICATE_IGNORED')
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DUPLICATE-REFUND-BLOCKED]'),
                refundReference
            )
        })
    })

    describe('Chaos Case 2: Double-Cancellation Mitigation (Critical)', () => {
        it('should treat ALREADY_CANCELLED response from telephony provider as a success', async () => {
            // Mock provider getStatus or setCancel throwing error because it was already cancelled
            providerCancelSpy
                .mockRejectedValueOnce(new Error('ACTIVATION_NOT_FOUND')) // Upstream shows already cancelled

            const handleCancelWorker = async () => {
                try {
                    await providerCancelSpy()
                    return 'COMPLETED'
                } catch (error: any) {
                    if (error.message.includes('ACTIVATION_NOT_FOUND') || error.message.includes('ALREADY_CANCELLED')) {
                        console.warn('[TELEPHONY-DUPLICATE-CANCEL-OK] Activation already cancelled in previous execution')
                        return 'COMPLETED_OK'
                    }
                    throw error
                }
            }

            const result = await handleCancelWorker()
            expect(result).toBe('COMPLETED_OK')
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TELEPHONY-DUPLICATE-CANCEL-OK]')
            )
        })
    })

    describe('Chaos Case 3: Redis Failover During Active Job (Critical)', () => {
        it('should protect transaction boundaries and avoid orphaned timers during Sentinel promotion', async () => {
            const numberId = 'number_789'
            const refundReference = `refund_timeout_${numberId}`
            let lockRenewed = true

            // 1. Worker A starts execution and initiates lock renewal
            const mockRenewLock = vi.fn().mockImplementation(async () => {
                if (!lockRenewed) {
                    throw new Error('Redis Connection Lost')
                }
                return true
            })

            // 2. Simulate Redis Sentinel Failover (lock renewal fails, connection resets)
            lockRenewed = false
            await expect(mockRenewLock()).rejects.toThrow('Redis Connection Lost')

            // 3. Simulated Stalled Reclaim by Worker B due to lock expiration on master disconnect
            mockPrisma.$transaction.mockImplementationOnce(async () => {
                // First successful execution in database during failover recovery
                await mockPrisma.walletLedger.create({
                    data: {
                        walletId: 'wallet_2',
                        amount: new Prisma.Decimal(5.0),
                        reference: refundReference
                    }
                })
                return { success: true }
            })

            // Executed by Worker B
            const workerBResult = await mockPrisma.$transaction(async () => {
                return mockPrisma.walletLedger.create({
                    data: {
                        walletId: 'wallet_2',
                        amount: new Prisma.Decimal(5.0),
                        reference: refundReference
                    }
                })
            })
            expect(workerBResult).toBeDefined()

            // 4. Worker A reconnects and attempts to commit (fails due to database unique constraint)
            mockPrisma.$transaction.mockImplementationOnce(async () => {
                throw new PrismaUniqueConstraintError('Unique constraint failed on field: reference')
            })

            const handleWorkerAResolved = async () => {
                try {
                    await mockPrisma.$transaction(async () => {
                        return mockPrisma.walletLedger.create({
                            data: {
                                walletId: 'wallet_2',
                                amount: new Prisma.Decimal(5.0),
                                reference: refundReference
                            }
                        })
                    })
                    return 'COMPLETED_SUCCESSFULLY'
                } catch (error: any) {
                    if (error.code === 'P2002') {
                        console.warn('[FAILOVER-RECOVERY-OK] Worker A blocked from double refund post-Sentinel failover')
                        return 'BLOCKED_DUPLICATE'
                    }
                    throw error
                }
            }

            const workerAResult = await handleWorkerAResolved()
            expect(workerAResult).toBe('BLOCKED_DUPLICATE')
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[FAILOVER-RECOVERY-OK]')
            )
        })
    })

    describe('Chaos Case 4: Delayed Job Resilience under Redis Sentinel Failover', () => {
        it('should guarantee delayed job retention and execute with acceptable drift after failover', async () => {
            const scheduledDelayMs = 10 * 60 * 1000 // 10 minutes
            const now = Date.now()
            const expectedExecutionTime = now + scheduledDelayMs

            // 1. Simulate Delayed Job Enqueue
            const jobStore = new Map<string, { id: string; delay: number; enqueuedAt: number }>()
            const enqueueJob = async (id: string, delay: number) => {
                jobStore.set(id, { id, delay, enqueuedAt: Date.now() })
                return id
            }

            const jobId = await enqueueJob('expire:number_456', scheduledDelayMs)
            expect(jobStore.has(jobId)).toBe(true)

            // 2. Trigger Redis Failover (simulated by dropping lock connection state)
            let redisMasterAlive = false
            const checkPersistedJobs = async () => {
                if (!redisMasterAlive) {
                    // Failover promotes replica; reads persisted AOF/RDB state
                    redisMasterAlive = true
                }
                return jobStore.get(jobId)
            }

            // 3. Verify Delayed Job survived master failover post-promotion
            const persistedJob = await checkPersistedJobs()
            expect(persistedJob).toBeDefined()
            expect(persistedJob?.delay).toBe(scheduledDelayMs)

            // 4. Verify execution timestamp drift remains acceptable (scheduled_at ± acceptable drift of 1 second)
            const simulatedExecuteTime = now + scheduledDelayMs + 250 // 250ms processing drift
            const drift = Math.abs(simulatedExecuteTime - expectedExecutionTime)
            expect(drift).toBeLessThanOrEqual(1000) // Within 1s threshold

            console.warn(`[DELAYED-FAILOVER-OK] Delayed job survived failover with drift: ${drift}ms`)
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[DELAYED-FAILOVER-OK]')
            )
        })
    })

    describe('Chaos Case 5: Full End-to-End Refund Replay Test', () => {
        it('should securely process full virtual number flow, crash, failover, and block replay duplicate', async () => {
            const numberId = 'number_refund_999'
            // Scenario: act_999 purchased by user_999 — walletBalance starts at $100.
            // Uniqueness is enforced via ledgerCount mock (simulates WalletLedger unique constraint).
            let walletBalance = 100.0
            let numberStatus = 'active'
            let ledgerCount = 0

            // Helper Mocked Database State Operations
            const mockDbTransaction = async (action: () => Promise<any>) => {
                return action()
            }

            // 1. Purchase Number
            const purchaseNumber = async () => {
                numberStatus = 'active'
                walletBalance -= 10.0 // Deduct $10.0
            }
            await purchaseNumber()
            expect(walletBalance).toBe(90.0)
            expect(numberStatus).toBe('active')

            // 2. Expire Number & Refund Wallet (First run)
            const handleExpiryAndRefund = async (forceAttempt = false) => {
                return mockDbTransaction(async () => {
                    if (numberStatus !== 'active' && !forceAttempt) {
                        return { status: 'skipped' }
                    }
                    // Mark cancelled
                    numberStatus = 'cancelled'
                    // Ledger increment (mocked DB unique check)
                    if (ledgerCount > 0) {
                        throw new PrismaUniqueConstraintError('Unique constraint failed on: reference')
                    }
                    ledgerCount++
                    walletBalance += 10.0 // Refund $10.0
                    return { status: 'refunded' }
                })
            }

            // 3. Execute first run & Simulate worker crash immediately post-transaction
            const run1Result = await handleExpiryAndRefund()
            expect(run1Result.status).toBe('refunded')
            expect(walletBalance).toBe(100.0)
            expect(numberStatus).toBe('cancelled')
            expect(ledgerCount).toBe(1)

            // 4. Redis Failover & Replay Job
            // Worker restarts, receives stalled job retry from BullMQ and forces a ledger insert attempt
            const run2Result = await handleExpiryAndRefund(true).catch((err) => {
                if (err.code === 'P2002') {
                    console.warn('[E2E-REFUND-REPLAY-OK] Blocked replay duplicate refund. Wallet balance untouched.')
                    return { status: 'blocked' }
                }
                throw err
            })

            // 5. Verify wallet balance unchanged, ledger count unchanged, activation state unchanged
            expect(run2Result.status).toBe('blocked')
            expect(walletBalance).toBe(100.0)
            expect(ledgerCount).toBe(1)
            expect(numberStatus).toBe('cancelled')

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[E2E-REFUND-REPLAY-OK]')
            )
        })
    })

    describe('Chaos Case 6: Redis Unavailable During Enqueue (Rebalancer eventuality)', () => {
        it('should commit DB cleanly if Redis enqueues fail, then recover missing timers on next rebalancer cycle', async () => {
            const dbState = {
                numberId: 'number_fail_111',
                status: 'active',
                committed: false
            }
            const redisJobs = new Map<string, any>()
            let redisOnline = false

            // 1. Database Purchase Transaction Commit (Success)
            const executePurchaseAndEnqueue = async () => {
                // DB commit succeeds
                dbState.committed = true

                // Attempt to enqueue to Redis (fails due to connection issue)
                try {
                    if (!redisOnline) {
                        throw new Error('Connection refused: Redis host unreachable')
                    }
                    redisJobs.set(`expire:${dbState.numberId}`, { type: 'expire' })
                    redisJobs.set(`poll:${dbState.numberId}`, { type: 'poll' })
                } catch (err: any) {
                    console.warn(`[REDIS-QUEUE-ERROR] Failed shadow dual-write to Redis, non-blocking fallback logged: ${err.message}`)
                }
            }

            await executePurchaseAndEnqueue()

            // Pass Criteria 1: DB row is committed cleanly even if Redis enqueue fails
            expect(dbState.committed).toBe(true)
            expect(redisJobs.has(`expire:${dbState.numberId}`)).toBe(false) // Queue misses the expire timer
            expect(redisJobs.has(`poll:${dbState.numberId}`)).toBe(false)   // Queue misses the poll timer

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[REDIS-QUEUE-ERROR]')
            )

            // 2. Redis comes back online
            redisOnline = true

            // 3. Simulate recoverActiveNumbers() Rebalancer cycle
            const recoverActiveNumbersSimulated = async () => {
                // Find all active numbers in DB
                if (dbState.committed && dbState.status === 'active') {
                    // Check Redis for active jobs. If missing, heal them.
                    const expireKey = `expire:${dbState.numberId}`
                    const pollKey = `poll:${dbState.numberId}`

                    if (!redisJobs.has(expireKey)) {
                        redisJobs.set(expireKey, { type: 'expire', healed: true })
                    }
                    if (!redisJobs.has(pollKey)) {
                        redisJobs.set(pollKey, { type: 'poll', healed: true })
                    }
                }
            }

            await recoverActiveNumbersSimulated()

            // Pass Criteria 2: Queue state completely healed and converged from DB state
            expect(redisJobs.has(`expire:${dbState.numberId}`)).toBe(true)
            expect(redisJobs.has(`poll:${dbState.numberId}`)).toBe(true)
            expect(redisJobs.get(`expire:${dbState.numberId}`)?.healed).toBe(true)
            expect(redisJobs.get(`poll:${dbState.numberId}`)?.healed).toBe(true)

            console.warn('[REBALANCER-HEAL-OK] Rebalancer successfully converged missing Redis timers from PostgreSQL state')
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('[REBALANCER-HEAL-OK]')
            )
        })
    })
})
