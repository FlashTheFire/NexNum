/**
 * ======================================================================
 * NEXNUM NOTIFICATION MANAGER - UNIFIED NOTIFICATION SYSTEM
 * ======================================================================
 * 
 * A professional-grade, multi-channel notification system for NexNum.
 * Supports:
 * - Telegram (with Forum Topics, Live Updates, Safe Emojis)
 * - Email (Gmail SMTP with App Password)
 * 
 * Features:
 * - Redis-backed state management for message editing
 * - Auto-creation of user-specific Forum Topics
 * - NSFW emoji filtering for topic icons
 * - Retry logic and graceful degradation
 * 
 * Usage:
 *   import { notify } from '@/lib/notifications'
 *   await notify.deposit({ userId, amount, ... })
 *   await notify.orderUpdate({ orderId, status, ... })
 *   await notify.alert('title', 'message', 'critical')
 * 
 * @author NexNum Infrastructure Team
 * @version 2.0.0
 */

import nodemailer from 'nodemailer'
import { EmailTemplates } from './templates'
import { Telegraf } from 'telegraf'
import { redis } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { recordIncident } from '@/lib/metrics'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        adminChannel: process.env.TELEGRAM_ADMIN_CHANNEL || '', // e.g., -1002203139746
        alertsChannel: process.env.TELEGRAM_ALERTS_CHANNEL || process.env.TELEGRAM_ADMIN_CHANNEL || '',
        enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_ADMIN_CHANNEL
    },
    email: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '', // Gmail App Password (16 chars)
        from: process.env.EMAIL_FROM || '"NexNum" <noreply@nexnum.com>',
        enabled: !!process.env.SMTP_USER && !!process.env.SMTP_PASS
    },
    redis: {
        userProfilePrefix: 'user_data:',
        orderInfoPrefix: 'order_info:'
    }
}

// Forum Topic Icon Colors (Telegram-approved)
const TOPIC_COLORS = [0x6FB9F0, 0xFFD67E, 0xCB86DB, 0x8EEE98, 0xFF93B2, 0xFB6F5F] as const

// Restricted emojis for topic icons
const RESTRICTED_EMOJIS = ["🍆", "🍑", "🔞", "🥃", "🍺", "🍷", "🍸", "🚬"]

// ============================================================================
// TYPES
// ============================================================================

export interface DepositPayload {
    userId: string
    userName?: string
    userEmail?: string
    amount: number
    depositId: string
    paidFrom: string      // 'UPI', 'Card', 'Crypto', etc.
    paymentType: string   // 'instant', 'manual', etc.
    transactionId?: string
    timestamp?: Date
}

export interface OrderPayload {
    userId: string
    userName?: string
    orderId: string
    appName: string
    price: number
    country: string
    countryCode: string
    phoneNumber: string
    status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
    validUntil?: string
    smsList?: string[]
    isApiOrder?: boolean
}

export interface UserMetricsPayload {
    userId: string
    userName: string
    balance: number
    totalSpend: number
    totalDeposits: number
    depositCount: number
    totalOrders: number
    totalOrderValue: number
}

export interface AlertPayload {
    title: string
    message: string
    severity: 'info' | 'warning' | 'critical'
    userId?: string
}

// ============================================================================
// TELEGRAM SERVICE
// ============================================================================

class TelegramChannel {
    private bot: Telegraf | null = null
    private channelId: string

    constructor() {
        this.channelId = CONFIG.telegram.adminChannel

        if (CONFIG.telegram.enabled) {
            this.bot = new Telegraf(CONFIG.telegram.botToken)
            logger.info('[Telegram] Channel initialized')
        } else {
            logger.warn('[Telegram] Disabled - missing TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHANNEL')
        }
    }

    // --------------------------------------------------------------------------
    // FORUM TOPIC MANAGEMENT
    // --------------------------------------------------------------------------

