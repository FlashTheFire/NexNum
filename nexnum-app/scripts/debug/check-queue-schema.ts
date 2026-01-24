
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function checkSchema() {
    try {
        const result = await prisma.$queryRawUnsafe(`
            SELECT schemaname, tablename 
            FROM pg_catalog.pg_tables 
            WHERE schemaname = 'pgboss'
        `)
        console.log('PG-BOSS Tables:', JSON.stringify(result, null, 2))
    } catch (e: any) {
        console.error('Error checking schema:', e.message)
    } finally {
        await prisma.$disconnect()
    }
}

checkSchema()
