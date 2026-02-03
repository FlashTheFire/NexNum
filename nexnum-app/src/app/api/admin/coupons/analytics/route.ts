/**
 * Admin Coupon Analytics API
 * GET - Get coupon usage statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { CouponService } from '@/lib/payment/coupon-service';

export async function GET(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if ('error' in authResult && authResult.error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const analytics = await CouponService.getAnalytics();

        return NextResponse.json({
            success: true,
            ...analytics
        });
    } catch (error: any) {
        console.error('[Admin Coupons Analytics] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch analytics' },
            { status: 500 }
        );
    }
}
