/**
 * CentralRegistry — canonical service/country resolution.
 *
 * Phase 1 dual-write: writes to both legacy (ServiceLookup/CountryLookup)
 * and new canonical tables. Reads prefer canonical tables.
 *
 * Uses MatchingEngine for 4-step resolution:
 *   1. Alias match → AUTO_ALIAS, conf ≥ 0.9
 *   2. Exact name → AUTO_EXACT, conf = 1.0
 *   3. Trigram fuzzy → AUTO_FUZZY, conf 0.5–0.89 (may queue for review)
 *   4. No match → returns null (caller decides; typically AUTO_NEW)
 *
 * Backward-compatible return shape: { id: number; name: string; code: string }
 */

import { prisma } from '@/lib/core/db'
import { MatchingEngine } from './matching-engine'
import { logger } from '@/lib/core/logger'

// Thresholds for auto-approve vs review queue
const AUTO_APPROVE_CONFIDENCE = 0.9

export class CentralRegistry {
  private static engine: MatchingEngine | null = null

  private static getEngine(): MatchingEngine {
    if (!this.engine) {
      this.engine = new MatchingEngine()
    }
    return this.engine
  }

  // ── Services ────────────────────────────────────────────────────

  static async resolveServiceId(
    providerName: string,
    externalId: string,
    rawName: string,
  ): Promise<{ id: number; name: string; code: string }> {
    const engine = this.getEngine()
    const { match, candidates, isAmbiguous } = await engine.matchService(rawName)

    // ── High confidence match found ────────────────────────────────
    if (match && match.confidence >= AUTO_APPROVE_CONFIDENCE) {
      await this.upsertServiceMapping(providerName, externalId, rawName, match)
      // Also write to legacy lookup (Phase 1 dual-write)
      await this.upsertLegacyService(match.canonicalCode, match.canonicalName)
      return { id: match.canonicalId, name: match.canonicalName, code: match.canonicalCode }
    }

    // ── Ambiguous fuzzy — queue for review ────────────────────────
    if (isAmbiguous && candidates.length > 0) {
      await this.queueServiceReview(providerName, externalId, rawName, candidates)
      // Still return the best guess to unblock the sync
      const best = candidates[0]
      await this.upsertServiceMapping(
        providerName, externalId, rawName,
        { canonicalId: best.id, canonicalCode: best.canonical_code, canonicalName: best.canonical_name, confidence: best.similarity },
        'AUTO_FUZZY',
      )
      return { id: best.id, name: best.canonical_name, code: best.canonical_code }
    }

    // ── No match — fall back to legacy lookup for continuity ──────
    const legacyCode = this.fallbackCanonicalCode(rawName)
    const legacyResult = await this.resolveLegacyService(legacyCode, rawName)

    // If the legacy lookup created a new row, optionally seed it as canonical
    await this.seedNewServiceIfNeeded(legacyResult)

    return legacyResult
  }

  // ── Countries ───────────────────────────────────────────────────

