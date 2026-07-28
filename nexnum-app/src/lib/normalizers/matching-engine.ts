/**
 * MatchingEngine — 4-step service/country canonical resolution.
 *
 * Step 1: Exact alias match (JSONB GIN containment) → confidence 1.0
 * Step 2: Exact normalized name match (ILIKE)         → confidence 1.0
 * Step 3: Trigram fuzzy match (pg_trgm)              → 0.5–0.89
 * Step 4: No match → null (caller creates new canonical)
 *
 * Confidence thresholds:
 *   ≥ 0.9  → auto-approve (AUTO_ALIAS / AUTO_EXACT)
 *   0.5–0.89 → AUTO_FUZZY (single winner = auto, ambiguous = queue)
 *   < 0.5  → AUTO_NEW (create new canonical)
 */

// ponytail: We don't instantiate PrismaClient directly; the db proxy handles singleton.
import { prisma as _p } from '@/lib/core/db'
const prisma = _p as any

type EntityType = 'service' | 'country'

interface MatchResult {
  canonicalId: number
  canonicalCode: string
  canonicalName: string
  confidence: number
  matchMethod: 'AUTO_ALIAS' | 'AUTO_EXACT' | 'AUTO_FUZZY' | 'AUTO_NEW'
}

interface FuzzyCandidate {
  id: number
  canonical_code: string
  canonical_name: string
  similarity: number
}

interface MatchOutput {
  match: MatchResult | null
  candidates: FuzzyCandidate[]
  isAmbiguous: boolean
}

const FUZZY_THRESHOLD = 0.3      // minimum trigram similarity to consider
const FUZZY_AUTO_THRESHOLD = 0.5 // minimum to auto-approve a fuzzy match
const AMBIGUITY_RATIO = 1.4      // winner must beat 2nd place by this factor

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export class MatchingEngine {
  constructor(_prisma?: any) {}

  async matchService(rawName: string): Promise<MatchOutput> {
    return this.runPipeline('service', rawName)
  }

  async matchCountry(rawName: string): Promise<MatchOutput> {
    return this.runPipeline('country', rawName)
  }

  private async runPipeline(type: EntityType, rawName: string): Promise<MatchOutput> {
    const norm = normalize(rawName)
    if (!norm) return { match: null, candidates: [], isAmbiguous: false }

    const table = type === 'service' ? 'canonical_services' : 'canonical_countries'

    // Step 1: Alias match (GIN JSONB containment)
    {
      const aliasList = JSON.stringify([norm])
      const hit: any = await prisma.$queryRawUnsafe(
        `SELECT id, canonical_code, canonical_name FROM ${table} WHERE aliases @> $1::jsonb LIMIT 1`,
        aliasList,
      )

      if (hit.length > 0) {
        return {
          match: this.buildResult(hit[0], 1.0, 'AUTO_ALIAS'),
          candidates: [],
          isAmbiguous: false,
        }
      }
    }

    // Step 2: Exact normalized name match (ILIKE)
    {
      const hit: any = await prisma.$queryRawUnsafe(
        `SELECT id, canonical_code, canonical_name FROM ${table} WHERE canonical_name ILIKE $1 LIMIT 1`,
        norm,
      )

      if (hit.length > 0) {
        return {
          match: this.buildResult(hit[0], 1.0, 'AUTO_EXACT'),
          candidates: [],
          isAmbiguous: false,
        }
      }
    }

    // Step 3: Trigram fuzzy match
    {
      // Ensure pg_trgm extension exists (suppress errors if already created)
      try {
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`)
      } catch {}

      const candidates: FuzzyCandidate[] = await prisma.$queryRawUnsafe(
        `SELECT id, canonical_code, canonical_name, similarity(canonical_name::text, $1::text)::double precision AS similarity
         FROM ${table}
         WHERE similarity(canonical_name::text, $1::text) > $2::double precision
         ORDER BY similarity DESC LIMIT 5`,
        norm,
        FUZZY_THRESHOLD,
      )

      if (candidates.length > 0) {
        const best = candidates[0]
        const second = candidates[1]
        const hasClearWinner =
          !second ||
          best.similarity >= FUZZY_AUTO_THRESHOLD &&
          best.similarity > second.similarity * AMBIGUITY_RATIO

        if (hasClearWinner && best.similarity >= FUZZY_AUTO_THRESHOLD) {
          return {
            match: this.buildResult(best, best.similarity, 'AUTO_FUZZY'),
            candidates,
            isAmbiguous: false,
          }
        }

        return { match: null, candidates, isAmbiguous: true }
      }
    }

    return { match: null, candidates: [], isAmbiguous: false }
  }

  private buildResult(
    row: { id: number; canonical_code: string; canonical_name: string },
    confidence: number,
    matchMethod: MatchResult['matchMethod'],
  ): MatchResult {
    return {
      canonicalId: row.id,
      canonicalCode: row.canonical_code,
      canonicalName: row.canonical_name,
      confidence,
      matchMethod,
    }
  }
}

export { normalize, FUZZY_THRESHOLD, FUZZY_AUTO_THRESHOLD, AMBIGUITY_RATIO }
