
// This service simulates an external SMS provider (like Twilio or 5sim)
// It manages an in-memory store of messages for demonstration purposes.
// In a real app, this would connect to a database and external APIs.

export interface SMSMessage {
    id: string
    numberId: string
    from: string
    text: string
    code?: string | null  // Extracted verification code
    receivedAt: string
    isRead: boolean
}

// In-memory store (active during server lifetime in dev)
// For production serverless, you'd use Redis or a DB.
let MESSAGE_STORE: Record<string, SMSMessage[]> = {}

const DEMO_SENDERS = [
    'Google', 'Facebook', 'WhatsApp', 'Telegram', 'Instagram', 'TikTok', 'Uber', 'Amazon', 'Apple', 'Netflix'
]

const DEMO_TEMPLATES = [
    "Your verification code is: {{code}}",
    "{{code}} is your verification code.",
    "Your login code: {{code}}. Don't share this matching code.",
    "ExampleApp verification code: {{code}}",
    "G-{{code}} is your Google verification code.",
]

class SMSService {

    // Get messages for a specific number
    getMessages(numberId: string): SMSMessage[] {
        return MESSAGE_STORE[numberId] || []
    }

    // Add a message manually (e.g., via webhook)
    addMessage(numberId: string, message: Omit<SMSMessage, 'id' | 'receivedAt' | 'isRead'>) {
        if (!MESSAGE_STORE[numberId]) {
            MESSAGE_STORE[numberId] = []
        }

        const newMessage: SMSMessage = {
            ...message,
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            receivedAt: new Date().toISOString(),
            isRead: false
        }

        MESSAGE_STORE[numberId].unshift(newMessage)
        return newMessage
    }

    // Simulate an incoming message for demo purposes
    simulateIncomingMessage(numberId: string): SMSMessage | null {
        // Probability check (10% chance to actually receive one when polled)
        // or force it if needed. For this demo, let's just generate one.

        const sender = DEMO_SENDERS[Math.floor(Math.random() * DEMO_SENDERS.length)]
        const randomCode = Math.floor(100000 + Math.random() * 900000).toString()
        const template = DEMO_TEMPLATES[Math.floor(Math.random() * DEMO_TEMPLATES.length)]
        const text = template.replace('{{code}}', randomCode)

        return this.addMessage(numberId, {
            numberId,
            from: sender,
            text
        })
    }
}

export const smsService = new SMSService()
