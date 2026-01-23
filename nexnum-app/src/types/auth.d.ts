// Custom Auth Types
// These were previously extending next-auth types, now standalone

export interface AuthSession {
    user: {
        id: string
        email: string
        name: string
        role: "USER" | "ADMIN"
    }
}

export interface AuthUser {
    id: string
    email: string
    name: string
    role: "USER" | "ADMIN"
}

export interface AuthJWT {
    userId: string
    email: string
    name: string
    role: "USER" | "ADMIN"
    version: number
    iat?: number
    exp?: number
}
