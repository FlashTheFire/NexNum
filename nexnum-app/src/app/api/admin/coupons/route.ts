/**
 * Admin Coupon Management API
 * 
 * GET    - List all coupons with filters
 * POST   - Create new coupon
 * PATCH  - Update coupon
 * DELETE - Disable coupon
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { CouponService } from '@/lib/payment/coupon-service';

// Helper to check admin and handle error
async function checkAdminAuth(request: NextRequest) {
    const result = await requireAdmin(request);
    if ('error' in result && result.error) {
        return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
    }
    return result;
}

// Zod schema for coupon creation
const createCouponSchema = z.object({
    type: z.enum(['PROMO', 'GIFT', 'REFERRAL']),
    code: z.string().min(3).max(40).optional(),
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
    discountValue: z.number().nonnegative().optional(),
    giftAmount: z.number().nonnegative().optional(),
    maxDiscount: z.number().nonnegative().optional(),
    maxUses: z.number().int().nonnegative().optional(),
    maxUsesPerUser: z.number().int().nonnegative().optional(),
    minDepositAmount: z.number().nonnegative().optional(),
    validServices: z.array(z.string()).optional(),
    newUsersOnly: z.boolean().optional(),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
}).refine(
    (data) => {
        if (data.type === 'PROMO' && !data.discountType) return false
        if (data.type === 'GIFT' && !data.giftAmount) return false
        return true
    },
    { message: 'PROMO requires discountType, GIFT requires giftAmount' }
).refine(
    (data) => {
        if (data.startsAt && data.expiresAt) {
            return new Date(data.expiresAt) > new Date(data.startsAt)
        }
        return true
    },
    { message: 'expiresAt must be after startsAt' }
)

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

        // M-NEW-5: validate with Zod
        const parsed = createCouponSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid coupon data', details: parsed.error.flatten() },
                { status: 400 }
            )
        }
        const data = parsed.data

        const coupon = await CouponService.createCoupon({
            type: data.type,
            code: data.code,
            name: data.name,
            description: data.description,
            discountType: data.discountType,
            discountValue: data.discountValue,
            giftAmount: data.giftAmount,
            maxDiscount: data.maxDiscount,
            maxUses: data.maxUses,
            maxUsesPerUser: data.maxUsesPerUser,
            minDepositAmount: data.minDepositAmount,
            validServices: data.validServices || [],
            newUsersOnly: data.newUsersOnly || false,
            startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
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

        // M-NEW-6: use !== undefined instead of truthy check so 0 values are preserved
        const coupon = await CouponService.updateCoupon(id, {
            name: updates.name,
            description: updates.description,
            discountValue: updates.discountValue !== undefined ? parseFloat(updates.discountValue) : undefined,
            maxUses: updates.maxUses !== undefined ? parseInt(updates.maxUses) : undefined,
            maxUsesPerUser: updates.maxUsesPerUser !== undefined ? parseInt(updates.maxUsesPerUser) : undefined,
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
