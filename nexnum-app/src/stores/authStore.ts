import { create } from 'zustand';

interface AuthState {
    user: { id: string; name: string; email: string; role?: string; preferredCurrency?: string } | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    lastAuthCheck: number;
    requires2Fa: boolean;
    tempToken: string | null;

    // Actions
    login: (email: string, password: string) => Promise<boolean>;
    verify2Fa: (token: string) => Promise<boolean>;
    register: (name: string, email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    updateUser: (data: { name?: string; email?: string; preferredCurrency?: string }) => void;
    clearError: () => void;
    hydrateFromCache: () => void;  // New: restore from cache immediately
}

// Cache keys
const TOKEN_KEY = 'nexnum_token';
const USER_KEY = 'nexnum_user';
const AUTH_TIMESTAMP_KEY = 'nexnum_auth_timestamp';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// Helper to save token to localStorage
const saveToken = (token: string) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(AUTH_TIMESTAMP_KEY, String(Date.now()));
    }
};

// Helper to get token from localStorage
const getToken = (): string | null => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem(TOKEN_KEY);
    }
    return null;
};

// Helper to clear token from localStorage
const clearToken = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(AUTH_TIMESTAMP_KEY);
    }
};

// Helper to save user to localStorage (for faster hydration)
const saveUser = (user: { id: string; name: string; email: string; role?: string; preferredCurrency?: string }) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
};

// Helper to get cached user from localStorage
const getCachedUser = (): { id: string; name: string; email: string; role?: string; preferredCurrency?: string } | null => {
    if (typeof window !== 'undefined') {
        const userData = localStorage.getItem(USER_KEY);
        const timestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);

        // Check if cache is still valid
        if (userData && timestamp) {
            const age = Date.now() - parseInt(timestamp, 10);
            if (age < CACHE_DURATION) {
                try {
                    return JSON.parse(userData);
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
};

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
    requires2Fa: false,
    tempToken: null,
    lastAuthCheck: 0, // Timestamp of last successful verification

    login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                set({
                    isLoading: false,
                    error: data.error || 'Login failed'
                });
                return false;
            }

            // Check for 2FA Challenge
            if (data.requires2Fa) {
                set({
                    requires2Fa: true,
                    tempToken: data.tempToken,
                    isLoading: false,
                    error: null
                });
                return true; // Return true to indicate "success" in terms of request, but component checks requires2Fa
            }

            // Save token and user to cache
            saveToken(data.token);
            saveUser(data.user);

            set({
                user: data.user,
                token: data.token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
                requires2Fa: false,
                tempToken: null,
                lastAuthCheck: Date.now(), // update timestamp
            });

            return true;
        } catch (error) {
            set({
                isLoading: false,
                error: 'Network error. Please try again.'
            });
            return false;
        }
    },

    verify2Fa: async (token: string) => {
        set({ isLoading: true, error: null });
        const { tempToken } = get();

        if (!tempToken) {
            set({ isLoading: false, error: 'Session expired. Please login again.' });
            return false;
        }

        try {
            const response = await fetch('/api/auth/2fa/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, tempToken })
            });

            const data = await response.json();

            if (!response.ok) {
                set({ isLoading: false, error: data.error || 'Invalid code' });
                return false;
            }

            // Success
            // Assuming validate route returns token in data.token
            const authToken = data.token;

            saveToken(authToken);
            saveUser(data.data.user);

            set({
                user: data.data.user,
                token: authToken,
                isAuthenticated: true,
                isLoading: false,
                error: null,
                requires2Fa: false,
                tempToken: null,
                lastAuthCheck: Date.now()
            });

            return true;
        } catch (error) {
            set({ isLoading: false, error: 'Network error' });
            return false;
        }
    },

    register: async (name: string, email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                set({
                    isLoading: false,
                    error: data.error || 'Registration failed'
                });
                return false;
            }

            // Save token and user to cache
            saveToken(data.token);
            saveUser(data.user);

            set({
                user: data.user,
                token: data.token,
                isAuthenticated: true,
                isLoading: false,
                error: null,
                lastAuthCheck: Date.now(), // update timestamp
            });

            return true;
        } catch (error) {
            set({
                isLoading: false,
                error: 'Network error. Please try again.'
            });
            return false;
        }
    },

    logout: async () => {
        try {
            const token = get().token || getToken();

            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
        } catch (error) {
            // Ignore logout errors
        }

        clearToken();
        set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            lastAuthCheck: 0,
        });
    },

    checkAuth: async () => {
        const token = getToken();
        const cachedUser = getCachedUser();
        const { lastAuthCheck, isAuthenticated } = get();

        // THROTTLE: If already authenticated and checked recently (< 45s), skip
        const now = Date.now();
        if (isAuthenticated && (now - lastAuthCheck < 45000)) {
            // Just ensure loading is false
            set({ isLoading: false });
            return;
        }

        // If we have cached user, use it immediately (optimistic)
        if (cachedUser && !isAuthenticated) {
            set({
                user: cachedUser,
                token,
                isAuthenticated: true,
                isLoading: false,
            });
        }

        // Verify token with backend in background
        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                // Only clear if explicitly unauthorized
                if (response.status === 401) {
                    clearToken();
                    set({
                        user: null,
                        token: null,
                        isAuthenticated: false,
                        isLoading: false,
                        lastAuthCheck: 0,
                    });
                } else {
                    // Server error (500) or other - keep state but log error
                    console.error('Auth verification failed:', response.status)
                    // Optionally set error state but KEEP authenticated (resilience)
                    set({ isLoading: false })
                }
                return;
            }

            const data = await response.json();

            // Update with fresh data and refresh cache
            saveUser(data.user);
            set({
                user: data.user,
                token,
                isAuthenticated: true,
                isLoading: false,
                lastAuthCheck: Date.now(), // Update timestamp
            });
        } catch (error) {
            // Network error - if we have cached user, stay logged in
            if (cachedUser) {
                set({
                    user: cachedUser,
                    token,
                    isAuthenticated: true,
                    isLoading: false,
                });
            } else {
                // No cache, must clear
                clearToken();
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                    isLoading: false,
                    lastAuthCheck: 0,
                });
            }
        }
    },

    updateUser: (data: { name?: string; email?: string; preferredCurrency?: string }) => {
        const currentUser = get().user;
        if (currentUser) {
            const updatedUser = { ...currentUser, ...data };
            saveUser(updatedUser);  // Update cache
            set({ user: updatedUser });
        }
    },

    clearError: () => {
        set({ error: null });
    },

    // Instantly restore auth state from cache (no network request)
    hydrateFromCache: () => {
        const token = getToken();
        const cachedUser = getCachedUser();

        if (token && cachedUser) {
            set({
                user: cachedUser,
                token,
                isAuthenticated: true,
                isLoading: false,
                error: null // Clear errors on hydration
            });
        } else {
            set({
                isLoading: false,
            });
        }
    },
}));
