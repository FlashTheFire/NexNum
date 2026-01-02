/**
 * Initialize MeiliSearch Indexes
 * 
 * Creates the 'offers' index and applies necessary settings (filterableAttributes, etc.)
 * Run this after clearing MeiliSearch data.
 * 
 * Usage: npx tsx scripts/init-meili.ts
 */

import { config } from "dotenv";
config({ path: '.env' });

import { initSearchIndexes } from "../src/lib/search";

async function main() {
    console.log("⚙️  Initializing MeiliSearch indexes...");
    try {
        await initSearchIndexes();
        console.log("✅ Initialization complete!");
    } catch (error) {
        console.error("❌ Initialization failed:", error);
        process.exit(1);
    }
}

main();