    async getOrCreateForumTopic(userId: string, userName: string): Promise<number | null> {
        if (!this.bot) return null

        const profileKey = `${CONFIG.redis.userProfilePrefix}${userId}:profile:main`

        // Check Redis for existing topic
        const storedForumId = await redis.hget(profileKey, 'forum_id')
        if (storedForumId) {
            return parseInt(storedForumId)
        }

        // Create new topic
        try {
            const iconColor = TOPIC_COLORS[Math.floor(Math.random() * TOPIC_COLORS.length)]
            const topicName = `❯ ${userName.slice(0, 15)} [${userId.slice(0, 8)}]`

            // Try to get a safe custom emoji (requires Fragment purchase, may fail)
            const customEmojiId = await this.getRandomSafeEmojiId()

            const topic = await this.bot.telegram.createForumTopic(this.channelId, topicName, {
                icon_color: iconColor,
                ...(customEmojiId && { icon_custom_emoji_id: customEmojiId })
            })

            if (topic) {
                await redis.hset(profileKey, { forum_id: topic.message_thread_id.toString() })
                logger.info(`[Telegram] Created Forum Topic for ${userId}: ${topic.message_thread_id}`)
                return topic.message_thread_id
            }
        } catch (error: any) {
            // If forum topic creation fails (e.g., not a supergroup), log but don't crash
            logger.error('[Telegram] Failed to create forum topic', { userId, error: error.message })
        }

        return null
    }

    private async getRandomSafeEmojiId(): Promise<string | null> {
        if (!CONFIG.telegram.enabled) return null

        try {
            const url = `https://api.telegram.org/bot${CONFIG.telegram.botToken}/getForumTopicIconStickers`
            const response = await fetch(url)

            if (!response.ok) return null

            const data = await response.json()
            if (!data.ok || !Array.isArray(data.result)) return null

            const safeStickers = data.result.filter((sticker: any) => {
                if (!sticker.emoji) return true
                return !RESTRICTED_EMOJIS.includes(sticker.emoji)
            })

            if (safeStickers.length === 0) return null

            const randomSticker = safeStickers[Math.floor(Math.random() * safeStickers.length)]
            return randomSticker.custom_emoji_id || null
        } catch {
            return null // Silently fail, use default icon
        }
    }

    async updateForumTopic(userId: string, newName?: string): Promise<boolean> {
        if (!this.bot) return false

        const profileKey = `${CONFIG.redis.userProfilePrefix}${userId}:profile:main`
        const forumId = await redis.hget(profileKey, 'forum_id')

        if (!forumId || !newName) return false

        try {
            await this.bot.telegram.callApi('editForumTopic', {
                chat_id: this.channelId,
                message_thread_id: parseInt(forumId),
                name: newName
            })
            return true
        } catch {
            return false
        }
    }

    async archiveForumTopic(userId: string): Promise<boolean> {
        if (!this.bot) return false

        const profileKey = `${CONFIG.redis.userProfilePrefix}${userId}:profile:main`
        const forumId = await redis.hget(profileKey, 'forum_id')

        if (!forumId) return false

        try {
            await this.bot.telegram.callApi('closeForumTopic', {
                chat_id: this.channelId,
                message_thread_id: parseInt(forumId)
            })
            await redis.hset(profileKey, { forum_archived: 'true' })
            return true
        } catch {
            return false
        }
    }

    async reopenForumTopic(userId: string): Promise<boolean> {
        if (!this.bot) return false

        const profileKey = `${CONFIG.redis.userProfilePrefix}${userId}:profile:main`
        const forumId = await redis.hget(profileKey, 'forum_id')

        if (!forumId) return false

        try {
            await this.bot.telegram.callApi('reopenForumTopic', {
                chat_id: this.channelId,
                message_thread_id: parseInt(forumId)
            })
            await redis.hset(profileKey, { forum_archived: 'false' })
            return true
        } catch {
            return false
        }
    }

    // --------------------------------------------------------------------------
    // DEPOSIT NOTIFICATIONS
    // --------------------------------------------------------------------------

