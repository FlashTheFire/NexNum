// SMS Provider Interfaces

export interface Country {
    code: string     // Primary Identifier (Universal)
    name: string
    flagUrl?: string | null
    [key: string]: any // Support the preservation of any mapped fields
}

export interface Service {
    code: string     // Primary Identifier (Universal)
    name: string
    iconUrl?: string | null
    [key: string]: any // Support the preservation of any mapped fields
}

export interface NumberResult {
    activationId: string
    phoneNumber: string
    countryCode: string
    countryName?: string
    serviceCode: string
    serviceName?: string
    price: number | null
    rawPrice?: number | null // New: Raw cost from provider (before markups)
    expiresAt: Date
}

export interface SmsMessage {
    id: string
    sender: string
    content: string
    code?: string // Extracted verification code
    receivedAt: Date
}

export type NumberStatus =
    | 'pending'      // Waiting for SMS
    | 'received'     // SMS received
    | 'cancelled'    // User cancelled
    | 'expired'      // Timed out
    | 'error'        // Provider error

export interface StatusResult {
    status: NumberStatus
    messages: SmsMessage[]
}

export interface SmsProvider {
    name: string

    // ═══════════════════════════════════════════════════════════════════════
    // INVENTORY METHODS (get*List) - API Standardization v2.0
    // ═══════════════════════════════════════════════════════════════════════

    /** Get available countries */
    getCountriesList(): Promise<Country[]>

    /** Get services for a country */
    getServicesList(countryCode: string | number): Promise<Service[]>


    // ═══════════════════════════════════════════════════════════════════════
    // TRANSACTION METHODS (get*)
    // ═══════════════════════════════════════════════════════════════════════

    /** Purchase a number */
    getNumber?(countryCode: string | number, serviceCode: string | number, options?: {
        operator?: string
        maxPrice?: string | number
    }): Promise<NumberResult>

    /** Check status and get SMS */
    getStatus?(activationId: string): Promise<StatusResult>

    /** Get provider balance */
    getBalance?(): Promise<number>

    /** Get prices (optional, for optimization) */
    getPrices?(countryCode?: string, serviceCode?: string): Promise<any[]>

    // ═══════════════════════════════════════════════════════════════════════
    // ACTION METHODS (set*)
    // ═══════════════════════════════════════════════════════════════════════

    /** @alias setCancel - Standardized naming v2.0 */
    setCancel?(activationId: string): Promise<void>

    /** @alias setResendCode - Standardized naming v2.0 */
    setResendCode?(activationId: string): Promise<void>

    /** Mark activation as complete (NEW) */
    setComplete?(activationId: string): Promise<void>

    // ═══════════════════════════════════════════════════════════════════════
    // DEPRECATED - DO NOT USE IN NEW CODE
    // ═══════════════════════════════════════════════════════════════════════

    /** @deprecated Use getCountriesList instead */
    getCountries?(): Promise<Country[]>

    /** @deprecated Use getServicesList instead */
    getServices?(countryCode?: string | number): Promise<Service[]>

    /** @deprecated Use setCancel instead */
    cancelNumber?(activationId: string): Promise<void>

    /** @deprecated Use setResendCode instead */
    nextSms?(activationId: string): Promise<void>

    /**
     * @deprecated Use setCancel or setComplete instead
     * This method exposed internal provider logic and is now disallowed
     */
    setStatus?(activationId: string, status: number | string): Promise<any>
}

