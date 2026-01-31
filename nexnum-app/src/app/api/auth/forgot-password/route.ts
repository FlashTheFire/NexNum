import { NextResponse } from 'next/server'
import { requestPasswordReset } from '@/lib/auth/password-reset'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { z } from 'zod'

const schema = z.object({
    email: z.string().email()
})

export const POST = apiHandler(async (request, { body }) => {
    const { email } = body!
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

    const result = await requestPasswordReset(email, ip)

    if (!result.success) {
        return ResponseFactory.error(result.error || 'Failed to request reset', 500)
    }

    return ResponseFactory.success({
        message: 'If an account exists, a reset link has been sent.'
    })
}, { schema, rateLimit: 'auth' })
