import { prisma } from '../src/lib/db';
import { resolveToCanonicalName, getSlugFromName } from '../src/lib/service-identity';

async function main() {
    console.log("--- Identity Resolution Test ---");
    const testService = "telegram";
    const testCountry = "india";

    console.log(`Input: service=${testService}, country=${testCountry}`);
    console.log(`Resolved: service=${resolveToCanonicalName(testService)}, country=${resolveToCanonicalName(testCountry)}`);
    console.log(`Slugs: service=${getSlugFromName(testService)}, country=${getSlugFromName(testCountry)}`);

    console.log("\n--- Database Check ---");
    const countries = await prisma.providerCountry.findMany({
        where: { name: { contains: 'India', mode: 'insensitive' } }
    });
    console.log("Countries found with 'india' code:", countries.map(c => ({ id: c.id, code: c.code, name: c.name })));

    const services = await prisma.providerService.findMany({
        where: { code: { contains: 'telegram', mode: 'insensitive' } }
    });
    console.log("Services found with 'telegram' code:", services.map(s => ({ id: s.id, code: s.code, name: s.name })));

    const pricingCount = await prisma.providerPricing.count({
        where: { deleted: false, stock: { gt: 0 } }
    });
    console.log(`Total active pricing records: ${pricingCount}`);

    const samplePricing = await prisma.providerPricing.findMany({
        where: { deleted: false, stock: { gt: 0 } },
        include: { country: true, service: true, provider: true },
        take: 5
    });
    console.log("\n--- Sample Pricing Records ---");
    samplePricing.forEach(p => {
        console.log(`Provider: ${p.provider.name}, Country: ${p.country.name} (${p.country.code}), Service: ${p.service.name} (${p.service.code}), Stock: ${p.stock}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
