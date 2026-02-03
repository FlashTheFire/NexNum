/**
 * Enterprise Coupon Service
 * 
 * Production-grade coupon system supporting:
 * - PROMO codes (% or fixed discounts on deposits)
 * - GIFT cards (instant wallet credit)
 * - REFERRAL codes (user-generated with earnings)
 * 
 * Security features:
 * - Rate limiting via Redis
 * - Luhn checksum validation
 * - Device fingerprint tracking
 * - Full audit logging
 */

import { prisma } from '@/lib/core/db';
import { redis } from '@/lib/core/redis';
import { CouponType, CouponStatus, Coupon, CouponRedemption } from '@prisma/client';


// ============================================
// TYPES
// ============================================

export interface CreateCouponInput {
    type: CouponType;
    code?: string; // Auto-generate if not provided
    name?: string;
    description?: string;

    // Value config
    discountType?: 'PERCENTAGE' | 'FIXED';
    discountValue?: number;
    giftAmount?: number;
    maxDiscount?: number;

    // Limits
    maxUses?: number;
    maxUsesPerUser?: number;
    minDepositAmount?: number;

    // Eligibility
    validServices?: string[];
    newUsersOnly?: boolean;

    // Validity
    startsAt?: Date;
    expiresAt?: Date;

    // Referral
    referrerId?: string;
    referralBonus?: number;

    createdBy?: string;
}

export interface ValidateCouponResult {
    valid: boolean;
    coupon?: Coupon;
    error?: string;
    errorCode?: 'INVALID_FORMAT' | 'NOT_FOUND' | 'EXPIRED' | 'DEPLETED' | 'DISABLED' |
    'ALREADY_USED' | 'MIN_AMOUNT' | 'NEW_USERS_ONLY' | 'RATE_LIMITED';
    discount?: {
        type: 'PERCENTAGE' | 'FIXED' | 'GIFT';
        value: number;
        appliedAmount: number;
        maxDiscount?: number;
    };
}

export interface RedemptionContext {
    userId: string;
    depositAmount?: number;
    depositId?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
}

export interface CouponAnalytics {
    totalCoupons: number;
    activeCoupons: number;
    totalRedemptions: number;
    totalDiscountGiven: number;
    topCoupons: Array<{
        code: string;
        type: CouponType;
        redemptions: number;
        totalValue: number;
    }>;
    redemptionsByDay: Array<{
        date: string;
        count: number;
        value: number;
    }>;
}

// ============================================
// CODE GENERATION
// ============================================

/**
 * Generate a coupon code with Luhn checksum
 * Format: NX-XXXX-XXXX (where last digit is checksum)
 */
export function generateCouponCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0,O,I,1)
    let code = '';

    // Generate 7 random characters
    for (let i = 0; i < 7; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Calculate Luhn checksum digit
    const checksum = calculateLuhnChecksum(code);
    code += checksum;

    // Format as NX-XXXX-XXXX
    return `NX-${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

/**
 * Calculate Luhn checksum for a string
 */
function calculateLuhnChecksum(input: string): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let sum = 0;

    for (let i = 0; i < input.length; i++) {
        let value = chars.indexOf(input[i]);
        if (i % 2 === 0) {
            value *= 2;
            if (value >= chars.length) {
                value = (value % chars.length) + Math.floor(value / chars.length);
            }
        }
        sum += value;
    }

    const checksumIndex = (chars.length - (sum % chars.length)) % chars.length;
    return chars[checksumIndex];
}

/**
 * Validate coupon code format and checksum
 */
export function validateCodeFormat(code: string): boolean {
    // Normalize: remove spaces, uppercase
    const normalized = code.replace(/[\s-]/g, '').toUpperCase();

    // Must be NX + 8 chars = 10 total
    if (!normalized.startsWith('NX') || normalized.length !== 10) {
        return false;
    }

    const codeBody = normalized.slice(2); // Remove NX prefix
    const payload = codeBody.slice(0, 7);
    const checksum = codeBody[7];

    return calculateLuhnChecksum(payload) === checksum;
}

/**
 * Normalize a coupon code to standard format
 */
export function normalizeCode(code: string): string {
    const clean = code.replace(/[\s-]/g, '').toUpperCase();
    if (clean.length === 10 && clean.startsWith('NX')) {
        return `NX-${clean.slice(2, 6)}-${clean.slice(6, 10)}`;
    }
    if (clean.length === 8) {
        return `NX-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
    }
    return code.toUpperCase();
}

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 attempts per minute

