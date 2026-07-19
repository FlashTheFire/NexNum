"use client"

import { useEffect, useRef } from "react"

/**
 * Intercepts the browser Back button (popstate) and the ESC key,
 * and routes them to a custom handler instead of leaving the page.
 *
 * Trick: we push a sentinel entry into the history stack on mount so
 * the user's first Back press lands inside our handler (we call
 * `goBack()` which re-fires popstate). This means:
 *   - We never navigate away while there are wizard steps to step through.
 *   - The next "real" Back press (after the handler returns "leave") exits cleanly.
 *
 * ESC handling is global on the document. We ignore ESC when the user is
 * typing in an input/textarea/contenteditable (otherwise ESC inside the
 * search box would be unusable).
 *
 * @param onStepBack  Called for every Back/ESC while the wizard can step back.
 *                    It is responsible for deciding whether to decrement the step
 *                    or, if already on step 1, to actually navigate away.
 * @param isAtRoot    Set true when the wizard is at the first step — when true,
 *                    the next Back/ESC will be allowed to leave the page naturally.
 */
export function useWizardBack(onStepBack: () => void, isAtRoot: boolean) {
    const handlerRef = useRef(onStepBack)
    handlerRef.current = onStepBack
    const rootRef = useRef(isAtRoot)
    rootRef.current = isAtRoot

    useEffect(() => {
        if (typeof window === "undefined") return

        // Push a sentinel entry so the first Back press triggers popstate
        // instead of immediately navigating away from the buy page.
        // Wrapped in a microtask so it doesn't fight with Next.js's router
        // (which already pushes its own history entries on mount).
        const sentinel = { __wizardBack: true }
        const push = () => {
            try {
                window.history.pushState(sentinel, "")
            } catch {
                /* sandboxed iframes etc. — fall back to no-op */
            }
        }
        const id = window.setTimeout(push, 0)

        const onPopState = () => {
            if (rootRef.current) {
                // At step 1 → user actually wants to leave. Push a NEW sentinel
                // so the user can press Back again to navigate further back,
                // and let the browser handle the navigation.
                push()
                window.history.back()
                return
            }
            // Step back, then re-arm the sentinel so the next Back press
            // is also intercepted.
            handlerRef.current()
            // Defer the re-push so React state updates flush first.
            window.setTimeout(push, 0)
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return
            const t = e.target as HTMLElement | null
            if (t) {
                const tag = t.tagName
                const editable = t.isContentEditable
                if (editable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
                    // Let inputs handle ESC (e.g. clear field, close picker)
                    return
                }
            }
            e.preventDefault()
            onPopState()
        }

        window.addEventListener("popstate", onPopState)
        document.addEventListener("keydown", onKeyDown)

        return () => {
            window.clearTimeout(id)
            window.removeEventListener("popstate", onPopState)
            document.removeEventListener("keydown", onKeyDown)
        }
    }, [])
}
