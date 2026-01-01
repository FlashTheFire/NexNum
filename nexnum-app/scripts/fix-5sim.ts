
import { prisma } from '../src/lib/db'

async function main() {
    const id = '858463fb-4784-4c93-b6e1-ef8a8c3c0b13'

    const endpoints = {
        "getCountries": { "method": "GET", "path": "https://5sim.net/v1/guest/countries" },
        "getServices": { "method": "GET", "path": "https://5sim.net/v1/guest/products/{country}/any" },
        "getNumber": { "method": "GET", "path": "http://api1.5sim.net/stubs/handler_api.php?api_key={authKey}&action=getNumber&service={service}&country={country}" },
        "getStatus": { "method": "GET", "path": "http://api1.5sim.net/stubs/handler_api.php?api_key={authKey}&action=getStatus&id={id}" },
        "cancelNumber": { "method": "GET", "path": "http://api1.5sim.net/stubs/handler_api.php?api_key={authKey}&action=setStatus&status=8&id={id}" },
        "getBalance": { "method": "GET", "path": "http://api1.5sim.net/stubs/handler_api.php?api_key={authKey}&action=getBalance" }
    }

    const mappings = {
        "getCountries": { "type": "json_dictionary", "fields": { "id": "iso.$firstValue", "name": "text_en", "code": "$key", "phoneCode": "prefix.$firstKey" } },
        "getServices": { "type": "json_dictionary", "fields": { "id": "$key", "name": "$key", "code": "$key", "price": "cost", "count": "count" } },
        "getNumber": { "type": "text_regex", "regex": "ACCESS_NUMBER:(\\d+):(\\d+)", "fields": { "id": "1", "phone": "2", "price": "0" } },
        "getStatus": { "type": "text_regex", "regex": "STATUS_([A-Z_]+):?(.*)?", "fields": { "status": "1", "sms": "2" } },
        "cancelNumber": { "type": "text_regex", "regex": "ACCESS_CANCEL", "fields": { "status": "1" } },
        "getBalance": { "type": "text_regex", "regex": "ACCESS_BALANCE:([\\d.]+)", "fields": { "balance": "1" } }
    }

    try {
        // Upsert to Restore if deleted
        await prisma.provider.upsert({
            where: { id },
            update: {
                endpoints,
                mappings,
                authType: 'none',
                description: 'Restored Hybrid Config (Auto)'
            },
            create: {
                id,
                name: '5sim',
                displayName: '5sim.net',
                apiBaseUrl: 'http://api1.5sim.net/stubs/handler_api.php',
                authType: 'none',
                endpoints,
                mappings,
                isActive: true, // Restore as Active
                priority: 10,
                description: 'Restored Hybrid Config (Auto)',
                logoUrl: 'https://5sim.net/favicon.ico' // bonus
            }
        })
        console.log('Successfully RESTORED 5sim provider!')
    } catch (e) {
        console.error('Failed to update provider:', e)
    }
}

main()
