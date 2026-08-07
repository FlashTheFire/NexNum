/**
 * Unified UPI Payment Provider for NexNum Bot Integration
 * 
 * Exclusively interfaces with nexnum-bot & Paytm QR Cloudflare Worker
 * 
 * @module payment/upi-provider
 */

import { logger } from '@/lib/core/logger'
import { getPaymentSettingsService, PaymentConfig, UPIProviderMode } from './payment-settings'

// ============================================================================
// Types
// ============================================================================

export interface CreateOrderResponse {
    status: boolean
    message: string
    result?: {
        orderId: string
        payment_url: string
    }
}

export interface CheckStatusResponse {
    status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'ERROR'
    message: string
    result?: {
        txnStatus: 'COMPLETED' | 'PENDING' | 'FAILED'
        resultInfo: string
        orderId: string
        status: 'SUCCESS' | 'FAILURE' | 'PENDING'
        amount: string
        date: string
        utr: string
    }
}

export interface DepositOrder {
    orderId: string
    paymentUrl: string
    qrCodeUrl: string
    amount: number
    expiresAt: Date
    expiresIn: number // seconds
}

export interface PaymentStatus {
    status: 'pending' | 'completed' | 'failed' | 'expired'
    amount?: number
    utr?: string // UPI Transaction Reference
    completedAt?: Date
    message?: string
}

// ============================================================================
// UPI Provider Class
// ============================================================================

export class UPIProvider {
    private configPromise: Promise<PaymentConfig> | null = null
    private cachedConfig: PaymentConfig | null = null
    private lastConfigFetch: number = 0
    private readonly CONFIG_CACHE_MS = 30000 // 30 seconds local cache

    /**
     * Get config with local caching
     */
    private async getConfig(): Promise<PaymentConfig> {
        const now = Date.now()

        if (this.cachedConfig && (now - this.lastConfigFetch) < this.CONFIG_CACHE_MS) {
            return this.cachedConfig
        }

        if (!this.configPromise) {
            this.configPromise = getPaymentSettingsService().getConfig().then(config => {
                this.cachedConfig = config
                this.lastConfigFetch = now
                this.configPromise = null
                return config
            })
        }

        return this.configPromise
    }

    /**
     * Generate unique order ID
     */
    generateOrderId(userId: string): string {
        const timestamp = Date.now()
        const random = Math.random().toString(36).substring(2, 8).toUpperCase()
        return `NXM_${userId.slice(-6)}_${timestamp}_${random}`
    }

    /**
     * Build and resolve QR code image URL for order
     */
    private async resolveQRCodeUrl(orderId: string, config: PaymentConfig): Promise<string> {
        const qrBase = config.upiQrBaseUrl || 'https://qr.udayscriptsx.workers.dev/'

        const upiRaw = `upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=NexNum&tr=${orderId}&tn=Adding Fund`
        const upiData = encodeURIComponent(upiRaw)

        const workerUrl = `${qrBase}?data=${upiData}&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 3500)
            const response = await fetch(workerUrl, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (response.ok) {
                const text = await response.text()
                try {
                    const data = JSON.parse(text)
                    if (data.image) return data.image
                } catch {}
            }
        } catch (_err) {}

        // Reliable fallback if worker is unreachable or returns invalid format
        return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiRaw)}`
    }

    /**
     * Create a new deposit order
     */
    async createOrder(
        orderId: string,
        amount: number,
        customerMobile: string,
        redirectUrl: string
    ): Promise<DepositOrder> {
        const config = await this.getConfig()

        // Ensure paymentsEnabled is true
        config.paymentsEnabled = true

        return this.createThirdPartyOrder(orderId, amount, customerMobile, redirectUrl, config)
    }

    /**
     * Create order via 3rd party gateway / nexnum-bot
     */
    private async createThirdPartyOrder(
        orderId: string,
        amount: number,
        customerMobile: string,
        redirectUrl: string,
        config: PaymentConfig
    ): Promise<DepositOrder> {
        const token = config.upiApiToken || 'nexnum_upi_token_default'

        try {
            const formData = new URLSearchParams()
            formData.append('customer_mobile', customerMobile)
            formData.append('user_token', token)
            formData.append('amount', amount.toString())
            formData.append('order_id', orderId)
            formData.append('redirect_url', redirectUrl)
            formData.append('remark1', 'NexNum Deposit')
            formData.append('remark2', orderId)

            const createUrl = config.upiCreateOrderUrl || 'https://pay.udayscripts.in/api/create-order'

            const response = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            })

            let paymentUrl = `upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=Paytm%20Merchant&tr=${orderId}&tn=Adding%20Fund`
            const expiresAt = new Date(Date.now() + config.depositTimeoutMins * 60 * 1000)

            try {
                const data: CreateOrderResponse = await response.json()
                if (data.status && data.result?.payment_url) {
                    paymentUrl = data.result.payment_url
                }
            } catch (_err) {}

            const qrCodeUrl = await this.resolveQRCodeUrl(orderId, config)

