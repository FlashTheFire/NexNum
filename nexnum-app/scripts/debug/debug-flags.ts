
import { getCountryFlagUrlSync } from '../../src/lib/normalizers/country-flags';
import { normalizeCountryName } from '../../src/lib/normalizers/country-normalizer';

console.log("Testing Flag Resolution...");

const inputs = [
    "India",
    "india",
    "India (22)",
    "United States",
    "ru"
];

for (const input of inputs) {
    const norm = normalizeCountryName(input);
    const flag = getCountryFlagUrlSync(norm) || getCountryFlagUrlSync(input);
    console.log(`Input: "${input}" -> Norm: "${norm}" -> Flag: "${flag}"`);
}
