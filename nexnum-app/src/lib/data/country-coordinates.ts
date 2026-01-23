/**
 * Pre-configured world map coordinates for countries
 * x: horizontal position (0-100, where 0 = left edge, 100 = right edge)
 * y: vertical position (0-100, where 0 = top edge, 100 = bottom edge)
 * 
 * Based on Mercator projection commonly used in web maps
 */

export interface CountryCoordinate {
    x: number;
    y: number;
}

export const COUNTRY_COORDINATES: Record<string, CountryCoordinate> = {
    // ===== NORTH AMERICA =====
    "US": { x: 20, y: 40 },
    "CA": { x: 18, y: 28 },
    "MX": { x: 17, y: 50 },
    "GT": { x: 20, y: 54 },
    "BZ": { x: 21, y: 53 },
    "HN": { x: 21, y: 55 },
    "SV": { x: 20, y: 55 },
    "NI": { x: 22, y: 56 },
    "CR": { x: 22, y: 58 },
    "PA": { x: 23, y: 59 },
    "CU": { x: 24, y: 50 },
    "JM": { x: 25, y: 52 },
    "HT": { x: 26, y: 51 },
    "DO": { x: 27, y: 51 },
    "PR": { x: 28, y: 52 },
    "TT": { x: 29, y: 56 },
    "BB": { x: 30, y: 54 },
    "AG": { x: 29, y: 53 },
    "LC": { x: 29, y: 55 },
    "VC": { x: 29, y: 55 },
    "GD": { x: 29, y: 56 },
    "DM": { x: 29, y: 54 },
    "KN": { x: 29, y: 53 },
    "BS": { x: 25, y: 48 },
    "KY": { x: 23, y: 51 },
    "AI": { x: 28, y: 52 },
    "VG": { x: 28, y: 52 },
    "VI": { x: 28, y: 52 },
    "AW": { x: 27, y: 56 },
    "CW": { x: 27, y: 56 },
    "SX": { x: 28, y: 52 },
    "MQ": { x: 29, y: 54 },
    "GP": { x: 29, y: 53 },

    // ===== SOUTH AMERICA =====
    "BR": { x: 32, y: 68 },
    "AR": { x: 28, y: 78 },
    "CL": { x: 26, y: 76 },
    "CO": { x: 25, y: 60 },
    "PE": { x: 24, y: 66 },
    "VE": { x: 27, y: 58 },
    "EC": { x: 23, y: 62 },
    "BO": { x: 27, y: 70 },
    "PY": { x: 29, y: 72 },
    "UY": { x: 30, y: 76 },
    "GY": { x: 29, y: 58 },
    "SR": { x: 30, y: 58 },
    "GF": { x: 31, y: 58 },
    "FK": { x: 29, y: 84 },

    // ===== WESTERN EUROPE =====
    "GB": { x: 46, y: 30 },
    "IE": { x: 44, y: 30 },
    "FR": { x: 48, y: 36 },
    "ES": { x: 45, y: 40 },
    "PT": { x: 43, y: 40 },
    "DE": { x: 50, y: 32 },
    "NL": { x: 49, y: 30 },
    "BE": { x: 48, y: 32 },
    "LU": { x: 49, y: 33 },
    "CH": { x: 50, y: 36 },
    "AT": { x: 52, y: 35 },
    "IT": { x: 52, y: 40 },
    "MT": { x: 52, y: 44 },
    "MC": { x: 50, y: 38 },
    "AD": { x: 47, y: 38 },
    "SM": { x: 52, y: 38 },
    "VA": { x: 52, y: 40 },
    "LI": { x: 50, y: 35 },
    "GI": { x: 44, y: 42 },
    "JE": { x: 46, y: 33 },
    "GG": { x: 46, y: 33 },
    "IM": { x: 45, y: 30 },

    // ===== NORTHERN EUROPE =====
    "SE": { x: 54, y: 22 },
    "NO": { x: 52, y: 20 },
    "FI": { x: 58, y: 22 },
    "DK": { x: 50, y: 28 },
    "IS": { x: 40, y: 18 },
    "EE": { x: 58, y: 26 },
    "LV": { x: 58, y: 28 },
    "LT": { x: 58, y: 29 },
    "FO": { x: 44, y: 20 },
    "AX": { x: 56, y: 24 },
    "SJ": { x: 54, y: 12 },
    "GL": { x: 32, y: 16 },

    // ===== EASTERN EUROPE =====
    "PL": { x: 54, y: 30 },
    "CZ": { x: 52, y: 32 },
    "SK": { x: 54, y: 34 },
    "HU": { x: 54, y: 36 },
    "RO": { x: 58, y: 38 },
    "BG": { x: 58, y: 40 },
    "UA": { x: 60, y: 34 },
    "BY": { x: 58, y: 30 },
    "MD": { x: 60, y: 36 },
    "RU": { x: 70, y: 24 },

    // ===== BALKANS =====
    "HR": { x: 53, y: 38 },
    "SI": { x: 52, y: 37 },
    "BA": { x: 54, y: 39 },
    "RS": { x: 56, y: 39 },
    "ME": { x: 55, y: 40 },
    "MK": { x: 56, y: 41 },
    "AL": { x: 55, y: 41 },
    "XK": { x: 56, y: 40 },
    "GR": { x: 56, y: 43 },
    "CY": { x: 60, y: 44 },

    // ===== MIDDLE EAST =====
    "TR": { x: 60, y: 40 },
    "IL": { x: 60, y: 46 },
    "PS": { x: 60, y: 46 },
    "LB": { x: 60, y: 44 },
    "SY": { x: 62, y: 44 },
    "JO": { x: 61, y: 46 },
    "IQ": { x: 64, y: 44 },
    "IR": { x: 68, y: 44 },
    "SA": { x: 64, y: 50 },
    "AE": { x: 68, y: 50 },
    "KW": { x: 65, y: 47 },
    "BH": { x: 67, y: 48 },
    "QA": { x: 67, y: 49 },
    "OM": { x: 70, y: 52 },
    "YE": { x: 66, y: 54 },

    // ===== CENTRAL ASIA =====
    "KZ": { x: 70, y: 34 },
    "UZ": { x: 72, y: 38 },
    "TM": { x: 70, y: 40 },
    "TJ": { x: 74, y: 40 },
    "KG": { x: 76, y: 38 },
    "AF": { x: 74, y: 44 },
    "PK": { x: 74, y: 48 },

    // ===== SOUTH ASIA =====
    "IN": { x: 76, y: 52 },
    "BD": { x: 80, y: 50 },
    "NP": { x: 78, y: 48 },
    "BT": { x: 80, y: 48 },
    "LK": { x: 78, y: 58 },
    "MV": { x: 76, y: 60 },

    // ===== SOUTHEAST ASIA =====
    "TH": { x: 82, y: 54 },
    "VN": { x: 84, y: 54 },
    "MY": { x: 82, y: 60 },
    "SG": { x: 82, y: 62 },
    "ID": { x: 86, y: 64 },
    "PH": { x: 88, y: 54 },
    "MM": { x: 80, y: 52 },
    "LA": { x: 82, y: 52 },
    "KH": { x: 82, y: 56 },
    "BN": { x: 84, y: 60 },
    "TL": { x: 88, y: 64 },

    // ===== EAST ASIA =====
    "CN": { x: 82, y: 42 },
    "JP": { x: 90, y: 40 },
    "KR": { x: 88, y: 42 },
    "KP": { x: 88, y: 40 },
    "TW": { x: 88, y: 50 },
    "MN": { x: 82, y: 34 },
    "HK": { x: 86, y: 50 },
    "MO": { x: 86, y: 50 },

    // ===== AFRICA - NORTH =====
    "MA": { x: 44, y: 44 },
    "DZ": { x: 48, y: 44 },
    "TN": { x: 50, y: 44 },
    "LY": { x: 54, y: 46 },
    "EG": { x: 58, y: 48 },
    "SD": { x: 58, y: 54 },
    "SS": { x: 58, y: 58 },
    "ER": { x: 62, y: 54 },
    "DJ": { x: 64, y: 56 },
    "ET": { x: 62, y: 58 },
    "SO": { x: 66, y: 58 },

    // ===== AFRICA - WEST =====
    "MR": { x: 42, y: 52 },
    "ML": { x: 44, y: 54 },
    "NE": { x: 50, y: 54 },
    "TD": { x: 54, y: 54 },
    "SN": { x: 40, y: 54 },
    "GM": { x: 40, y: 54 },
    "GW": { x: 40, y: 56 },
    "GN": { x: 42, y: 58 },
    "SL": { x: 42, y: 58 },
    "LR": { x: 42, y: 60 },
    "CI": { x: 44, y: 60 },
    "BF": { x: 46, y: 56 },
    "GH": { x: 46, y: 60 },
    "TG": { x: 48, y: 60 },
    "BJ": { x: 48, y: 60 },
    "NG": { x: 50, y: 58 },
    "CV": { x: 36, y: 54 },

    // ===== AFRICA - CENTRAL =====
    "CM": { x: 52, y: 60 },
    "CF": { x: 54, y: 60 },
    "GA": { x: 52, y: 64 },
    "CG": { x: 54, y: 64 },
    "CD": { x: 56, y: 64 },
    "AO": { x: 54, y: 68 },
    "GQ": { x: 52, y: 62 },
    "ST": { x: 50, y: 62 },

    // ===== AFRICA - EAST =====
    "KE": { x: 62, y: 62 },
    "UG": { x: 60, y: 62 },
    "TZ": { x: 60, y: 66 },
    "RW": { x: 58, y: 64 },
    "BI": { x: 58, y: 66 },

    // ===== AFRICA - SOUTH =====
    "ZA": { x: 56, y: 78 },
    "NA": { x: 54, y: 74 },
    "BW": { x: 56, y: 74 },
    "ZW": { x: 58, y: 72 },
    "ZM": { x: 58, y: 70 },
    "MW": { x: 60, y: 70 },
    "MZ": { x: 62, y: 72 },
    "SZ": { x: 58, y: 76 },
    "LS": { x: 56, y: 78 },
    "MG": { x: 66, y: 72 },
    "MU": { x: 70, y: 72 },
    "SC": { x: 68, y: 66 },
    "KM": { x: 64, y: 68 },
    "RE": { x: 70, y: 74 },
    "YT": { x: 64, y: 68 },

    // ===== OCEANIA =====
    "AU": { x: 88, y: 76 },
    "NZ": { x: 96, y: 82 },
    "FJ": { x: 98, y: 70 },
    "PG": { x: 92, y: 66 },
    "NC": { x: 94, y: 74 },
    "VU": { x: 96, y: 70 },
    "SB": { x: 94, y: 66 },
    "WS": { x: 100, y: 68 },
    "TO": { x: 100, y: 72 },
    "PF": { x: 8, y: 70 },
    "GU": { x: 92, y: 54 },
    "MP": { x: 92, y: 52 },
    "FM": { x: 94, y: 58 },
    "PW": { x: 90, y: 58 },
    "MH": { x: 98, y: 58 },
    "KI": { x: 100, y: 62 },
    "NR": { x: 96, y: 62 },
    "TV": { x: 98, y: 64 },
    "CK": { x: 2, y: 72 },
    "NU": { x: 100, y: 72 },
    "AS": { x: 100, y: 68 },
    "WF": { x: 100, y: 68 },
};

/**
 * Get flag URL for a country code
 */
export function getFlagUrl(code: string): string {
    const normalizedCode = code.toLowerCase();
    return `/flags/${normalizedCode}.svg`;
}

/**
 * Get coordinates for a country, with fallback for unknown countries
 */
export function getCountryCoordinates(code: string): CountryCoordinate | null {
    return COUNTRY_COORDINATES[code.toUpperCase()] || null;
}

/**
 * Default coordinates for unknown countries (center of map)
 */
export const DEFAULT_COORDINATES: CountryCoordinate = { x: 50, y: 50 };
