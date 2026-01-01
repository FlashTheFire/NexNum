import { useState, useEffect } from 'react'

/**
 * Debounce a value - delays updating until after wait milliseconds have elapsed
 * @param value The value to debounce
 * @param delay The milliseconds to wait (default 500)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay = 500): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(timer)
        }
    }, [value, delay])

    return debouncedValue
}

export default useDebounce
