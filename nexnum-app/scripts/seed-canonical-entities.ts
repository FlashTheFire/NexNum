/**
 * Phase 0 Backfill — Migrate ServiceLookup/CountryLookup → Canonical tables
 *
 * Reads existing ServiceLookup, CountryLookup, metadata.json, and
 * countries-metadata.json to seed CanonicalService / CanonicalCountry.
 * Then runs matching against all ProviderService/ProviderCountry rows
 * to populate mapping tables.
 *
 * Run once after migration deploy:
 *   npx tsx scripts/seed-canonical-entities.ts
 */

import { prisma } from '@/lib/core/db'
import serviceMetadata from '../src/data/metadata.json'
import countriesMetadata from '../src/data/countries-metadata.json'

// ── Helpers ────────────────────────────────────────────────────────

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function generateCanonicalCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleCase(str: string): string {
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Build alias map from metadata.serviceOverrides
function buildServiceAliases(): Record<string, string[]> {
  const aliases: Record<string, string[]> = {}
  for (const [key, config] of Object.entries((serviceMetadata as any).serviceOverrides || {})) {
    const cfg = config as { slugAliases?: string[]; displayName: string }
    const normalizedKey = normalize(key)
    const allAliases = [normalizedKey, ...(cfg.slugAliases || []).map(normalize)]
    aliases[normalizedKey] = allAliases
  }
  return aliases
}

// ── Seed Services ──────────────────────────────────────────────────

async function seedServices() {
  console.log('[SEED] Seeding CanonicalService...')

  const svcAliases = buildServiceAliases()

  // 1. Existing ServiceLookup rows → canonical with empty aliases initially
  const existingServices = await (prisma as any).serviceLookup.findMany()
  let created = 0

  for (const sl of existingServices) {
    const code = sl.service_code || sl.serviceCode
    if (!code) continue

    const upsertResult = await (prisma as any).canonicalService.upsert({
      where: { canonicalCode: code },
      create: {
        canonicalCode: code,
        canonicalName: sl.service_name || sl.serviceName || code,
        displayName: sl.service_name || sl.serviceName || code,
        aliases: [],
        isVerified: false,
      },
      update: {},
    })

    if (upsertResult.isActive === true && upsertResult.id !== 0) created++
  }

  // 2. Enrich from metadata.json aliases
  for (const [key, aliasList] of Object.entries(svcAliases)) {
    const canonical = await (prisma as any).canonicalService.findFirst({
      where: {
        OR: [
          { canonicalCode: key },
          { canonicalName: { contains: key, mode: 'insensitive' } },
        ],
      },
    })

    if (canonical) {
      const existing = Array.isArray(canonical.aliases) ? canonical.aliases : []
      const merged = [...new Set([...existing, ...aliasList])]
      await (prisma as any).canonicalService.update({
        where: { id: canonical.id },
        data: { aliases: merged },
      })
    }
  }

  console.log(`[SEED] CanonicalService populated (${created} unique codes enriched)`)
}

// ── Seed Countries ─────────────────────────────────────────────────

async function seedCountries() {
  console.log('[SEED] Seeding CanonicalCountry...')

  const existingCountries = await (prisma as any).countryLookup.findMany()
  let created = 0

  for (const cl of existingCountries) {
    const code = cl.country_code || cl.countryCode
    if (!code) continue

    const upsertResult = await (prisma as any).canonicalCountry.upsert({
      where: { canonicalCode: code },
      create: {
        canonicalCode: code.toUpperCase(),
        canonicalName: cl.country_name || cl.countryName || code,
        displayName: { en: cl.country_name || cl.countryName || code },
        aliases: [],
        isVerified: false,
      },
      update: {},
    })

    if (upsertResult.isVerified === false && upsertResult.id !== 0) created++
  }

  // 2. Enrich from countries-metadata.json
  for (const meta of countriesMetadata as any[]) {
    const iso = meta.code?.toUpperCase()
    if (!iso) continue

    const canonical = await (prisma as any).canonicalCountry.findUnique({
      where: { canonicalCode: iso },
    })

    if (canonical) {
      const nameEn = meta.name?.en || iso
      const aliases: string[] = [normalize(iso)]
      if (nameEn) aliases.push(normalize(nameEn))

      // Also add countryNameMap aliases if present
      const nameMap = (serviceMetadata as any).countryNameMap || {}
      for (const [aliasKey, target] of Object.entries(nameMap)) {
        if ((target as string) === nameEn || (target as string) === iso) {
          aliases.push(normalize(aliasKey))
        }
      }

      await (prisma as any).canonicalCountry.update({
        where: { id: canonical.id },
        data: {
          aliases: [...new Set(aliases)],
          displayName: meta.name || canonical.displayName,
          region: meta.region || canonical.region,
          subRegion: meta.subRegion || canonical.subRegion,
          coordinates: meta.latitude != null ? { lat: meta.latitude, lng: meta.longitude } : canonical.coordinates,
        },
      })
    }
  }

  console.log(`[SEED] CanonicalCountry populated (${created} unique codes enriched)`)
}

// ── Seed Mappings ──────────────────────────────────────────────────

async function seedMappings() {
  console.log('[SEED] Seeding ProviderServiceMapping...')

  const providers = await prisma.provider.findMany()
  let mapped = 0

  for (const provider of providers) {
    const services = await (prisma as any).providerService.findMany({
      where: { providerId: provider.id },
    })

    for (const ps of services) {
      const rawName = ps.name || ''
      const normalized = normalize(rawName)
      const canonicalCode = generateCanonicalCode(titleCase(normalized))

      // Try to find existing canonical by alias or name match
      const canonical = await (prisma as any).canonicalService.findFirst({
        where: {
          OR: [
            { canonicalCode },
            { aliases: { has: normalized } },
            { canonicalName: { contains: normalized, mode: 'insensitive' } },
          ],
        },
      })

      if (canonical) {
        await (prisma as any).providerServiceMapping.upsert({
          where: {
            providerId_providerServiceId: {
              providerId: provider.id,
              providerServiceId: ps.id,
            },
          },
          create: {
            providerId: provider.id,
            providerServiceId: ps.id,
            canonicalServiceId: canonical.id,
            confidence: 1.0,
            matchMethod: 'AUTO_ALIAS',
            isVerified: false,
          },
          update: {},
        })
        mapped++
      }
    }
  }

  console.log(`[SEED] ProviderServiceMapping seeded (${mapped} mappings)`)

  console.log('[SEED] Seeding ProviderCountryMapping...')
  let cMapped = 0

  for (const provider of providers) {
    const countries = await (prisma as any).providerCountry.findMany({
      where: { providerId: provider.id },
    })

    for (const pc of countries) {
      const rawName = pc.name || ''
      const normalized = normalize(rawName)
      const iso = pc.code?.toUpperCase() || normalized

      const canonical = await (prisma as any).canonicalCountry.findFirst({
        where: {
          OR: [
            { canonicalCode: iso },
            { aliases: { has: normalized } },
            { canonicalName: { contains: normalized, mode: 'insensitive' } },
          ],
        },
      })

      if (canonical) {
        await (prisma as any).providerCountryMapping.upsert({
          where: {
            providerId_providerCountryId: {
              providerId: provider.id,
              providerCountryId: pc.id,
            },
          },
          create: {
            providerId: provider.id,
            providerCountryId: pc.id,
            canonicalCountryId: canonical.id,
            confidence: 1.0,
            matchMethod: 'AUTO_ALIAS',
            isVerified: false,
          },
          update: {},
        })
        cMapped++
      }
    }
  }

  console.log(`[SEED] ProviderCountryMapping seeded (${cMapped} mappings)`)
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  try {
    await seedServices()
    await seedCountries()
    await seedMappings()
    console.log('[SEED] Done.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error('[SEED] Fatal:', err)
  process.exit(1)
})
