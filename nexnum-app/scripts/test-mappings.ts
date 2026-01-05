
import { getCountryFlagUrl } from '../src/lib/country-flags';

async function test() {
    const countries = ['Anguilla', 'Argentina', 'Angola', 'China', 'United States'];

    console.log('Testing Flag URLs:');
    for (const c of countries) {
        const url = await getCountryFlagUrl(c);
        console.log(`${c}: ${url}`);
    }
}

test();
