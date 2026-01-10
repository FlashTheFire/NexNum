/**
 * Chaos Test Script
 * 
 * Simulates high concurrency and client disconnects to verify locking and atomicity.
 * 
 * Usage: npx ts-node scripts/chaos-test.ts
 */

const BASE_URL = 'http://localhost:3000/api'
const CONCURRENCY = 10

async function purchase(id: number) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.random() * 2000 + 500) // Random abort 0.5-2.5s

    try {
        console.log(`[${id}] Starting purchase...`)
        const res = await fetch(`${BASE_URL}/numbers/purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                countryCode: 'US',
                serviceCode: 'wa',
                testMode: true
            }),
            signal: controller.signal
        })
        clearTimeout(timeout)
        const json = await res.json()
        console.log(`[${id}] Result: ${res.status}`, json)
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.log(`[${id}] Client Aborted (Chaos)`)
        } else {
            console.error(`[${id}] Error:`, err.message)
        }
    }
}

async function run() {
    console.log('Starting Chaos Test...')
    const promises = []
    for (let i = 0; i < CONCURRENCY; i++) {
        promises.push(purchase(i))
    }
    await Promise.all(promises)
    console.log('Chaos Test Complete.')
}

run()
