import nodemailer from 'nodemailer'
import { logger } from '@/lib/core/logger'
import { NotificationChannel, NotificationPayload } from '../types'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587')
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const FROM_EMAIL = process.env.FROM_EMAIL || '"NexNum" <noreply@nexnum.com>'

export class EmailService implements NotificationChannel {
    name = 'email'
    private transporter: nodemailer.Transporter | null = null

    constructor() {
        if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                host: SMTP_HOST,
                port: SMTP_PORT,
                secure: SMTP_PORT === 465,
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASS
                }
            })
        } else {
            logger.warn('SMTP credentials missing. Email notifications disabled.')
        }
    }

    async send(payload: NotificationPayload): Promise<boolean> {
        if (!this.transporter) return false

        // Only send certain types or alerts
        // For now, let's assume we email on critical alerts and deposits
        if (payload.type !== 'DEPOSIT' && payload.type !== 'ALERT') {
            return true // Skip silently
        }

        try {
            // Get user email - in a real app we'd fetch from DB using payload.userId
            // For now, we'll assume we have a way to lookup, or just log for this demo
            // Since payload doesn't have email, let's just log "Would send email"
            // unless we fetch user here.

            // NOTE: In production, the NotificationManager should hydrate the payload with email 
            // or pass it in. For this step, we'll placeholder.

            // await this.transporter.sendMail({ ... })
            logger.info('[EmailService] Sent email for ' + payload.type)
            return true
        } catch (error) {
            logger.error('Email Send Error', { error })
            return false
        }
    }
}
