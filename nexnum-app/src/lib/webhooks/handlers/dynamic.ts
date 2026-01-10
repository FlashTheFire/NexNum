/**
 * Dynamic Webhook Handler
 * 
 * Uses DynamicProvider configuration to parse and process webhooks.
 * Replaces hardcoded provider handlers.
 */

import { BaseWebhookHandler } from './base'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { WebhookPayload } from '@/lib/sms/types'

export class DynamicWebhookHandler extends BaseWebhookHandler {
    private dynamicProvider: DynamicProvider

    constructor(dynamicProvider: DynamicProvider) {
        super(dynamicProvider.name)
        this.dynamicProvider = dynamicProvider
    }

    /**
     * Parse webhook using DynamicProvider's mapping logic
     */
    parse(body: any): WebhookPayload {
        return this.dynamicProvider.parseWebhook(body)
    }
}
