'use client';

import React, { createContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

export const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Socket URL (Proxy handles /api/socket -> 3001 in dev, or Ingress in prod)
        // Check next.config.mjs or assumes standalone port access?
        // In Local Dev, we usually run socket on 3001. 
        // If we use rewrites, we can use relative path.
        // For now, let's try direct port 3001 logic or env var if we are in dev mode.
        // BUT, cookies won't be sent cross-port easily without credentials/CORS setup.
        // Best approach: Use a relative path if Next.js rewrites to 3001, OR direct URL.
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

        const socketInstance = io(socketUrl, {
            path: '/api/socket',
            withCredentials: true, // IMPORTANT: Send cookies
            autoConnect: true,
            reconnection: true,
            transports: ['websocket'],
        });

        socketInstance.on('connect', () => {
            setIsConnected(true);
            console.log('✅ [Socket] Connected');

            // Trigger Sync
            // We fetch missed events since last disconnect? 
            // For MVP, we just fetch "recent" or rely on page refresh for history 
            // and socket for new stuff.
            // SPRINT C plan said: Call Sync API
            syncMissedEvents();
        });

        socketInstance.on('disconnect', () => {
            setIsConnected(false);
            console.log('❌ [Socket] Disconnected');
        });

        socketInstance.on('connect_error', (err) => {
            console.error('⚠️ [Socket] Connection Error:', err.message);
        });

        // Global Listeners (e.g. Toasts)
        socketInstance.on('sms.received', (data: any) => {
            // Show toast if valid
            if (data?.phoneNumber && data?.message) {
                toast(`New Message on ${data.phoneNumber}`, {
                    description: data.message,
                    action: {
                        label: 'View',
                        onClick: () => window.location.href = `/sms/${data.phoneNumber}` // Simple nav
                    }
                });
            }
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    const syncMissedEvents = async () => {
        try {
            // We could track 'lastEventId' in localStorage or sessionStorage
            const lastId = sessionStorage.getItem('lastEventId') || '-';

            const res = await fetch(`/api/user/events/sync?since=${lastId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.events && Array.isArray(data.events)) {
                    data.events.forEach((evt: any) => {
                        // Dispatch event as if it came from socket?
                        // Or just let store handle it?
                        // For now, we process "Global" sync logic here if needed.
                        // But mostly components care about sync data.

                        // Store latest ID
                        if (evt.eventId) {
                            sessionStorage.setItem('lastEventId', evt.eventId);
                        }
                    });

                    if (data.events.length > 0) {
                        console.log(`[Socket] Synced ${data.events.length} missed events`);
                        toast.success('Sync complete', { description: `Retrieved ${data.events.length} missed messages` });
                    }
                }
            }
        } catch (e) {
            console.error('Sync failed', e);
        }
    };

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
