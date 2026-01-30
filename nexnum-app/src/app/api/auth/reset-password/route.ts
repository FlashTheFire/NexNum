import { NextResponse } from 'next/server'
import { resetPassword } from '@/lib/auth/password-reset'
import { apiHandler } from '@/lib/api/api-handler'
import { z } from 'zod'

const schema = z.object({
    token: z.string(),
    password: z.string().min(8)
})

export const POST = apiHandler(async (request, { body }) => {
    if (!body) return NextResponse.json({ error: 'Missing request body' }, { status: 400 })
    const { token, password } = body

    const result = await resetPassword(token, password)

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
        success: true,
        message: 'Password updated successfully'
    })
}, { schema, rateLimit: 'auth' })
