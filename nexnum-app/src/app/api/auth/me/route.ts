import { prisma } from '@/lib/core/db'
import { WalletService } from '@/lib/wallet/wallet'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { z } from 'zod'

export const GET = apiHandler(async (request, { user }) => {
    if (!user) return ResponseFactory.error('Unauthorized', 401)

    // Get user data with wallet
    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        include: {
            wallet: true,
        }
    })

    if (!dbUser) {
        return ResponseFactory.error('User not found', 404)
    }

    // Get wallet balance (via Service)
    const balance = await WalletService.getBalance(dbUser.id)

    return ResponseFactory.success({
        user: {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            preferredCurrency: dbUser.preferredCurrency,
            createdAt: dbUser.createdAt,
            emailVerified: dbUser.emailVerified,
        },
        wallet: {
            id: dbUser.wallet?.id,
            balance,
        }
    })
}, { requiresAuth: true })

const patchSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    preferredCurrency: z.string().optional()
})

export const PATCH = apiHandler(async (request, { user, body }) => {
    if (!user) return ResponseFactory.error('Unauthorized', 401)

    const { name, email, preferredCurrency } = body!

    const updatedUser = await prisma.user.update({
        where: { id: user.userId },
        data: {
            name: name !== undefined ? name : undefined,
            email: email !== undefined ? email : undefined,
            preferredCurrency: preferredCurrency !== undefined ? preferredCurrency : undefined,
        }
    })

    return ResponseFactory.success({
        user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            preferredCurrency: updatedUser.preferredCurrency,
            createdAt: updatedUser.createdAt,
            emailVerified: updatedUser.emailVerified
        }
    })
}, { schema: patchSchema, requiresAuth: true })
