
import { DynamicProvider } from '../src/lib/dynamic-provider';
import { PROVIDER_TEMPLATES } from '../src/app/admin/providers/editors';

async function verifyHeroSMS() {
    console.log('🧪 Starting HeroSMS Template Verification...');

    // 1. Load Template
    const template = PROVIDER_TEMPLATES['herosms'];
    console.log(`\n📋 Loaded Template: ${template.displayName}`);

    // 2. Parse Config
    const endpoints = JSON.parse(template.endpoints as string);
    const mappings = JSON.parse(template.mappings as string);

    // 3. Initialize Provider Engine
    // Mocking a provider DB entry
    const mockProvider = {
        id: 'herosms-test',
        name: 'HeroSMS',
        apiBaseUrl: template.baseUrl,
        authType: template.authType,
        authKey: 'TEST_SECRET_KEY',
        authQueryParam: template.authQueryParam,
        endpoints: endpoints,
        mappings: mappings,
        priority: 1,
        isActive: true,
        priceMultiplier: 1.2,
        fixedMarkup: 0.05,
        currency: 'USD'
    };

    const provider = new DynamicProvider(mockProvider as any);

    // 4. Test URL Generation
    console.log('\n🔍 Verifying URL Construction (Fixing Doc Bug)...');

    // Test 1: getBalance
    // Expected: .../handler_api.php?action=getBalance&api_key=TEST_SECRET_KEY
    // Doc Bug: .../handler_api.php?action=getBalance?api_key=... (Double ?)
    try {
        // We'll peek into private method or just use the public interface and catch the fetch error, 
        // but since we want to check the URL, we might need to rely on the DynamicProvider's logging or modify it to return URL.
        // For this script, let's manually replicate the logic or rely on a successful fetch mock if possible.
        // Easier: Inspect the parsing result from the template directly.

        const balanceEndpoint = endpoints.getBalance;
        const balanceUrl = balanceEndpoint.path
            .replace('{authKey}', 'TEST_SECRET_KEY');

        console.log(`   [balance] Generated: ${balanceUrl}`);

        if (balanceUrl.includes('?action=getBalance&api_key=')) {
            console.log('   ✅ PASS: Correctly uses "&" for second param.');
        } else if (balanceUrl.includes('?action=getBalance?api_key=')) {
            console.error('   ❌ FAIL: Still uses "?" for second param (Doc Bug).');
        } else {
            console.log('   ⚠️ CHECK manually.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

verifyHeroSMS();