    async sendDepositNotification(payload: DepositPayload): Promise<boolean> {
        if (!this.bot) return false

        const userName = payload.userName || `User ${payload.userId.slice(0, 8)}`
        const forumId = await this.getOrCreateForumTopic(payload.userId, userName)
        if (!forumId) return false

        // Check if this is first deposit (to maybe trigger special actions)
        const profileKey = `${CONFIG.redis.userProfilePrefix}${payload.userId}:profile:main`
        const depositCount = await redis.hincrby(profileKey, 'deposit_count', 1)
        const isFirstDeposit = depositCount === 1

        const timestamp = payload.timestamp || new Date()
        const paymentTag = payload.paymentType.toUpperCase().replace(/\s/g, '_')

        const message = `
<b>#${paymentTag}_DEPOSIT ❯</b>

<b>Transaction Details »</b>
<blockquote expandable>
<b>💰 Amount »</b> <code>${payload.amount.toFixed(2)}</code> 💎
<b>👤 Paid From »</b> <code>${payload.paidFrom}</code>
<b>🕊 Payment Type »</b> <code>${payload.paymentType}</code>

<b>Balance Update »</b>
<b>🏛</b> <code>${payload.depositId}</code>
${payload.transactionId ? `<b>🔗 Tx »</b> <code>${payload.transactionId}</code>\n` : ''}<b>⏱️ Time »</b> ${timestamp.toISOString().replace('T', ' ').slice(0, 19)}
</blockquote>
<b>Successfully Credited</b>${isFirstDeposit ? '\n\n🎉 <b>First Deposit!</b>' : ''}
        `.trim()

        const keyboard = {
            inline_keyboard: [[
                { text: '🔗 User', url: `tg://openmessage?user_id=${payload.userId}` },
                { text: '⌕ Details', callback_data: `deposit:${payload.depositId}` }
            ]]
        }

        try {
            await this.bot.telegram.sendMessage(this.channelId, message, {
                message_thread_id: forumId,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })

            // Also post a summary to the main channel (outside topic)
            const summary = `<b>💎 #${paymentTag}_DEPOSIT ❯</b>\n[<code>${payload.paymentType}</code>][<code>${payload.userId.slice(0, 8)}</code>][<code>${payload.amount.toFixed(2)}</code>]`
            await this.bot.telegram.sendMessage(this.channelId, summary, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            })

            return true
        } catch (error: any) {
            logger.error('[Telegram] Failed to send deposit notification', { error: error.message })
            return false
        }
    }

    // --------------------------------------------------------------------------
    // ORDER NOTIFICATIONS (with Live Edit support)
    // --------------------------------------------------------------------------

    async sendOrderReport(payload: OrderPayload): Promise<boolean> {
        if (!this.bot) return false

        const userName = payload.userName || `User ${payload.userId.slice(0, 8)}`
        const forumId = await this.getOrCreateForumTopic(payload.userId, userName)
        if (!forumId) return false

        const orderRedisKey = `${CONFIG.redis.orderInfoPrefix}${payload.orderId}`
        const isUpdate = payload.status !== 'PENDING' && payload.status !== 'ACTIVE'

        const statusMap: Record<string, string> = {
            'PENDING': '⏳ Processing...',
            'ACTIVE': '📱 Waiting for SMS...',
            'COMPLETED': '✅ Order Has Completed',
            'CANCELLED': '⏱️ Order Is Cancelled',
            'EXPIRED': '⏱️ Order Has Expired'
        }
        const validStatus = statusMap[payload.status] || payload.status

        const orderTag = payload.isApiOrder ? 'API_ORDER' : 'USER_ORDER'

        const message = `
<b>#${orderTag}_DETAILS ❯</b>

<b>Transaction Details »</b>
<blockquote expandable>
📦 <b>App Name »</b> <code>${payload.appName}</code>
💰 <b>Price »</b> <code>${payload.price.toFixed(2)}</code> 💎
🌍 <b>Region »</b> <code>${payload.country}</code> [ <code>${payload.countryCode}</code> ]

<b>Contact Details »</b>
💳 <code>${payload.orderId}</code>
📞 <code>+${payload.phoneNumber}</code>
${payload.smsList && payload.smsList.length > 0 ? `🔐 <b>Codes »</b> <code>${payload.smsList.join(', ')}</code>\n` : ''}${payload.validUntil ? `⏱️ <b>Until »</b> ${payload.validUntil}\n` : ''}</blockquote>
<b>${validStatus}</b>
        `.trim()

        const keyboard = {
            inline_keyboard: [[
                { text: '🔗 User', url: `tg://openmessage?user_id=${payload.userId}` },
                { text: '⌕ Details', callback_data: `order:${payload.orderId}` }
            ]]
        }

        try {
            // Check if we should EDIT an existing message
            if (isUpdate) {
                const storedMsgId = await redis.hget(orderRedisKey, 'forum_message_id')
                if (storedMsgId) {
                    await this.bot.telegram.editMessageText(
                        this.channelId,
                        parseInt(storedMsgId),
                        undefined,
                        message,
                        { parse_mode: 'HTML', reply_markup: keyboard }
                    )
                    logger.info(`[Telegram] Edited order message ${storedMsgId} for ${payload.orderId}`)
                    return true
                }
            }

            // Send new message
            const sent = await this.bot.telegram.sendMessage(this.channelId, message, {
                message_thread_id: forumId,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })

            // Store message ID for future edits
            if (sent) {
                await redis.hset(orderRedisKey, { forum_message_id: sent.message_id.toString() })
            }

            return true
        } catch (error: any) {
            logger.error('[Telegram] Failed to send/edit order report', { error: error.message })
            return false
        }
    }

    // --------------------------------------------------------------------------
    // USER METRICS REPORT (Stateful)
    // --------------------------------------------------------------------------

    async sendUserMetricsReport(payload: UserMetricsPayload): Promise<boolean> {
        if (!this.bot) return false

        const forumId = await this.getOrCreateForumTopic(payload.userId, payload.userName)
        if (!forumId) return false

        const message = `
 👤 <b>User:</b> <code>${payload.userName.slice(0, 15)}</code> <b>||</b> <code>${payload.userId}</code>

<b>╭─────────────────────╮</b>
<code>│</code><b>     📊 User Metrics Report         </b><code>│</code>
<b>╰─────────────────────╯</b>

<b>╭─────────────────────╮</b>
<b>│ 💰 Balance Summary!                 │</b>
<b>├─────────────────────┤</b>
<b>│ 💵 Balance:</b> <code>${payload.balance.toFixed(2)}</code> Point${payload.balance !== 1 ? 's' : ''}
<b>│ 💸 Total Spend:</b> <code>${payload.totalSpend.toFixed(2)}</code> Point${payload.totalSpend !== 1 ? 's' : ''}
<b>╰─────────────────────╯</b>

<b>╭─────────────────────╮</b>
<b>│ 📥 Deposit Summary!                  │</b>
<b>├─────────────────────┤</b>
<b>│ 💰 Total Deposited:</b> <code>${payload.totalDeposits.toFixed(2)}</code> 💎
<b>│ 🔄 Deposit Count:</b> <code>${payload.depositCount}</code> Time${payload.depositCount !== 1 ? 's' : ''}
<b>╰─────────────────────╯</b>

<b>╭─────────────────────╮</b>
<b>│ 🛒 Order Summary!                     │</b>
<b>├─────────────────────┤</b>
<b>│ 🛍 Total Orders:</b> <code>${payload.totalOrders}</code> Order${payload.totalOrders !== 1 ? 's' : ''}
<b>│ 🏷 Total Order :</b> <code>${payload.totalOrderValue.toFixed(2)}</code> Point${payload.totalOrderValue !== 1 ? 's' : ''}
<b>╰─────────────────────╯</b>

 ✅ <code>${new Date().toISOString().replace('T', ' ').slice(0, 19)}</code>
        `.trim()

        const keyboard = {
            inline_keyboard: [[
                { text: '↻ Refresh', callback_data: `#RefreshMetrics:${payload.userId}` },
                { text: '🔗 User', url: `tg://openmessage?user_id=${payload.userId}` }
            ]]
        }

        const profileKey = `${CONFIG.redis.userProfilePrefix}${payload.userId}:profile:main`

        try {
            const storedMsgId = await redis.hget(profileKey, 'forum_message_id')

            if (storedMsgId) {
                // Edit existing metrics message
                await this.bot.telegram.editMessageText(
                    this.channelId,
                    parseInt(storedMsgId),
                    undefined,
                    message,
                    { parse_mode: 'HTML', reply_markup: keyboard }
                )
                return true
            } else {
                // Send new and pin
                const sent = await this.bot.telegram.sendMessage(this.channelId, message, {
                    message_thread_id: forumId,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                })

                if (sent) {
                    await redis.hset(profileKey, { forum_message_id: sent.message_id.toString() })

                    // Try to pin (may fail due to permissions)
                    try {
                        await this.bot.telegram.pinChatMessage(this.channelId, sent.message_id, {
                            disable_notification: true
                        })
                    } catch { /* Ignore pin errors */ }
                }
                return true
            }
        } catch (error: any) {
            logger.error('[Telegram] Failed to send user metrics', { error: error.message })
            return false
        }
    }

    // --------------------------------------------------------------------------
    // SYSTEM ALERTS
    // --------------------------------------------------------------------------

    async sendAlert(payload: AlertPayload): Promise<boolean> {
        if (!this.bot) return false

        const severityEmoji = {
            info: 'ℹ️',
            warning: '⚠️',
            critical: '🚨'
        }

        const message = `${severityEmoji[payload.severity]} <b>${payload.title}</b>\n\n${payload.message}`

        try {
            // Alerts go to alerts channel or general (no topic)
            await this.bot.telegram.sendMessage(
                CONFIG.telegram.alertsChannel || this.channelId,
                message,
                { parse_mode: 'HTML' }
            )
            return true
        } catch (error: any) {
            logger.error('[Telegram] Failed to send alert', { error: error.message })
            return false
        }
    }
}

