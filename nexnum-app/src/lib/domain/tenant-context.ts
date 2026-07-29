/**
 * Super CEO Multi-Domain Engine
 * 
 * Provides dynamic tenant branding, custom domains resolution,
 * and multi-tenant domain overrides for single-instance EC2 deployments.
 */

export interface TenantConfig {
    domain: string
    brandName: string
    title: string
    description: string
    supportEmail: string
    logoUrl?: string
    themeColor: string
    isPrimary: boolean
}

const DEFAULT_TENANT: TenantConfig = {
    domain: 'nexnum.in',
    brandName: 'NexNum',
    title: 'NexNum – Premium Virtual Phone Numbers & SMS Verification',
    description: 'Instant virtual phone numbers for SMS verification across 50+ countries. High throughput, multi-provider routing & instant OTP receiving.',
    supportEmail: 'support@nx1.in',
    themeColor: '#10b981',
    isPrimary: true
}

export function getTenantFromHost(hostHeader?: string | null): TenantConfig {
    if (!hostHeader) return DEFAULT_TENANT

    const cleanHost = hostHeader.split(':')[0].toLowerCase()

    // Match domain or return fallback default
    if (cleanHost === 'nexnum.in' || cleanHost === 'www.nexnum.in' || cleanHost === 'nx1.in' || cleanHost === 'www.nx1.in') {
        return DEFAULT_TENANT
    }

    // Dynamic White-Label Brand Generator for Custom Connected Domains
    const baseName = cleanHost.replace(/^(www\.|app\.|sms\.)/, '').split('.')[0]
    const capitalizedBrand = baseName.charAt(0).toUpperCase() + baseName.slice(1)

    return {
        domain: cleanHost,
        brandName: capitalizedBrand,
        title: `${capitalizedBrand} – Global Virtual Numbers & SMS Verification`,
        description: `Secure virtual phone numbers and instant OTP verification powered by ${capitalizedBrand} Global Network.`,
        supportEmail: `support@${cleanHost}`,
        themeColor: '#10b981',
        isPrimary: false
    }
}
