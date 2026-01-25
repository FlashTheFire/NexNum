
import 'dotenv/config'
import { prisma } from '../lib/core/db'

async function main() {
    // Find user 'Harsh'
    const user = await prisma.user.findFirst({
        where: {
            name: { contains: 'Harsh', mode: 'insensitive' }
        }
    })

    if (!user) {
        console.log('User Harsh not found!')
        return
    }

    console.log(`Found user: ${user.name} (${user.email}). Current Role: ${user.role}`)

    const updated = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' }
    })

    console.log(`Updated user ${updated.name} to role: ${updated.role}`)
}

main()
    .catch(e => console.error(e))
