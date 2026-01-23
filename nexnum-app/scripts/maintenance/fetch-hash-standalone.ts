
import { prisma } from '../../src/lib/core/db';
import { DynamicProvider } from '../../src/lib/providers/dynamic-provider';
import crypto from 'crypto';
import https from 'https';

async function main() {
    console.log("🔍 Fetching Woohoo Hash...");

    // 1. Get 5sim provider
    const provider = await prisma.provider.findUnique({ where: { name: '5sim' } });
    if (!provider) { console.error("5sim not found"); return; }

    const engine = new DynamicProvider(provider);

    try {
        console.log("Fetching services...");
        const services = await engine.getServices('us'); // specific country to be faster
        const woohoo = services.find(s => s.name.toLowerCase().includes('woohoo') || (s.id && s.id.toLowerCase().includes('woohoo')));

        if (woohoo) {
            console.log("✅ Found Woohoo:", woohoo);
            if (woohoo.iconUrl) {
                console.log("Downloading Icon:", woohoo.iconUrl);

                https.get(woohoo.iconUrl, (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
                        console.log("\n🔥 BAD BEAR HASH FOUND 🔥");
                        console.log(`Hash: ${hash}`);
                        console.log(`Size: ${buffer.length}`);
                        process.exit(0);
                    });
                });
            } else {
                console.log("❌ Woohoo has no iconUrl!");
            }
        } else {
            console.log("❌ Woohoo service not found in 'us' list.");
        }
    } catch (e) {
        console.error(e);
    }
}

main();
