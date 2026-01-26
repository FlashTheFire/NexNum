/**
 * Centralized Provider System
 */
import { SmartSmsRouter } from './smart-router'

// Singleton instance of the Smart Router used globally
export const smsProvider = new SmartSmsRouter()

export * from './types'
export * from './dynamic-provider'
export * from './provider-factory'
