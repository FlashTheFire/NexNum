import { NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { apiHandler } from '@/lib/api/api-handler'
import { z } from 'zod'

const schema = z.object({
    email: z.string().email()
})

export const POST = apiHandler(async (request, { body }) => {
    if (!body) return NextResponse.json({ error: 'Missing request body' }, { status: 400 })
    const { email } = body
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

    const result = await requestPasswordReset(email, ip)

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
        success: true,
        message: 'If an account exists, a reset link has been sent.'
    })
}, { schema, rateLimit: 'auth' })
