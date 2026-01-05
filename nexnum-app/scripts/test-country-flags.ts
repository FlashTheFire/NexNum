/**
 * Test Country Flags Lookup
 */

const COUNTRIES_URL = "https://gist.githubusercontent.com/devhammed/78cfbee0c36dfdaa4fce7e79c0d39208/raw/449258552611926be9ee7a8b4acc2ed9b2243a97/countries.json";
const FLAG_BASE = "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags";

// Fast + accent-safe normalizer
const normalize = (s: string | undefined | null): string =>
    String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

async function testCountryFlags() {
    console.log("Fetching country data...");

    const res = await fetch(COUNTRIES_URL);
    const data = await res.json();

    // Build the cache
    const cache = new Map<string, string>();
    for (const c of data) {
        const normalizedName = normalize(c.name);
        const isoCode = c.code?.toLowerCase();

        if (normalizedName && isoCode) {
            cache.set(normalizedName, isoCode);
        }
        if (isoCode) {
            cache.set(isoCode, isoCode);
        }
    }

    console.log(`\nLoaded ${cache.size} entries\n`);

    // Test cases
    const testCases = [
        "Afghanistan",
        "afghanistan",
        "AFGHANISTAN",
        "United States",
        "Åland Islands",
        "4",           // Should fail - numeric code
        "16",          // Should fail - numeric code  
        "Unknown",     // Should fail - not a country
        "af",          // Should work - ISO code
        "us",          // Should work - ISO code
        "India",
        "Russia",
    ];

    console.log("Test Results:");
    console.log("=".repeat(80));

    for (const test of testCases) {
        const normalized = normalize(test);
        const isoCode = cache.get(normalized);

        // Validate: must be exactly 2 lowercase letters
        const isValid = isoCode && /^[a-z]{2}$/.test(isoCode);
        const flagUrl = isValid ? `${FLAG_BASE}/${isoCode}.svg` : undefined;

        console.log(`"${test.padEnd(20)}" → normalized: "${normalized.padEnd(15)}" → ISO: ${(isoCode || 'N/A').padEnd(5)} → ${flagUrl || '❌ FALLBACK'}`);
    }

    console.log("=".repeat(80));
    console.log("\n✅ Test complete!");
}

testCountryFlags().catch(console.error);
