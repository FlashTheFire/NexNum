// SMS Provider Interface & Factory
// Adapter pattern for multiple SMS providers

export * from './types'
import { SmsProvider } from './types'

// Provider factory
import { FiveSimProvider } from './fivesim'
import { HeroSmsProvider } from './herosms'
import { SmsBowerProvider } from './smsbower'
import { GrizzlySmsProvider } from './grizzlysms'
import { OnlineSimProvider } from './onlinesim'

export type ProviderName = '5sim' | 'herosms' | 'smsbower' | 'grizzlysms' | 'onlinesim'

export function getSmsProvider(name?: ProviderName): SmsProvider {
    const providerName = name || (process.env.SMS_PROVIDER as ProviderName) || 'herosms'

    switch (providerName) {
        case '5sim':
            return new FiveSimProvider()
        case 'herosms':
            return new HeroSmsProvider()
        case 'smsbower':
            return new SmsBowerProvider()
        case 'grizzlysms':
            return new GrizzlySmsProvider()
        case 'onlinesim':
            return new OnlineSimProvider()
        default:
            console.warn(`Unknown SMS provider: ${providerName}, falling back to herosms`)
            return new HeroSmsProvider()
    }
}

// Default provider instance
export const smsProvider = getSmsProvider()
