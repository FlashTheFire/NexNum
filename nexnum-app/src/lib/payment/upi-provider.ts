/**
 * UPI Payment Provider for Paytm Integration
 * 
 * Supports dual-mode:
 * - THIRD_PARTY: Uses paytm.udayscripts.in API (MID: UWjSzy23711328951174)
 * - DIRECT_PAYTM: Official Paytm Payment Gateway API
 * - DISABLED: No payments
 * 
 * @module payment/upi-provider
 */

import { PaymentError } from './payment-errors'
import { logger } from '@/lib/core/logger'
import { getPaymentSettingsService, PaymentConfig, UPIProviderMode } from './payment-settings'
import crypto from 'crypto'

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

// Paytm Direct API Types
interface PaytmInitiateRequest {
    body: {
        requestType: string
        mid: string
        websiteName: string
        orderId: string
        txnAmount: {
            value: string
            currency: string
        }
        userInfo: {
            custId: string
            mobile?: string
        }
        callbackUrl: string
    }
    head: {
        signature: string
    }
}

interface PaytmInitiateResponse {
    head: {
        responseTimestamp: string
        version: string
        signature: string
    }
    body: {
        resultInfo: {
            resultStatus: string
            resultCode: string
            resultMsg: string
        }
        txnToken?: string
        isPromoCodeValid?: boolean
        authenticated?: boolean
    }
}

interface PaytmStatusResponse {
    body: {
        resultInfo: {
            resultStatus: string
            resultCode: string
            resultMsg: string
        }
        txnId?: string
        bankTxnId?: string
        orderId?: string
        txnAmount?: string
        txnType?: string
        gatewayName?: string
        bankName?: string
        mid?: string
        paymentMode?: string
        refundAmt?: string
        txnDate?: string
    }
}

// ============================================================================
// Paytm Checksum Generation
// ============================================================================

class PaytmChecksum {
    private static readonly ENCRYPTION_ALGORITHM = 'aes-128-cbc'

    static generateSignature(params: string, key: string): string {
        const salt = this.generateRandomString(4)
        const saltedParams = params + '|' + salt
        const hash = crypto.createHash('sha256').update(saltedParams).digest('hex')
        const hashWithSalt = hash + salt
        return this.encrypt(hashWithSalt, key)
    }

    static verifySignature(params: string, key: string, checksum: string): boolean {
        try {
            const decrypted = this.decrypt(checksum, key)
            const salt = decrypted.substring(decrypted.length - 4)
            const hash = decrypted.substring(0, decrypted.length - 4)
            const calcHash = crypto.createHash('sha256').update(params + '|' + salt).digest('hex')
            return hash === calcHash
        } catch {
            return false
        }
    }

    private static generateRandomString(length: number): string {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
        let result = ''
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return result
    }

