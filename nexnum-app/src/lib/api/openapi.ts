import {
    OpenAPIRegistry,
    OpenApiGeneratorV3,
    extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * Global API Registry for OpenAPI Documentation
 */
export const registry = new OpenAPIRegistry();

// --- COMMON SCHEMAS ---

export const ErrorSchema = registry.register(
    'ErrorResponse',
    z.object({
        success: z.boolean().openapi({ example: false }),
        error: z.string().openapi({ example: 'Something went wrong' }),
        code: z.string().optional().openapi({ example: 'E_HTTP_400' }),
        details: z.any().optional().openapi({ example: [{ field: 'email', message: 'Invalid format' }] }),
    })
);

export const SuccessSchema = registry.register(
    'SuccessResponse',
    z.object({
        success: z.boolean().openapi({ example: true }),
        data: z.any().optional(),
    })
);

// --- PAGINATION SCHEMA ---

export const PaginationSchema = registry.register(
    'Pagination',
    z.object({
        total: z.number().openapi({ example: 100 }),
        page: z.number().openapi({ example: 1 }),
        limit: z.number().openapi({ example: 20 }),
        pages: z.number().openapi({ example: 5 }),
    })
);

/**
 * Generate the full OpenAPI Document
 */
export function generateOpenApiDocument() {
    const generator = new OpenApiGeneratorV3(registry.definitions);

    return generator.generateDocument({
        openapi: '3.0.0',
        info: {
            version: '1.0.0',
            title: 'NexNum Professional API',
            description: 'Senior-grade documentation for NexNum internal and external services.',
        },
        servers: [{ url: '/api' }],
    });
}
