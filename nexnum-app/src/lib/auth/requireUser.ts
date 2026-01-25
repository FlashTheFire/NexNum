import { NextResponse } from 'next/server'
import { verifyToken, getTokenFromHeaders } from './jwt'
import { cookies } from 'next/headers'

export async function requireUser(request: Request) {
    let token = getTokenFromHeaders(request.headers)

    if (!token) {
        const cookieStore = await cookies()
        token = cookieStore.get('token')?.value
    }

    if (!token) {
        return {
            userId: null,
            error: NextResponse.json(
                { success: false, error: 'Unauthorized: Missing token' },
                { status: 401 }
            )
        }
    }

    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
        return {
            userId: null,
            error: NextResponse.json(
                { success: false, error: 'Unauthorized: Invalid token' },
                { status: 401 }
            )
        }
    }

    return {
        userId: payload.userId,
        error: null
    }
}
