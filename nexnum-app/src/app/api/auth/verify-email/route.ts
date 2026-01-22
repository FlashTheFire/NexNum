import { NextResponse } from 'next/server'
import { verifyEmail } from '@/lib/auth/email-verification'
import { apiHandler } from '@/lib/api/api-handler'
import { z } from 'zod'

const schema = z.object({
    token: z.string()
})

// POST /api/auth/verify-email
export const POST = apiHandler(async (request, { body }) => {
    const { token } = body

    const result = await verifyEmail(token)

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
        success: true,
        message: 'Email verified successfully'
    })
}, { schema, rateLimit: 'auth' })
