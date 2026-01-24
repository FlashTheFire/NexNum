import { Telegraf, Context } from 'telegraf'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { NotificationChannel, NotificationPayload, OrderNotification, DepositNotification, MetricReportNotification } from '../types'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_ADMIN_CHANNEL = process.env.TELEGRAM_ADMIN_CHANNEL // e.g., -1002203139746

export class TelegramService implements NotificationChannel {
    name = 'telegram'
    private bot: Telegraf
    private channelId: string

    constructor() {
        if (!TELEGRAM_BOT_TOKEN) {
            logger.warn('TELEGRAM_BOT_TOKEN is not set. Telegram notifications disabled.')
            this.bot = new Telegraf('DISABLED') // Dummy to prevent crash
        } else {
            this.bot = new Telegraf(TELEGRAM_BOT_TOKEN)
        }
        this.channelId = TELEGRAM_ADMIN_CHANNEL || ''
    }

    async send(payload: NotificationPayload): Promise<boolean> {
        if (!TELEGRAM_BOT_TOKEN || !this.channelId) return false

        try {
            switch (payload.type) {
                case 'DEPOSIT':
                    return await this.handleDeposit(payload)
                case 'ORDER':
                    return await this.handleOrder(payload)
                case 'USER_METRICS':
                    return await this.handleUserMetrics(payload)
                case 'ALERT':
                    return await this.handleAlert(payload)
                default:
                    return false
            }
        } catch (error) {
            logger.error('Telegram Send Error', { error })
            return false
        }
    }

    // ============================================================================
    // FORUM / TOPIC MANAGEMENT
    // ============================================================================

    private async getOrCreateForumTopic(userId: string, userName: string): Promise<number | null> {
        const profileKey = `user_data:${userId}:profile:main`
        const storedForumId = await redis.hget(profileKey, 'forum_id')

        if (storedForumId) {
            return parseInt(storedForumId)
        }

        // Create new topic
        try {
            // Valid Telegram forum topic colors
            const colors = [0x6FB9F0, 0xFFD67E, 0xCB86DB, 0x8EEE98, 0xFF93B2, 0xFB6F5F] as const
            const iconColor = colors[Math.floor(Math.random() * colors.length)]
            const topicName = `❯ ${userName} [${userId}]`

            // Get safe custom emoji
            const customEmojiId = await this.getRandomSafeEmojiId()

            const topic = await this.bot.telegram.createForumTopic(this.channelId, topicName, {
                icon_color: iconColor,
                icon_custom_emoji_id: customEmojiId || undefined
            })

            if (topic) {
                await redis.hset(profileKey, { forum_id: topic.message_thread_id.toString() })
                logger.info(`Created Forum Topic for ${userId}: ${topic.message_thread_id}`)
                return topic.message_thread_id
            }
        } catch (error) {
            logger.error('Failed to create forum topic', { userId, error })
        }
        return null
    }