// ============================================================================
// EMAIL SERVICE
// ============================================================================

class EmailChannel {
    private transporter: nodemailer.Transporter | null = null

    constructor() {
        if (CONFIG.email.enabled) {
            this.transporter = nodemailer.createTransport({
                host: CONFIG.email.host,
                port: CONFIG.email.port,
                secure: CONFIG.email.port === 465,
                auth: {
                    user: CONFIG.email.user,
                    pass: CONFIG.email.pass
                }
            })
            logger.info('[Email] SMTP transport initialized')
        } else {
            logger.warn('[Email] Disabled - missing SMTP_USER or SMTP_PASS')
        }
    }


    async sendDepositConfirmation(payload: DepositPayload): Promise<boolean> {
        if (!this.transporter || !payload.userEmail) return false

        const html = EmailTemplates.depositConfirmation(payload)

        try {
            await this.transporter.sendMail({
                from: CONFIG.email.from,
                to: payload.userEmail,
                subject: `💎 Deposit Confirmed - ${payload.amount.toFixed(2)} Points`,
                html
            })
            logger.info(`[Email] Sent deposit confirmation to ${payload.userEmail}`)
            return true
        } catch (error: any) {
            logger.error('[Email] Failed to send deposit confirmation', { error: error.message })
            return false
        }
    }

