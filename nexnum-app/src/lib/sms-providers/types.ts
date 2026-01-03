// SMS Provider Interfaces

export interface Country {
    id: string
    code: string
    name: string
    flag?: string | null;
}

export interface Service {
    id: string
    code: string
    name: string
    price: number
}

export interface NumberResult {
    activationId: string
    phoneNumber: string
    countryCode: string
    countryName: string
    serviceCode: string
    serviceName: string
    price: number
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
    getServices(countryCode: string): Promise<Service[]>

    // Purchase a number
    getNumber(countryCode: string, serviceCode: string, preferredProvider?: string): Promise<NumberResult>

    // Check status and get SMS
    getStatus(activationId: string): Promise<StatusResult>

    // Cancel/release a number
    cancelNumber(activationId: string): Promise<void>

    // Get balance (optional, for monitoring)
    getBalance?(): Promise<number>
}
