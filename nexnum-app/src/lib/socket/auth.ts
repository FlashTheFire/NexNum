import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { verifyToken } from '@/lib/auth/jwt';
import { prisma } from '@/lib/core/db';
import { logger } from '@/lib/core/logger';

export interface AuthenticatedSocket extends Socket {
    user?: {
        id: string;
        email: string;
        role: string;
    };
}

/**
 * Socket.io Middleware for JWT Authentication
 * Performs strict validation including DB checks for Ban/Token Version.
 */
export async function socketAuth(socket: Socket, next: (err?: ExtendedError) => void) {
    try {
        let token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

        // Support HTTP-only Cookies
        if (!token && socket.handshake.headers.cookie) {
            const cookies = socket.handshake.headers.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {} as Record<string, string>);
            token = cookies['token'];
        }

        if (!token) {
            return next(new Error('Authentication error: Token required'));
        }

        // 1. Verify Signature & Expiry
        const payload = await verifyToken(token);
        if (!payload) {
            return next(new Error('Authentication error: Invalid token'));
        }

        // 2. DB Check (Strict Security: Ban & Token Version Revocation)
        // This makes connection slightly slower but much safer. 
        // We can optimize with Redis caching later if needed.
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                role: true,
                isBanned: true,
                tokenVersion: true
            }
        });

        if (!user) {
            return next(new Error('Authentication error: User not found'));
        }

        if (user.isBanned) {
            logger.warn(`[Socket] Rejected connection from banned user ${user.id}`);
            return next(new Error('Authentication error: Account suspended'));
        }

        if (user.tokenVersion !== payload.version) {
            logger.warn(`[Socket] Rejected connection from user ${user.id} (Token Version Mismatch)`);
            return next(new Error('Authentication error: Token revoked'));
        }

        // 3. Attach User to Socket
        (socket as AuthenticatedSocket).user = {
            id: user.id,
            email: user.email,
            role: user.role
        };

        next();
    } catch (err) {
        logger.error('[Socket] Auth middleware error', err);
        next(new Error('Authentication error: Internal Server Error'));
    }
}
