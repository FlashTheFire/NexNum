/**
 * User Referral API
 * GET  - Get user's referral code and stats
 * POST - Apply referral code during signup/deposit
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { CouponService } from '@/lib/payment/coupon-service';

/**
 * GET /api/user/referral
 * Get user's referral code and earnings
 */
export async function GET(request: NextRequest) {
    const { userId, error } = await requireUser(request);
    if (error || !userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const referralInfo = await CouponService.getReferralStats(userId);

        return NextResponse.json({
            success: true,
            ...referralInfo
        });
    } catch (error: any) {
        console.error('[Referral] Get error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get referral info' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/user/referral
 * Apply referral code
 */
export async function POST(request: NextRequest) {
    const { userId, error } = await requireUser(request);
    if (error || !userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { code, depositAmount } = body;

        if (!code) {
            return NextResponse.json({
                success: false,
                error: 'Referral code is required'
            });
        }

        const result = await CouponService.applyCoupon(code, { userId, depositAmount: depositAmount || 0 });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Referral] Apply error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to apply referral'
        });
    }
}
