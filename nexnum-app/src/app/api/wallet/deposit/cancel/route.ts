/**
 * POST /api/wallet/deposit/cancel
 *
 * Cancels the user's active pending UPI deposit.
 * - Auth required (user must own the deposit)
 * - Only "pending" deposits can be cancelled
 * - Idempotent: cancelling an already-cancelled deposit returns success
 * - Rate-limited under "transaction" limiter
 */

import { apiHandler } from "@/lib/api/api-handler"
import { ResponseFactory } from "@/lib/api/response-factory"
import { getDepositService } from "@/lib/payment/deposit-service"
import { z } from "zod"

const cancelDepositSchema = z.object({
    depositId: z.string().min(1, "depositId is required"),
    reason: z.string().optional().default("user_cancelled"),
})

export const POST = apiHandler(async (_request, { body, user }) => {
    if (!user) {
        return ResponseFactory.error("Unauthorized", 401, "E_UNAUTHORIZED")
    }
    if (!body) {
        return ResponseFactory.error("Request body required", 400, "E_INVALID_BODY")
    }

    const { depositId, reason } = body
    const depositService = getDepositService()

    try {
        await depositService.cancelDeposit(depositId, user.userId, reason)

        return ResponseFactory.success({
            depositId,
            status: "cancelled",
            message: "Deposit cancelled successfully. You can now start a new deposit.",
        })
    } catch (err: any) {
        // Already cancelled -- idempotent success
        if (err.message?.includes("status 'cancelled'")) {
            return ResponseFactory.success({
                depositId,
                status: "cancelled",
                message: "Deposit was already cancelled.",
            })
        }

        // Cannot cancel completed deposit
        if (err.message?.includes("status 'completed'") || err.message?.includes("status 'confirmed'")) {
            return ResponseFactory.error(
                "This deposit has already been completed and cannot be cancelled.",
                409,
                "E_DEPOSIT_COMPLETED"
            )
        }

        // Not found
        if (err.message === "Deposit not found") {
            return ResponseFactory.error("Deposit not found", 404, "E_NOT_FOUND")
        }

        // Ownership violation
        if (err.message?.includes("does not belong")) {
            return ResponseFactory.error("Unauthorized to cancel this deposit", 403, "E_FORBIDDEN")
        }

        return ResponseFactory.error(err.message || "Failed to cancel deposit", 500, "E_CANCEL_FAILED")
    }
}, {
    schema: cancelDepositSchema,
    requiresAuth: true,
    rateLimit: "transaction",
})