            return {
                orderId,
                paymentUrl,
                qrCodeUrl,
                amount,
                expiresAt,
                expiresIn: config.depositTimeoutMins * 60,
            }
        } catch (error: any) {
            const expiresAt = new Date(Date.now() + config.depositTimeoutMins * 60 * 1000)
            const qrCodeUrl = await this.resolveQRCodeUrl(orderId, config)
            return {
                orderId,
                paymentUrl: `upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=Paytm%20Merchant&tr=${orderId}&tn=Adding%20Fund`,
                qrCodeUrl,
                amount,
                expiresAt,
                expiresIn: config.depositTimeoutMins * 60,
            }
        }
    }

    /**
     * Check payment status for an order
     */
    async checkStatus(orderId: string): Promise<PaymentStatus> {
        const config = await this.getConfig()
        return this.checkThirdPartyStatus(orderId, config)
    }

    /**
     * Check status via nexnum-bot / Paytm worker / 3rd-party gateway.
     * This method NEVER throws — all failures gracefully return { status: 'pending' }.
     * This ensures the polling endpoint never returns HTTP 500 due to provider downtime.
     */
    private async checkThirdPartyStatus(orderId: string, config: PaymentConfig): Promise<PaymentStatus> {
        // 1. Primary: nexnum-bot FastAPI status endpoint (source of truth)
        try {
            const botUrl = process.env.NEXNUM_BOT_URL || 'http://nexnum-bot:8080'
            const botResp = await fetch(`${botUrl}/api/v1/deposit/status/${orderId}`, {
                signal: AbortSignal.timeout(3000),
            })
            if (botResp.ok) {
                const botData = await botResp.json()
                const depStatus = (botData?.deposit?.status || botData?.status || '').toUpperCase()
                if (depStatus === 'COMPLETED' || depStatus === 'SUCCESS') {
                    return {
                        status: 'completed',
                        amount: parseFloat(botData.deposit?.amount || botData.amount || 0),
                        utr: botData.deposit?.utr || botData.utr || 'AUTO_VERIFIED',
                        completedAt: new Date(),
                    }
                }
                if (depStatus === 'FAILED' || depStatus === 'CANCELLED' || depStatus === 'TIMEOUT') {
                    return { status: 'failed', message: 'Payment was not completed' }
                }
            }
        } catch (_err) {
            // nexnum-bot unavailable — fall through to next check
        }

        // 2. Secondary: Paytm Cloudflare Worker direct status check
        try {
            const workerUrl = `https://paytm.udayscriptsx.workers.dev/?mid=UWjSzy23711328951174&id=${orderId}`
            const workerResp = await fetch(workerUrl, { signal: AbortSignal.timeout(3500) })
            if (workerResp.ok) {
                let data: any = {}
                try { data = JSON.parse(await workerResp.text()) } catch { /* non-JSON response — ignore */ }
                if (data.STATUS === 'TXN_SUCCESS' || data.status === 'TXN_SUCCESS') {
                    return {
                        status: 'completed',
                        amount: parseFloat(data.TXNAMOUNT || data.amount || 0),
                        utr: data.BANKTXNID || data.utr || orderId,
                        completedAt: new Date(),
                    }
                }
            }
        } catch (_err) {
            // Paytm worker unavailable — fall through to next check
        }

        // 3. Tertiary: 3rd-party gateway API (only if token is configured)
        if (config.upiApiToken) {
            try {
                const formData = new URLSearchParams()
                formData.append('user_token', config.upiApiToken)
                formData.append('order_id', orderId)

                const statusUrl = config.upiCheckStatusUrl || 'https://pay.udayscripts.in/api/check-order-status'
                const response = await fetch(statusUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData.toString(),
                    signal: AbortSignal.timeout(3500),
                })

                const data: CheckStatusResponse = await response.json()

                if (data.status === 'COMPLETED' && data.result?.status === 'SUCCESS') {
                    return {
                        status: 'completed',
                        amount: parseFloat(data.result.amount),
                        utr: data.result.utr,
                        completedAt: new Date(data.result.date),
                        message: data.result.resultInfo,
                    }
                }

                if (data.status === 'FAILED' || data.result?.status === 'FAILURE') {
                    return { status: 'failed', message: data.message || 'Payment failed' }
                }
            } catch (error: any) {
                logger.warn('[UPIProvider] 3rd-party status check error — falling back to pending', {
                    error: error.message,
                    orderId,
                })
            }
        }

        // All checks exhausted — return clean pending (never throw)
        return {
            status: 'pending',
            message: 'Waiting for payment confirmation',
        }
    }

    /**
     * Get provider public config
     */
    async getPublicConfig() {
        const config = await this.getConfig()
        const { PricingConfig } = await import('@/config/app.config')
        return {
            mode: config.upiProviderMode,
            minAmount: config.depositMinAmount,
            maxAmount: config.depositMaxAmount,
            timeoutMinutes: config.depositTimeoutMins,
            bonusPercent: config.depositBonusPercent,
            exchangeRates: PricingConfig.exchangeRates,
            depositTaxPercent: PricingConfig.depositTaxPercent,
            depositMarkupPercent: PricingConfig.depositMarkupPercent,
        }
    }

    /**
     * Force refresh config from database
     */
    async refreshConfig(): Promise<void> {
        this.cachedConfig = null
        this.lastConfigFetch = 0
        this.configPromise = null
        await this.getConfig()
    }
}

// Singleton instance
let providerInstance: UPIProvider | null = null

export function getUPIProvider(): UPIProvider {
    if (!providerInstance) {
        providerInstance = new UPIProvider()
    }
    return providerInstance
}

export function resetUPIProvider(): void {
    providerInstance = null
}

// Re-export types from payment-settings for convenience
export type { UPIProviderMode }
