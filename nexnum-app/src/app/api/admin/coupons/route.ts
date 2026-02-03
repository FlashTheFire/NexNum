/**
 * Admin Coupon Management API
 * 
 * GET    - List all coupons with filters
 * POST   - Create new coupon
 * PATCH  - Update coupon
 * DELETE - Disable coupon
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { CouponService, generateCouponCode } from '@/lib/payment/coupon-service';

// Helper to check admin and handle error
async function checkAdminAuth(request: NextRequest) {
    const result = await requireAdmin(request);
    if ('error' in result && result.error) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return result;
}

/**
 * GET /api/admin/coupons
 * List coupons with optional filters
 */
export async function GET(request: NextRequest) {
    const authResult = await checkAdminAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || undefined;
        const status = searchParams.get('status') || undefined;
        const search = searchParams.get('search') || undefined;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        const result = await CouponService.listCoupons({
            type: type as any,
            status: status as any,
            search,
            page,
            limit
        });

        return NextResponse.json({
            success: true,
            coupons: result.coupons,
            total: result.total,
            page,
            limit,
            totalPages: Math.ceil(result.total / limit)
        });
    } catch (error) {
        console.error('[Admin Coupons] List error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch coupons' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/coupons
 * Create a new coupon
 */
export async function POST(request: NextRequest) {
    const authResult = await checkAdminAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await request.json();
        const {
            type,
            code,
            name,
            description,
            discountType,
            discountValue,
            giftAmount,
            maxDiscount,
            maxUses,
            maxUsesPerUser,
            minDepositAmount,
            validServices,
            newUsersOnly,
            startsAt,
            expiresAt,
        } = body;

        // Validation
        if (!type || !['PROMO', 'GIFT', 'REFERRAL'].includes(type)) {
            return NextResponse.json(
                { error: 'Invalid coupon type' },
                { status: 400 }
            );
        }

        if (type === 'PROMO' && !discountType) {
            return NextResponse.json(
                { error: 'Discount type required for promo codes' },
                { status: 400 }
            );
        }

        if (type === 'GIFT' && !giftAmount) {
            return NextResponse.json(
                { error: 'Gift amount required for gift cards' },
                { status: 400 }
            );
        }

        const coupon = await CouponService.createCoupon({
            type,
            code: code || undefined,
            name,
            description,
            discountType,
            discountValue: discountValue ? parseFloat(discountValue) : undefined,
            giftAmount: giftAmount ? parseFloat(giftAmount) : undefined,
            maxDiscount: maxDiscount ? parseFloat(maxDiscount) : undefined,
            maxUses: maxUses ? parseInt(maxUses) : undefined,
            maxUsesPerUser: maxUsesPerUser ? parseInt(maxUsesPerUser) : undefined,
            minDepositAmount: minDepositAmount ? parseFloat(minDepositAmount) : undefined,
            validServices: validServices || [],
            newUsersOnly: newUsersOnly || false,
            startsAt: startsAt ? new Date(startsAt) : undefined,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            createdBy: authResult.userId,
        });

        return NextResponse.json({
            success: true,
            coupon
        }, { status: 201 });
    } catch (error: any) {
        console.error('[Admin Coupons] Create error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create coupon' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/admin/coupons
 * Update a coupon
 */
export async function PATCH(request: NextRequest) {
    const authResult = await checkAdminAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Coupon ID required' },
                { status: 400 }
            );
        }

        const coupon = await CouponService.updateCoupon(id, {
            name: updates.name,
            description: updates.description,
            discountValue: updates.discountValue ? parseFloat(updates.discountValue) : undefined,
            maxUses: updates.maxUses ? parseInt(updates.maxUses) : undefined,
            maxUsesPerUser: updates.maxUsesPerUser ? parseInt(updates.maxUsesPerUser) : undefined,
            expiresAt: updates.expiresAt ? new Date(updates.expiresAt) : undefined,
        });

        return NextResponse.json({
            success: true,
            coupon
        });
    } catch (error: any) {
        console.error('[Admin Coupons] Update error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update coupon' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/coupons
 * Disable a coupon (soft delete)
 */
export async function DELETE(request: NextRequest) {
    const authResult = await checkAdminAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Coupon ID required' },
                { status: 400 }
            );
        }

        const coupon = await CouponService.disableCoupon(id);

        return NextResponse.json({
            success: true,
            coupon
        });
    } catch (error: any) {
        console.error('[Admin Coupons] Delete error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to disable coupon' },
            { status: 500 }
        );
    }
}
