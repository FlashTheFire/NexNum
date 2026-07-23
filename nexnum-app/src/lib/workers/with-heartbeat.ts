/**
 * Worker heartbeat helper.
 *
 * Wraps a worker function so that a heartbeat is recorded on every
 * invocation, regardless of success or failure. This lets the
 * zombie-detector distinguish "worker is not running at all" from
 * "worker is running but every tick errors out":
 *
 *  - heartbeat present + alertmanager error spam  → code-bug, not zombie
 *  - heartbeat MISSING for > threshold           → true zombie (hung / OOM)
 *
 * Usage:
 *
 *   export const processReconciliationBatch = withHeartbeat(
 *     'payment_reconcile',
 *     processReconciliationBatchImpl
 *   )
 *
 * The wrapper preserves the original return type.
 */

import { recordHeartbeat } from './heartbeat-registry'
import { logger } from '@/lib/core/logger'

export type WorkerFunction<TArgs extends any[], TResult> = (...args: TArgs) => Promise<TResult>

/**
 * Wrap a worker function. Records a heartbeat after the function settles
 * (either resolves or rejects). Re-throws the error so callers can still
 * observe failures via their normal error handling.
 */
export function withHeartbeat<TArgs extends any[], TResult>(
    workerName: string,
    fn: WorkerFunction<TArgs, TResult>
): WorkerFunction<TArgs, TResult> {
    return async (...args: TArgs): Promise<TResult> => {
        try {
            const result = await fn(...args)
            recordHeartbeat(workerName)
            return result
        } catch (err) {
            // Record heartbeat even on failure — a worker that runs but always
            // errors is making forward progress; we want zombie-detection to
            // trigger ONLY when the worker is completely silent.
            recordHeartbeat(workerName)
            const msg = err instanceof Error ? err.message : String(err)
            logger.error(`[${workerName}] Tick failed (heartbeat still recorded)`, {
                context: 'WORKER_HEARTBEAT',
                worker: workerName,
                error: msg
            })
            throw err
        }
    }
}
