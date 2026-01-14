/**
 * Central export for SMS Providers
 */
import { SmartSmsRouter } from '@/lib/providers/smart-router'

export * from './types'

// Singleton instance of the Smart Router
export const smsProvider = new SmartSmsRouter()
