
export interface CountryData {
    name: string;
    flag: string;
    code: string;
}

export const COUNTRY_DATA: CountryData[] = []

// Helper to look up unique ISO code by Name
export function getIsoByName(countryName: string): string | null {
    const lowerName = countryName.toLowerCase();

    // Exact Name Match
    const exact = COUNTRY_DATA.find(c => c.name.toLowerCase() === lowerName);
    if (exact) return exact.code;

    // Partial Name Match
    const partial = COUNTRY_DATA.find(c => c.name.toLowerCase().includes(lowerName));
    if (partial) return partial.code;

    return null;
}


// Export a simple safe map for non-colliding codes (Empty for now as valid phone codes removed)
export const SAFE_PHONE_TO_ISO: Record<string, string> = {};
