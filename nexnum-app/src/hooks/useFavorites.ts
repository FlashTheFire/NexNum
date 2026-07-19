"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/authStore";

export type FavoriteType = "SERVICE" | "COUNTRY";

export interface FavoriteItem {
    id: string;             // server-side uuid (use as favoriteId for unpin)
    type: FavoriteType;
    value: string;          // canonical (lowercased) value
    displayName: string;
    iconUrl?: string | null;
    sortOrder?: number;
    createdAt?: string;
}

interface UseFavoritesResult {
    favorites: FavoriteItem[];
    isFavorite: (type: FavoriteType, value: string) => boolean;
    favoriteIdOf: (type: FavoriteType, value: string) => string | null;
    toggle: (type: FavoriteType, item: { value: string; displayName: string; iconUrl?: string | null }) => Promise<boolean>;
    remove: (id: string) => Promise<void>;
    loading: boolean;
    error: string | null;
}

/**
 * Cross-device favorites backed by /api/user/favorites.
 *
 * - Loads favorites once when user becomes authenticated
 * - Optimistic toggle (instant UI update, reverts on server failure)
 * - Skips network entirely for anonymous users (the API requires auth)
 * - Works alongside the per-user favorite merge in /api/search/* responses,
 *   which means a fresh /api/search/services page-load already includes the
 *   `isFavorite` flag for every item.
 */
export function useFavorites(): UseFavoritesResult {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            setFavorites([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch("/api/user/favorites", { credentials: "include" })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((data: { items: FavoriteItem[] }) => {
                if (cancelled || !mountedRef.current) return;
                setFavorites(data.items || []);
            })
            .catch((e) => {
                if (cancelled || !mountedRef.current) return;
                console.warn("[useFavorites] load failed", e);
                setError("Could not load favorites");
            })
            .finally(() => {
                if (!cancelled && mountedRef.current) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [isAuthenticated]);

    const isFavorite = useCallback(
        (type: FavoriteType, value: string) => {
            const v = (value || "").toLowerCase();
            return favorites.some((f) => f.type === type && f.value === v);
        },
        [favorites]
    );

    const favoriteIdOf = useCallback(
        (type: FavoriteType, value: string) => {
            const v = (value || "").toLowerCase();
            const found = favorites.find((f) => f.type === type && f.value === v);
            return found?.id ?? null;
        },
        [favorites]
    );

    const remove = useCallback(async (id: string) => {
        if (!isAuthenticated) return;
        const before = favorites;
        setFavorites((prev) => prev.filter((f) => f.id !== id));
        try {
            const r = await fetch("/api/user/favorites?id=" + encodeURIComponent(id), {
                method: "DELETE",
                credentials: "include",
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } catch (e) {
            if (!mountedRef.current) return;
            console.warn("[useFavorites] remove failed, reverting", e);
            setFavorites(before);
            setError("Could not remove favorite");
        }
    }, [favorites, isAuthenticated]);

    const toggle = useCallback(
        async (
            type: FavoriteType,
            item: { value: string; displayName: string; iconUrl?: string | null }
        ): Promise<boolean> => {
            if (!isAuthenticated) {
                setError("Sign in to pin services and countries");
                return false;
            }
            const v = (item.value || "").toLowerCase();
            const existing = favorites.find((f) => f.type === type && f.value === v);
            const before = favorites;

            if (existing) {
                // Optimistic remove
                setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
                try {
                    const r = await fetch(
                        "/api/user/favorites",
                        {
                            method: "DELETE",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type, value: v }),
                        }
                    );
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return false;
                } catch (e) {
                    if (!mountedRef.current) return false;
                    console.warn("[useFavorites] toggle-off failed, reverting", e);
                    setFavorites(before);
                    setError("Could not update favorite");
                    return true;
                }
            } else {
                // Optimistic add
                const optimistic: FavoriteItem = {
                    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    type,
                    value: v,
                    displayName: item.displayName,
                    iconUrl: item.iconUrl ?? null,
                    sortOrder: 0,
                };
                setFavorites((prev) => [optimistic, ...prev]);
                try {
                    const r = await fetch(
                        "/api/user/favorites",
                        {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                type,
                                value: v,
                                displayName: item.displayName,
                                iconUrl: item.iconUrl ?? null,
                            }),
                        }
                    );
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const data = (await r.json()) as { item: FavoriteItem };
                    if (!mountedRef.current) return true;
                    setFavorites((prev) => prev.map((f) => (f.id === optimistic.id ? data.item : f)));
                    return true;
                } catch (e) {
                    if (!mountedRef.current) return false;
                    console.warn("[useFavorites] toggle-on failed, reverting", e);
                    setFavorites(before);
                    setError("Could not save favorite");
                    return false;
                }
            }
        },
        [favorites, isAuthenticated]
    );

    return { favorites, isFavorite, favoriteIdOf, toggle, remove, loading, error };
}
