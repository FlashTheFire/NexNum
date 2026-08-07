import 'dotenv/config'
import { prisma } from '../src/lib/core/db'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Automatically applies master PostgreSQL schema (app_schema.sql)
 * Creates any missing tables, columns, types, or indexes idempotently on container startup.
 */
export async function applyAppSchema() {
    console.log('[SCHEMA] Checking & applying master SQL schema (app_schema.sql)...')
    const schemaPath = path.join(process.cwd(), 'prisma', 'app_schema.sql')
    
    if (!fs.existsSync(schemaPath)) {
        console.warn('[SCHEMA] app_schema.sql not found at:', schemaPath)
        return
    }

    try {
        const sql = fs.readFileSync(schemaPath, 'utf-8')
        await prisma.$executeRawUnsafe(sql)
        console.log('[SCHEMA] ✅ Master database schema synchronized successfully.')
    } catch (error: any) {
        console.error('[SCHEMA] ⚠️ Schema sync notice:', error.message)
    }
}

if (require.main === module) {
    applyAppSchema()
        .then(() => process.exit(0))
        .catch(() => process.exit(1))
}
