/**
 * Coupon Validation API
 * POST - Validate a promo/referral code before applying
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { CouponService } from '@/lib/payment/coupon-service';

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
                valid: false,
                error: 'Promo code is required'
            });
        }

        const result = await CouponService.validateCoupon(code, { userId, depositAmount });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Coupon Validate] Error:', error);
        return NextResponse.json({
            valid: false,
            error: error.message || 'Validation failed'
        });
    }
}
