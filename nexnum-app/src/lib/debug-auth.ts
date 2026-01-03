
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function debugAuth() {
    console.log('🔍 DEBUG AUTHENTICATION')
    console.log('----------------------')
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
    console.log(`JWT_SECRET present: ${!!process.env.JWT_SECRET}`)
    console.log(`DATABASE_URL present: ${!!process.env.DATABASE_URL}`)

    try {
        console.log('\nConnecting to database...')
        const count = await prisma.user.count()
        console.log(`✅ User count: ${count}`)

        if (count === 0) {
            console.log('⚠️ No users found! Login will fail.')
        } else {
            const users = await prisma.user.findMany({ select: { email: true, role: true } })
            console.log('Users found:')
            users.forEach(u => console.log(`   - ${u.email} (${u.role})`))
        }

    } catch (e) {
        console.error('❌ Database Access Failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

debugAuth()
