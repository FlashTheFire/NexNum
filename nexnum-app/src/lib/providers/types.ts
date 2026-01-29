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

    // Get available countries
    getCountries(): Promise<Country[]>

    // Get services for a country
    getServices(countryCode: string | number): Promise<Service[]>

    // Purchase a number
    getNumber?(countryCode: string | number, serviceCode: string | number, options?: { operator?: string; maxPrice?: string | number }): Promise<NumberResult>

    // Check status and get SMS
    getStatus?(activationId: string): Promise<StatusResult>

    // Cancel/release a number
    cancelNumber?(activationId: string): Promise<void>

    // Get balance (optional, for monitoring)
    getBalance?(): Promise<number>

    // Confirm or cancel activation (optional)
    setStatus?(activationId: string, status: number | string): Promise<any>

    // Request next SMS (New Standard)
    nextSms?(activationId: string): Promise<void>

    // Get prices (optional, optimization)
    getPrices?(countryCode?: string, serviceCode?: string): Promise<any[]>
}
