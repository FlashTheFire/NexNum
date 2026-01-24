
import { getCountryFlagUrlSync } from '../../src/lib/normalizers/country-flags';
import { getCountryIsoCode, normalizeCountryName } from '../../src/lib/normalizers/country-normalizer';
import countriesMetadata from '../../src/data/countries-metadata.json';
import metadata from '../../src/data/metadata.json';

console.log("=== FLAG DEBUGGER ===");

// 1. Check Metadata Source
const indiaMeta = countriesMetadata.find(c => c.name.en === "India");
console.log("Metadata Entry for India:", indiaMeta ? "FOUND" : "MISSING", indiaMeta?.code);

const indiaMap = metadata.countryNameMap["india"];
console.log("Metadata Map for 'india':", indiaMap);

// 2. Test Normalizer
const inputs = ["India", "india", "22", "75"];
inputs.forEach(input => {
    const norm = normalizeCountryName(input);
    const iso = getCountryIsoCode(input);
    const flag = getCountryFlagUrlSync(input);
    console.log(`Input: "${input}" | Norm: "${norm}" | ISO: "${iso}" | Flag: "${flag}"`);
});

// 3. Test Provider Logic Simulation
const p = { country: "22", name: "India" };
const canonicalCtyName = normalizeCountryName(p.name || 'Unknown');
const flagUrl = getCountryFlagUrlSync(canonicalCtyName) || getCountryFlagUrlSync(p.name || '') || getCountryFlagUrlSync(p.country) || '';

console.log("Provider Logic Result:", flagUrl);