    async sendOrderUpdate(payload: OrderPayload, userEmail?: string): Promise<boolean> {
        if (!this.transporter || !userEmail) return false

        const html = EmailTemplates.orderUpdate(payload)

        try {
            await this.transporter.sendMail({
                from: CONFIG.email.from,
                to: userEmail,
                subject: `📱 Order ${payload.status} - ${payload.appName}`,
                html
            })
            return true
        } catch (error: any) {
            logger.error('[Email] Failed to send order update', { error: error.message })
            return false
        }
    }

    async sendAlert(payload: AlertPayload, recipientEmail?: string): Promise<boolean> {
        if (!this.transporter) return false

        const to = recipientEmail || CONFIG.email.user // Default to admin email
        if (!to) return false

        try {
            await this.transporter.sendMail({
                from: CONFIG.email.from,
                to,
                subject: `🚨 [${payload.severity.toUpperCase()}] ${payload.title}`,
                text: payload.message,
                html: EmailTemplates.alert(payload.title, payload.message)
            })
            return true
        } catch {
            return false
        }
    }
}

// ============================================================================
// NOTIFICATION MANAGER (Unified Interface)
// ============================================================================

class NotificationManager {
    private telegram: TelegramChannel
    private email: EmailChannel

    constructor() {
        this.telegram = new TelegramChannel()
        this.email = new EmailChannel()
        logger.info('[NotificationManager] Initialized')
    }

