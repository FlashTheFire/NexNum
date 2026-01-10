
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function promoteUser() {
    console.log('👑 PROMOTING USER TO ADMIN')
    console.log('-------------------------')

    try {
        const email = 'harshtakur001@gmail.com'
        const user = await prisma.user.findUnique({ where: { email } })

        if (!user) {
            console.log('❌ User not found!')
            return
        }

        if (user.role === 'ADMIN') {
            console.log('✅ User is already ADMIN.')
            return
        }

        await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' }
        })

        console.log(`✅ Successfully promoted ${email} to ADMIN`)

    } catch (e) {
        console.error('❌ Promotion Failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

promoteUser()