async function checkRateLimit(userId: string): Promise<boolean> {
    const key = `coupon:rate:${userId}`;

    try {
        const current = await redis.incr(key);
        if (current === 1) {
            await redis.expire(key, RATE_LIMIT_WINDOW);
        }
        return current <= RATE_LIMIT_MAX;
    } catch {
        // If Redis fails, allow the request
        return true;
    }
}

// ============================================
// COUPON SERVICE
// ============================================

export const CouponService = {
    /**
     * Create a new coupon (admin only)
     */
    async createCoupon(input: CreateCouponInput): Promise<Coupon> {
        const code = input.code || generateCouponCode();

        // Validate code format if provided
        if (input.code && !validateCodeFormat(input.code)) {
            throw new Error('Invalid coupon code format');
        }

        // Check for duplicate
        const existing = await prisma.coupon.findUnique({
            where: { code: normalizeCode(code) }
        });
        if (existing) {
            throw new Error('Coupon code already exists');
        }

        return prisma.coupon.create({
            data: {
                code: normalizeCode(code),
                type: input.type,
                name: input.name,
                description: input.description,
                discountType: input.discountType,
                discountValue: input.discountValue ?? null,
                giftAmount: input.giftAmount ?? null,
                maxDiscount: input.maxDiscount ?? null,
                maxUses: input.maxUses ?? 1,
                maxUsesPerUser: input.maxUsesPerUser ?? 1,
                minDepositAmount: input.minDepositAmount ?? null,
                validServices: input.validServices ?? [],
                newUsersOnly: input.newUsersOnly ?? false,
                startsAt: input.startsAt ?? new Date(),
                expiresAt: input.expiresAt,
                referrerId: input.referrerId,
                referralBonus: input.referralBonus ?? null,
                createdBy: input.createdBy,
            }
        });
    },

    /**
     * Generate batch gift cards
     */
    async createBatchGiftCards(
        count: number,
        giftAmount: number,
        options: {
            expiresAt?: Date;
            name?: string;
            createdBy?: string;
        } = {}
    ): Promise<Coupon[]> {
        const coupons: Coupon[] = [];

        for (let i = 0; i < count; i++) {
            const coupon = await this.createCoupon({
                type: 'GIFT',
                giftAmount,
                name: options.name || `Gift Card ${i + 1}`,
                expiresAt: options.expiresAt,
                createdBy: options.createdBy,
                maxUses: 1,
                maxUsesPerUser: 1,
            });
            coupons.push(coupon);
        }

        return coupons;
    },

    /**
     * Get or create user's referral code
     */
    async getUserReferralCode(userId: string): Promise<Coupon> {
        // Check if user already has a referral code
        const existing = await prisma.coupon.findFirst({
            where: {
                type: 'REFERRAL',
                referrerId: userId,
            }
        });

        if (existing) {
            return existing;
        }

        // Create new referral code
        return this.createCoupon({
            type: 'REFERRAL',
            referrerId: userId,
            discountType: 'PERCENTAGE',
            discountValue: 5, // 5% bonus for referee
            referralBonus: 10, // 10 points to referrer
            maxUses: 0, // Unlimited total uses
            maxUsesPerUser: 1, // Each user can only use once
            name: 'Referral Code',
        });
    },

    /**
     * Validate a coupon code (call before deposit)
     */
    async validateCoupon(
        code: string,
        context: RedemptionContext
    ): Promise<ValidateCouponResult> {
        // Rate limiting
        const allowed = await checkRateLimit(context.userId);
        if (!allowed) {
            return {
                valid: false,
                error: 'Too many attempts. Please wait a minute.',
                errorCode: 'RATE_LIMITED'
            };
        }

        // Format validation
        const normalizedCode = normalizeCode(code);
        if (!validateCodeFormat(normalizedCode)) {
            return {
                valid: false,
                error: 'Invalid coupon code format',
                errorCode: 'INVALID_FORMAT'
            };
        }

        // Fetch coupon
        const coupon = await prisma.coupon.findUnique({
            where: { code: normalizedCode },
            include: {
                redemptions: {
                    where: { userId: context.userId }
                }
            }
        });

        if (!coupon) {
            return {
                valid: false,
                error: 'Coupon not found',
                errorCode: 'NOT_FOUND'
            };
        }

        // Status check
        if (coupon.status !== 'ACTIVE') {
            const statusMessages: Record<CouponStatus, string> = {
                ACTIVE: '',
                EXPIRED: 'This coupon has expired',
                DEPLETED: 'This coupon has been fully redeemed',
                DISABLED: 'This coupon is no longer valid',
            };
            return {
                valid: false,
                error: statusMessages[coupon.status],
                errorCode: coupon.status as ValidateCouponResult['errorCode']
            };
        }

        // Expiry check
        if (coupon.expiresAt && new Date() > coupon.expiresAt) {
            // Auto-update status
            await prisma.coupon.update({
                where: { id: coupon.id },
                data: { status: 'EXPIRED' }
            });
            return {
                valid: false,
                error: 'This coupon has expired',
                errorCode: 'EXPIRED'
            };
        }

        // Start date check
        if (coupon.startsAt && new Date() < coupon.startsAt) {
            return {
                valid: false,
                error: 'This coupon is not yet active',
                errorCode: 'DISABLED'
            };
        }

        // Usage limit check (global)
        if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
            await prisma.coupon.update({
                where: { id: coupon.id },
                data: { status: 'DEPLETED' }
            });
            return {
                valid: false,
                error: 'This coupon has been fully redeemed',
                errorCode: 'DEPLETED'
            };
        }

        // Per-user limit check
        const userRedemptions = coupon.redemptions.length;
        if (userRedemptions >= coupon.maxUsesPerUser) {
            return {
                valid: false,
                error: 'You have already used this coupon',
                errorCode: 'ALREADY_USED'
            };
        }

        // Minimum deposit check (for PROMO type)
        if (coupon.type === 'PROMO' && coupon.minDepositAmount && context.depositAmount) {
            if (context.depositAmount < Number(coupon.minDepositAmount)) {
                return {
                    valid: false,
                    error: `Minimum deposit of ₹${coupon.minDepositAmount} required`,
                    errorCode: 'MIN_AMOUNT'
                };
            }
        }

        // New users only check
        if (coupon.newUsersOnly) {
            const previousDeposits = await prisma.walletTransaction.count({
                where: {
                    wallet: { userId: context.userId },
                    type: 'deposit'
                }
            });
            if (previousDeposits > 0) {
                return {
                    valid: false,
                    error: 'This coupon is for new users only',
                    errorCode: 'NEW_USERS_ONLY'
                };
            }
        }

        // Calculate discount
        let discount: ValidateCouponResult['discount'];

        if (coupon.type === 'GIFT') {
            discount = {
                type: 'GIFT',
                value: Number(coupon.giftAmount || 0),
                appliedAmount: Number(coupon.giftAmount || 0),
            };
        } else if (coupon.discountType === 'PERCENTAGE') {
            const percentage = Number(coupon.discountValue || 0);
            let appliedAmount = (context.depositAmount || 0) * (percentage / 100);

            // Apply max discount cap
            if (coupon.maxDiscount && appliedAmount > Number(coupon.maxDiscount)) {
                appliedAmount = Number(coupon.maxDiscount);
            }

            discount = {
                type: 'PERCENTAGE',
                value: percentage,
                appliedAmount,
                maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : undefined,
            };
        } else {
            discount = {
                type: 'FIXED',
                value: Number(coupon.discountValue || 0),
                appliedAmount: Number(coupon.discountValue || 0),
            };
        }

        return {
            valid: true,
            coupon,
            discount,
        };
    },

    /**
     * Apply coupon to a deposit (creates redemption record)
     */
    async applyCoupon(
        code: string,
        context: RedemptionContext
    ): Promise<CouponRedemption> {
        const validation = await this.validateCoupon(code, context);

        if (!validation.valid || !validation.coupon || !validation.discount) {
            throw new Error(validation.error || 'Invalid coupon');
        }

        const coupon = validation.coupon;

        // Create redemption record
        const redemption = await prisma.couponRedemption.create({
            data: {
                couponId: coupon.id,
                userId: context.userId,
                depositId: context.depositId,
                appliedAmount: validation.discount.appliedAmount,
                originalAmount: context.depositAmount ?? null,
                finalAmount: context.depositAmount
                    ? context.depositAmount + validation.discount.appliedAmount
                    : null,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
                deviceFingerprint: context.deviceFingerprint,
            }
        });

        // Increment usage counter
        await prisma.coupon.update({
            where: { id: coupon.id },
            data: { currentUses: { increment: 1 } }
        });

        // If referral, credit the referrer
        if (coupon.type === 'REFERRAL' && coupon.referrerId && coupon.referralBonus) {
            const referrerWallet = await prisma.wallet.findUnique({
                where: { userId: coupon.referrerId }
            });

            if (referrerWallet) {
                await prisma.wallet.update({
                    where: { id: referrerWallet.id },
                    data: {
                        balance: { increment: Number(coupon.referralBonus) }
                    }
                });

                // Create transaction record for referrer
                await prisma.walletTransaction.create({
                    data: {
                        walletId: referrerWallet.id,
                        amount: Number(coupon.referralBonus),
                        type: 'referral_bonus',
                        description: `Referral bonus from ${code}`,
                    }
                });
            }
        }

        return redemption;
    },

    /**
     * Redeem gift card (instant credit, no deposit needed)
     */
    async redeemGiftCard(
        code: string,
        context: RedemptionContext
    ): Promise<{ success: boolean; amount: number; error?: string }> {
        const validation = await this.validateCoupon(code, context);

        if (!validation.valid || !validation.coupon) {
            return { success: false, amount: 0, error: validation.error };
        }

        if (validation.coupon.type !== 'GIFT') {
            return { success: false, amount: 0, error: 'This is not a gift card' };
        }

        const amount = Number(validation.coupon.giftAmount || 0);

        // Get user wallet
        let wallet = await prisma.wallet.findUnique({
            where: { userId: context.userId }
        });

        if (!wallet) {
            wallet = await prisma.wallet.create({
                data: { userId: context.userId, balance: 0 }
            });
        }

        // Credit wallet
        await prisma.wallet.update({
            where: { id: wallet.id },
            data: {
                balance: { increment: amount }
            }
        });

        // Create transaction
        await prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount,
                type: 'gift_card',
                description: `Gift card redeemed: ${code}`,
            }
        });

        // Create redemption record
        await prisma.couponRedemption.create({
            data: {
                couponId: validation.coupon.id,
                userId: context.userId,
                appliedAmount: amount,
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
                deviceFingerprint: context.deviceFingerprint,
            }
        });

        // Increment usage and potentially mark as depleted
        const updated = await prisma.coupon.update({
            where: { id: validation.coupon.id },
            data: { currentUses: { increment: 1 } }
        });

        if (updated.maxUses > 0 && updated.currentUses >= updated.maxUses) {
            await prisma.coupon.update({
                where: { id: validation.coupon.id },
                data: { status: 'DEPLETED' }
            });
        }

        return { success: true, amount };
    },

    /**
     * Get user's referral stats
     */
    async getReferralStats(userId: string): Promise<{
        referralCode: string;
        totalReferrals: number;
        totalEarnings: number;
        pendingEarnings: number;
        recentReferrals: Array<{
            date: Date;
            amount: number;
        }>;
    }> {
        const referralCoupon = await this.getUserReferralCode(userId);

        const redemptions = await prisma.couponRedemption.findMany({
            where: { couponId: referralCoupon.id },
            orderBy: { redeemedAt: 'desc' },
            take: 10
        });

        const totalEarnings = redemptions.length * Number(referralCoupon.referralBonus || 0);

        return {
            referralCode: referralCoupon.code,
            totalReferrals: redemptions.length,
            totalEarnings,
            pendingEarnings: 0, // Could track pending referrals here
            recentReferrals: redemptions.map(r => ({
                date: r.redeemedAt,
                amount: Number(referralCoupon.referralBonus || 0)
            }))
        };
    },

    /**
     * Get analytics for admin dashboard
     */
    async getAnalytics(days: number = 30): Promise<CouponAnalytics> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [
            totalCoupons,
            activeCoupons,
            redemptions,
            topCouponsData
        ] = await Promise.all([
            prisma.coupon.count(),
            prisma.coupon.count({ where: { status: 'ACTIVE' } }),
            prisma.couponRedemption.findMany({
                where: { redeemedAt: { gte: startDate } },
                include: { coupon: true }
            }),
            prisma.couponRedemption.groupBy({
                by: ['couponId'],
                _count: { id: true },
                _sum: { appliedAmount: true },
                orderBy: { _count: { id: 'desc' } },
                take: 5
            })
        ]);

        // Get coupon details for top coupons
        const topCoupons = await Promise.all(
            topCouponsData.map(async (data) => {
                const coupon = await prisma.coupon.findUnique({
                    where: { id: data.couponId }
                });
                return {
                    code: coupon?.code || 'Unknown',
                    type: coupon?.type || 'PROMO',
                    redemptions: data._count.id,
                    totalValue: Number(data._sum.appliedAmount || 0)
                };
            })
        );

        // Calculate daily redemptions
        const redemptionsByDay: CouponAnalytics['redemptionsByDay'] = [];
        const dayMap = new Map<string, { count: number; value: number }>();

        for (const r of redemptions) {
            const dateKey = r.redeemedAt.toISOString().split('T')[0];
            const existing = dayMap.get(dateKey) || { count: 0, value: 0 };
            dayMap.set(dateKey, {
                count: existing.count + 1,
                value: existing.value + Number(r.appliedAmount)
            });
        }

        for (const [date, data] of dayMap) {
            redemptionsByDay.push({ date, ...data });
        }

        redemptionsByDay.sort((a, b) => a.date.localeCompare(b.date));

        return {
            totalCoupons,
            activeCoupons,
            totalRedemptions: redemptions.length,
            totalDiscountGiven: redemptions.reduce((sum, r) => sum + Number(r.appliedAmount), 0),
            topCoupons,
            redemptionsByDay
        };
    },

    /**
     * List coupons with filters (admin)
     */
    async listCoupons(options: {
        type?: CouponType;
        status?: CouponStatus;
        search?: string;
        page?: number;
        limit?: number;
    } = {}): Promise<{ coupons: Coupon[]; total: number }> {
        const { type, status, search, page = 1, limit = 20 } = options;

        const where: any = {};
        if (type) where.type = type;
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [coupons, total] = await Promise.all([
            prisma.coupon.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    _count: { select: { redemptions: true } }
                }
            }),
            prisma.coupon.count({ where })
        ]);

        return { coupons, total };
    },

    /**
     * Update coupon (admin)
     */
    async updateCoupon(id: string, data: Partial<CreateCouponInput>): Promise<Coupon> {
        return prisma.coupon.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                discountValue: data.discountValue ?? undefined,
                maxUses: data.maxUses,
                maxUsesPerUser: data.maxUsesPerUser,
                expiresAt: data.expiresAt,
            }
        });
    },

    /**
     * Disable coupon (soft delete)
     */
    async disableCoupon(id: string): Promise<Coupon> {
        return prisma.coupon.update({
            where: { id },
            data: { status: 'DISABLED' }
        });
    }
};

export default CouponService;
