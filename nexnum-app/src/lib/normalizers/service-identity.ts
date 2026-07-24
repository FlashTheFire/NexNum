/**
 * Service Identity Library
 *
 * Central source of truth for service names, slugs, and aliases.
 *
 * Phase 2 dual-read: the in-memory maps (built from metadata.json) remain
 * as a fast first-pass cache. The new canonical tables are consulted when
 * the map has no entry — this lets us discover services that weren't in
 * metadata.json without breaking existing lookups.
 *
 * When Phase 3 cutover happens, the in-memory maps can be removed entirely
 * and all resolution goes through the AliasRegistry class below.
 */

import metadata from '@/data/metadata.json'

// ── Legacy in-memory maps (dual-read, used until Phase 3 cleanup) ─

export const SERVICE_OVERRIDES = metadata.serviceOverrides as Record<string, {
    displayName: string;
    slugAliases?: string[];
    iconUrl?: string;
}>

export const POPULAR_SERVICES = metadata.popularServices
export const COUNTRY_NAME_MAP = metadata.countryNameMap

// Compatibility Maps
export const CANONICAL_SERVICE_NAME_MAP: Record<string, string> = {}
export const CANONICAL_SERVICE_NAMES: Record<string, string> = {}
export const CANONICAL_DISPLAY_NAMES: Record<string, string> = {}
export const CANONICAL_SERVICE_ICONS: Record<string, string> = {}
const DISPLAY_NAME_TO_KEY: Record<string, string> = {}
export const NUMERIC_ID_TO_SERVICE: Record<number, string> = {}
export const NUMERIC_ID_TO_COUNTRY: Record<number, string> = {}

for (const [key, config] of Object.entries(SERVICE_OVERRIDES)) {
    CANONICAL_SERVICE_NAME_MAP[key.toLowerCase()] = config.displayName
    CANONICAL_DISPLAY_NAMES[key] = config.displayName
    DISPLAY_NAME_TO_KEY[config.displayName.toLowerCase()] = key
    if (config.slugAliases) {
        for (const alias of config.slugAliases) {
            CANONICAL_SERVICE_NAMES[alias] = key
        }
    }
    if (config.iconUrl) {
        CANONICAL_SERVICE_ICONS[key] = config.iconUrl
    }
}

// ── Exports from country-normalizer ────────────────────────────────

export { normalizeCountryName } from './country-normalizer'

// ── Normalization utilities ───────────────────────────────────────

export function normalizeServiceName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()
}

// ── AliasRegistry — DB-backed alias lookup ─────────────────────────

interface CanonicalServiceRow {
    id: number
    canonicalCode: string
    canonicalName: string
    displayName: string
    aliases: string[]
}

export class AliasRegistry {
    private prisma: any

    constructor(prismaClient: any) {
        this.prisma = prismaClient
    }

    /**
     * Check if an alias exists and return the canonical row.
     * Uses GIN JSON containment query (@>) for O(log n) alias lookup.
     */
    async resolveAlias(alias: string): Promise<CanonicalServiceRow | null> {
        const normalized = normalizeServiceName(alias)
        if (!normalized) return null

        const rows = await this.prisma.$queryRaw<CanonicalServiceRow[]>`
            SELECT id, canonical_code AS "canonicalCode", canonical_name AS "canonicalName",
                   COALESCE(display_name, canonical_name) AS "displayName", aliases
            FROM canonical_services
            WHERE aliases @> ${JSON.stringify([normalized])}::jsonb
            LIMIT 1
        `

        return rows.length > 0 ? rows[0] : null
    }

    /**
     * Exact ILIKE match on canonical name.
     */
    async resolveExactName(input: string): Promise<CanonicalServiceRow | null> {
        const normalized = normalizeServiceName(input)
        if (!normalized) return null

        const rows = await this.prisma.$queryRaw<CanonicalServiceRow[]>`
            SELECT id, canonical_code AS "canonicalCode", canonical_name AS "canonicalName",
                   COALESCE(display_name, canonical_name) AS "displayName", aliases
            FROM canonical_services
            WHERE canonical_name ILIKE ${normalized}
            LIMIT 1
        `

        return rows.length > 0 ? rows[0] : null
    }

    /**
     * Create or get a new canonical service entry.
     */
    async upsert(code: string, name: string, aliases?: string[]): Promise<CanonicalServiceRow> {
        const result = await this.prisma.$queryRaw<[CanonicalServiceRow]>`
            INSERT INTO canonical_services (canonical_code, canonical_name, display_name, aliases)
            VALUES (${code}, ${name}, ${name}, ${JSON.stringify(aliases || [])}::jsonb)
            ON CONFLICT (canonical_code) DO UPDATE SET
                canonical_name = EXCLUDED.canonical_name,
                display_name = COALESCE(EXCLUDED.display_name, canonical_services.display_name),
                aliases = CASE
                    WHEN EXCLUDED.aliases IS NOT NULL
                    THEN canonical_services.aliases || EXCLUDED.aliases
                    ELSE canonical_services.aliases
                END
            RETURNING id, canonical_code AS "canonicalCode", canonical_name AS "canonicalName",
                      COALESCE(display_name, canonical_name) AS "displayName", aliases
        `

        return result[0]
    }

