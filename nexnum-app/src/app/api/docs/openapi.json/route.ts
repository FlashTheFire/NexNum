import { NextResponse } from 'next/server';
import { generateOpenApiDocument } from '@/lib/api/openapi';

export const dynamic = 'force-dynamic';

export async function GET() {
    const doc = generateOpenApiDocument();
    return NextResponse.json(doc);
}
