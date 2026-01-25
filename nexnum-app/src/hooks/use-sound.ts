import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

export function useSound(path: string) {
    const audioRef = useRef<HTMLAudioElement | null>(null)

    useEffect(() => {
        // Initialize audio
        const audio = new Audio(path)
        audio.preload = 'auto'
        audioRef.current = audio

        return () => {
            audioRef.current = null
        }
    }, [path])

    const play = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0
            audioRef.current.play().catch(e => {
                // Autoplay policy might block this if no interaction
                console.debug('[Sound] Play blocked (user interaction required first)', e)
                // Optionally show a toast or UI hint if critical, but for notifications it's usually fine to fail silently
            })
        }
    }, [])

    return { play }
}
