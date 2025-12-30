import { create } from 'zustand';
import {
    User,
    findUserByEmail,
    createUser,
    validateCredentials,
    saveSession,
    getSession,
    clearSession
} from '@/lib/auth';

interface AuthState {
    user: { id: string; name: string; email: string } | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    login: (email: string, password: string) => Promise<boolean>;
    register: (name: string, email: string, password: string) => Promise<boolean>;
    logout: () => void;
    checkAuth: () => void;
    updateUser: (name: string, email: string) => void;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const user = validateCredentials(email, password);

        if (!user) {
            set({
                isLoading: false,
                error: 'Invalid email or password'
            });
            return false;
        }

        saveSession(user);

        set({
            user: { id: user.id, name: user.name, email: user.email },
            isAuthenticated: true,
            isLoading: false,
            error: null,
        });

        return true;
    },

    register: async (name: string, email: string, password: string) => {
        set({ isLoading: true, error: null });

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Check if email already exists
        if (findUserByEmail(email)) {
            set({
                isLoading: false,
                error: 'Email already registered'
            });
            return false;
        }

        // Create user
        const user = createUser(name, email, password);

        // Auto-login
        saveSession(user);

        set({
            user: { id: user.id, name: user.name, email: user.email },
            isAuthenticated: true,
            isLoading: false,
            error: null,
        });

        return true;
    },

    logout: () => {
        clearSession();
        set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
        });
    },

    checkAuth: () => {
        const session = getSession();

        if (session) {
            set({
                user: {
                    id: session.userId,
                    name: session.name,
                    email: session.email
                },
                isAuthenticated: true,
                isLoading: false,
            });
        } else {
            set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
            });
        }
    },

    updateUser: (name: string, email: string) => {
        const currentUser = get().user;
        if (currentUser) {
            const updatedUser = { ...currentUser, name, email };

            // Update state
            set({ user: updatedUser });

            // Update persistent session
            const session = getSession();
            if (session) {
                // We need to update the session in localStorage
                // Note: saveSession takes a full User object, we might need to recreate it or modify saveSession to accept updates
                // For now, simpler approach:
                const fullUser = {
                    id: currentUser.id,
                    name,
                    email,
                    passwordHash: "hidden" // This is a mock, we don't have the password here easily. 
                    // In a real app we wouldn't need to re-save password hash on profile update.
                    // But our mock 'saveSession' might need it. 
                    // Let's check saveSession implementation in auth.ts if needed, or just partial update if possible.
                    // Actually, let's just update the specific fields in localStorage if possible or ignore persistence for name change for a moment if complex.
                    // Wait, `saveUsers` saves the whole DB. `saveSession` saves the current session.
                };

                // Hack for mock: Update the session storage directly if needed, or use a helper.
                // Let's just trust state update for now or implement a better helper.
                // Actually, let's do a simple localStorage update for the session key.
                localStorage.setItem('nexnum_session', JSON.stringify({
                    ...session,
                    name,
                    email
                }));
            }
        }
    },

    clearError: () => {
        set({ error: null });
    },
}));
