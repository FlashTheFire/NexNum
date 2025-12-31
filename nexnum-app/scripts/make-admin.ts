import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function makeAdmin(email: string) {
    if (!email) {
        console.error('Please provide an email address')
        process.exit(1)
    }

    try {
        const user = await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' },
        })
        console.log(`Successfully made ${user.email} an admin`)
    } catch (e) {
        console.error('Error updating user:', e)
    } finally {
        await prisma.$disconnect()
    }
}

const email = process.argv[2]
makeAdmin(email)
