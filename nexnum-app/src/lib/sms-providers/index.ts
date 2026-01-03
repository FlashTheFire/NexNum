// SMS Provider Factory - Smart Router
import { SmartSmsRouter } from '../smart-router'

export * from './types'

// Export legacy provider classes
export { FiveSimProvider } from './fivesim'
export { SmsBowerProvider } from './smsbower'
export { GrizzlySmsProvider } from './grizzlysms'
export { HeroSmsProvider } from './herosms'

// Export a single instance of the Smart Router
// This router will dynamically load active providers from the DB
export const smsProvider = new SmartSmsRouter()

// Legacy exports for type compatibility if needed
export type ProviderName = string
