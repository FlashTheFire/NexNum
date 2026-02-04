/**
 * Admin Coupon Batch Generation API
 * POST - Generate batch of gift card codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { CouponService } from '@/lib/payment/coupon-service';

export async function POST(request: NextRequest) {
    const authResult = await requireAdmin(request);
    if ('error' in authResult && authResult.error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { count, giftAmount, prefix, expiresAt } = body;

        // Validation
        if (!count || count < 1 || count > 100) {
            return NextResponse.json(
                { error: 'Count must be between 1 and 100' },
                { status: 400 }
            );
        }

        if (!giftAmount || giftAmount < 1) {
            return NextResponse.json(
                { error: 'Gift amount must be at least ₹1' },
                { status: 400 }
            );
        }

        const coupons = await CouponService.createBatchGiftCards(
            count,
            giftAmount,
            {
                expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                createdBy: authResult.userId,
            }
        );

        return NextResponse.json({
            success: true,
            coupons,
            count: coupons.length
        }, { status: 201 });
    } catch (error: any) {
        console.error('[Admin Coupons Batch] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate gift cards' },
            { status: 500 }
        );
    }
}
