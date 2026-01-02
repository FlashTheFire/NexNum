import { Resend } from 'resend'
import { render } from '@react-email/render'
import { ReactElement } from 'react'

// Initialize Resend with API key
// If key is missing, we'll log emails to console (Dev mode)
const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null

const FROM_EMAIL = 'NexNum <system@nexnum.io>' // You should verify this domain in Resend
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface SendEmailParams {
    to: string
    subject: string
    component: ReactElement
}

export class EmailService {
    /**
     * Send an email using Resend
     */
    static async send({ to, subject, component }: SendEmailParams) {
        try {
            // Check if email sending is enabled in settings (if you passed settings here)
            // For now we assume enabled if called.

            // 1. Render React component to HTML
            const html = await render(component)

            // 2. Mock sending in Dev if no key
            if (!resend) {
                console.log('📧 [Email Mock] --------------------------------')
                console.log(`To: ${to}`)
                console.log(`Subject: ${subject}`)
                console.log('--- HTML Preview ---')
                console.log(html.substring(0, 500) + '...')
                console.log('------------------------------------------------')
                return { success: true, id: 'mock-id' }
            }

            // 3. Send via Resend
            const data = await resend.emails.send({
                from: FROM_EMAIL,
                to,
                subject,
                html,
            })

            if (data.error) {
                console.error('Email sending failed:', data.error)
                return { success: false, error: data.error }
            }

            return { success: true, id: data.data?.id }

        } catch (error) {
            console.error('Email service error:', error)
            return { success: false, error }
        }
    }
}
