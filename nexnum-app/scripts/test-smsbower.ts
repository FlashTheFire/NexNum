
import fs from 'fs';
import path from 'path';

async function testSync() {
    console.log('Testing SMSBower Fetch & Parse...');

    // 1. Fetch
    const url = 'https://smsbower.org/activations/getPricesByService?serviceId=5&withPopular=true';
    console.log(`Fetching ${url}...`);

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Response length: ${text.length}`);

        // 2. Parse
        const json = JSON.parse(text);
        console.log('Keys in response:', Object.keys(json));

        let services: any[] = [];

        // Logic from provider-sync.ts
        if (json.services && typeof json.services === 'object' && !Array.isArray(json.services)) {
            services = Object.values(json.services);
            console.log(`Parsed ${services.length} services from json.services (Object)`);
        } else if (json.services && Array.isArray(json.services)) {
            services = json.services;
            console.log(`Parsed ${services.length} services from json.services (Array)`);
        } else {
            console.log('Could not find services array/object');
        }

        if (services.length > 0) {
            console.log('First service:', JSON.stringify(services[0], null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testSync();
