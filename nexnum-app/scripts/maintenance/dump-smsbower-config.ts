import { prisma } from '../../src/lib/core/db'

async function main() {
    const smsbower = await prisma.provider.findFirst({
        where: { name: 'smsbower' },
        select: {
            name: true,
            useDynamicMetadata: true,
            dynamicFunctions: true,
            mappings: true,
            endpoints: true
        }
    })

    console.log(JSON.stringify(smsbower, null, 2))
}

main().finally(() => prisma.$disconnect())
