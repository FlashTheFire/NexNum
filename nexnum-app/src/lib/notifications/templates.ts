/**
 * Email Templates
 * 
 * Standardized HTML email generation for notifications.
 */

export interface EmailTemplatePayload {
    amount?: number
    depositId?: string
    transactionId?: string
    paidFrom?: string
    paymentType?: string
    timestamp?: Date
    status?: string
    appName?: string
    phoneNumber?: string
    country?: string
    smsList?: string[]
}

const BASE_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 20px; color: #718096; font-size: 12px; }
    .details { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
`

export const EmailTemplates = {
    depositConfirmation: (payload: EmailTemplatePayload) => `
<!DOCTYPE html>
<html>
<head><style>
    ${BASE_STYLES}
    .amount { font-size: 32px; font-weight: bold; color: #2d3748; }
</style></head>
<body>
<div class="container">
    <div class="header"><h1>💎 Deposit Confirmed</h1></div>
    <div class="content">
        <div class="amount">${payload.amount?.toFixed(2)} Points</div>
        <p>Your deposit has been successfully credited to your account.</p>
        <div class="details">
            <div class="detail-row"><span>Transaction ID</span><span>${payload.depositId}</span></div>
            <div class="detail-row"><span>Payment Method</span><span>${payload.paidFrom}</span></div>
            <div class="detail-row"><span>Type</span><span>${payload.paymentType}</span></div>
            <div class="detail-row"><span>Date</span><span>${(payload.timestamp || new Date()).toLocaleString()}</span></div>
        </div>
    </div>
    <div class="footer"><p>Thank you for using NexNum!</p></div>
</div>
</body>
</html>`,

    orderUpdate: (payload: EmailTemplatePayload) => {
        const statusColors: Record<string, string> = {
            COMPLETED: '#c6f6d5; color: #22543d',
            PENDING: '#fefcbf; color: #744210',
            ACTIVE: '#fefcbf; color: #744210',
            CANCELLED: '#fed7d7; color: #742a2a',
            EXPIRED: '#fed7d7; color: #742a2a'
        }

        const statusText: Record<string, string> = {
            PENDING: 'Your order is being processed',
            ACTIVE: 'Your number is ready and waiting for SMS',
            COMPLETED: 'Your order has been completed successfully',
            CANCELLED: 'Your order has been cancelled',
            EXPIRED: 'Your order has expired'
        }

        const colorStyle = statusColors[payload.status || 'PENDING'] || '#edf2f7'
        const title = statusText[payload.status || 'PENDING'] || 'Order Update'

        return `
<!DOCTYPE html>
<html>
<head><style>
    ${BASE_STYLES}
    .status { padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px; background: ${colorStyle.split(';')[0]}; ${colorStyle.split(';')[1]} }
</style></head>
<body>
<div class="container">
    <div class="status"><h2>${title}</h2></div>
    <div class="details">
        <p><strong>Service:</strong> ${payload.appName}</p>
        <p><strong>Number:</strong> +${payload.phoneNumber}</p>
        <p><strong>Region:</strong> ${payload.country}</p>
        ${payload.smsList?.length ? `<p><strong>SMS Codes:</strong> ${payload.smsList.join(', ')}</p>` : ''}
    </div>
    <div class="footer"><p>Track your orders on the dashboard.</p></div>
</div>
</body>
</html>`
    },

    alert: (title: string, message: string) => `
<!DOCTYPE html>
<html>
<head><style>${BASE_STYLES}</style></head>
<body>
<div class="container">
    <div class="header" style="background: #e53e3e;"><h1>${title}</h1></div>
    <div class="content"><p>${message}</p></div>
</div>
</body>
</html>`
}