  static async resolveCountryId(
    providerName: string,
    externalId: string,
    rawName: string,
  ): Promise<{ id: number; name: string; code: string }> {
    const engine = this.getEngine()
    const { match, candidates, isAmbiguous } = await engine.matchCountry(rawName)

    if (match && match.confidence >= AUTO_APPROVE_CONFIDENCE) {
      await this.upsertCountryMapping(providerName, externalId, rawName, match)
      await this.upsertLegacyCountry(match.canonicalCode, match.canonicalName)
      return { id: match.canonicalId, name: match.canonicalName, code: match.canonicalCode }
    }

    if (isAmbiguous && candidates.length > 0) {
      await this.queueCountryReview(providerName, externalId, rawName, candidates)
      const best = candidates[0]
      await this.upsertCountryMapping(
        providerName, externalId, rawName,
        { canonicalId: best.id, canonicalCode: best.canonical_code, canonicalName: best.canonical_name, confidence: best.similarity },
        'AUTO_FUZZY',
      )
      return { id: best.id, name: best.canonical_name, code: best.canonical_code }
    }

    // Try ISO code-based resolution first (most countries have ISO codes)
    const isoCode = this.tryResolveIso(rawName)
    if (isoCode) {
      const legacyResult = await this.resolveLegacyCountry(isoCode, rawName)
      await this.seedNewCountryIfNeeded(legacyResult)
      return legacyResult
    }

    const legacyCode = this.fallbackCanonicalCode(rawName)
    const legacyResult = await this.resolveLegacyCountry(legacyCode, rawName)
    await this.seedNewCountryIfNeeded(legacyResult)
    return legacyResult
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private static async upsertServiceMapping(
    providerName: string,
    externalId: string,
    rawName: string,
    match: { canonicalId: number; canonicalCode: string; canonicalName: string; confidence: number },
    method: 'AUTO_ALIAS' | 'AUTO_EXACT' | 'AUTO_FUZZY' = 'AUTO_ALIAS',
  ): Promise<void> {
    // Find or create provider
    const provider = await prisma.provider.upsert({
      where: { name: providerName },
      create: {
        name: providerName,
        displayName: providerName,
        apiBaseUrl: '',
        endpoints: {},
        mappings: {},
        isActive: true,
      },
      update: {},
    })

    // Ensure parent ProviderService record exists
    const providerService = await (prisma as any).providerService.upsert({
      where: {
        providerId_externalId: {
          providerId: provider.id,
          externalId,
        },
      },
      create: {
        providerId: provider.id,
        externalId,
        code: match.canonicalCode || externalId,
        name: rawName,
        isActive: true,
      },
      update: {
        name: rawName,
        lastSyncAt: new Date(),
      },
    })

    const confidence = method === 'AUTO_FUZZY' ? match.confidence : 1.0

    await (prisma as any).providerServiceMapping.upsert({
      where: {
        providerId_providerServiceId: {
          providerId: provider.id,
          providerServiceId: providerService.id,
        },
      },
      create: {
        providerId: provider.id,
        providerServiceId: providerService.id,
        canonicalServiceId: match.canonicalId,
        confidence,
        matchMethod: method,
        isVerified: confidence >= AUTO_APPROVE_CONFIDENCE,
      },
      update: {
        canonicalServiceId: match.canonicalId,
        confidence,
        matchMethod: method,
      },
    })

    // Increment provider count on canonical (idempotent: only on new mapping)
    await (prisma as any).canonicalService.update({
      where: { id: match.canonicalId },
      data: { providerCount: { increment: 1 } },
    })
  }

  private static async upsertCountryMapping(
    providerName: string,
    externalId: string,
    rawName: string,
    match: { canonicalId: number; canonicalCode: string; canonicalName: string; confidence: number },
    method: 'AUTO_ALIAS' | 'AUTO_EXACT' | 'AUTO_FUZZY' = 'AUTO_ALIAS',
  ): Promise<void> {
    const provider = await prisma.provider.upsert({
      where: { name: providerName },
      create: {
        name: providerName,
        displayName: providerName,
        apiBaseUrl: '',
        endpoints: {},
        mappings: {},
        isActive: true,
      },
      update: {},
    })

    // Ensure parent ProviderCountry record exists
    const providerCountry = await (prisma as any).providerCountry.upsert({
      where: {
        providerId_externalId: {
          providerId: provider.id,
          externalId,
        },
      },
      create: {
        providerId: provider.id,
        externalId,
        code: match.canonicalCode || externalId,
        name: rawName,
        isActive: true,
      },
      update: {
        name: rawName,
        lastSyncAt: new Date(),
      },
    })

    const confidence = method === 'AUTO_FUZZY' ? match.confidence : 1.0

    await (prisma as any).providerCountryMapping.upsert({
      where: {
        providerId_providerCountryId: {
          providerId: provider.id,
          providerCountryId: providerCountry.id,
        },
      },
      create: {
        providerId: provider.id,
        providerCountryId: providerCountry.id,
        canonicalCountryId: match.canonicalId,
        confidence,
        matchMethod: method,
        isVerified: confidence >= AUTO_APPROVE_CONFIDENCE,
      },
      update: {
        canonicalCountryId: match.canonicalId,
        confidence,
        matchMethod: method,
      },
    })

    await (prisma as any).canonicalCountry.update({
      where: { id: match.canonicalId },
      data: { providerCount: { increment: 1 } },
    })
  }

  private static async upsertLegacyService(code: string, name: string): Promise<void> {
    try {
      await (prisma as any).serviceLookup.upsert({
        where: { serviceCode: code },
        create: { serviceCode: code, serviceName: name },
        update: {},
      })
    } catch {
      // P2002 = already exists, that's fine in dual-write
    }
  }

  private static async upsertLegacyCountry(code: string, name: string): Promise<void> {
    try {
      await (prisma as any).countryLookup.upsert({
        where: { countryCode: code },
        create: { countryCode: code, countryName: name },
        update: {},
      })
    } catch {
      // already exists
    }
  }

  private static async resolveLegacyService(
    code: string,
    rawName: string,
  ): Promise<{ id: number; name: string; code: string }> {
    let lookup = await (prisma as any).serviceLookup.findUnique({
      where: { serviceCode: code },
    })

    if (!lookup) {
      try {
        lookup = await (prisma as any).serviceLookup.create({
          data: { serviceCode: code, serviceName: rawName },
        })
      } catch (error: any) {
        if (error.code === 'P2002') {
          lookup = await (prisma as any).serviceLookup.findUnique({
            where: { serviceCode: code },
          })
        } else {
          throw error
        }
      }
    }

    if (!lookup) throw new Error(`[REGISTRY] Failed to resolve Service: ${rawName}`)
    return { id: lookup.serviceId, name: lookup.serviceName, code: lookup.serviceCode }
  }

  private static async resolveLegacyCountry(
    code: string,
    rawName: string,
  ): Promise<{ id: number; name: string; code: string }> {
    let lookup = await (prisma as any).countryLookup.findUnique({
      where: { countryCode: code },
    })

    if (!lookup) {
      try {
        lookup = await (prisma as any).countryLookup.create({
          data: { countryCode: code, countryName: rawName },
        })
      } catch (error: any) {
        if (error.code === 'P2002') {
          lookup = await (prisma as any).countryLookup.findUnique({
            where: { countryCode: code },
          })
        } else {
          throw error
        }
      }
    }

    if (!lookup) throw new Error(`[REGISTRY] Failed to resolve Country: ${rawName}`)
    return { id: lookup.countryId, name: lookup.countryName, code: lookup.countryCode }
  }

  private static async queueServiceReview(
    providerName: string,
    externalId: string,
    rawName: string,
    candidates: Array<{ id: number; canonical_code: string; canonical_name: string; similarity: number }>,
  ): Promise<void> {
    const provider = await prisma.provider.upsert({
      where: { name: providerName },
      create: {
        name: providerName,
        displayName: providerName,
        apiBaseUrl: '',
        endpoints: {},
        mappings: {},
        isActive: true,
      },
      update: {},
    })

    await (prisma as any).mappingReviewQueue.create({
      data: {
        entityType: 'SERVICE',
        providerId: provider.id,
        rawExternalId: externalId,
        rawName,
        candidateMatches: candidates.map(c => ({
          id: c.id,
          code: c.canonical_code,
          name: c.canonical_name,
          similarity: c.similarity,
        })),
        bestMatchId: candidates[0]?.id,
        bestMatchConfidence: candidates[0]?.similarity ?? 0,
        status: 'PENDING',
        priority: 0,
      },
    })

    logger.warn('[REGISTRY] Service queued for review', {
      provider: providerName,
      rawName,
      candidates: candidates.length,
    })
  }

  private static async queueCountryReview(
    providerName: string,
    externalId: string,
    rawName: string,
    candidates: Array<{ id: number; canonical_code: string; canonical_name: string; similarity: number }>,
  ): Promise<void> {
    const provider = await prisma.provider.upsert({
      where: { name: providerName },
      create: {
        name: providerName,
        displayName: providerName,
        apiBaseUrl: '',
        endpoints: {},
        mappings: {},
        isActive: true,
      },
      update: {},
    })

    await (prisma as any).mappingReviewQueue.create({
      data: {
        entityType: 'COUNTRY',
        providerId: provider.id,
        rawExternalId: externalId,
        rawName,
        candidateMatches: candidates.map(c => ({
          id: c.id,
          code: c.canonical_code,
          name: c.canonical_name,
          similarity: c.similarity,
        })),
        bestMatchId: candidates[0]?.id,
        bestMatchConfidence: candidates[0]?.similarity ?? 0,
        status: 'PENDING',
        priority: 0,
      },
    })

    logger.warn('[REGISTRY] Country queued for review', {
      provider: providerName,
      rawName,
      candidates: candidates.length,
    })
  }

  private static async seedNewServiceIfNeeded(result: { id: number; name: string; code: string }): Promise<void> {
    // If on the legacy path, the canonical table may not have a row yet.
    // Upsert a minimal canonical entry so future matches can alias against it.
    await (prisma as any).canonicalService.upsert({
      where: { canonicalCode: result.code },
      create: {
        canonicalCode: result.code,
        canonicalName: result.name,
        displayName: result.name,
        aliases: [],
        isVerified: false,
      },
      update: {},
    })
  }

  private static async seedNewCountryIfNeeded(result: { id: number; name: string; code: string }): Promise<void> {
    const code = (result.code || '').trim().toUpperCase()
    if (!code) return

    await (prisma as any).canonicalCountry.upsert({
      where: { canonicalCode: code },
      create: {
        canonicalCode: code,
        canonicalName: result.name,
        displayName: { en: result.name },
        aliases: [],
        isVerified: false,
      },
      update: {},
    })
  }

  private static tryResolveIso(rawName: string): string | null {
    const match = rawName.trim().match(/^[A-Za-z]{2}$/)
    return match ? match[0].toUpperCase() : null
  }

  private static fallbackCanonicalCode(rawName: string): string {
    // Kebab-case fallback when no explicit code exists
    return rawName
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
}
