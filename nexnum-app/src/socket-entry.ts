// Load Environment FIRST
import dotenv from 'dotenv';
import path from 'path';
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

import { createServer } from 'http';
import { SocketService } from './lib/socket/server';
import { logger } from './lib/core/logger';

const PORT = parseInt(process.env.SOCKET_PORT || '3951', 10);

async function bootstrap() {
    logger.info('[SocketEntry] Starting Socket Server...');

    // Minimal HTTP Server
    const httpServer = createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
        }
        res.writeHead(404);
        res.end();
    });

    // Initialize Socket Service
    const socketService = new SocketService(httpServer);

    // Listen
    httpServer.listen(PORT, () => {
        logger.info(`[SocketEntry] Listening on port ${PORT}`);
        logger.info(`[SocketEntry] Path: /api/socket`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
        logger.info('[SocketEntry] Shutting down...');
        await socketService.cleanup();
        httpServer.close();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

bootstrap().catch((e) => {
    logger.error('Fatal Error in SocketEntry', e);
    process.exit(1);
});
