import { NextResponse } from 'next/server'
import { API_SECURITY_HEADERS } from '@/lib/security'
import { getRequestId, getTraceId } from './request-context'
import { AppError } from '@/lib/core/errors'

/**
 * Professional API Response Factory
 * 
 * Standardizes the JSON envelope for all API responses.
 * Automatically injects Security and Correlation headers.
 */

export class ResponseFactory {
    /**
     * Standard Success Response
     */
    static success<T>(data: T, status: number = 200): NextResponse {
        return NextResponse.json(
            { success: true, data },
            { status, headers: this.getHeaders() }
        )
    }

    /**
     * Paginated Success Response
     */
    static paginated<T>(items: T[], total: number, page: number, limit: number): NextResponse {
        return NextResponse.json(
            {
                success: true,
                data: items,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) }
            },
            { status: 200, headers: this.getHeaders() }
        )
    }

    /**
     * Standard Error Response
     */
    static error(message: string, status: number = 400, code?: string, details?: any): NextResponse {
        return NextResponse.json(
            {
                success: false,
                error: message,
                code: code || `HTTP_${status}`,
                details
            },
            { status, headers: this.getHeaders() }
        )
    }

    /**
     * Security Headers + Correlation IDs
     */
    private static getHeaders(): HeadersInit {
        return {
            ...API_SECURITY_HEADERS,
            'X-Request-ID': getRequestId(),
            'X-Trace-ID': getTraceId(),
            'Access-Control-Expose-Headers': 'X-Request-ID, X-Trace-ID'
        }
    }
}
