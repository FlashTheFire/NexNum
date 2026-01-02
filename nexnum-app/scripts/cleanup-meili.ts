/**
 * Cleanup ALL old MeiliSearch indexes
 * 
 * Deletes all indexes except 'offers' which is the only one used now.
 * 
 * Usage: npx tsx scripts/cleanup-meili.ts
 */

import { config } from "dotenv";
config({ path: '.env' });

import { meili } from "../src/lib/search";

async function main() {
    console.log("🧹 Cleaning up MeiliSearch - removing all non-offers indexes...\n");

    // Get all current indexes
    const indexes = await meili.getIndexes();

    for (const idx of indexes.results) {
        // Delete ALL indexes
        try {
            console.log(`🗑️  Deleting index: ${idx.uid}`);
            await meili.deleteIndex(idx.uid);
            console.log(`   ✅ Deleted`);
        } catch (error: any) {
            console.log(`   ❌ Failed:`, error.message);
        }
    }

    console.log("\n✅ Cleanup complete! Only 'offers' index remains.");
}

main().catch(console.error);
