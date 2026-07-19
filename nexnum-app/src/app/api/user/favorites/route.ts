/**
 * User Favorites API
 * GET    /api/user/favorites?type=SERVICE|COUNTRY  - list favorites
 * POST   /api/user/favorites  { type, value, displayName, iconUrl? }  - upsert
 * DELETE /api/user/favorites  { type, value }  - remove
 *
 * Replaces the localStorage-only pinned items so favorites are cross-device.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { prisma } from '@/lib/core/db';
import { z } from 'zod';
import { rateLimiters } from '@/lib/auth/ratelimit';

function getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}

const ALLOWED_TYPES = new Set(['SERVICE', 'COUNTRY']);

const upsertSchema = z.object({
    type: z.string().refine((v: string) => ALLOWED_TYPES.has(v), 'type must be SERVICE or COUNTRY'),
    value: z.string().min(1).max(120),
    displayName: z.string().min(1).max(160),
    iconUrl: z.string().max(500).optional().nullable(),
});

const deleteSchema = z.object({
    type: z.string().refine((v: string) => ALLOWED_TYPES.has(v), 'type must be SERVICE or COUNTRY'),
    value: z.string().min(1).max(120),
});

export async function GET(req: NextRequest) {
    const { userId, error } = await requireUser(req);
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const type = req.nextUrl.searchParams.get('type');
        const where: any = { userId };
        if (type) {
            if (!ALLOWED_TYPES.has(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
            where.type = type;
        }
        const favs = await prisma.userFavorite.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
        return NextResponse.json({ items: favs });
    } catch (e: any) {
        console.error('[favorites GET] error', e);
        return NextResponse.json({ error: 'Failed to load favorites' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { userId, error } = await requireUser(req);
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Per-user soft limit on writes (60/min) to prevent runaway loops
    const ip = getClientIp(req);
    const rl = await rateLimiters.api.limit(`fav-write:${userId}:${ip}`, 60);
    if (!rl.success) {
        const res = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        res.headers.set('X-RateLimit-Limit', String(rl.limit));
        res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
        res.headers.set('X-RateLimit-Reset', String(rl.reset));
        return res;
    }

    try {
        const body = await req.json();
        const parsed = upsertSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
        }
        const { type, value, displayName, iconUrl } = parsed.data;
        const normValue = value.toLowerCase();

        const fav = await prisma.userFavorite.upsert({
            where: { userId_type_value: { userId, type, value: normValue } },
            create: { userId, type, value: normValue, displayName, iconUrl: iconUrl ?? null },
            update: { displayName, iconUrl: iconUrl ?? null },
        });
        return NextResponse.json({ item: fav });
    } catch (e: any) {
        console.error('[favorites POST] error', e);
        return NextResponse.json({ error: 'Failed to save favorite' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const { userId, error } = await requireUser(req);
    if (error || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await req.json().catch(() => null);
        const id = req.nextUrl.searchParams.get('id');
        if (id) {
            await prisma.userFavorite.deleteMany({ where: { id, userId } });
            return NextResponse.json({ ok: true });
        }
        if (!body) return NextResponse.json({ error: 'Missing id or payload' }, { status: 400 });
        const parsed = deleteSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        const { type, value } = parsed.data;
        await prisma.userFavorite.deleteMany({
            where: { userId, type, value: value.toLowerCase() },
        });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error('[favorites DELETE] error', e);
        return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
    }
}
