import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'
import { redirect } from 'next/navigation'

export default async function DebugTokenPage() {
    // SECURITY: Block in production
    if (process.env.NODE_ENV === 'production') {
        redirect('/dashboard')
    }

    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    const authToken = cookieStore.get('auth-token')?.value

    let payload = null
    let error = null

    if (token) {
        try {
            payload = await verifyToken(token)
        } catch (e) {
            error = "Token verification failed"
        }
    }

    // SECURITY: Must be logged in to view
    if (!payload) {
        return (
            <div className="p-8 bg-black text-white font-mono">
                <h1 className="text-xl font-bold mb-4">⛔ Access Denied</h1>
                <p className="text-red-500">You must be logged in to access this debug page.</p>
            </div>
        )
    }

    return (
        <div className="p-8 bg-black text-white font-mono whitespace-pre-wrap">
            <h1 className="text-xl font-bold mb-4">🔒 Token Debugger (DEV ONLY)</h1>

            <div className="mb-4">
                <strong>Cookie 'token':</strong> {token ? "Present" : "Missing"}
            </div>
            <div className="mb-4">
                <strong>Cookie 'auth-token':</strong> {authToken ? "Present" : "Missing"}
            </div>

            <div className="p-4 border border-white/20 rounded">
                <h2 className="font-bold mb-2">Decoded Payload (from 'token'):</h2>
                {payload ? JSON.stringify(payload, null, 2) : "No payload (Invalid or Missing Token)"}
            </div>

            {error && (
                <div className="mt-4 text-red-500">
                    Error: {error}
                </div>
            )}
        </div>
    )
}