    private async getRandomSafeEmojiId(): Promise<string | null> {
        if (!TELEGRAM_BOT_TOKEN) return null

        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getForumTopicIconStickers`
            const response = await fetch(url)

            if (!response.ok) return null

            const data = await response.json()
            if (!data.ok || !Array.isArray(data.result)) return null

            const restrictedEmojis = ["🍆", "🍑", "🔞", "🥃", "🍺", "🍷", "🍸", "🚬"]

            const safeStickers = data.result.filter((sticker: any) => {
                // Check if emoji is in restricted list
                // Some stickers might have multiple emojis, usually the first one is representative
                if (!sticker.emoji) return true
                return !restrictedEmojis.includes(sticker.emoji)
            })

            if (safeStickers.length === 0) return null

            const randomSticker = safeStickers[Math.floor(Math.random() * safeStickers.length)]
            return randomSticker.custom_emoji_id
        } catch (error) {
            logger.error('Failed to get safe emoji', { error })
            return null
        }
    }

    // ============================================================================
    // HANDLERS
    // ============================================================================

    private async handleDeposit(payload: DepositNotification): Promise<boolean> {
        // ensure topic exists
        const forumId = await this.getOrCreateForumTopic(payload.userId, `User ${payload.userId}`)
        if (!forumId) return false

        const emoji = payload.paymentType === 'UPI' ? '🇮🇳' : '💳' // Example mapping

        const message = `
<b>#${payload.paymentType.toUpperCase().replace(/\s/g, '_')}_DEPOSIT ❯</b>

<b>Transaction Details »</b>
<blockquote expandable>
<b>💰 Amount »</b> <code>${payload.amount}</code> 💎
<b>👤 Paid From »</b> <code>${payload.paidFrom}</code>
<b>🕊 Payment Type »</b> <code>${payload.paymentType}</code>

<b>Balance Update »</b>
<b>🏛</b> <code>${payload.depositId}</code>
<b>⏱️ Time »</b> ${payload.timestamp.toISOString().replace('T', ' ').substring(0, 19)}
</blockquote>
<b>Successfully Credited</b>
        `.trim()

        const keyboard = {
            inline_keyboard: [[
                { text: '🔗 User', url: `tg://openmessage?user_id=${payload.userId}` },
                { text: '⌕ Details', callback_data: `deposit:${payload.depositId}` }
            ]]
        }

        // Send to admin channel in specific topic
        const sent = await this.bot.telegram.sendMessage(this.channelId, message, {
            message_thread_id: forumId,
            parse_mode: 'HTML',
            reply_markup: keyboard
        })

        // Also update the "metrics report" card if it exists
        // (Logic from user_metrics_report would be called separately by manager)

        return !!sent
    }

    private async handleOrder(payload: OrderNotification): Promise<boolean> {
        const forumId = await this.getOrCreateForumTopic(payload.userId, `User ${payload.userId}`)
        if (!forumId) return false

        const isUpdate = payload.status !== 'PENDING'
        const validStatusMap: Record<string, string> = {
            'PENDING': '⏳ processing',
            'COMPLETED': '✅ Order Has Completed',
            'CANCELLED': '⏱️ Order Is Cancelled',
            'EXPIRED': '⏱️ Order Has Expired'
        }
        const validStatus = validStatusMap[payload.status] || payload.status

        const message = `
<b>#${payload.phoneNumber ? 'USER' : 'API'}_ORDER_DETAILS ❯</b>

<b>Transaction Details »</b>
<blockquote expandable>
📦 <b>App Name »</b> <code>${payload.appName}</code>
💰 <b>Price »</b> <code>${payload.price}</code> 💎
🌍 <b>Region »</b> <code>${payload.country}</code> [ <code>${payload.countryCode}</code> ]

<b>Contact Details »</b>
💳 <code>${payload.orderId}</code>
📞 <code>+${payload.phoneNumber}</code>
⎚ Code » <code>...</code> <!-- Placeholder for visual parity -->

${payload.smsList && payload.smsList.length > 0 ? `🔐 <b>Codes »</b> <code>${payload.smsList.join(', ')}</code>\n` : ''}
${validStatus}
</blockquote>
        `.trim()

        const keyboard = {
            inline_keyboard: [[
                { text: '🔗 User', url: `tg://openmessage?user_id=${payload.userId}` },
                { text: '⌕ Details', callback_data: `order:${payload.orderId}` }
            ]]
        }

        const redisKey = `order_info:${payload.orderId}`

        try {
            let messageId: number | null = null

            // If it's an update, try to edit
            if (isUpdate) {
                const storedMsgId = await redis.hget(redisKey, 'forum_message_id')
                if (storedMsgId) {
                    await this.bot.telegram.editMessageText(this.channelId, parseInt(storedMsgId), undefined, message, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    })
                    return true
                }
            }

            // Otherwise send new
            const sent = await this.bot.telegram.sendMessage(this.channelId, message, {
                message_thread_id: forumId,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })

            // Store message ID for future edits
            if (sent) {
                await redis.hset(redisKey, { forum_message_id: sent.message_id.toString() })
            }

            return !!sent
        } catch (e) {
            logger.error('Telegram Order/Edit Failed', { error: e })
            return false
        }
    }

    private async handleUserMetrics(payload: MetricReportNotification): Promise<boolean> {
        const forumId = await this.getOrCreateForumTopic(payload.userId, payload.username)
        if (!forumId) return false

        const message = `
 👤 <b>User:</b> <code>${payload.username}</code> <b>||</b> <code>${payload.userId}</code>

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

 ✅ <code>${new Date().toISOString().replace('T', ' ').substring(0, 19)}</code>
        `.trim()

        const keyboard = {
            inline_keyboard: [[
                { text: '↻ Refresh', callback_data: `#RefreshMetrics:${payload.userId}` },
                { text: '🔗 User', url: `tg://openmessage?user_id=${payload.userId}` }
            ]]
        }

        const profileKey = `user_data:${payload.userId}:profile:main`
        const storedMsgId = await redis.hget(profileKey, 'forum_message_id')

        try {
            if (storedMsgId) {
                // Try editing
                await this.bot.telegram.editMessageText(this.channelId, parseInt(storedMsgId), undefined, message, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                })
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
                    try {
                        await this.bot.telegram.pinChatMessage(this.channelId, sent.message_id, { disable_notification: true })
                    } catch (e) { /* ignore pin errors */ }
                }
                return !!sent
            }
        } catch (e) {
            logger.error('Telegram UserMetrics Failed', { error: e })
            return false
        }
    }

    private async handleAlert(payload: NotificationPayload & { type: 'ALERT' }): Promise<boolean> {
        // Alerts go to general topic (or null message_thread_id for 'General' topic in older groups)
        // For simplicity, we send to a default or dedicated alert topic if configured, otherwise general.
        // We'll just send to channel root for now (General).

        const message = `🚨 <b>${payload.title}</b>\n\n${payload.message}`
        await this.bot.telegram.sendMessage(this.channelId, message, { parse_mode: 'HTML' })
        return true
    }
}
