
import 'dotenv/config'
import { prisma } from '@/lib/core/db'

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true, role: true }
    })
    console.log(JSON.stringify(users, null, 2))
}

main()
    .catch(e => console.error(e))
// .finally(async () => await prisma.$disconnect()) // db.ts manages lifetime usually, but here script ends.