    private static encrypt(input: string, key: string): string {
        const derivedKey = crypto.createHash('sha256').update(key).digest().slice(0, 16)
        const iv = Buffer.alloc(16, 0) // 16 bytes of zeros
        const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, derivedKey, iv)
        let encrypted = cipher.update(input, 'utf8', 'base64')
        encrypted += cipher.final('base64')
        return encrypted
    }

    private static decrypt(input: string, key: string): string {
        const derivedKey = crypto.createHash('sha256').update(key).digest().slice(0, 16)
        const iv = Buffer.alloc(16, 0)
        const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, derivedKey, iv)
        let decrypted = decipher.update(input, 'base64', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
    }
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
     * Build QR code URL for order
     */
    private buildQRCodeUrl(orderId: string, config: PaymentConfig): string {
        const qrBase = config.upiQrBaseUrl || 'https://qr.udayscriptsx.workers.dev/'

        // UPI deep link with custom styling
        const upiData = encodeURIComponent(
            `upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=NexNum&tr=${orderId}&tn=Adding Fund`
        )

        return `${qrBase}?data=${upiData}&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`
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

        // Validation
        if (!config.paymentsEnabled) {
            throw PaymentError.declined('Payments are currently disabled')
        }

        if (amount < config.depositMinAmount) {
            throw PaymentError.declined(`Minimum deposit amount is ₹${config.depositMinAmount}`)
        }
        if (amount > config.depositMaxAmount) {
            throw PaymentError.declined(`Maximum deposit amount is ₹${config.depositMaxAmount}`)
        }

        // Route to appropriate provider
        switch (config.upiProviderMode) {
            case 'THIRD_PARTY':
                return this.createThirdPartyOrder(orderId, amount, customerMobile, redirectUrl, config)
            case 'DIRECT_PAYTM':
                return this.createDirectPaytmOrder(orderId, amount, customerMobile, redirectUrl, config)
            case 'DISABLED':
            default:
                throw PaymentError.declined('UPI payments are not available')
        }
    }

    /**
     * Create order via 3rd party gateway (paytm.udayscripts.in)
     */
    private async createThirdPartyOrder(
        orderId: string,
        amount: number,
        customerMobile: string,
        redirectUrl: string,
        config: PaymentConfig
    ): Promise<DepositOrder> {
        if (!config.upiApiToken) {
            throw PaymentError.providerError('UPI payment provider not configured')
        }

        try {
            const formData = new URLSearchParams()
            formData.append('customer_mobile', customerMobile)
            formData.append('user_token', config.upiApiToken)
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

            const data: CreateOrderResponse = await response.json()

            if (!data.status || !data.result) {
                logger.error('[UPIProvider] 3rd party create order failed', { message: data.message, orderId })
                throw PaymentError.providerError(data.message || 'Failed to create payment order')
            }

            const expiresAt = new Date(Date.now() + config.depositTimeoutMins * 60 * 1000)

            logger.info('[UPIProvider] 3rd party order created', {
                orderId: data.result.orderId,
                amount,
                expiresAt: expiresAt.toISOString()
            })

            return {
                orderId: data.result.orderId,
                paymentUrl: data.result.payment_url,
                qrCodeUrl: this.buildQRCodeUrl(orderId, config),
                amount,
                expiresAt,
                expiresIn: config.depositTimeoutMins * 60,
            }
        } catch (error: any) {
            if (error instanceof PaymentError) throw error
            logger.error('[UPIProvider] 3rd party create order error', { error: error.message, orderId })
            throw PaymentError.providerError('Payment service temporarily unavailable')
        }
    }

    /**
     * Create order via Direct Paytm API
     */
    private async createDirectPaytmOrder(
        orderId: string,
        amount: number,
        customerMobile: string,
        _redirectUrl: string,
        config: PaymentConfig
    ): Promise<DepositOrder> {
        if (!config.paytmMerchantId || !config.paytmMerchantKey) {
            throw PaymentError.providerError('Paytm credentials not configured')
        }

        try {
            const isProduction = config.paytmEnvironment === 'PRODUCTION'
            const baseUrl = isProduction
                ? 'https://securegw.paytm.in'
                : 'https://securegw-stage.paytm.in'

            // Build request body
            const requestBody = {
                requestType: 'Payment',
                mid: config.paytmMerchantId,
                websiteName: config.paytmWebsite || 'DEFAULT',
                orderId: orderId,
                txnAmount: {
                    value: amount.toFixed(2),
                    currency: 'INR',
                },
                userInfo: {
                    custId: orderId.split('_')[1] || 'CUST001',
                    mobile: customerMobile,
                },
                callbackUrl: config.paytmCallbackUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/wallet/deposit/callback`,
            }

            // Generate checksum/signature
            const bodyString = JSON.stringify(requestBody)
            const signature = PaytmChecksum.generateSignature(bodyString, config.paytmMerchantKey)

            const paytmRequest: PaytmInitiateRequest = {
                body: requestBody,
                head: { signature },
            }

            // Initiate transaction
            const response = await fetch(
                `${baseUrl}/theia/api/v1/initiateTransaction?mid=${config.paytmMerchantId}&orderId=${orderId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(paytmRequest),
                }
            )

            const data: PaytmInitiateResponse = await response.json()

            if (data.body.resultInfo.resultStatus !== 'S' || !data.body.txnToken) {
                logger.error('[UPIProvider] Paytm initiate failed', {
                    resultCode: data.body.resultInfo.resultCode,
                    resultMsg: data.body.resultInfo.resultMsg,
                    orderId,
                })
                throw PaymentError.providerError(data.body.resultInfo.resultMsg || 'Failed to initiate Paytm transaction')
            }

            const txnToken = data.body.txnToken
            const expiresAt = new Date(Date.now() + config.depositTimeoutMins * 60 * 1000)

            // Build payment URL for redirect flow
            const paymentUrl = `${baseUrl}/theia/api/v1/showPaymentPage?mid=${config.paytmMerchantId}&orderId=${orderId}&txnToken=${txnToken}`

            logger.info('[UPIProvider] Paytm order created', {
                orderId,
                amount,
                environment: config.paytmEnvironment,
                expiresAt: expiresAt.toISOString()
            })

            return {
                orderId,
                paymentUrl,
                qrCodeUrl: this.buildQRCodeUrl(orderId, config),
                amount,
                expiresAt,
                expiresIn: config.depositTimeoutMins * 60,
            }
        } catch (error: any) {
            if (error instanceof PaymentError) throw error
            logger.error('[UPIProvider] Paytm create order error', { error: error.message, orderId })
            throw PaymentError.providerError('Paytm service temporarily unavailable')
        }
    }

    /**
     * Check payment status for an order
     */
    async checkStatus(orderId: string): Promise<PaymentStatus> {
        const config = await this.getConfig()

        switch (config.upiProviderMode) {
            case 'THIRD_PARTY':
                return this.checkThirdPartyStatus(orderId, config)
            case 'DIRECT_PAYTM':
                return this.checkPaytmStatus(orderId, config)
            case 'DISABLED':
            default:
                return { status: 'failed', message: 'Payments disabled' }
        }
    }

    /**
     * Check status via 3rd party gateway
     */
    private async checkThirdPartyStatus(orderId: string, config: PaymentConfig): Promise<PaymentStatus> {
        if (!config.upiApiToken) {
            throw PaymentError.providerError('UPI payment provider not configured')
        }

        try {
            const formData = new URLSearchParams()
            formData.append('user_token', config.upiApiToken)
            formData.append('order_id', orderId)

            const statusUrl = config.upiCheckStatusUrl || 'https://pay.udayscripts.in/api/check-order-status'

            const response = await fetch(statusUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            })

            const data: CheckStatusResponse = await response.json()

            // Map external status to internal status
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
                return {
                    status: 'failed',
                    message: data.message || 'Payment failed',
                }
            }

            if (data.status === 'ERROR') {
                logger.warn('[UPIProvider] Check status error', { orderId, message: data.message })
                return {
                    status: 'pending',
                    message: data.message,
                }
            }

            return {
                status: 'pending',
                message: 'Waiting for payment',
            }
        } catch (error: any) {
            logger.error('[UPIProvider] Check status error', { error: error.message, orderId })
            return { status: 'pending', message: 'Status check temporarily unavailable' }
        }
    }

    /**
     * Check status via Direct Paytm API
     */
    private async checkPaytmStatus(orderId: string, config: PaymentConfig): Promise<PaymentStatus> {
        if (!config.paytmMerchantId || !config.paytmMerchantKey) {
            throw PaymentError.providerError('Paytm credentials not configured')
        }

        try {
            const isProduction = config.paytmEnvironment === 'PRODUCTION'
            const baseUrl = isProduction
                ? 'https://securegw.paytm.in'
                : 'https://securegw-stage.paytm.in'

            const requestBody = {
                mid: config.paytmMerchantId,
                orderId: orderId,
            }

            const bodyString = JSON.stringify(requestBody)
            const signature = PaytmChecksum.generateSignature(bodyString, config.paytmMerchantKey)

            const response = await fetch(
                `${baseUrl}/v3/order/status`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        body: requestBody,
                        head: { signature },
                    }),
                }
            )

            const data: PaytmStatusResponse = await response.json()
            const result = data.body.resultInfo

            if (result.resultStatus === 'TXN_SUCCESS') {
                return {
                    status: 'completed',
                    amount: parseFloat(data.body.txnAmount || '0'),
                    utr: data.body.bankTxnId,
                    completedAt: data.body.txnDate ? new Date(data.body.txnDate) : new Date(),
                    message: result.resultMsg,
                }
            }

            if (result.resultStatus === 'TXN_FAILURE') {
                return {
                    status: 'failed',
                    message: result.resultMsg || 'Transaction failed',
                }
            }

            if (result.resultStatus === 'PENDING') {
                return {
                    status: 'pending',
                    message: 'Transaction pending',
                }
            }

            // Any other status
            return {
                status: 'pending',
                message: result.resultMsg || 'Processing',
            }
        } catch (error: any) {
            logger.error('[UPIProvider] Paytm status check error', { error: error.message, orderId })
            return { status: 'pending', message: 'Status check temporarily unavailable' }
        }
    }

    /**
     * Get provider public config
     */
    async getPublicConfig() {
        const config = await this.getConfig()
        return {
            mode: config.upiProviderMode,
            minAmount: config.depositMinAmount,
            maxAmount: config.depositMaxAmount,
            timeoutMinutes: config.depositTimeoutMins,
            bonusPercent: config.depositBonusPercent,
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
