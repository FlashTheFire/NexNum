/**
 * Forensic Alert Dispatcher
 * 
 * Handles high-priority security notifications with structured forensic data.
 * Features:
 * - Multi-channel delivery (Telegram, Email)
 * - Anti-Burst Throttling (Redis-backed)
 * - Forensic Payload Formatting
 */

import { notify } from '@/lib/notifications'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

export interface ForensicIncident {
    userId: string
    userName?: string
    drift: number
    balance: number
    expectedSum: number
    actionTaken: 'BANNED' | 'QUARANTINED' | 'LOGGED'
    timestamp: Date
    lastTransactions: Array<{
        type: string
        amount: number
        description: string | null
        ts: Date
    }>
}

export class ForensicDispatcher {
    private static THROTTLE_TTL = 3600 // 1 hour

    /**
     * Dispatch a forensic incident report to administrators.
     */
    static async dispatch(incident: ForensicIncident): Promise<void> {
        const throttleKey = `forensic:throttle:${incident.userId}`;

        try {
            // 1. Check Burst Protection
            const isThrottled = await redis.get(throttleKey);
            if (isThrottled) {
                logger.warn(`[Forensic] Alert throttled for user ${incident.userId}`);
                return;
            }

            // 2. Format Telegram Report
            const tgTitle = `🚨 FINANCIAL INTEGRITY BREACH`;
            const tgMessage = `
<b>User ID:</b> <code>${incident.userId}</code>
<b>User Name:</b> <code>${incident.userName || 'Unknown'}</code>

<b>Financial Forensic Details »</b>
<blockquote expandable>
<b>⚠️ DRIFT DETECTED »</b> <code>${incident.drift.toFixed(4)}</code>
<b>💰 Actual Balance »</b> <code>${incident.balance.toFixed(2)}</code>
<b>🧮 Theoretical Sum »</b> <code>${incident.expectedSum.toFixed(2)}</code>
</blockquote>

<b>Response Action »</b> <code>${incident.actionTaken}</code>

<b>Recent Transactions »</b>
<blockquote expandable>
${incident.lastTransactions.map(tx => `- [${tx.type.toUpperCase()}] ${tx.amount.toFixed(2)}: ${tx.description || 'No desc'}`).join('\n')}
</blockquote>

<b>Timestamp:</b> <code>${incident.timestamp.toISOString().replace('T', ' ').slice(0, 19)}</code>
            `.trim();

            // 3. Fire Alerts (Telegram + Email)
            await Promise.allSettled([
                notify.alert(tgTitle, tgMessage, 'critical'),
                // Dedicated email alert with one-line summary
                // The notify.alert already sends email, so we just use that.
            ]);

            // 4. Activate Throttle
            await redis.setex(throttleKey, this.THROTTLE_TTL, 'active');

            logger.info(`[Forensic] Alert dispatched for user ${incident.userId}`);

        } catch (error) {
            logger.error('[Forensic] Failed to dispatch alert', { error });
        }
    }
}
