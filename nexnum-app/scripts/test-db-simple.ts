
import { config } from 'dotenv'
config()

import { prisma } from '../src/lib/core/db'

async function test() {
    console.log('Testing DB connection...')
    const count = await prisma.user.count()
    console.log('User count:', count)
    process.exit(0)
}

test().catch(err => {
    console.error('DB test failed:', err)
    process.exit(1)
})
