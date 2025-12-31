
import { prisma } from '../src/lib/db';

async function check() {
    console.log('Checking SMSBower Service Data...');
    const service = await prisma.service.findFirst({
        where: { provider: 'smsbower' },
        orderBy: { updatedAt: 'desc' }
    });

    if (service) {
        console.log('Found Service:', JSON.stringify(service, null, 2));
    } else {
        console.log('No SMSBower services found.');
    }
}

check()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
