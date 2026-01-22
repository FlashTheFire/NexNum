/**
 * Phone Number Parser Utility
 * 
 * Parses phone numbers into country code and national number.
 * Uses libphonenumber-js (Google's libphonenumber port for JS).
 */

import { parsePhoneNumber, CountryCode, isValidPhoneNumber } from 'libphonenumber-js'

export interface ParsedPhoneNumber {
    /** Full E.164 formatted number (e.g., "+14155552671") */
    full: string
    /** Country calling code with + (e.g., "+1") */
    countryCode: string
    /** National number without country code or trunk prefix (e.g., "4155552671") */
    nationalNumber: string
    /** ISO 3166-1 alpha-2 country code (e.g., "US") */
    countryIso: string | null
    /** Whether the number is valid */
    isValid: boolean
}

/**
 * Formats a phone number into country code and national number.
 * Works for all countries and ensures compatibility with international apps.
 * 
 * @param phoneNumber - The phone number to parse (can be with or without +)
 * @param defaultCountry - Optional default country for numbers without country code
 * @returns Parsed phone number components
 * 
 * @example
 * formatPhoneNumber("+14155552671")
 * // Returns: { countryCode: "+1", nationalNumber: "4155552671", countryIso: "US", ... }
 * 
 * formatPhoneNumber("919876543210")
 * // Returns: { countryCode: "+91", nationalNumber: "9876543210", countryIso: "IN", ... }
 */
export function formatPhoneNumber(
    phoneNumber: string,
    defaultCountry?: CountryCode
): ParsedPhoneNumber {
    try {
        // Ensure the number starts with "+"
        let normalizedNumber = phoneNumber.trim()
        if (/^\d+$/.test(normalizedNumber)) {
            normalizedNumber = `+${normalizedNumber}`
        }

        // Parse the phone number
        const parsed = parsePhoneNumber(normalizedNumber, defaultCountry)

        if (!parsed) {
            return {
                full: phoneNumber,
                countryCode: '',
                nationalNumber: phoneNumber,
                countryIso: null,
                isValid: false
            }
        }

        // Extract country code with +
        const countryCode = `+${parsed.countryCallingCode}`

        // Get national number (without country code, without trunk prefix)
        // nationalNumber is already clean in libphonenumber-js
        const nationalNumber = parsed.nationalNumber

        return {
            full: parsed.format('E.164'),
            countryCode,
            nationalNumber,
            countryIso: parsed.country || null,
            isValid: parsed.isValid()
        }

    } catch (error) {
        // Return as-is if parsing fails
        return {
            full: phoneNumber,
            countryCode: '',
            nationalNumber: phoneNumber,
            countryIso: null,
            isValid: false
        }
    }
}

/**
 * Quick validation check for a phone number
 */
export function isValidPhone(phoneNumber: string, country?: CountryCode): boolean {
    try {
        let normalizedNumber = phoneNumber.trim()
        if (/^\d+$/.test(normalizedNumber)) {
            normalizedNumber = `+${normalizedNumber}`
        }
        return isValidPhoneNumber(normalizedNumber, country)
    } catch {
        return false
    }
}

/**
 * Extract just the country code from a phone number
 */
export function extractCountryCode(phoneNumber: string): string {
    const parsed = formatPhoneNumber(phoneNumber)
    return parsed.countryCode
}

/**
 * Extract just the national number from a phone number
 */
export function extractNationalNumber(phoneNumber: string): string {
    const parsed = formatPhoneNumber(phoneNumber)
    return parsed.nationalNumber
}
