import { z } from 'zod'

// ============================================
// AUTH SCHEMAS
// ============================================

export const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
})

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
})

// ============================================
// WALLET SCHEMAS
// ============================================

export const topupSchema = z.object({
    amount: z.number()
        .positive('Amount must be positive')
        .max(10000, 'Maximum topup is $10,000'),
    idempotencyKey: z.string().uuid('Invalid idempotency key'),
})

// ============================================
// NUMBER SCHEMAS
// ============================================

export const purchaseNumberSchema = z.object({
    countryCode: z.string().length(2, 'Country code must be 2 characters'),
    serviceCode: z.string().min(1, 'Service code is required'),
    idempotencyKey: z.string().uuid('Invalid idempotency key'),
})

export const searchNumbersSchema = z.object({
    country: z.string().optional(),
    service: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(20),
})

// ============================================
// UTILITY FUNCTIONS
// ============================================

export type ValidationResult<T> =
    | { success: true; data: T }
    | { success: false; error: string }

export function validate<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): ValidationResult<T> {
    const result = schema.safeParse(data)

    if (result.success) {
        return { success: true, data: result.data }
    }

    // Get first error message
    const firstError = result.error.issues[0]
    const errorMessage = firstError.path.length > 0
        ? `${firstError.path.join('.')}: ${firstError.message}`
        : firstError.message

    return { success: false, error: errorMessage }
}

// ============================================
// TYPE EXPORTS
// ============================================

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type TopupInput = z.infer<typeof topupSchema>
export type PurchaseNumberInput = z.infer<typeof purchaseNumberSchema>
export type SearchNumbersInput = z.infer<typeof searchNumbersSchema>
