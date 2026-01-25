import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '../providers/socket-provider';

export const useSocket = () => {
    return useContext(SocketContext);
};

/**
 * Hook to subscribe to a specific socket event.
 * Automatically handles mounting/unmounting.
 * 
 * @param event The event name (e.g., 'sms.received')
 * @param handler Callback function
 */
export const useSocketEvent = <T = any>(event: string, handler: (data: T) => void) => {
    const { socket, isConnected } = useSocket();
    const handlerRef = useRef(handler);

    // Keep handler ref fresh without re-subscribing
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        if (!socket || !isConnected) return;

        const eventListener = (data: T) => {
            if (handlerRef.current) {
                handlerRef.current(data);
            }
        };

        socket.on(event, eventListener);

        return () => {
            socket.off(event, eventListener);
        };
    }, [socket, isConnected, event]);
};
