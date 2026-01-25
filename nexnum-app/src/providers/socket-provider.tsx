'use client';

import React, { createContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useGlobalStore } from '@/stores/appStore';
import { Phone, Wallet, Bell } from 'lucide-react';
import { useSound } from '@/hooks/use-sound';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

export const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

// Enable by setting NEXT_PUBLIC_SOCKET_ENABLED=true in .env
const SOCKET_ENABLED = process.env.NEXT_PUBLIC_SOCKET_ENABLED === 'true';

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const fetchDashboardState = useGlobalStore((state) => state.fetchDashboardState);
    const { play: playNotification } = useSound('/audio/notification.mp3')

    useEffect(() => {
        if (!SOCKET_ENABLED) {
            console.log('ℹ️ [Socket] Disabled (using visibility-based refresh instead)');
            return;
        }

        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3951';

        const socketInstance = io(socketUrl, {
            path: '/api/socket',
            withCredentials: true,
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000, // Slower retry to be nice
            transports: ['websocket', 'polling'], // Fallback enabled
        });

        socketInstance.on('connect', () => {
            setIsConnected(true);
            // toast.success('Real-time connection established', { 
            //     id: 'socket-connected', 
            //     icon: <Wifi className="w-4 h-4 text-green-400"/>,
            //     duration: 2000
            // });
            console.log('✅ [Socket] Connected');
            syncMissedEvents();
        });

        socketInstance.on('disconnect', (reason) => {
            setIsConnected(false);
            console.log('❌ [Socket] Disconnected:', reason);
        });

        socketInstance.on('connect_error', (err) => {
            console.debug('[Socket] Connection failed:', err.message);
        });

        // -----------------------------------------------------------------
        // Event Handling (Envelope Unwrapping)
        // -----------------------------------------------------------------

        socketInstance.on('state.updated', (envelope: any) => {
            // Verify Envelope Version
            if (envelope?.v !== 1 || !envelope?.payload) {
                console.warn('[Socket] Invalid envelope received:', envelope);
                return;
            }

            const { type, reason } = envelope.payload;
            console.log(`🔄 [Socket] State Update: ${type} (${reason || 'Unknown'})`);

            // Optimistic Updates could go here
            fetchDashboardState();

            // Notify user of balance changes if explicitly triggered
            if (type === 'wallet' && reason === 'deposit') {
                toast.success('Deposit Received', {
                    description: 'Your balance has been updated.',
                    icon: <Wallet className="w-4 h-4 text-emerald-400" />
                });
            }
        });

        socketInstance.on('sms.received', (envelope: any) => {
            if (envelope?.v !== 1 || !envelope?.payload) {
                console.warn('[Socket] Invalid envelope received:', envelope);
                return;
            }

            const data = envelope.payload;
            if (data?.phoneNumber && data?.message) {
                // Play notification sound
                playNotification()

                toast('New Message Received', {
                    description: `${data.phoneNumber}: ${data.message.substring(0, 50)}${data.message.length > 50 ? '...' : ''}`,
                    icon: <Phone className="w-4 h-4 text-violet-400" />,
                    duration: 8000, // Keep longer
                    action: {
                        label: 'View',
                        onClick: () => window.location.href = `/sms/${data.phoneNumber}`
                    }
                });
            }
            fetchDashboardState();
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [fetchDashboardState]);

    /**
     * Replay missed events from Redis Stream via API
     */
    const syncMissedEvents = async () => {
        try {
            const lastId = sessionStorage.getItem('lastEventId') || '-';
            const res = await fetch(`/api/user/events/sync?since=${lastId}`);

            if (res.ok) {
                const data = await res.json();
                if (data.events && Array.isArray(data.events)) {
                    // Deduplicate?
                    const validEvents = data.events.filter((e: any) => e && e.v === 1);

                    if (validEvents.length > 0) {
                        console.log(`[Socket] Replaying ${validEvents.length} missed events...`);

                        // Process purely for side-effects (toasts, data refresh)
                        // We don't re-emit to socket to avoid loops, just call handlers directly or re-fetch state
                        let shouldRefetch = false;

                        validEvents.forEach((evt: any) => {
                            // Update cursor
                            sessionStorage.setItem('lastEventId', evt.eventId);

                            if (evt.type === 'state.updated') shouldRefetch = true;
                            // Only toast for very, very recent messages (prevents toast bomb on login)
                            if (evt.type === 'sms.received') {
                                // Check if event is < 30 seconds old
                                if (Date.now() - (evt.ts || 0) < 30000) {
                                    // Trigger toast...
                                }
                                shouldRefetch = true;
                            }
                        });

                        if (shouldRefetch) fetchDashboardState();
                    }
                }
            }
        } catch (e) {
            console.error('[Socket] Sync failed', e);
        }
    };

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
