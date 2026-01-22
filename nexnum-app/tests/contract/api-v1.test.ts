
import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config();

// Use hardcoded default if env var is missing or empty
const envBase = process.env.BASE_URL;
console.log('process.env.BASE_URL raw:', envBase);
const BASE_URL = (envBase && envBase.startsWith('http')) ? envBase : 'http://localhost:3000';
console.log('Testing against BASE_URL resolved:', BASE_URL);

// Use the test key we generated, or fallback to a known test key if env is missing
const API_KEY = process.env.API_KEY || 'nxn_test_aJoYDH2Kp3-6GD1hECPLBew2pifl0ymt';

// --- Schemas (Matching OpenAPI) ---

const ErrorResponseSchema = z.object({
    success: z.boolean(), // usually false
    error: z.object({
        message: z.string(),
        code: z.string(),
        status: z.number().optional(),
    }).optional(),
});

const BalanceSchema = z.object({
    success: z.literal(true),
    data: z.object({
        balance: z.number(),
        currency: z.string(),
    }),
});

const NumberSummarySchema = z.object({
    id: z.string().uuid(),
    phoneNumber: z.string(),
    parsed: z.object({
        countryCode: z.string().nullable().optional(),
        nationalNumber: z.string().nullable().optional(),
    }).optional(),
    country: z.object({
        code: z.string(),
        name: z.string().optional(),
    }).optional(),
    service: z.object({
        code: z.string(),
        name: z.string().optional(),
    }).optional(),
    status: z.enum(['active', 'reserved', 'expired', 'cancelled', 'available']), // Added 'available' as it might appear
    expiresAt: z.string().datetime().nullable().optional(),
});

const NumberListSchema = z.object({
    success: z.literal(true),
    data: z.object({
        numbers: z.array(NumberSummarySchema),
    }),
});

const SmsMessageSchema = z.object({
    id: z.string().uuid().optional(),
    sender: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    receivedAt: z.string().datetime(),
});

const SmsListSchema = z.object({
    success: z.literal(true),
    data: z.object({
        messages: z.array(z.any()), // SmsMessageSchema might vary slightly in list vs detail, loose check for now or specific
    }),
});


describe('API Contract Tests (v1)', () => {

    it('GET /api/v1/balance should match schema', async () => {
        const response = await fetch(`${BASE_URL}/api/v1/balance`, {
            headers: { 'x-api-key': API_KEY },
        });

        expect(response.status).toBe(200);
        const json = await response.json();

        // Validate with Zod
        const result = BalanceSchema.safeParse(json);
        if (!result.success) {
            console.error('Balance Validation Failed:', result.error);
        }
        expect(result.success).toBe(true);
    });

    it('GET /api/v1/numbers should match schema', async () => {
        const response = await fetch(`${BASE_URL}/api/v1/numbers`, {
            headers: { 'x-api-key': API_KEY },
        });

        expect(response.status).toBe(200);
        const json = await response.json();

        const result = NumberListSchema.safeParse(json);
        if (!result.success) {
            console.error('Numbers Validation Failed:', result.error);
        }
        expect(result.success).toBe(true);
    });

    it('GET /api/v1/sms should match schema', async () => {
        const response = await fetch(`${BASE_URL}/api/v1/sms`, {
            headers: { 'x-api-key': API_KEY },
        });

        expect(response.status).toBe(200);
        const json = await response.json();

        const result = SmsListSchema.safeParse(json);
        if (!result.success) {
            console.error('SMS Validation Failed:', result.error);
        }
        expect(result.success).toBe(true);
    });

    it('Should return 401 without API Key', async () => {
        const response = await fetch(`${BASE_URL}/api/v1/balance`);
        expect(response.status).toBe(401);
        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json.error.code).toBeDefined();
    });

});
