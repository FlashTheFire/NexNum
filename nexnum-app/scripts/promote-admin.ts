import { prisma } from '../src/lib/core/db'

async function main() {
    const email = process.argv[2]
    if (!email) {
        console.error('❌ Error: Email address is required.')
        console.log('Usage: npx tsx scripts/promote-admin.ts <email>')
        process.exit(1)
    }

    console.log(`👤 Identifying user: ${email}...`)

    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        })

        if (!user) {
            console.error(`❌ User with email ${email} not found.`)
            process.exit(1)
        }

        console.log(`🔼 Promoting User [${user.id}] to ADMIN...`)

        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                role: 'ADMIN',
                tokenVersion: { increment: 1 } // Invalidate existing sessions
            }
        })

        console.log(`✅ SUCCESS: ${updatedUser.email} is now an ADMIN.`)
        console.log('🔄 IMPORTANT: The user must logout and log back in to generate a new token with ADMIN privileges.')
    } catch (error) {
        console.error('❌ Database error:', error)
        process.exit(1)
    }
}

main()
