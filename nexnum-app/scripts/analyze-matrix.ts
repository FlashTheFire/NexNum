/**
 * Matrix Data Analysis Script
 * Fetches top countries/services by stock and price from ProviderPricing
 * 
 * Usage: npx tsx scripts/analyze-matrix.ts
 */

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set')
    process.exit(1)
}

const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('\n🔍 MATRIX DATA ANALYSIS\n');
    console.log('='.repeat(60));

    // Get total counts first
    const totalOffers = 0; // await prisma.providerPricing.count({})
    console.log(`\n📊 Total active offers with stock > 0: ${totalOffers.toLocaleString()}\n`);

    // 1. TOP 20 COUNTRIES BY AVERAGE STOCK
    console.log('\n' + '='.repeat(60));
    console.log('📈 TOP 20 COUNTRIES BY AVERAGE STOCK (High Availability)');
    console.log('='.repeat(60));

    const countriesByStock = await prisma.$queryRaw<any[]>`
        SELECT 
            pc.name AS country_name,
            pc.code AS country_code,
            ROUND(AVG(pp.stock), 2) AS avg_stock,
            SUM(pp.stock) AS total_stock,
            COUNT(DISTINCT pp."service_id") AS service_count,
            COUNT(*) AS offer_count
        FROM provider_pricing pp
        JOIN provider_countries pc ON pp."country_id" = pc.id
        WHERE pp.deleted = false AND pp.stock > 0
        GROUP BY pc.id, pc.name, pc.code
        ORDER BY avg_stock DESC
        LIMIT 20
    `;

    console.log('\nRank | Country                    | Avg Stock | Total Stock | Services');
    console.log('-'.repeat(75));
    countriesByStock.forEach((row, i) => {
        console.log(
            `${String(i + 1).padStart(4)} | ${String(row.country_name || 'Unknown').padEnd(26)} | ${String(row.avg_stock).padStart(9)} | ${String(row.total_stock).padStart(11)} | ${row.service_count}`
        );
    });

    // 2. TOP 20 SERVICES BY AVERAGE STOCK
    console.log('\n' + '='.repeat(60));
    console.log('📈 TOP 20 SERVICES BY AVERAGE STOCK (High Availability)');
    console.log('='.repeat(60));

    const servicesByStock = await prisma.$queryRaw<any[]>`
        SELECT 
            ps.name AS service_name,
            ps.code AS service_code,
            ROUND(AVG(pp.stock), 2) AS avg_stock,
            SUM(pp.stock) AS total_stock,
            COUNT(DISTINCT pp."country_id") AS country_count,
            COUNT(*) AS offer_count
        FROM provider_pricing pp
        JOIN provider_services ps ON pp."service_id" = ps.id
        WHERE pp.deleted = false AND pp.stock > 0
        GROUP BY ps.id, ps.name, ps.code
        ORDER BY avg_stock DESC
        LIMIT 20
    `;

    console.log('\nRank | Service                    | Avg Stock | Total Stock | Countries');
    console.log('-'.repeat(75));
    servicesByStock.forEach((row, i) => {
        console.log(
            `${String(i + 1).padStart(4)} | ${String(row.service_name || 'Unknown').padEnd(26)} | ${String(row.avg_stock).padStart(9)} | ${String(row.total_stock).padStart(11)} | ${row.country_count}`
        );
    });

    // 3. TOP 20 COUNTRIES BY AVERAGE PRICE (LOW = Best Deals)
    console.log('\n' + '='.repeat(60));
    console.log('💰 TOP 20 COUNTRIES BY LOWEST AVERAGE PRICE');
    console.log('='.repeat(60));

    const countriesByPrice = await prisma.$queryRaw<any[]>`
        SELECT 
            pc.name AS country_name,
            pc.code AS country_code,
            ROUND(AVG(pp."sellPrice")::numeric, 4) AS avg_price,
            ROUND(MIN(pp."sellPrice")::numeric, 4) AS min_price,
            COUNT(DISTINCT pp."service_id") AS service_count,
            SUM(pp.stock) AS total_stock
        FROM provider_pricing pp
        JOIN provider_countries pc ON pp."country_id" = pc.id
        WHERE pp.deleted = false AND pp.stock > 0
        GROUP BY pc.id, pc.name, pc.code
        ORDER BY avg_price ASC
        LIMIT 20
    `;

    console.log('\nRank | Country                    | Avg Price | Min Price | Services | Stock');
    console.log('-'.repeat(80));
    countriesByPrice.forEach((row, i) => {
        console.log(
            `${String(i + 1).padStart(4)} | ${String(row.country_name || 'Unknown').padEnd(26)} | $${String(row.avg_price).padStart(7)} | $${String(row.min_price).padStart(7)} | ${String(row.service_count).padStart(8)} | ${row.total_stock}`
        );
    });

    // 4. TOP 20 SERVICES BY AVERAGE PRICE (LOW = Best Deals)
    console.log('\n' + '='.repeat(60));
    console.log('💰 TOP 20 SERVICES BY LOWEST AVERAGE PRICE');
    console.log('='.repeat(60));

    const servicesByPrice = await prisma.$queryRaw<any[]>`
        SELECT 
            ps.name AS service_name,
            ps.code AS service_code,
            ROUND(AVG(pp."sellPrice")::numeric, 4) AS avg_price,
            ROUND(MIN(pp."sellPrice")::numeric, 4) AS min_price,
            COUNT(DISTINCT pp."country_id") AS country_count,
            SUM(pp.stock) AS total_stock
        FROM provider_pricing pp
        JOIN provider_services ps ON pp."service_id" = ps.id
        WHERE pp.deleted = false AND pp.stock > 0
        GROUP BY ps.id, ps.name, ps.code
        ORDER BY avg_price ASC
        LIMIT 20
    `;

    console.log('\nRank | Service                    | Avg Price | Min Price | Countries | Stock');
    console.log('-'.repeat(80));
    servicesByPrice.forEach((row, i) => {
        console.log(
            `${String(i + 1).padStart(4)} | ${String(row.service_name || 'Unknown').padEnd(26)} | $${String(row.avg_price).padStart(7)} | $${String(row.min_price).padStart(7)} | ${String(row.country_count).padStart(9)} | ${row.total_stock}`
        );
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 OVERALL SUMMARY');
    console.log('='.repeat(60));

    const summary = await prisma.$queryRaw<any[]>`
        SELECT 
            COUNT(*) AS total_offers,
            COUNT(DISTINCT pp."country_id") AS unique_countries,
            COUNT(DISTINCT pp."service_id") AS unique_services,
            SUM(pp.stock) AS grand_total_stock,
            ROUND(AVG(pp.stock), 2) AS overall_avg_stock,
            ROUND(AVG(pp."sellPrice")::numeric, 4) AS overall_avg_price
        FROM provider_pricing pp
        WHERE pp.deleted = false AND pp.stock > 0
    `;

    if (summary[0]) {
        const s = summary[0];
        console.log(`
Total Offers:      ${Number(s.total_offers).toLocaleString()}
Unique Countries:  ${s.unique_countries}
Unique Services:   ${s.unique_services}
Grand Total Stock: ${Number(s.grand_total_stock).toLocaleString()}
Overall Avg Stock: ${s.overall_avg_stock}
Overall Avg Price: $${s.overall_avg_price}
`);
    }

    console.log('✅ Analysis complete!\n');
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
        await pool.end()
    });
