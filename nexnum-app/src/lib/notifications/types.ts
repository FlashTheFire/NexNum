import { ReactElement } from 'react'

export type NotificationType = 'DEPOSIT' | 'ORDER' | 'ALERT' | 'USER_METRICS'

export interface BaseNotification {
    userId: string
    timestamp: Date
}

export interface DepositNotification extends BaseNotification {
    type: 'DEPOSIT'
    amount: number
    currency: string // 'Points' or 'USD'
    depositId: string
    paidFrom: string // 'UPI', 'Card', etc.
    paymentType: string
    transactionId: string
}

export interface OrderNotification extends BaseNotification {
    type: 'ORDER'
    orderId: string
    appName: string
    price: number
    country: string
    countryCode: string
    region: string
    phoneNumber: string
    code?: string // SMS Code
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED'
    validUntil?: string
    smsList?: string[]
}

export interface AlertNotification extends BaseNotification {
    type: 'ALERT'
    title: string
    message: string
    severity: 'info' | 'warning' | 'critical'
}

export interface MetricReportNotification extends BaseNotification {
    type: 'USER_METRICS'
    username: string
    balance: number
    totalSpend: number
    totalDeposits: number
    depositCount: number
    totalOrders: number
    totalOrderValue: number
}

export type NotificationPayload =
    | DepositNotification
    | OrderNotification
    | AlertNotification
    | MetricReportNotification

export interface NotificationChannel {
    name: string
    send(payload: NotificationPayload): Promise<boolean>
}
