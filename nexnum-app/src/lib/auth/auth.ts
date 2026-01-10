// Simple auth utilities for mock authentication

// Generate a simple hash (NOT secure - for demo only)
export function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// Generate unique user ID
export function generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// User type
export interface User {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    createdAt: string;
}

// Session type
export interface Session {
    userId: string;
    email: string;
    name: string;
    expiresAt: number;
}

const USERS_KEY = 'nexnum_users';
const SESSION_KEY = 'nexnum_session';

// Get mock user database from localStorage
export function getUsers(): User[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
}

// Save users to localStorage
export function saveUsers(users: User[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Find user by email
export function findUserByEmail(email: string): User | undefined {
    return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

// Create new user
export function createUser(name: string, email: string, password: string): User {
    const users = getUsers();

    const newUser: User = {
        id: generateUserId(),
        name,
        email: email.toLowerCase(),
        passwordHash: simpleHash(password),
        createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveUsers(users);

    return newUser;
}

// Validate credentials
export function validateCredentials(email: string, password: string): User | null {
    const user = findUserByEmail(email);
    if (!user) return null;

    if (user.passwordHash !== simpleHash(password)) return null;

    return user;
}

// Session management
export function saveSession(user: User): void {
    if (typeof window === 'undefined') return;

    const session: Session = {
        userId: user.id,
        email: user.email,
        name: user.name,
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
    if (typeof window === 'undefined') return null;

    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;

    const session: Session = JSON.parse(data);

    // Check if expired
    if (session.expiresAt < Date.now()) {
        clearSession();
        return null;
    }

    return session;
}

export function clearSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SESSION_KEY);
}
