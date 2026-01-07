/**
 * Mock Provider API
 * Simulates an external SMS provider (JSON API)
 */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    // Check response type override (for testing different parser modes)
    const responseType = searchParams.get('responseType') || 'json'

    // 1. Get Balance
    if (action === 'getBalance') {
        const balance = 100.00
        if (responseType === 'text_balance') return new Response(`ACCESS_BALANCE:${balance}`, { status: 200 })
        return NextResponse.json({
            balance,
            currency: 'USD'
        })
    }

    // 2. Get Number
    if (action === 'getNumber') {
        const id = 'mock-' + Date.now()
        const phone = '1234567890'

        if (responseType === 'text_access_number') {
            return new Response(`ACCESS_NUMBER:${id}:${phone}`, { status: 200 })
        }

        return NextResponse.json({
            success: true,
            activationId: id,
            number: phone,
            country: 'us',
            service: 'whatsapp',
            cost: 0.50
        })
    }

    // 3. Get Status
    if (action === 'getStatus') {
        if (responseType === 'text_status') {
            // Simulate smsbower text loop
            return new Response(`STATUS_OK:445566`, { status: 200 })
        }

        return NextResponse.json({
            status: 'RECEIVED', // Return received so poller can pick up 'mock' message
            message: 'SMS Received',
            code: '123456',
            sms: {
                sender: 'Google',
                text: 'Your code is 123456',
                code: '123456'
            }
        })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
    // Webhook simulation endpoint?
    return NextResponse.json({ received: true })
}
