import { redis } from '@/lib/core/redis';
import { prisma } from '@/lib/core/db';

/**
 * High-Speed Redis Caching for User Favorites
 * Protects PostgreSQL database from user-authenticated search query load.
 */
export async function getUserFavoritesMap(userId: string, type: 'SERVICE' | 'COUNTRY'): Promise<Map<string, string>> {
    const key = `cache:user:favs:${userId}:${type}`;
    try {
        const cached = await redis.get(key);
        if (cached) {
            const arr: [string, string][] = JSON.parse(cached);
            return new Map(arr);
        }
    } catch { /* fail open */ }

    try {
        const favs = await prisma.userFavorite.findMany({
            where: { userId, type },
            select: { id: true, value: true }
        });
        const entries: [string, string][] = favs.map(f => [f.value, f.id]);
        try {
            await redis.set(key, JSON.stringify(entries), 'EX', 300); // 5 min TTL
        } catch { /* fail open */ }
        return new Map(entries);
    } catch {
        return new Map();
    }
}

/**
 * Invalidate user favorites cache on POST / DELETE
 */
export async function invalidateUserFavoritesCache(userId: string) {
    try {
        await redis.del(`cache:user:favs:${userId}:SERVICE`, `cache:user:favs:${userId}:COUNTRY`);
    } catch { /* fail open */ }
}
