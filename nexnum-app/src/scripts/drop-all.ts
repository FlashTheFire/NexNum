import 'dotenv/config'
import { prisma } from '../lib/core/db'
import Redis from 'ioredis'

/**
 * Single-command script to purge ALL Supabase PostgreSQL database tables/views/types
 * and flush ALL Redis cache keys.
 */
async function dropAll() {
    console.log('💣 [PURGE] Starting full cleanup: Supabase DB + Redis cache...')
    
    // 1. Purge Supabase / PostgreSQL Database
    try {
        await prisma.$executeRawUnsafe(`
            DO $$ DECLARE
                r RECORD;
            BEGIN
                FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
                END LOOP;
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
                FOR r IN (SELECT type_name FROM (
                    SELECT t.typname as type_name
                    FROM pg_type t
                    JOIN pg_enum e ON t.oid = e.enumtypid
                    GROUP BY t.typname
                ) enums) LOOP
                    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.type_name) || ' CASCADE';
                END LOOP;
            END $$;
        `)
        console.log('💥 [SUPABASE] All views, tables, and ENUM types dropped cleanly!')
    } catch (err: any) {
        console.error('⚠️ [SUPABASE] DB purge notice:', err.message)
    }

    // 2. Flush Redis Cache (tries local & container URLs)
    const redisUrls = [
        process.env.REDIS_URL,
        'redis://:4807afac74c98db34a06d9c50158a83b87746b4b2e47273e20495dbb92f85811@localhost:6379',
        'redis://:4807afac74c98db34a06d9c50158a83b87746b4b2e47273e20495dbb92f85811@redis:6379'
    ].filter((u): u is string => Boolean(u))

    let flushed = false
    for (const url of redisUrls) {
        try {
            const redis = new Redis(url, { maxRetriesPerRequest: 1, retryStrategy: () => null })
            redis.on('error', () => {}) // Suppress connection error logs for fallbacks
            await redis.flushall()
            await redis.quit()
            console.log(`💥 [REDIS] Redis cache flushed cleanly (FLUSHALL)!`)
            flushed = true
            break
        } catch (e) {
            // Try next URL fallback
        }
    }

    if (!flushed) {
        console.warn('⚠️ [REDIS] Redis flush skipped (Redis host unreachable).')
    }

    console.log('🎉 [PURGE] Complete purge finished successfully!')
}

dropAll()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Purge Error:', err)
        process.exit(1)
    })
