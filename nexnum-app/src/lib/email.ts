import nodemailer from 'nodemailer'
import { render } from '@react-email/render'
import { ReactElement } from 'react'
import { SettingsService } from './settings'

// ============================================================
// EMAIL SERVICE (SMTP)
// ============================================================

interface SendEmailParams {
    to: string
    subject: string
    component: ReactElement
}

export class EmailService {
    private static transporter: nodemailer.Transporter | null = null

    private static async getTransporter() {
        if (this.transporter) return this.transporter

        let host = process.env.SMTP_HOST
        let port = parseInt(process.env.SMTP_PORT || '587')
        let user = process.env.SMTP_USER
        let pass = process.env.SMTP_PASS

        try {
            const settings = await SettingsService.getSettings()
            if (settings.smtp.host) {
                host = settings.smtp.host
                port = settings.smtp.port
                user = settings.smtp.user
                pass = settings.smtp.pass
            }
        } catch (e) {
            console.warn('[EmailService] Failed to fetch settings, using environment fallbacks.')
        }

        if (!host || !user || !pass) {
            throw new Error('[EmailService] SMTP credentials missing. Email sending requires a configured SMTP server.');
        }

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465, // true for 465, false for other ports
            auth: {
                user,
                pass
            }
        })

        return this.transporter
    }

    /**
     * Send an email using SMTP (Nodemailer)
     */
    static async send({ to, subject, component }: SendEmailParams) {
        try {
            // 1. Get settings for sender address or use env/default
            let from = process.env.FROM_EMAIL || '"NexNum" <harshtakur001@gmail.com>'
            try {
                const settings = await SettingsService.getSettings()
                if (settings.general.emailSender) {
                    from = settings.general.emailSender
                }
            } catch (e) {
                console.warn('[EmailService] Failed to fetch settings, using defaults.')
            }

            // 2. Render React component to HTML
            const html = await render(component)

            // 3. Get Transporter
            const transporter = await this.getTransporter()


            // 5. Send Email
            if (process.env.NODE_ENV !== 'production') {
                console.log('📧 [Dev Email Preview] -----------------------')
                console.log(`To: ${to}`)
                console.log(`Subject: ${subject}`)
                // crude extraction of link for convenience
                const linkMatch = html.match(/href="(http:\/\/[^"]+)"/);
                if (linkMatch) {
                    console.log(`🔗 Link Found: ${linkMatch[1]}`)
                }
                console.log('------------------------------------------------')
            }
            const info = await transporter.sendMail({
                from,
                to,
                subject,
                html
            })

            console.log(`[EmailService] Sent email: ${info.messageId}`)
            return { success: true, id: info.messageId }

        } catch (error: any) {
            console.error('Email service error:', error)
            return { success: false, error: error.message || error }
        }
    }
}

