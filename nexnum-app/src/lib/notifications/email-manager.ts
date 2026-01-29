import { EmailService } from '@/lib/email'
import { ConfirmEmail } from '@/components/emails/ConfirmEmail'
import { WelcomeEmail } from '@/components/emails/WelcomeEmail'
import { PasswordResetEmail } from '@/components/emails/PasswordResetEmail'
import { SecurityAlertEmail } from '@/components/emails/SecurityAlertEmail'
import { TransactionEmail } from '@/components/emails/TransactionEmail'
import { ApiKeyEmail } from '@/components/emails/ApiKeyEmail'

/**
 * Industrial Email Manager (Transaction Master)
 * 
 * Centralized coordination of all transactional communications.
 * - Standardized Subject Lines
 * - Semantic API for Developers
 * - Automated Internal Alerting Hooks
 */
export class EmailManager {
    /**
     * Auth: Confirm Account Registration
     */
    static async sendConfirmation(to: string, name: string, link: string) {
        return EmailService.send({
            to,
            subject: '🔒 Action Required: Confirm Your NexNum Account',
            component: ConfirmEmail({ name, confirmLink: link })
        })
    }

    /**
     * Auth: Welcome Message (Post-Verification)
     */
    static async sendWelcome(to: string, name: string) {
        return EmailService.send({
            to,
            subject: '✨ Protocol Activated: Welcome to NexNum',
            component: WelcomeEmail({ name })
        })
    }

    /**
     * Auth: Password Reset Requested
     */
    static async sendPasswordReset(to: string, name: string, link: string) {
        return EmailService.send({
            to,
            subject: '🔑 Protocol Security: Password Reset Requested',
            component: PasswordResetEmail({ name, resetLink: link })
        })
    }

    /**
     * Security: New API Key Generated
     */
    static async sendApiKeyGenerated(to: string, name: string, keyName: string, keyPrefix: string) {
        return EmailService.send({
            to,
            subject: '🛡️ Security Alert: New API Key Authorized',
            component: ApiKeyEmail({ name, action: 'created', keyName, keyPrefix })
        })
    }

    /**
     * Finance: Successful Transaction
     */
    static async sendTransactionReceipt(to: string, name: string, amount: number, transactionId: string) {
        return EmailService.send({
            to,
            subject: `💳 Digital Receipt: Transaction #${transactionId.slice(-8).toUpperCase()}`,
            component: TransactionEmail({
                name,
                type: 'deposit',
                amount,
                currency: 'USD',
                referenceId: transactionId,
                date: new Date().toLocaleDateString(),
                description: 'Wallet Balance Deposit'
            })
        })
    }

    /**
     * Security: High-Risk Login Detected
     */
    static async sendSecurityAlert(to: string, name: string, alert: { type: 'login' | 'password_changed'; ip: string; city: string; country: string }) {
        return EmailService.send({
            to,
            subject: '🚨 CRITICAL: High-Risk Access Detected',
            component: SecurityAlertEmail({
                name,
                type: alert.type,
                location: `${alert.city}, ${alert.country}`,
                ip: alert.ip,
                time: new Date().toLocaleString()
            })
        })
    }
}