    /**
     * Send deposit notification to all enabled channels
     */
    async deposit(payload: DepositPayload): Promise<void> {
        // Fire simultaneously, don't await
        Promise.allSettled([
            this.telegram.sendDepositNotification(payload),
            this.email.sendDepositConfirmation(payload)
        ]).catch(() => { })

        // Also update user metrics in Telegram
        if (payload.userId) {
            this.userMetrics(payload.userId).catch(() => { })
        }
    }

    /**
     * Send order update (supports live editing on status change)
     */
    async orderUpdate(payload: OrderPayload, userEmail?: string): Promise<void> {
        Promise.allSettled([
            this.telegram.sendOrderReport(payload),
            this.email.sendOrderUpdate(payload, userEmail)
        ]).catch(() => { })
    }

    /**
     * Send/update user metrics report in their Telegram topic
     */
    async userMetrics(userId: string): Promise<void> {
        try {
            // Fetch user data from database
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    name: true,
                    wallet: {
                        select: {
                            balance: true,
                            transactions: {
                                select: { amount: true, type: true }
                            }
                        }
                    },
                    numbers: {
                        select: { price: true }
                    }
                }
            })

            if (!user) return

            const deposits = user.wallet?.transactions.filter(t =>
                t.type === 'deposit' || t.type === 'admin_credit'
            ) || []
            const orders = user.numbers || []

            const payload: UserMetricsPayload = {
                userId,
                userName: user.name || 'Unknown',
                balance: Number(user.wallet?.balance || 0),
                totalSpend: orders.reduce((sum, o) => sum + Number(o.price || 0), 0),
                totalDeposits: deposits.reduce((sum, d) => sum + Math.abs(Number(d.amount)), 0),
                depositCount: deposits.length,
                totalOrders: orders.length,
                totalOrderValue: orders.reduce((sum, o) => sum + Number(o.price || 0), 0)
            }

            await this.telegram.sendUserMetricsReport(payload)
        } catch (error: any) {
            logger.error('[NotificationManager] Failed to send user metrics', { error: error.message })
        }
    }

    /**
     * Send system alert (goes to all channels)
     */
    async alert(title: string, message: string, severity: AlertPayload['severity'] = 'info'): Promise<void> {
        const payload: AlertPayload = { title, message, severity }

        // Also record as incident metric
        recordIncident(severity, title.toLowerCase().replace(/\s+/g, '_'))

        Promise.allSettled([
            this.telegram.sendAlert(payload),
            this.email.sendAlert(payload)
        ]).catch(() => { })
    }

    // Expose Telegram topic management for advanced use cases
    get telegram_topics() {
        return {
            archive: (userId: string) => this.telegram.archiveForumTopic(userId),
            reopen: (userId: string) => this.telegram.reopenForumTopic(userId),
            update: (userId: string, newName: string) => this.telegram.updateForumTopic(userId, newName)
        }
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const notify = new NotificationManager()

export const notificationManager = notify

// Re-export deposit tracking services
export { depositTracker, redeemCodes } from './deposit-tracker'
