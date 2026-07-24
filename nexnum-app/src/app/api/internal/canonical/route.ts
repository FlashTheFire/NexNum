/**
 * Internal Canonical Resolution API
 *
 * Used by search/pricing engines to resolve service or country names
 * to canonical IDs. Accepts a raw name + optional provider context.
 *
 * GET /api/internal/canonical?type=service&name=discord
 * GET /api/internal/canonical?type=country&name=United States
 *
 * Returns: { canonicalId, canonicalCode, canonicalName, confidence, matchMethod }
 */

import { NextRequest, NextResponse } from 'next/server'
import { MatchingEngine } from '@/lib/normalizers/matching-engine'
import { logger } from '@/lib/core/logger'

const engine = new MatchingEngine()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as 'service' | 'country' | null
    const name = searchParams.get('name')
    const provider = searchParams.get('provider') // optional context

    if (!type || !name) {
      return NextResponse.json(
        { error: 'Missing required params: type (service|country) and name' },
        { status: 400 }
      )
    }

    let result
    if (type === 'service') {
      result = await engine.matchService(name)
    } else if (type === 'country') {
      result = await engine.matchCountry(name)
    } else {
      return NextResponse.json({ error: 'Invalid type. Use "service" or "country"' }, { status: 400 })
    }

    const response: any = {
      input: name,
      provider,
      matched: !!result.match,
      match: result.match
        ? {
            canonicalId: result.match.canonicalId,
            canonicalCode: result.match.canonicalCode,
            canonicalName: result.match.canonicalName,
            confidence: result.match.confidence,
            matchMethod: result.match.matchMethod,
          }
        : null,
      candidates: result.candidates.map(c => ({
        id: c.id,
        code: c.canonical_code,
        name: c.canonical_name,
        similarity: c.similarity,
      })),
      isAmbiguous: result.isAmbiguous,
    }

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('[internal/canonical] Error:', { error: error.message })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
