import { resetPassword } from '@/lib/auth/password-reset'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { z } from 'zod'

const schema = z.object({
    token: z.string(),
    password: z.string().min(8)
})

export const POST = apiHandler(async (request, { body }) => {
    const { token, password } = body!

    const result = await resetPassword(token, password)

    if (!result.success) {
        return ResponseFactory.error(result.error || 'Reset failed', 400)
    }

    return ResponseFactory.success({
        message: 'Password updated successfully'
    })
}, { schema, rateLimit: 'auth' })
