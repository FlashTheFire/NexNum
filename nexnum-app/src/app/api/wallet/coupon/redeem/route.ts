/**
 * Gift Card Redemption API
 * POST - Redeem a gift card code for instant wallet credit
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { CouponService } from '@/lib/payment/coupon-service';

export async function POST(request: NextRequest) {
    const { userId, error } = await requireUser(request);
    if (error || !userId) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { code } = body;

        if (!code) {
            return NextResponse.json({
                success: false,
                error: 'Gift card code is required'
            });
        }

        const result = await CouponService.redeemGiftCard(code, userId);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[Gift Card Redeem] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Redemption failed'
        });
    }
}
