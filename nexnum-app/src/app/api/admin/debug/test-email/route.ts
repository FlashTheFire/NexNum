import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/requireAdmin'
import { EmailService } from '@/lib/email'
import { WelcomeEmail } from '@/components/emails/WelcomeEmail'
import { VerificationEmail } from '@/components/emails/VerificationEmail'
import { TransactionEmail } from '@/components/emails/TransactionEmail'
import { LowBalanceEmail } from '@/components/emails/LowBalanceEmail'
import { AnnouncementEmail } from '@/components/emails/AnnouncementEmail'
import { SecurityAlertEmail } from '@/components/emails/SecurityAlertEmail'
import { ApiKeyEmail } from '@/components/emails/ApiKeyEmail'
import { MaintenanceEmail } from '@/components/emails/MaintenanceEmail'
import { InvoiceEmail } from '@/components/emails/InvoiceEmail'

export async function POST(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const { template, to } = await request.json()

        if (!to) return NextResponse.json({ error: 'Recipient required' }, { status: 400 })

        let component
        let subject

        switch (template) {
            case 'welcome':
                subject = 'Test: Welcome Email'
                component = WelcomeEmail({ name: 'Test User' })
                break
            case 'verification':
                subject = 'Test: Verification Code'
                component = VerificationEmail({ code: '123456' })
                break
            case 'deposit':
                subject = 'Test: Deposit Receipt'
                component = TransactionEmail({
                    type: 'deposit',
                    amount: 50.00,
                    currency: 'USD',
                    referenceId: 'TXN-TEST-12345',
                    date: new Date().toLocaleDateString(),
                    description: 'Wallet Top-up'
                })
                break
            case 'purchase':
                subject = 'Test: Purchase Receipt'
                component = TransactionEmail({
                    type: 'purchase',
                    amount: 2.50,
                    currency: 'USD',
                    referenceId: 'ORD-TEST-9999',
                    date: new Date().toLocaleDateString(),
                    description: 'USA Physical Number (Verizon)'
                })
                break
            case 'lowBalance':
                subject = 'Test: Low Balance Alert'
                component = LowBalanceEmail({
                    balance: 2.50,
                    threshold: 5.00,
                    name: 'Admin User'
                })
                break
            case 'announcement':
                subject = 'Test: Announcement'
                component = AnnouncementEmail({
                    title: 'Big News: New Features!',
                    content: '<p> We have just launched our new <strong>Email System</strong>. <br/> Check it out in your dashboard.</p>',
                    actionLabel: 'Read More',
                    actionUrl: 'https://nexnum.io/blog',
                    imageUrl: 'https://placehold.co/600x300/8b5cf6/ffffff?text=New+Feature'
                })
                break
            case 'security':
                subject = 'Security Alert: New Sign-in'
                component = SecurityAlertEmail({
                    type: 'login',
                    ip: '203.0.113.195',
                    location: 'San Francisco, CA',
                    device: 'Chrome on macOS',
                    time: new Date().toLocaleString()
                })
                break
            case 'apiKey':
                subject = 'API Key Created'
                component = ApiKeyEmail({
                    action: 'created',
                    keyName: 'Production API Key',
                    keyPrefix: 'sk_live_'
                })
                break
            case 'maintenance':
                subject = 'System Maintenance Notice'
                component = MaintenanceEmail({
                    startTime: 'Jan 15, 02:00 UTC',
                    endTime: 'Jan 15, 04:00 UTC',
                    reason: 'Database Upgrades'
                })
                break
            case 'invoice':
                subject = 'New Invoice #INV-2024-001'
                component = InvoiceEmail({
                    invoiceId: 'INV-2024-001',
                    amount: 99.00,
                    currency: 'USD',
                    date: new Date().toLocaleDateString(),
                    items: [
                        { description: 'Pro Plan Subscription (Monthly)', amount: 49.00 },
                        { description: 'Dedicated Number (UK)', amount: 50.00 }
                    ]
                })
                break
            default:
                return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
        }

        const result = await EmailService.send({
            to,
            subject,
            component
        })

        if (!result.success) {
            throw result.error
        }

        return NextResponse.json({ success: true, message: `Sent ${template} email to ${to}` })
    } catch (error) {
        console.error('Test email failed:', error)
        return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
    }
}
