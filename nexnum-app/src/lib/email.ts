import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { ReactElement } from 'react'
import { SettingsService } from './settings'

// ============================================================
// EMAIL SERVICE (SMTP + Resend)
// ============================================================

interface SendEmailParams {
    to: string
    subject: string
    component: ReactElement
}

export class EmailService {
    private static transporter: nodemailer.Transporter | null = null
    private static resendClient: Resend | null = null

    // Rate limiting for email sending
    private static readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
    private static readonly MAX_EMAILS_PER_WINDOW = 100; // Max emails per window
    private static emailTimestamps: Map<string, number[]> = new Map();

    private static useResend(): boolean {
        return process.env.NODE_ENV === 'production' && !!process.env.RESEND_API_KEY
    }

    private static async getResendClient() {
        if (this.resendClient) return this.resendClient

        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) {
            throw new Error('[EmailService] RESEND_API_KEY is not configured.')
        }

        this.resendClient = new Resend(apiKey)
        return this.resendClient
    }

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
            throw new Error('[EmailService] SMTP credentials missing. Email sending requires a configured SMTP server.')
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
     * Check if we can send email to this address based on rate limits
     */
    private static canSendEmail(email: string): boolean {
        const now = Date.now();
        const windowStart = now - this.RATE_LIMIT_WINDOW_MS;

        // Get or initialize timestamps for this email
        let timestamps = this.emailTimestamps.get(email) || [];

        // Remove timestamps outside the window
        timestamps = timestamps.filter(timestamp => timestamp > windowStart);

        // Check if we're under the limit
        if (timestamps.length >= this.MAX_EMAILS_PER_WINDOW) {
            return false;
        }

        // Add current timestamp and store back
        timestamps.push(now);
        this.emailTimestamps.set(email, timestamps);

        // Clean up old entries periodically (every 10 minutes)
        if (now % 600000 < 1000) { // Roughly every 10 minutes
            this.cleanupOldEntries();
        }

        return true;
    }

    /**
     * Clean up old entries to prevent memory leaks
     */
    private static cleanupOldEntries() {
        const now = Date.now();
        const windowStart = now - this.RATE_LIMIT_WINDOW_MS;

        for (const [email, timestamps] of this.emailTimestamps.entries()) {
            const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);
            if (validTimestamps.length === 0) {
                this.emailTimestamps.delete(email);
            } else {
                this.emailTimestamps.set(email, validTimestamps);
            }
        }
    }

    /**
     * Send an email using SMTP (Nodemailer)
     */
    static async send({ to, subject, component }: SendEmailParams) {
        try {
            // Check rate limiting
            if (!this.canSendEmail(to)) {
                throw new Error(`Rate limit exceeded for email: ${to}`);
            }

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

            if (this.useResend()) {
                const resend = await this.getResendClient()
                const response = await resend.emails.send({
                    from,
                    to,
                    subject,
                    html,
                })

                if (response.error || !response.data) {
                    const details = response.error
                        ? `${response.error.name} (${response.error.statusCode ?? 'unknown status'}): ${response.error.message}`
                        : 'no response data returned'
                    throw new Error(`[EmailService] Resend email failed: ${details}`)
                }

                console.log(`[EmailService] Sent email via Resend: ${response.data.id}`)
                return { success: true, id: response.data.id }
            }

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
