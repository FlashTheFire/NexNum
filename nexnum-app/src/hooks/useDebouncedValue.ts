"use client";

import { useEffect, useState } from "react";

/**
 * Returns a value that only updates after `delayMs` of stability.
 * Used to throttle expensive effects (network calls, list re-renders) on
 * keystroke-driven inputs. Default 200ms — long enough to coalesce typical
 * typing bursts, short enough to feel instant to the user.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 200): T {
    const [debounced, setDebounced] = useState<T>(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}
