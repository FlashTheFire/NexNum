
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/core/db';
import { getCurrentUser } from '@/lib/auth/jwt';

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers);

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const preferences = await prisma.notificationPreferences.findUnique({
            where: { userId: user.userId }
        });

        return NextResponse.json(preferences || {});
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getCurrentUser(request.headers);

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const preferences = await prisma.notificationPreferences.upsert({
            where: { userId: user.userId },
            update: body,
            create: {
                userId: user.userId,
                ...body
            }
        });

        return NextResponse.json(preferences);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }
}
