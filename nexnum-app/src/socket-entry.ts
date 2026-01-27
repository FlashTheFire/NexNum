/**
 * Industrial Socket Server Entry Point
 * 
 * Powered by CoreOrchestrator for unified lifecycle management.
 */

import { createServer } from 'http';
import { SocketService } from './lib/socket/server';
import { logger } from './lib/core/logger';
import { orchestrator } from './lib/core/orchestrator';

const PORT = parseInt(process.env.SOCKET_PORT || '3951', 10);

async function bootstrap() {
    // 1. Unified Bootstrap (Env, DB, Redis, Signals)
    await orchestrator.bootstrap('Standalone:Socket');

    logger.info('[SocketEntry] Initializing HTTP & Socket Services...');

    // 2. HTTP Base Server
    const httpServer = createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
        }
        res.writeHead(404);
        res.end();
    });

    // 3. Socket.io Service Layer
    const socketService = new SocketService(httpServer);

    // 4. Register Shutdown Hooks
    orchestrator.onShutdown(async () => {
        logger.info('[SocketEntry] Shutting down socket service...');
        await socketService.cleanup();
        httpServer.close();
    });

    // 5. Start Execution
    httpServer.listen(PORT, () => {
        logger.success(`[SocketEntry] Listening on port ${PORT}`);
        logger.info(`[SocketEntry] Path: /api/socket`);
    });
}

bootstrap().catch((e) => {
    logger.error('Fatal Error in SocketEntry', e);
    process.exit(1);
});
