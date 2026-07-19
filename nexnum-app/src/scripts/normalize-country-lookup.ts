/**
 * One-time cleanup script: Normalize countryLookup names to canonical form.
 *
 * Problem: Old sync runs stored mixed-case country names (e.g., "India" and "india"
 * as separate rows or with inconsistent casing). The unified normalizeCountryName()
 * now handles this at read time, but the stored data should be canonical too.
 *
 * Usage:
 *   npx tsx src/scripts/normalize-country-lookup.ts
 *
 * Safe to run multiple times — idempotent.
 */
import { prisma } from '../lib/core/db'
import { normalizeCountryName } from '../lib/normalizers/country-normalizer'

async function main() {
    console.log('[Cleanup] Fetching all countryLookup rows...')

    const rows = await prisma.countryLookup.findMany({
        select: { countryId: true, countryCode: true, countryName: true }
    })

    console.log(`[Cleanup] Found ${rows.length} rows`)

    let updated = 0
    let skipped = 0

    for (const row of rows) {
        const canonical = normalizeCountryName(row.countryName)

        if (canonical === row.countryName) {
            skipped++
            continue
        }

        console.log(`[Cleanup] Updating: "${row.countryName}" → "${canonical}" (${row.countryCode})`)

        await prisma.countryLookup.update({
            where: { countryId: row.countryId },
            data: { countryName: canonical }
        })
        updated++
    }

    console.log(`\n[Cleanup] Done. Updated: ${updated}, Skipped (already canonical): ${skipped}`)
    await prisma.$disconnect()
}

main().catch((err) => {
    console.error('[Cleanup] Failed:', err)
    process.exit(1)
})
