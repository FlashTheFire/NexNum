/**
 * NEXNUM WALLET TRANSACTION TYPES
 * Standardized types for all financial movements.
 */

export type WalletTransactionType =
    | 'topup'               // Direct user deposit (via payment gateway)
    | 'manual_credit'         // Admin manual add funds
    | 'manual_debit'          // Admin manual remove funds
    | 'referral_bonus'        // Credit from referrals
    | 'redeem_code'           // Credit from promo codes
    | 'purchase'              // Final confirmed purchase (committed)
    | 'number_purchase'       // Single-step direct purchase
    | 'subscription_purchase' // Subscription payment
    | 'item_purchase'         // General item purchase
    | 'refund'                // Refund for failed/cancelled service
    | 'p2p_transfer_out'      // Transfer to another user
    | 'p2p_transfer_in'       // Transfer from another user
    | 'deposit'               // Pending/Completed deposit record
    | 'expired_deposit'       // Failed deposit (timeout)
    | 'failed_deposit'        // Failed deposit (gateway error)
    | 'cancelled_deposit'     // Manually or automatically cancelled
    | 'chargeback'            // External chargeback handling
    | 'adjustment';           // Generic system adjustment

export const TRANSACTION_DESCRIPTIONS: Record<WalletTransactionType, string> = {
    topup: 'Wallet Top-up',
    manual_credit: 'Administrative Credit',
    manual_debit: 'Administrative Deduction',
    referral_bonus: 'Referral Reward',
    redeem_code: 'Promo Code Redemption',
    purchase: 'Service Purchase',
    number_purchase: 'Number Purchase',
    subscription_purchase: 'Subscription Payment',
    item_purchase: 'Item Purchase',
    refund: 'Refund',
    p2p_transfer_out: 'Peer Transfer (Out)',
    p2p_transfer_in: 'Peer Transfer (In)',
    deposit: 'Funds Deposit (Pending)',
    expired_deposit: 'Expired Deposit',
    failed_deposit: 'Failed Deposit',
    cancelled_deposit: 'Cancelled Deposit',
    chargeback: 'Payment Chargeback',
    adjustment: 'System Adjustment'
};
