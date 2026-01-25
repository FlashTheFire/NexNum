
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
    try {
        // Dynamic import
        const { searchServices } = await import('../src/lib/search/search');

        console.log("Testing searchServices sort='relevance'...");
        const result = await searchServices('', { limit: 20, sort: 'relevance' });

        console.log(`Found ${result.total} services. Top 20:`);
        console.log('RANK | NAME                 | STOCK  | PRICE  | POP   | SC:STOCK | SC:PRICE | TOTAL');
        console.log('-----|----------------------|--------|--------|-------|----------|----------|------');

        result.services.forEach((s, i) => {
            const stock = s.totalStock || 0;
            const price = s.lowestPrice || 0;
            const popular = s.popular;

            // V2 Algorithm Test
            // Stock: Smoother log scale, no harsh cap at 10k. 
            // Cap at 10 for ~100M stock -> log10(100M)=8 -> 8*1.2 = 9.6
            const stockScore = Math.min(10, Math.log10(stock + 1) * 1.5);

            // Price: Inverse curve. Never hits 0.
            // 0.1 -> 9.1, 1.0 -> 5.0, 60 -> 0.16
            const priceScore = 15 / (1 + price);

            const popBonus = popular ? 3 : 0;

            // Weight: Equal balance? Or Price favored?
            // Let's try 50/50
            const total = (stockScore * 0.5) + (priceScore * 0.5) + popBonus;

            console.log(
                `#${(i + 1).toString().padEnd(3)} | ` +
                `${s.name.slice(0, 20).padEnd(20)} | ` +
                `${stock.toString().padEnd(6)} | ` +
                `$${price.toFixed(2).padEnd(5)} | ` +
                `${popular ? 'YES' : 'NO '} | ` +
                `${stockScore.toFixed(2).padEnd(8)} | ` +
                `${priceScore.toFixed(2).padEnd(8)} | ` +
                `${total.toFixed(2)}`
            );
        });
    } catch (e) {
        console.error(e);
    }
}

run();