    /**
     * Add aliases to an existing canonical service.
     */
    async addAliases(canonicalCode: string, newAliases: string[]): Promise<void> {
        if (newAliases.length === 0) return

        await this.prisma.$executeRaw`
            UPDATE canonical_services
            SET aliases = aliases || ${JSON.stringify(newAliases)}::jsonb
            WHERE canonical_code = ${canonicalCode}
        `
    }

    /**
     * Get a canonical service by its code (for ID resolution).
     */
    async getByCode(code: string): Promise<CanonicalServiceRow | null> {
        const rows = await this.prisma.$queryRaw<CanonicalServiceRow[]>`
            SELECT id, canonical_code AS "canonicalCode", canonical_name AS "canonicalName",
                   COALESCE(display_name, canonical_name) AS "displayName", aliases
            FROM canonical_services
            WHERE canonical_code = ${code}
            LIMIT 1
        `

        return rows.length > 0 ? rows[0] : null
    }
}

// ── Backward-compatible public API ─────────────────────────────────

/**
 * Standardize a service name.
 * Kept as export for existing callers.
 */
export function normalizeServiceNameLegacy(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()
}

/**
 * Resolve any input string to its canonical display name.
 * Dual-read: checks in-memory maps first, falls back to AliasRegistry.
 */
export function getCanonicalName(input: string): string {
    if (!input) return ''

    // 0. Preliminary cleaning for slugs/codes
    const cleanInput = input
        .toLowerCase()
        .replace(/[_-]/g, ' ')
        .replace(/\(.*\)/g, '')
        .trim();

    // 1. Check SERVICE MAPS (in-memory, O(1))
    const normalizedInput = normalizeServiceName(cleanInput)

    if (CANONICAL_SERVICE_NAMES[normalizedInput]) {
        const key = CANONICAL_SERVICE_NAMES[normalizedInput]
        return CANONICAL_DISPLAY_NAMES[key] || CANONICAL_SERVICE_NAME_MAP[key.toLowerCase()] || key
    }

    if (CANONICAL_SERVICE_NAME_MAP[normalizedInput]) {
        return CANONICAL_SERVICE_NAME_MAP[normalizedInput]
    }

    // 2. Check COUNTRY MAP
    if (COUNTRY_NAME_MAP[cleanInput as keyof typeof COUNTRY_NAME_MAP]) {
        return COUNTRY_NAME_MAP[cleanInput as keyof typeof COUNTRY_NAME_MAP]
    }

    // 3. Fallback: Title Case
    return cleanInput
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

/**
 * Resolve a numeric ID to a canonical name.
 * Now reads from canonical tables first, falls back to legacy lookup.
 */
export async function resolveNumericIdToName(type: 'service' | 'country', id: number | string): Promise<string | null> {
    const numId = typeof id === 'string' ? parseInt(id) : id
    if (isNaN(numId)) return null

    const { prisma } = await import('@/lib/core/db')

    if (type === 'service') {
        // Try canonical table first
        const rows = await prisma.$queryRaw<{ canonical_name: string }[]>`
            SELECT canonical_name FROM canonical_services WHERE id = ${numId} LIMIT 1
        `
        if (rows.length > 0) return rows[0].canonical_name

        // Fall back to legacy
        const lookup = await (prisma.serviceLookup as any).findUnique({
            where: { serviceId: numId }
        })
        return lookup?.serviceName || null
    } else {
        // Try canonical table first
        const rows = await prisma.$queryRaw<{ canonical_name: string }[]>`
            SELECT canonical_name FROM canonical_countries WHERE id = ${numId} LIMIT 1
        `
        if (rows.length > 0) return rows[0].canonical_name

        // Fall back to legacy
        const lookup = await (prisma.countryLookup as any).findUnique({
            where: { countryId: numId }
        })
        return lookup?.countryName || null
    }
}

/**
 * Resolve input to the internal canonical key (e.g. "google", "telegram")
 * This is the best identifier for icons and internal logic.
 */
export function getCanonicalKey(input: string): string | undefined {
    if (!input) return undefined
    const normalizedInput = normalizeServiceName(input)

    // 1. Direct hit on key
    if (SERVICE_OVERRIDES[normalizedInput as keyof typeof SERVICE_OVERRIDES]) {
        return normalizedInput
    }

    // 2. Hit on alias
    if (CANONICAL_SERVICE_NAMES[normalizedInput]) {
        return CANONICAL_SERVICE_NAMES[normalizedInput]
    }

    // 3. Hit on display name (O(1) Lookup)
    if (DISPLAY_NAME_TO_KEY[input.toLowerCase()]) {
        return DISPLAY_NAME_TO_KEY[input.toLowerCase()]
    }

    return undefined
}

/**
 * Convert any string to a URL-safe kebab-case slug.
 * Used for: URLs, Database Keys (ServiceLookup.code)
 */
export function generateCanonicalCode(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}
