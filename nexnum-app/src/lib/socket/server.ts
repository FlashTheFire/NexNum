import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { logger } from '@/lib/core/logger';
import { redis as coreRedis } from '@/lib/core/redis'; // Shared IORedis instance (for other things)
import { AuthenticatedSocket, socketAuth } from './auth';
import type { Server as HttpServer } from 'http';
import { EventEnvelopeSchema } from '@/lib/events/schema';
import { SocketRateLimiter } from './limiter';
import { PresenceMonitor } from './presence';

export class SocketService {
    private io: Server;
    private static instance: SocketService;

    // Separate Redis clients for Pub/Sub (Required by socket.io-redis-adapter)
    private pubClient: Redis | null = null;
    private subClient: Redis | null = null;

    // Dedicated Subscriber for our "events:global" logic
    // We use a raw redis client for this distinct from the adapter to keep logic clean
    private eventSubscriber = coreRedis.duplicate();

    constructor(httpServer: HttpServer) {
        // Allow multiple origins for CORS (dev + prod)
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            process.env.NEXT_PUBLIC_APP_URL,
        ].filter(Boolean) as string[];

        this.io = new Server(httpServer, {
            cors: {
                origin: allowedOrigins,
                methods: ['GET', 'POST'],
                credentials: true,
                allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
            },
            path: '/api/socket', // Custom path to avoid conflict/easy proxying
            transports: ['polling', 'websocket'], // Allow both transports
            allowEIO3: true, // Allow Engine.IO v3 clients
        });

        // ERROR BOUNDARY: Global Engine.IO Errors
        this.io.engine.on('connection_error', (err) => {
            logger.error('[SocketEngine] Connection Error', {
                code: err.req ? 'REQ_ERR' : 'GEN_ERR',
                message: err.message,
                context: err.context
            });
        });

        this.setupAdapter();
        this.setupAuth();
        this.setupConnectionHandlers();
        this.startEventSubscription();

        logger.info('[SocketService] Initialized');
    }

    private async setupAdapter() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        try {
            // Using ioredis for consistency with the rest of the app
            this.pubClient = new Redis(redisUrl);
            this.subClient = new Redis(redisUrl);

            // ioredis connects automatically, but we can handle errors
            this.pubClient.on('error', (err) => logger.error('[SocketService] PubClient Error', err));
            this.subClient.on('error', (err) => logger.error('[SocketService] SubClient Error', err));

            this.io.adapter(createAdapter(this.pubClient, this.subClient));
            logger.info('[SocketService] Redis Adapter Connected');
        } catch (e) {
            logger.error('[SocketService] Failed to connect Redis Adapter', e);
        }
    }

    private setupAuth() {
        this.io.use(socketAuth);
    }

    private setupConnectionHandlers() {
        this.io.on('connection', async (rawSocket: Socket) => {
            const socket = rawSocket as AuthenticatedSocket;
            const userId = socket.user?.id;

            if (!userId) {
                socket.disconnect(true);
                return;
            }

            // 1. Rate Limit / Concurrency Check
            const allowed = await SocketRateLimiter.tryAcquire(userId, socket.id);
            if (!allowed) {
                socket.emit('error', { message: 'Too many connections' });
                socket.disconnect(true);
                return;
            }

            // 2. Auto-Join User Room
            const userRoom = `user:${userId}`;
            await socket.join(userRoom);

            // 3. Track Presence (Distributed)
            await PresenceMonitor.trackOnline(userId);

            logger.info(`[Socket] User connected: ${userId} (Joined ${userRoom})`);

            // 4. Handle Disconnect
            socket.on('disconnect', async (reason) => {
                logger.debug(`[Socket] User disconnected: ${userId}`, { reason });
                await Promise.all([
                    SocketRateLimiter.release(userId, socket.id),
                    PresenceMonitor.trackOffline(userId)
                ]);
            });

            // ERROR BOUNDARY: Per-socket errors
            socket.on('error', (err) => {
                logger.error('[Socket] Client Error', { userId, error: err.message });
            });
        });
    }

    /**
     * Listens to the 'events:global' channel published by the Worker
     * and forwards messages to the appropriate Socket.io Rooms.
     */
    private startEventSubscription() {
        this.eventSubscriber.subscribe('events:global', (err) => {
            if (err) {
                logger.error('[SocketService] Failed to subscribe to events channel', err);
            } else {
                logger.info('[SocketService] Listening to "events:global"');
            }
        });

        this.eventSubscriber.on('message', (channel, message) => {
            if (channel !== 'events:global') return;

            try {
                const raw = JSON.parse(message);

                // 1. Validate Envelope (Defensive Coding)
                const parsed = EventEnvelopeSchema.safeParse(raw);
                if (!parsed.success) {
                    logger.warn('[SocketService] Dropping invalid event envelope', parsed.error);
                    return;
                }

                const event = parsed.data;

                // 2. Handle INTERNAL Control Events (Kill Switch)
                if (event.type === 'user.revoked') {
                    const userId = event.payload.userId as string;
                    if (userId) {
                        this.killUserSessions(userId);
                    }
                    return;
                }

                // 3. Emit to Room
                // We emit using the event 'type' as the socket event name
                // e.g. client.on('sms.received', (payload) => {})
                this.io.to(event.room).emit(event.type, event.payload);

                logger.debug(`[SocketService] Emitted ${event.type} to ${event.room}`, {
                    eventId: event.eventId,
                    connections: this.io.sockets.adapter.rooms.get(event.room)?.size || 0
                });

            } catch (e) {
                logger.error('[SocketService] Error processing Redis message', e);
            }
        });
    }

    /**
     * Forcefully disconnect all active sockets for a user.
     * Used for real-time ban enforcement or security revocation.
     */
    private killUserSessions(userId: string) {
        const room = `user:${userId}`;
        const sockets = this.io.sockets.adapter.rooms.get(room);

        if (sockets && sockets.size > 0) {
            logger.warn(`[SocketService] REVOKING SESSIONS for user ${userId} (${sockets.size} sockets)`);
            this.io.to(room).emit('security.revoked', { reason: 'Account suspended or token revoked' });
            this.io.in(room).disconnectSockets(true);
        }
    }

    /**
     * Get global connection statistics
     */
    public async getStats() {
        const totalConnections = this.io.engine.clientsCount;
        return {
            totalConnections,
            adapter: 'redis'
        };
    }

    public async cleanup() {
        await Promise.all([
            this.pubClient?.disconnect(),
            this.subClient?.disconnect(),
            this.eventSubscriber.quit(),
            new Promise<void>((resolve) => this.io.close(() => resolve()))
        ]);
    }
}
