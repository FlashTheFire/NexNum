import { useState, useEffect } from 'react';

interface PinnedItem {
    id: string;
    [key: string]: any;
}

export function usePinnedItems<T extends PinnedItem>(storageKey: string) {
    const [pinnedItems, setPinnedItems] = useState<T[]>([]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) {
                setPinnedItems(JSON.parse(stored));
            }
        } catch (error) {
            console.error(`Error reading ${storageKey} from localStorage`, error);
        }
    }, [storageKey]);

    const togglePin = (item: T) => {
        setPinnedItems(prev => {
            let newPinned: T[];
            const exists = prev.some(p => p.id === item.id);

            if (exists) {
                newPinned = prev.filter(p => p.id !== item.id);
            } else {
                newPinned = [item, ...prev]; // Add new pins to the top
            }

            try {
                localStorage.setItem(storageKey, JSON.stringify(newPinned));
            } catch (error) {
                console.error(`Error writing ${storageKey} to localStorage`, error);
            }

            return newPinned;
        });
    };

    const isPinned = (id: string) => pinnedItems.some(item => item.id === id);

    return { pinnedItems, togglePin, isPinned };
}
